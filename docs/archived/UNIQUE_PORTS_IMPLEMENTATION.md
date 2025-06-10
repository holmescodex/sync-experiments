# Unique Ports Implementation for Development

## Overview

Following the unique-ports-strategy.md pattern, I've implemented dynamic port configuration for the development environment to avoid conflicts.

## Changes Made

### 1. SimulationOrchestrator.ts
- Updated to use environment variables for all ports:
  - `ALICE_PORT` (default: 3001)
  - `BOB_PORT` (default: 3002)
  - `NETWORK_SIMULATOR_PORT` (default: 3003)
  - `NETWORK_HTTP_PORT` (default: 3004)
- Passes these ports to child processes

### 2. run-dev-with-unique-ports.sh
- New script that sets development ports in the 5000 range:
  - Alice Backend: 5001
  - Bob Backend: 5002
  - Network Simulator: 5003
  - Network HTTP API: 5004
- Avoids conflicts with default ports (3001-3004)

### 3. package.json
- `npm run dev` now uses the unique ports script
- `npm run dev:default` runs with default ports (3001-3004)

### 4. Frontend Configuration
- Created `.env.development` with:
  - `VITE_ALICE_BACKEND_URL=http://localhost:5001`
  - `VITE_BOB_BACKEND_URL=http://localhost:5002`
- Updated App.tsx to use `import.meta.env.VITE_*` variables

## Usage

### Development with unique ports (recommended):
```bash
cd backend
npm run dev
```

### Development with default ports:
```bash
cd backend
npm run dev:default
```

### Custom ports:
```bash
export ALICE_PORT=6001
export BOB_PORT=6002
export NETWORK_SIMULATOR_PORT=6003
export NETWORK_HTTP_PORT=6004
npm run dev:default
```

## Benefits

1. **No Port Conflicts**: Development uses 5000 range, avoiding conflicts with:
   - Default ports (3001-3004)
   - Cypress test ports (3011-3014)
   - Backend test ports (4011-4014)

2. **Consistent with Strategy**: Follows the established unique-ports-strategy.md pattern

3. **Frontend Integration**: Frontend automatically connects to the correct backend ports

4. **Flexibility**: Easy to override with environment variables

## Port Allocation Summary

| Environment | Alice | Bob | Network | HTTP API |
|------------|-------|-----|---------|----------|
| Default    | 3001  | 3002| 3003    | 3004     |
| Development| 5001  | 5002| 5003    | 5004     |
| Cypress    | 3011  | 3012| 3013    | 3014     |
| Backend Tests| 4011 | 4012| 4013   | 4014     |