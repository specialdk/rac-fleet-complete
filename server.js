// Fleet Complete API MCP Connection - Complete Setup
// File: server.js

const express = require('express');
const fetch = require('node-fetch');
const app = express();
const port = process.env.PORT || 3000;

// Fleet Complete API Configuration
const FLEET_COMPLETE_CONFIG = {
    // HUB GraphQL API (Modern API)
    hubApiUrl: 'https://api.fleetcomplete.com',
    graphqlUrl: 'https://api.fleetcomplete.com/graphql',
    graphiqlUrl: 'https://api.fleetcomplete.com/graphiql?path=/graphql',

    // Legacy REST API (if needed)
    legacyApiUrl: 'https://app.ecofleet.com/seeme/Api',

    // Authentication endpoints
    tokenUrl: 'https://api.fleetcomplete.com/login/token',
    refreshUrl: 'https://api.fleetcomplete.com/login/refresh',
    userInfoUrl: 'https://api.fleetcomplete.com/login/userinfo',

    // Credentials (set via environment variables)
    username: process.env.FLEET_COMPLETE_USERNAME,
    password: process.env.FLEET_COMPLETE_PASSWORD,
    apiKey: process.env.FLEET_COMPLETE_API_KEY // for legacy API if needed
};

// In-memory token storage (replace with database in production)
let tokenData = {
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    userId: null,
    fleetId: null
};

app.use(express.json());
app.use(express.static('public'));

// Utility function to check if token is expired
function isTokenExpired() {
    return !tokenData.accessToken || !tokenData.expiresAt || Date.now() >= tokenData.expiresAt;
}

// Authenticate with Fleet Complete API
async function authenticateFleetComplete() {
    try {
        console.log('🔄 Authenticating with Fleet Complete API...');

        const response = await fetch(FLEET_COMPLETE_CONFIG.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                username: FLEET_COMPLETE_CONFIG.username,
                password: FLEET_COMPLETE_CONFIG.password
            })
        });

        if (!response.ok) {
            throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Store tokens (access_token is valid for 5 minutes)
        tokenData.accessToken = data.access_token;
        tokenData.refreshToken = data.refresh_token;
        tokenData.expiresAt = Date.now() + (5 * 60 * 1000); // 5 minutes

        console.log('✅ Fleet Complete authentication successful');

        // Get user info to obtain userId and fleetId
        await getUserInfo();

        return true;
    } catch (error) {
        console.error('❌ Fleet Complete authentication failed:', error);
        throw error;
    }
}

// Get user information including userId and fleetId
async function getUserInfo() {
    try {
        const response = await fetch(FLEET_COMPLETE_CONFIG.userInfoUrl, {
            headers: {
                'Authorization': `Bearer ${tokenData.accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get user info: ${response.status}`);
        }

        const userInfo = await response.json();

        if (userInfo && userInfo.length > 0) {
            tokenData.userId = userInfo[0].userId;
            tokenData.fleetId = userInfo[0].fleetId || userInfo[0].fleetName;

            console.log('✅ User info retrieved:', {
                userId: tokenData.userId,
                fleetName: userInfo[0].fleetName
            });
        }

        return userInfo;
    } catch (error) {
        console.error('❌ Failed to get user info:', error);
        throw error;
    }
}

// Refresh access token
async function refreshAccessToken() {
    try {
        console.log('🔄 Refreshing Fleet Complete access token...');

        const response = await fetch(FLEET_COMPLETE_CONFIG.refreshUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                refreshToken: tokenData.refreshToken
            })
        });

        if (!response.ok) {
            throw new Error(`Token refresh failed: ${response.status}`);
        }

        const data = await response.json();

        tokenData.accessToken = data.access_token;
        tokenData.expiresAt = Date.now() + (5 * 60 * 1000); // 5 minutes

        console.log('✅ Access token refreshed');
        return true;
    } catch (error) {
        console.error('❌ Token refresh failed, re-authenticating...');
        return await authenticateFleetComplete();
    }
}

// Ensure we have a valid token
async function ensureValidToken() {
    if (isTokenExpired()) {
        if (tokenData.refreshToken) {
            await refreshAccessToken();
        } else {
            await authenticateFleetComplete();
        }
    }
}

