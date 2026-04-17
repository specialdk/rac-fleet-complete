import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const FLEETCOMPLETE_API = 'https://api.fleetcomplete.com';
const FLEETCOMPLETE_USERNAME = process.env.FLEETCOMPLETE_USERNAME;
const FLEETCOMPLETE_PASSWORD = process.env.FLEETCOMPLETE_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;

// PostgreSQL connection
const { Pool } = pg;
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;

if (!FLEETCOMPLETE_USERNAME || !FLEETCOMPLETE_PASSWORD) {
  console.error('ERROR: FLEETCOMPLETE_USERNAME and FLEETCOMPLETE_PASSWORD must be set');
  process.exit(1);
}

// Session state (in-memory for now, will persist to PostgreSQL)
let sessionState = {
  database: null,
  username: FLEETCOMPLETE_USERNAME,
  sessionCookie: null,
  userId: null,
  authenticatedAt: null,
  expiresAt: null,
  lastRefresh: null,
  refreshCount: 0,
  status: 'initializing',
};

// ── FleetComplete Authentication ──────────────────────────────────────────────
async function authenticateFleetComplete() {
  console.log('Authenticating to FleetComplete...');
  try {
    const response = await fetch(`${FLEETCOMPLETE_API}/seeme/Api/SignOn/LogOn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: FLEETCOMPLETE_USERNAME,
        password: FLEETCOMPLETE_PASSWORD,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Authentication failed: ${response.status} - ${text}`);
    }

    const data = await response.json();
    
    // Extract session cookie from Set-Cookie header
    const cookies = response.headers.get('set-cookie');
    
    sessionState.database = data.database || data.databaseName || 'rirratjingu_aboriginal_corporation';
    sessionState.sessionCookie = cookies;
    sessionState.userId = data.userId;
    sessionState.authenticatedAt = new Date().toISOString();
    sessionState.expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 days
    sessionState.lastRefresh = new Date().toISOString();
    sessionState.refreshCount++;
    sessionState.status = 'connected';

    console.log('FleetComplete authenticated successfully');
    console.log(`Database: ${sessionState.database}`);
    console.log(`Session expires: ${sessionState.expiresAt}`);

    // Persist to database if available
    if (pool) {
      await saveSessionToDB();
    }

    return true;
  } catch (err) {
    console.error('Authentication failed:', err.message);
    sessionState.status = 'error';
    return false;
  }
}

async function saveSessionToDB() {
  if (!pool) return;
  
  try {
    await pool.query(`
      INSERT INTO fleetcomplete_sessions (database_name, username, session_cookie, user_id, authenticated_at, expires_at, last_verified, auto_renew)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (database_name) 
      DO UPDATE SET 
        session_cookie = $3,
        user_id = $4,
        authenticated_at = $5,
        expires_at = $6,
        last_verified = $7,
        updated_at = CURRENT_TIMESTAMP
    `, [
      sessionState.database,
      sessionState.username,
      sessionState.sessionCookie,
      sessionState.userId,
      sessionState.authenticatedAt,
      sessionState.expiresAt,
      new Date().toISOString(),
      true
    ]);
    console.log('Session saved to database');
  } catch (err) {
    console.error('Failed to save session to database:', err.message);
  }
}

async function loadSessionFromDB() {
  if (!pool) return false;

  try {
    const result = await pool.query(`
      SELECT * FROM fleetcomplete_sessions 
      WHERE database_name = $1 
      ORDER BY authenticated_at DESC 
      LIMIT 1
    `, [sessionState.database || 'rirratjingu_aboriginal_corporation']);

    if (result.rows.length > 0) {
      const session = result.rows[0];
      const expiresAt = new Date(session.expires_at);
      const now = new Date();

      // Check if session is still valid (expires in more than 1 day)
      if (expiresAt > new Date(now.getTime() + 24 * 60 * 60 * 1000)) {
        sessionState.database = session.database_name;
        sessionState.sessionCookie = session.session_cookie;
        sessionState.userId = session.user_id;
        sessionState.authenticatedAt = session.authenticated_at;
        sessionState.expiresAt = session.expires_at;
        sessionState.lastRefresh = session.last_verified;
        sessionState.status = 'connected';
        console.log('Session loaded from database');
        return true;
      }
    }
  } catch (err) {
    console.error('Failed to load session from database:', err.message);
  }
  return false;
}

// Auto-refresh session when it expires in < 7 days
function startAutoRefresh() {
  setInterval(async () => {
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(sessionState.expiresAt);
    
    if (expiresAt < sevenDaysFromNow) {
      console.log('Session expiring soon - refreshing...');
      await authenticateFleetComplete();
    }
  }, 6 * 60 * 60 * 1000); // Check every 6 hours
}

