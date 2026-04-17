#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';

dotenv.config();

// Ensure Railway URL has https:// prefix
let railwayUrl = process.env.RAILWAY_API_URL || 'http://localhost:3000';
if (!railwayUrl.startsWith('http://') && !railwayUrl.startsWith('https://')) {
  railwayUrl = `https://${railwayUrl}`;
}
const RAILWAY_API_URL = railwayUrl;

// Helper function to call Railway API
async function callAPI(endpoint) {
  try {
    const response = await fetch(`${RAILWAY_API_URL}${endpoint}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(`Failed to call ${endpoint}: ${error.message}`);
  }
}

// Helper function to call Railway API with POST
async function callAPIPost(endpoint, body = {}) {
  try {
    const response = await fetch(`${RAILWAY_API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(`Failed to call ${endpoint}: ${error.message}`);
  }
}

// Create MCP server instance
const server = new Server(
  {
    name: 'rac-fleetcomplete',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'test_fleetcomplete_connection',
        description: 'Test connection to RAC FleetComplete API and get system status',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_vehicles',
        description: 'Get all fleet vehicles tracked in FleetComplete/Geotab',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_fuel_delivery_vehicles',
        description: 'Get only fuel delivery vehicles (RF01 T609 Kenworth and RF02 T408 SAR Fuel)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_vehicle_locations',
        description: 'Get current locations of all fleet vehicles',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_geofences',
        description: 'Get all geofences/zones configured in FleetComplete (Rio Gantry, Quarry Depot, Mine Tank Farm, BP Garage, Gulkula Mine)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_zone_events',
        description: 'Get zone entry/exit events for geofence analysis. Optional filters: fromDate, toDate, deviceId, zoneId',
        inputSchema: {
          type: 'object',
          properties: {
            fromDate: {
              type: 'string',
              description: 'Start date in ISO format (e.g., 2024-01-01T00:00:00Z)',
            },
            toDate: {
              type: 'string',
              description: 'End date in ISO format (e.g., 2024-01-31T23:59:59Z)',
            },
            deviceId: {
              type: 'string',
              description: 'Device ID to filter by specific vehicle',
            },
            zoneId: {
              type: 'string',
              description: 'Zone ID to filter by specific geofence',
            },
          },
        },
      },
      {
        name: 'get_trips',
        description: 'Get trip data for fuel delivery analysis. Optional filters: fromDate, toDate, deviceId',
        inputSchema: {
          type: 'object',
          properties: {
            fromDate: {
              type: 'string',
              description: 'Start date in ISO format (e.g., 2024-01-01T00:00:00Z)',
            },
            toDate: {
              type: 'string',
              description: 'End date in ISO format (e.g., 2024-01-31T23:59:59Z)',
            },
            deviceId: {
              type: 'string',
              description: 'Device ID to filter by specific vehicle',
            },
          },
        },
      },
      {
        name: 'get_connection_status',
        description: 'Get FleetComplete API connection status including session expiry and vehicle count',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_session_status',
        description: 'Get detailed session status including authentication time, expiry, and refresh count',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'force_session_refresh',
        description: 'Force a manual session refresh to FleetComplete/Geotab (use if connection fails)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'test_fleetcomplete_connection': {
        const health = await callAPI('/health');
        const connection = await callAPI('/connection-status');
        const session = await callAPI('/api/session-status');
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'ok',
                service: health.service,
                version: health.version,
                connected: connection.connected,
                database: connection.database,
                vehicleCount: connection.vehicleCount,
                sessionDaysRemaining: connection.sessionDaysRemaining,
                sessionStatus: session.status,
                timestamp: health.timestamp,
              }, null, 2),
            },
          ],
        };
      }

      case 'get_vehicles': {
        const data = await callAPI('/api/vehicles');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                count: data.count,
                vehicles: data.vehicles,
              }, null, 2),
            },
          ],
        };
      }

      case 'get_fuel_delivery_vehicles': {
        const data = await callAPI('/api/fuel-delivery-vehicles');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                count: data.count,
                vehicles: data.vehicles,
                note: 'RF01 (T609 Kenworth, CF17NN) and RF02 (T408 SAR Fuel, CE51DH) - dedicated fuel delivery trucks',
              }, null, 2),
            },
          ],
        };
      }

      case 'get_vehicle_locations': {
        const data = await callAPI('/api/vehicle-locations');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                count: data.count,
                locations: data.locations,
              }, null, 2),
            },
          ],
        };
      }

      case 'get_geofences': {
        const data = await callAPI('/api/geofences');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                count: data.count,
                geofences: data.geofences,
              }, null, 2),
            },
          ],
        };
      }

      case 'get_zone_events': {
        const params = new URLSearchParams();
        if (args.fromDate) params.append('fromDate', args.fromDate);
        if (args.toDate) params.append('toDate', args.toDate);
        if (args.deviceId) params.append('deviceId', args.deviceId);
        if (args.zoneId) params.append('zoneId', args.zoneId);
        
        const queryString = params.toString();
        const endpoint = queryString ? `/api/zone-events?${queryString}` : '/api/zone-events';
        const data = await callAPI(endpoint);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                count: data.count,
                events: data.events,
              }, null, 2),
            },
          ],
        };
      }

      case 'get_trips': {
        const params = new URLSearchParams();
        if (args.fromDate) params.append('fromDate', args.fromDate);
        if (args.toDate) params.append('toDate', args.toDate);
        if (args.deviceId) params.append('deviceId', args.deviceId);
        
        const queryString = params.toString();
        const endpoint = queryString ? `/api/trips?${queryString}` : '/api/trips';
        const data = await callAPI(endpoint);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                count: data.count,
                trips: data.trips,
              }, null, 2),
            },
          ],
        };
      }

      case 'get_connection_status': {
        const data = await callAPI('/connection-status');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case 'get_session_status': {
        const data = await callAPI('/api/session-status');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case 'force_session_refresh': {
        const data = await callAPIPost('/api/force-refresh');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: data.success,
                message: data.message,
                daysRemaining: data.daysRemaining,
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error.message,
            tool: name,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('RAC FleetComplete MCP server running on stdio');
  console.error(`Connecting to Railway API: ${RAILWAY_API_URL}`);
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