// Make authenticated GraphQL request
async function makeGraphQLRequest(query, variables = {}) {
    await ensureValidToken();

    const response = await fetch(FLEET_COMPLETE_CONFIG.graphqlUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`,
            'Content-Type': 'application/json',
            'userId': tokenData.userId
        },
        body: JSON.stringify({
            query,
            variables
        })
    });

    if (!response.ok) {
        throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

// Homepage with Fleet Complete interface
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Fleet Complete API MCP Connection</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            min-height: 100vh;
        }
        .container {
            background: white;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }
        h1 { color: #2d3748; text-align: center; margin-bottom: 30px; }
        .section {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .section h3 { margin-top: 0; color: #4a5568; }
        .status {
            padding: 12px;
            border-radius: 6px;
            margin: 10px 0;
            font-weight: 500;
        }
        .status.connected { background: #ecfdf5; border: 1px solid #10b981; color: #047857; }
        .status.disconnected { background: #fef2f2; border: 1px solid #ef4444; color: #dc2626; }
        .status.pending { background: #fffbeb; border: 1px solid #f59e0b; color: #d97706; }
        button {
            background: #1e3c72;
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 6px;
            cursor: pointer;
            margin: 5px;
            font-size: 14px;
        }
        button:hover { background: #2a5298; }
        button:disabled { background: #9ca3af; cursor: not-allowed; }
        .result {
            background: #1f2937;
            color: #f9fafb;
            padding: 15px;
            border-radius: 6px;
            font-family: monospace;
            font-size: 12px;
            white-space: pre-wrap;
            max-height: 400px;
            overflow-y: auto;
            margin: 10px 0;
        }
        .button-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
            margin: 15px 0;
        }
        .highlight { background: #fef3c7; padding: 2px 4px; border-radius: 3px; }
        .vehicle-card {
            border: 1px solid #d1d5db;
            border-radius: 8px;
            padding: 15px;
            margin: 10px 0;
            background: white;
        }
        .vehicle-status {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        .status-active { background: #dcfce7; color: #166534; }
        .status-inactive { background: #fef2f2; color: #dc2626; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚛 Fleet Complete API MCP Connection</h1>
        
        <!-- Connection Status -->
        <div class="section">
            <h3>🔗 Connection Status</h3>
            <div id="connectionStatus" class="status disconnected">
                ❌ Not Connected - Need to authenticate first
            </div>
            <p><strong>Fleet Complete Configuration:</strong></p>
            <ul>
                <li>HUB GraphQL API: ${FLEET_COMPLETE_CONFIG.graphqlUrl}</li>
                <li>Token URL: ${FLEET_COMPLETE_CONFIG.tokenUrl}</li>
                <li>User ID: <span id="userId">Not retrieved</span></li>
                <li>Fleet ID: <span id="fleetId">Not retrieved</span></li>
            </ul>
        </div>

        <!-- Authentication -->
        <div class="section">
            <h3>🔐 Step 1: Authentication</h3>
            <p>Connect to Fleet Complete using your credentials. Tokens are automatically refreshed.</p>
            <button onclick="authenticate()">🚀 Authenticate with Fleet Complete</button>
            <div id="authResult"></div>
        </div>

        <!-- Vehicle Data Testing -->
        <div class="section">
            <h3>🚛 Step 2: Vehicle Data</h3>
            <p>Once authenticated, retrieve your fleet vehicles and their data:</p>
            
            <div class="button-grid">
                <button onclick="getActiveVehicles()" disabled id="btn-vehicles">🚛 Get Active Vehicles</button>
                <button onclick="getVehicleLocations()" disabled id="btn-locations">📍 Get Vehicle Locations</button>
                <button onclick="getDriverAssignments()" disabled id="btn-drivers">👨‍💼 Get Driver Assignments</button>
                <button onclick="getGeofences()" disabled id="btn-geofences">📍 Get Geofences</button>
            </div>
            
            <div id="vehicleResult"></div>
        </div>

        <!-- Real-time Data -->
        <div class="section">
            <h3>⚡ Step 3: Real-time Monitoring</h3>
            <p>Monitor vehicle locations, status, and geofence events in real-time:</p>
            
            <div class="button-grid">
                <button onclick="startLocationTracking()" disabled id="btn-tracking">📍 Start Location Tracking</button>
                <button onclick="getVehicleStatus()" disabled id="btn-status">📊 Get Vehicle Status</button>
                <button onclick="getGeofenceEvents()" disabled id="btn-events">🚨 Get Geofence Events</button>
            </div>
            
            <div id="trackingResult"></div>
        </div>

        <!-- Debug Information -->
        <div class="section">
            <h3>🐛 Debug Information</h3>
            <button onclick="showDebugInfo()" disabled id="btn-debug">📋 Show Debug Info</button>
            <div id="debugInfo"></div>
        </div>
    </div>

    <script>
        let isAuthenticated = false;

        // Authenticate with Fleet Complete
        function authenticate() {
            showLoading('authResult');
            
            fetch('/auth/fleet-complete', { method: 'POST' })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        document.getElementById('authResult').innerHTML = 
                            '<div class="status connected">✅ Authentication successful!</div>';
                        document.getElementById('connectionStatus').innerHTML = 
                            '✅ Connected - Ready to access Fleet Complete API';
                        document.getElementById('connectionStatus').className = 'status connected';
                        document.getElementById('userId').textContent = data.userId || 'Retrieved';
                        document.getElementById('fleetId').textContent = data.fleetId || 'Retrieved';
                        enableButtons();
                        isAuthenticated = true;
                    } else {
                        document.getElementById('authResult').innerHTML = 
                            '<div class="status disconnected">❌ Authentication failed: ' + (data.error || 'Unknown error') + '</div>';
                    }
                })
                .catch(error => {
                    document.getElementById('authResult').innerHTML = 
                        '<div class="status disconnected">❌ Network Error: ' + error.message + '</div>';
                });
        }

        // Get active vehicles
        function getActiveVehicles() {
            showLoading('vehicleResult');
            
            fetch('/api/vehicles')
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        displayVehicles(data.vehicles);
                    } else {
                        document.getElementById('vehicleResult').innerHTML = 
                            '<div class="status disconnected">❌ Error: ' + (data.error || 'Failed to get vehicles') + '</div>';
                    }
                })
                .catch(error => {
                    document.getElementById('vehicleResult').innerHTML = 
                        '<div class="status disconnected">❌ Network Error: ' + error.message + '</div>';
                });
        }

        // Display vehicles in a nice format
        function displayVehicles(vehicles) {
            let html = '<h4>🚛 Active Vehicles (' + vehicles.length + ')</h4>';
            
            vehicles.forEach(vehicle => {
                const lastUpdate = new Date(vehicle.latestData?.timestamp || 0).toLocaleString();
                const location = vehicle.latestData?.address || 'Location unknown';
                const status = vehicle.latestData?.ignition?.value ? 'Active' : 'Inactive';
                
                html += '<div class="vehicle-card">';
                html += '<h5>🚛 ' + (vehicle.name || 'Vehicle ' + vehicle.id.substring(0, 8)) + '</h5>';
                html += '<p><strong>License:</strong> ' + (vehicle.licensePlate || 'N/A') + '</p>';
                html += '<p><strong>Make/Model:</strong> ' + (vehicle.make || 'N/A') + ' ' + (vehicle.model || '') + ' (' + (vehicle.year || 'N/A') + ')</p>';
                html += '<p><strong>Status:</strong> <span class="vehicle-status ' + (status === 'Active' ? 'status-active' : 'status-inactive') + '">' + status + '</span></p>';
                html += '<p><strong>Location:</strong> ' + location + '</p>';
                html += '<p><strong>Last Update:</strong> ' + lastUpdate + '</p>';
                html += '</div>';
            });
            
            document.getElementById('vehicleResult').innerHTML = html;
        }

        // Get vehicle locations
        function getVehicleLocations() {
            showLoading('vehicleResult');
            
            fetch('/api/locations')
                .then(response => response.json())
                .then(data => {
                    document.getElementById('vehicleResult').innerHTML = 
                        '<div class="result">' + JSON.stringify(data, null, 2) + '</div>';
                });
        }

        // Get driver assignments
        function getDriverAssignments() {
            showLoading('vehicleResult');
            
            fetch('/api/drivers')
                .then(response => response.json())
                .then(data => {
                    document.getElementById('vehicleResult').innerHTML = 
                        '<div class="result">' + JSON.stringify(data, null, 2) + '</div>';
                });
        }

        // Get geofences
        function getGeofences() {
            showLoading('vehicleResult');
            
            fetch('/api/geofences')
                .then(response => response.json())
                .then(data => {
                    document.getElementById('vehicleResult').innerHTML = 
                        '<div class="result">' + JSON.stringify(data, null, 2) + '</div>';
                });
        }

        // Start location tracking
        function startLocationTracking() {
            showLoading('trackingResult');
            
            fetch('/api/tracking/start', { method: 'POST' })
                .then(response => response.json())
                .then(data => {
                    document.getElementById('trackingResult').innerHTML = 
                        '<div class="result">' + JSON.stringify(data, null, 2) + '</div>';
                });
        }

        // Get vehicle status
        function getVehicleStatus() {
            showLoading('trackingResult');
            
            fetch('/api/status')
                .then(response => response.json())
                .then(data => {
                    document.getElementById('trackingResult').innerHTML = 
                        '<div class="result">' + JSON.stringify(data, null, 2) + '</div>';
                });
        }

        // Get geofence events
        function getGeofenceEvents() {
            showLoading('trackingResult');
            
            fetch('/api/events')
                .then(response => response.json())
                .then(data => {
                    document.getElementById('trackingResult').innerHTML = 
                        '<div class="result">' + JSON.stringify(data, null, 2) + '</div>';
                });
        }

        // Show debug information
        function showDebugInfo() {
            fetch('/api/debug')
                .then(response => response.json())
                .then(data => {
                    document.getElementById('debugInfo').innerHTML = 
                        '<div class="result">' + JSON.stringify(data, null, 2) + '</div>';
                });
        }

        // Helper functions
        function showLoading(elementId) {
            document.getElementById(elementId).innerHTML = 
                '<div class="status pending">🔄 Loading...</div>';
        }

        function enableButtons() {
            const buttons = ['btn-vehicles', 'btn-locations', 'btn-drivers', 'btn-geofences', 
                           'btn-tracking', 'btn-status', 'btn-events', 'btn-debug'];
            buttons.forEach(id => {
                document.getElementById(id).disabled = false;
            });
        }

        // Check authentication status on page load
        fetch('/auth/status')
            .then(response => response.json())
            .then(data => {
                if (data.authenticated) {
                    document.getElementById('connectionStatus').innerHTML = 
                        '✅ Connected - Fleet Complete API ready';
                    document.getElementById('connectionStatus').className = 'status connected';
                    document.getElementById('userId').textContent = data.userId || 'Retrieved';
                    document.getElementById('fleetId').textContent = data.fleetId || 'Retrieved';
                    enableButtons();
                    isAuthenticated = true;
                }
            })
            .catch(() => {
                // Ignore errors on page load
            });
    </script>
</body>
</html>
    `);
});