function getAuthHeaders() {
  return {
    'Cookie': sessionState.sessionCookie,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
}

async function fleetCompleteGet(path) {
  const response = await fetch(`${FLEETCOMPLETE_API}${path}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error(`FleetComplete API ${response.status}: ${await response.text()}`);
  return response.json();
}

async function fleetCompletePost(path, body = {}) {
  const response = await fetch(`${FLEETCOMPLETE_API}${path}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`FleetComplete API ${response.status}: ${await response.text()}`);
  return response.json();
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Static pages
app.get('/', (req, res) => res.sendFile('index.html', { root: 'public' }));
app.get('/dashboard', (req, res) => res.sendFile('dashboard.html', { root: 'public' }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'RAC FleetComplete API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'RAC FleetComplete API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Session status
app.get('/api/session-status', (req, res) => {
  const now = new Date();
  const expiresAt = new Date(sessionState.expiresAt);
  const daysRemaining = Math.max(0, Math.floor((expiresAt - now) / (24 * 60 * 60 * 1000)));
  const hoursRemaining = Math.max(0, Math.floor((expiresAt - now) / (60 * 60 * 1000)));

  res.json({
    status: sessionState.status,
    database: sessionState.database,
    username: sessionState.username,
    authenticatedAt: sessionState.authenticatedAt,
    expiresAt: sessionState.expiresAt,
    daysRemaining,
    hoursRemaining,
    lastRefresh: sessionState.lastRefresh,
    refreshCount: sessionState.refreshCount,
  });
});

// Force session refresh
app.post('/api/force-refresh', async (req, res) => {
  const success = await authenticateFleetComplete();
  const daysRemaining = Math.floor((new Date(sessionState.expiresAt) - new Date()) / (24 * 60 * 60 * 1000));
  
  if (success) {
    res.json({
      success: true,
      message: 'Session refreshed successfully',
      daysRemaining
    });
  } else {
    res.status(500).json({
      success: false,
      message: 'Session refresh failed'
    });
  }
});

// Connection status
app.get('/connection-status', async (req, res) => {
  try {
    // Test connection by fetching vehicles
    const vehicles = await fleetCompleteGet('/seeme/Api/Asset/Assets');
    
    res.json({
      connected: true,
      database: sessionState.database,
      vehicleCount: vehicles?.length || 0,
      sessionDaysRemaining: Math.floor((new Date(sessionState.expiresAt) - new Date()) / (24 * 60 * 60 * 1000)),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      connected: false,
      error: err.message
    });
  }
});

app.get('/api/connection-status', async (req, res) => {
  try {
    const vehicles = await fleetCompleteGet('/seeme/Api/Asset/Assets');
    
    res.json({
      connected: true,
      database: sessionState.database,
      vehicleCount: vehicles?.length || 0,
      sessionDaysRemaining: Math.floor((new Date(sessionState.expiresAt) - new Date()) / (24 * 60 * 60 * 1000)),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      connected: false,
      error: err.message
    });
  }
});

// Vehicles endpoint
app.get('/api/vehicles', async (req, res) => {
  try {
    const vehicles = await fleetCompleteGet('/seeme/Api/Asset/Assets');
    res.json({
      count: vehicles?.length || 0,
      vehicles: vehicles || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fuel delivery vehicles only (RF01 & RF02)
app.get('/api/fuel-delivery-vehicles', async (req, res) => {
  try {
    const vehicles = await fleetCompleteGet('/seeme/Api/Asset/Assets');
    const fuelVehicles = vehicles.filter(v => 
      v.Description?.includes('RF01') || 
      v.Description?.includes('RF02') ||
      v.Description?.includes('T609') ||
      v.Description?.includes('T408')
    );
    
    res.json({
      count: fuelVehicles.length,
      vehicles: fuelVehicles
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vehicle locations
app.get('/api/vehicle-locations', async (req, res) => {
  try {
    const locations = await fleetCompleteGet('/seeme/Api/Asset/Positions');
    res.json({
      count: locations?.length || 0,
      locations: locations || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Server Startup ────────────────────────────────────────────────────────────

async function startServer() {
  console.log('Starting RAC FleetComplete API server...');
  
  // Try to load session from database, if not available authenticate fresh
  const sessionLoaded = await loadSessionFromDB();
  if (!sessionLoaded) {
    await authenticateFleetComplete();
  }
  
  startAutoRefresh();
  
  app.listen(PORT, () => {
    console.log(`RAC FleetComplete API server running on port ${PORT}`);
    console.log(`Database: ${sessionState.database}`);
    console.log('Auto-refresh: active (checks every 6 hours)');
  });
}

startServer();
