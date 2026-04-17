import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const GEOTAB_SERVER = 'fleetcomplete.geotab.com';
const GEOTAB_DATABASE = 'rirratjingu_aboriginal_corporation';
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

// Session state
let sessionState = {
  database: GEOTAB_DATABASE,
  username: FLEETCOMPLETE_USERNAME,
  credentials: null,
  authenticatedAt: null,
  expiresAt: null,
  lastRefresh: null,
  refreshCount: 0,
  status: 'initializing',
};

// ── Geotab/FleetComplete Authentication ──────────────────────────────────────
async function authenticateGeotab() {
  console.log('Authenticating to FleetComplete (Geotab)...');
  try {
    const response = await fetch(`https://${GEOTAB_SERVER}/apiv1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'Authenticate',
        params: {
          userName: FLEETCOMPLETE_USERNAME,
          password: FLEETCOMPLETE_PASSWORD,
          database: GEOTAB_DATABASE
        }
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Authentication failed: ${response.status} - ${text}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Geotab API error: ${JSON.stringify(data.error)}`);
    }

    if (!data.result || !data.result.credentials) {
      throw new Error('No credentials returned from Geotab API');
    }

    sessionState.credentials = data.result.credentials;
    sessionState.database = data.result.credentials.database || GEOTAB_DATABASE;
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
      JSON.stringify(sessionState.credentials),
      sessionState.credentials?.userName || FLEETCOMPLETE_USERNAME,
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
    `, [GEOTAB_DATABASE]);

    if (result.rows.length > 0) {
      const session = result.rows[0];
      const expiresAt = new Date(session.expires_at);
      const now = new Date();

      // Check if session is still valid (expires in more than 1 day)
      if (expiresAt > new Date(now.getTime() + 24 * 60 * 60 * 1000)) {
        sessionState.database = session.database_name;
        sessionState.credentials = JSON.parse(session.session_cookie);
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
      await authenticateGeotab();
    }
  }, 6 * 60 * 60 * 1000); // Check every 6 hours
}

async function geotabCall(method, params = {}) {
  if (!sessionState.credentials) {
    throw new Error('Not authenticated to Geotab');
  }

  const response = await fetch(`https://${GEOTAB_SERVER}/apiv1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method,
      params: {
        credentials: sessionState.credentials,
        ...params
      }
    }),
  });

  if (!response.ok) {
    throw new Error(`Geotab API ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Geotab API error: ${JSON.stringify(data.error)}`);
  }

  return data.result;
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
  const success = await authenticateGeotab();
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
    // Test connection by fetching devices (vehicles)
    const devices = await geotabCall('Get', { typeName: 'Device' });
    
    res.json({
      connected: true,
      database: sessionState.database,
      vehicleCount: devices?.length || 0,
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
    const devices = await geotabCall('Get', { typeName: 'Device' });
    
    res.json({
      connected: true,
      database: sessionState.database,
      vehicleCount: devices?.length || 0,
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
    const devices = await geotabCall('Get', { typeName: 'Device' });
    res.json({
      count: devices?.length || 0,
      vehicles: devices || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fuel delivery vehicles only (RF01 & RF02)
app.get('/api/fuel-delivery-vehicles', async (req, res) => {
  try {
    const devices = await geotabCall('Get', { typeName: 'Device' });
    const fuelVehicles = devices.filter(v => 
      v.name?.includes('RF01') || 
      v.name?.includes('RF02') ||
      v.name?.includes('T609') ||
      v.name?.includes('T408') ||
      v.name?.includes('CF17NN') ||
      v.name?.includes('CE51DH')
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
    const locations = await geotabCall('Get', { typeName: 'DeviceStatusInfo' });
    res.json({
      count: locations?.length || 0,
      locations: locations || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── NEW ENDPOINTS FOR DASHBOARD ──────────────────────────────────────────────

// Get all geofences/zones
app.get('/api/geofences', async (req, res) => {
  try {
    const zones = await geotabCall('Get', { typeName: 'Zone' });
    res.json({
      count: zones?.length || 0,
      geofences: zones || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get zone stop events (geofence entry/exit)
app.get('/api/zone-events', async (req, res) => {
  try {
    const { fromDate, toDate, deviceId, zoneId } = req.query;
    
    const search = {
      typeName: 'ZoneStop',
    };

    if (fromDate) {
      search.fromDate = fromDate;
    }
    if (toDate) {
      search.toDate = toDate;
    }
    if (deviceId) {
      search.deviceSearch = { id: deviceId };
    }
    if (zoneId) {
      search.zoneSearch = { id: zoneId };
    }

    const events = await geotabCall('Get', search);
    
    res.json({
      count: events?.length || 0,
      events: events || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get trips for productivity analysis
app.get('/api/trips', async (req, res) => {
  try {
    const { fromDate, toDate, deviceId } = req.query;
    
    const search = {
      typeName: 'Trip',
    };

    if (fromDate) {
      search.fromDate = fromDate;
    }
    if (toDate) {
      search.toDate = toDate;
    }
    if (deviceId) {
      search.deviceSearch = { id: deviceId };
    }

    const trips = await geotabCall('Get', search);
    
    res.json({
      count: trips?.length || 0,
      trips: trips || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get status data (real-time vehicle info)
app.get('/api/status-data', async (req, res) => {
  try {
    const statusData = await geotabCall('Get', { typeName: 'StatusData' });
    res.json({
      count: statusData?.length || 0,
      statusData: statusData || []
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
    await authenticateGeotab();
  }
  
  startAutoRefresh();
  
  app.listen(PORT, () => {
    console.log(`RAC FleetComplete API server running on port ${PORT}`);
    console.log(`Database: ${sessionState.database}`);
    console.log(`Geotab Server: ${GEOTAB_SERVER}`);
    console.log('Auto-refresh: active (checks every 6 hours)');
  });
}

startServer();
