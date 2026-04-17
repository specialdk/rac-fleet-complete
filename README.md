# RAC FleetComplete Dashboard

Fleet management dashboard for Rirratjingu Aboriginal Corporation (RAC) integrating FleetComplete telematics with Claude AI through the Model Context Protocol (MCP).

## Overview

This project provides:

* **Express.js API Server** - REST API for FleetComplete fleet management data
* **Connection Manager** - Web UI for monitoring FleetComplete session status
* **MCP Server** - Claude Desktop integration for AI-powered fleet analysis (coming soon)
* **PostgreSQL Session Storage** - Persistent session management

## Project Structure

```
rac-fleet-complete/
├── server.js              # Main Express.js API server
├── mcp-server.js          # MCP server for Claude Desktop (TODO)
├── public/
│   ├── index.html         # Connection Manager UI
│   └── dashboard.html     # Main Dashboard UI (TODO)
├── package.json           # NPM dependencies
├── .env.example           # Environment template
├── .gitignore             # Git ignore rules
└── README.md              # This file
```

## Features

### Current (Phase 1)
- ✅ FleetComplete API authentication & session management
- ✅ 14-day session persistence with auto-refresh
- ✅ Connection Manager UI (MEX-style design)
- ✅ Vehicle tracking endpoints
- ✅ PostgreSQL session storage
- ✅ Railway deployment ready

### Planned (Phase 2)
- 🔄 Main Dashboard UI with fuel delivery metrics
- 🔄 MCP Server for Claude Desktop integration
- 🔄 Productivity analytics (loading efficiency, delivery times)
- 🔄 Geofence event tracking
- 🔄 AI-powered fleet insights

## Prerequisites

* Node.js >= 18.0.0
* PostgreSQL database (Railway recommended)
* FleetComplete account with API access

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file from the template:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Server
PORT=3000
NODE_ENV=development

# FleetComplete
FLEETCOMPLETE_USERNAME=it@rirratjingu.com
FLEETCOMPLETE_PASSWORD=your_password_here

# PostgreSQL (Railway)
DATABASE_URL=postgresql://user:password@host:5432/database
```

## Database Setup

Create the session storage table in PostgreSQL:

```sql
CREATE TABLE fleetcomplete_sessions (
    id SERIAL PRIMARY KEY,
    database_name VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    session_cookie TEXT,
    user_id VARCHAR(255),
    authenticated_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    last_verified TIMESTAMP,
    auto_renew BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_fleetcomplete_database ON fleetcomplete_sessions(database_name);
```

## Running Locally

```bash
npm start      # Production
npm run dev    # Development (auto-reload)
```

Server runs on `http://localhost:3000`

## Deployment to Railway

1. **Create new Railway project**
2. **Add PostgreSQL database**
3. **Connect GitHub repo:** `specialdk/rac-fleet-complete`
4. **Set environment variables:**
   - `FLEETCOMPLETE_USERNAME`
   - `FLEETCOMPLETE_PASSWORD`
   - `DATABASE_URL` (auto-set by Railway)
5. **Deploy!**

Changes pushed to `main` branch auto-deploy to Railway.

## API Endpoints

### Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/session-status` | Session expiration & status |
| GET | `/connection-status` | FleetComplete connectivity test |
| POST | `/api/force-refresh` | Manual session refresh |

### Fleet Data

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/vehicles` | All fleet vehicles |
| GET | `/api/fuel-delivery-vehicles` | RF01 & RF02 fuel trucks only |
| GET | `/api/vehicle-locations` | Current vehicle positions |

## FleetComplete API Integration

**Authentication:**
- 14-day session-based authentication
- Auto-refresh when session expires in < 7 days
- Session cookie stored in PostgreSQL

**API Base URL:**
```
https://api.fleetcomplete.com
```

**Endpoints Used:**
- `/seeme/Api/SignOn/LogOn` - Authentication
- `/seeme/Api/Asset/Assets` - Vehicle list
- `/seeme/Api/Asset/Positions` - Vehicle locations

## RAC Fleet Context

**Fuel Delivery Vehicles:**
- **RF01:** T609 Kenworth (License: CF17NN) - Primary fuel delivery
- **RF02:** T408 SAR Fuel body truck (License: CE51DH) - Secondary fuel delivery

**Other Fleet:**
- T409, UD Prime Mover, UD HR Tipper, Bobcat, Cat Skid steer (quarry/construction)

**Key Locations:**
1. Rio Fuel Gantry (loading station)
2. Quarry Depot (staging area)
3. Mine Fuel Farm (primary delivery)
4. BP Nhulunbuy (secondary delivery)
5. Yirrkala Store (occasional delivery)

## Session Management

**Session Lifecycle:**
- **Duration:** 14 days from authentication
- **Auto-refresh:** Checks every 6 hours, refreshes if < 7 days remaining
- **Status indicators:**
  - 🟢 Green: > 7 days remaining
  - 🟡 Amber: 3-7 days remaining
  - 🔴 Red: < 3 days remaining

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.18.2 | Web server framework |
| pg | ^8.11.3 | PostgreSQL client |
| dotenv | ^16.3.1 | Environment variables |
| @modelcontextprotocol/sdk | ^1.17.3 | MCP server SDK |
| zod | ^3.22.4 | Schema validation |
| nodemon | ^3.0.1 | Development auto-reload |

## Architecture

```
┌─────────────────┐
│ Claude Desktop  │ (Phase 2)
│   MCP Client    │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  MCP Server     │ (Phase 2)
│  (local)        │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Express.js API  │
│   (Railway)     │
├─────────────────┤
│ • Session Mgmt  │
│ • API Proxy     │
│ • Data Transform│
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  FleetComplete  │
│      API        │
└─────────────────┘
         │
         ↓
┌─────────────────┐
│  PostgreSQL     │
│   (Railway)     │
└─────────────────┘
```

## Development Roadmap

**Phase 1:** ✅ Foundation (Current)
- Express.js server
- FleetComplete authentication
- Connection Manager UI
- PostgreSQL session storage

**Phase 2:** 🔄 Dashboard & Analytics
- Main dashboard UI
- Fuel delivery productivity metrics
- Geofence event tracking
- Trip analysis

**Phase 3:** 🔄 MCP Integration
- MCP server for Claude Desktop
- Natural language fleet queries
- AI-powered insights

**Phase 4:** 🔄 Advanced Features
- Real-time alerts
- Custom reporting
- Mobile optimization

## Contributing

This is an internal RAC project maintained by Duane Kay (Business Intelligence Manager).

## License

MIT

## Contact

**Duane Kay**  
Business Intelligence Manager  
Rirratjingu Aboriginal Corporation  
Nhulunbuy, NT

---

**Built with:**
- FleetComplete API
- Express.js
- PostgreSQL (Railway)
- Model Context Protocol
- Claude AI