// Authentication endpoint
app.post('/auth/fleet-complete', async (req, res) => {
    try {
        await authenticateFleetComplete();
        res.json({
            success: true,
            message: 'Authentication successful',
            userId: tokenData.userId,
            fleetId: tokenData.fleetId
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Check authentication status
app.get('/auth/status', (req, res) => {
    res.json({
        authenticated: !isTokenExpired(),
        userId: tokenData.userId,
        fleetId: tokenData.fleetId,
        tokenExpiresAt: tokenData.expiresAt
    });
});

// Get active vehicles
app.get('/api/vehicles', async (req, res) => {
    try {
        const query = `
            query GetActiveVehicles {
                getActiveVehicles {
                    id
                    name
                    fleetId
                    vin
                    licensePlate
                    make
                    model
                    year
                    latestData {
                        timestamp
                        gps {
                            latitude
                            longitude
                            speed
                            heading
                        }
                        address {
                            address
                            city
                            region
                            country
                        }
                        ignition {
                            value
                            timestamp
                        }
                        odometer {
                            value
                            timestamp
                        }
                    }
                }
            }
        `;

        const result = await makeGraphQLRequest(query);

        if (result.errors) {
            throw new Error(result.errors.map(e => e.message).join(', '));
        }

        res.json({
            success: true,
            vehicles: result.data.getActiveVehicles || [],
            count: result.data.getActiveVehicles?.length || 0
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get vehicle locations
app.get('/api/locations', async (req, res) => {
    try {
        const query = `
            query GetActiveVehicles {
                getActiveVehicles {
                    id
                    name
                    licensePlate
                    latestData {
                        timestamp
                        gps {
                            latitude
                            longitude
                            speed
                            heading
                        }
                        address {
                            address
                            city
                            region
                            country
                        }
                    }
                }
            }
        `;

        const result = await makeGraphQLRequest(query);

        if (result.errors) {
            throw new Error(result.errors.map(e => e.message).join(', '));
        }

        const locations = result.data.getActiveVehicles?.map(vehicle => ({
            vehicleId: vehicle.id,
            name: vehicle.name,
            licensePlate: vehicle.licensePlate,
            location: {
                latitude: vehicle.latestData?.gps?.latitude,
                longitude: vehicle.latestData?.gps?.longitude,
                speed: vehicle.latestData?.gps?.speed,
                heading: vehicle.latestData?.gps?.heading,
                address: vehicle.latestData?.address?.address,
                city: vehicle.latestData?.address?.city,
                timestamp: vehicle.latestData?.timestamp
            }
        })) || [];

        res.json({
            success: true,
            locations,
            count: locations.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get driver assignments
app.get('/api/drivers', async (req, res) => {
    try {
        const query = `
            query GetDriverAssignments {
                getDriverAssignments {
                    id
                    vehicleId
                    driverId
                    startedAt
                    endedAt
                    isDeleted
                }
            }
        `;

        const result = await makeGraphQLRequest(query);

        if (result.errors) {
            throw new Error(result.errors.map(e => e.message).join(', '));
        }

        res.json({
            success: true,
            assignments: result.data.getDriverAssignments || [],
            count: result.data.getDriverAssignments?.length || 0
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get geofences
app.get('/api/geofences', async (req, res) => {
    try {
        const query = `
            query GetGeofences {
                getGeofences {
                    id
                    name
                    fleetId
                    type
                    color
                    description
                    geojson
                    address {
                        address
                        city
                        region
                        country
                    }
                }
            }
        `;

        const result = await makeGraphQLRequest(query);

        if (result.errors) {
            throw new Error(result.errors.map(e => e.message).join(', '));
        }

        res.json({
            success: true,
            geofences: result.data.getGeofences || [],
            count: result.data.getGeofences?.length || 0
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Debug endpoint
app.get('/api/debug', (req, res) => {
    res.json({
        timestamp: new Date().toISOString(),
        tokenStatus: {
            hasAccessToken: !!tokenData.accessToken,
            hasRefreshToken: !!tokenData.refreshToken,
            expiresAt: tokenData.expiresAt,
            isExpired: isTokenExpired(),
            userId: tokenData.userId,
            fleetId: tokenData.fleetId
        },
        config: {
            hubApiUrl: FLEET_COMPLETE_CONFIG.hubApiUrl,
            graphqlUrl: FLEET_COMPLETE_CONFIG.graphqlUrl,
            hasCredentials: !!(FLEET_COMPLETE_CONFIG.username && FLEET_COMPLETE_CONFIG.password)
        }
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        authenticated: !isTokenExpired(),
        service: 'Fleet Complete API MCP'
    });
});

app.listen(port, () => {
    console.log(`🚛 Fleet Complete API MCP running on port ${port}`);
    console.log(`📊 Dashboard: http://localhost:${port}`);
    console.log(`🔗 GraphQL API: ${FLEET_COMPLETE_CONFIG.graphqlUrl}`);
    console.log(`🎯 Ready for Fleet Complete integration!`);

    if (!FLEET_COMPLETE_CONFIG.username || !FLEET_COMPLETE_CONFIG.password) {
        console.warn('⚠️  Please set FLEET_COMPLETE_USERNAME and FLEET_COMPLETE_PASSWORD environment variables');
    }
});