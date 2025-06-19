#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';

// Geotab API client class
class GeotabAPI {
  constructor(server = 'fleetcomplete.geotab.com') {
    this.server = server;
    this.baseUrl = `https://${server}/apiv1`;
    this.sessionId = null;
    this.database = null;
    this.userName = null;
  }

  async authenticate(userName, password, database) {
    const response = await fetch(`${this.baseUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method: 'Authenticate',
        params: {
          userName: userName,
          password: password,
          database: database
        }
      })
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    this.sessionId = data.result.credentials.sessionId;
    this.database = data.result.credentials.database;
    this.userName = data.result.credentials.userName;
    
    return data.result;
  }

  async call(method, params = {}) {
    if (!this.sessionId) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    const response = await fetch(`${this.baseUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method: method,
        params: {
          credentials: {
            userName: this.userName,
            sessionId: this.sessionId,
            database: this.database
          },
          ...params
        }
      })
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    return data.result;
  }
}

// Global API instance
let geotabAPI = new GeotabAPI();

// MCP Server setup
const server = new Server(
  {
    name: 'fleetcomplete-mcp-server',
    version: '0.1.0',
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
        name: 'authenticate',
        description: 'Authenticate with FleetComplete/Geotab',
        inputSchema: {
          type: 'object',
          properties: {
            userName: {
              type: 'string',
              description: 'Your FleetComplete email address'
            },
            password: {
              type: 'string',
              description: 'Your FleetComplete password'
            },
            database: {
              type: 'string',
              description: 'Your FleetComplete database name'
            }
          },
          required: ['userName', 'password', 'database']
        }
      },
      {
        name: 'get_vehicles',
        description: 'Get list of vehicles in your fleet',
        inputSchema: {
          type: 'object',
          properties: {
            resultsLimit: {
              type: 'number',
              description: 'Maximum number of vehicles to return (default: 50)'
            }
          }
        }
      },
      {
        name: 'get_vehicle_locations',
        description: 'Get current locations of all vehicles',
        inputSchema: {
          type: 'object',
          properties: {
            resultsLimit: {
              type: 'number',
              description: 'Maximum number of locations to return (default: 50)'
            }
          }
        }
      },
      {
        name: 'get_devices',
        description: 'Get list of tracking devices',
        inputSchema: {
          type: 'object',
          properties: {
            resultsLimit: {
              type: 'number',
              description: 'Maximum number of devices to return (default: 50)'
            }
          }
        }
      }
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'authenticate':
        const authResult = await geotabAPI.authenticate(
          args.userName,
          args.password,
          args.database
        );
        return {
          content: [
            {
              type: 'text',
              text: `Successfully authenticated to FleetComplete!\nDatabase: ${authResult.credentials.database}\nSession expires in 14 days.`
            }
          ]
        };

      case 'get_vehicles':
        const vehicles = await geotabAPI.call('Get', {
          typeName: 'Device',
          resultsLimit: args.resultsLimit || 50
        });
        return {
          content: [
            {
              type: 'text',
              text: `Found ${vehicles.length} vehicles:\n${JSON.stringify(vehicles, null, 2)}`
            }
          ]
        };

      case 'get_vehicle_locations':
        const statusData = await geotabAPI.call('Get', {
          typeName: 'StatusData',
          search: {
            diagnosticSearch: {
              id: 'DiagnosticGpsId'
            }
          },
          resultsLimit: args.resultsLimit || 50
        });
        return {
          content: [
            {
              type: 'text',
              text: `Current vehicle locations:\n${JSON.stringify(statusData, null, 2)}`
            }
          ]
        };

      case 'get_devices':
        const devices = await geotabAPI.call('Get', {
          typeName: 'Device',
          resultsLimit: args.resultsLimit || 50
        });
        return {
          content: [
            {
              type: 'text',
              text: `Fleet devices:\n${JSON.stringify(devices, null, 2)}`
            }
          ]
        };

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Error executing ${name}: ${error.message}`
    );
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('FleetComplete MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});
