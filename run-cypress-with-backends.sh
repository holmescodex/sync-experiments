#!/bin/bash

# Cypress Test Runner with Fresh Backend Setup
# This script starts a complete orchestrated backend environment with unique ports
# and then runs Cypress tests against it.

set -e  # Exit on any error

# Configuration - Use unique ports to avoid conflicts
ALICE_PORT=3011
BOB_PORT=3012
NETWORK_SIMULATOR_PORT=3013
NETWORK_HTTP_PORT=3014
FRONTEND_PORT=5174

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Cypress Test Environment${NC}"
echo "Configuration:"
echo "  Alice Backend: http://localhost:${ALICE_PORT}"
echo "  Bob Backend: http://localhost:${BOB_PORT}"
echo "  Network Simulator: ws://localhost:${NETWORK_SIMULATOR_PORT}"
echo "  Network HTTP API: http://localhost:${NETWORK_HTTP_PORT}"
echo "  Frontend: http://localhost:${FRONTEND_PORT}"
echo ""

# Kill any existing processes on our test ports
echo -e "${YELLOW}🧹 Cleaning up existing processes...${NC}"
pkill -f "port.*${ALICE_PORT}" 2>/dev/null || true
pkill -f "port.*${BOB_PORT}" 2>/dev/null || true
pkill -f "port.*${NETWORK_SIMULATOR_PORT}" 2>/dev/null || true
pkill -f "port.*${NETWORK_HTTP_PORT}" 2>/dev/null || true
pkill -f "port.*${FRONTEND_PORT}" 2>/dev/null || true
lsof -ti:${ALICE_PORT} | xargs kill -9 2>/dev/null || true
lsof -ti:${BOB_PORT} | xargs kill -9 2>/dev/null || true
lsof -ti:${NETWORK_SIMULATOR_PORT} | xargs kill -9 2>/dev/null || true
lsof -ti:${NETWORK_HTTP_PORT} | xargs kill -9 2>/dev/null || true
lsof -ti:${FRONTEND_PORT} | xargs kill -9 2>/dev/null || true

sleep 2

# Start the orchestrator with custom ports
echo -e "${YELLOW}🎬 Starting simulation orchestrator...${NC}"
cd /home/hwilson/sync-experiments/backend

# Create a custom orchestrator script for testing
cat > test-orchestrator.ts << 'EOF'
import { SimulationOrchestrator } from './src/simulation/SimulationOrchestrator'
import { NetworkSimulatorService } from './src/simulation/NetworkSimulatorService'

interface DeviceConfig {
  deviceId: string
  port: number
  publicKey?: string
  privateKey?: string
}

class TestOrchestrator {
  private orchestrator: SimulationOrchestrator
  private alicePort: number
  private bobPort: number
  private networkPort: number
  private networkHttpPort: number
  
  constructor() {
    this.alicePort = parseInt(process.env.ALICE_PORT || '3011')
    this.bobPort = parseInt(process.env.BOB_PORT || '3012')
    this.networkPort = parseInt(process.env.NETWORK_SIMULATOR_PORT || '3013')
    this.networkHttpPort = parseInt(process.env.NETWORK_HTTP_PORT || '3014')
    
    this.orchestrator = new SimulationOrchestrator()
    
    // Access the private deviceConfigs through reflection
    const configs = (this.orchestrator as any).deviceConfigs as Map<string, DeviceConfig>
    configs.clear()
    configs.set('alice', { deviceId: 'alice', port: this.alicePort })
    configs.set('bob', { deviceId: 'bob', port: this.bobPort })
    
    console.log(`[TestOrchestrator] Configured for Alice:${this.alicePort}, Bob:${this.bobPort}, Network:${this.networkPort}, HTTP:${this.networkHttpPort}`)
  }
  
  async start() {
    // Override the network service start method
    const originalStartNetworkService = (this.orchestrator as any).startNetworkService.bind(this.orchestrator)
    ;(this.orchestrator as any).startNetworkService = async () => {
      console.log('[TestOrchestrator] Starting network simulator service on custom ports...')
      ;(this.orchestrator as any).networkService = new NetworkSimulatorService(this.networkPort, this.networkHttpPort)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    
    await this.orchestrator.start()
  }
  
  async stop() {
    if ((this.orchestrator as any).stop) {
      await (this.orchestrator as any).stop()
    }
  }
}

const testOrchestrator = new TestOrchestrator()

process.on('SIGINT', async () => {
  console.log('\n[TestOrchestrator] Shutting down...')
  await testOrchestrator.stop()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n[TestOrchestrator] Shutting down...')
  await testOrchestrator.stop()
  process.exit(0)
})

testOrchestrator.start().catch(console.error)
EOF

# Start the test orchestrator in the background
ALICE_PORT=${ALICE_PORT} BOB_PORT=${BOB_PORT} NETWORK_SIMULATOR_PORT=${NETWORK_SIMULATOR_PORT} NETWORK_HTTP_PORT=${NETWORK_HTTP_PORT} \
  npx tsx test-orchestrator.ts > orchestrator-test.log 2>&1 &
ORCHESTRATOR_PID=$!

echo "Orchestrator started with PID: ${ORCHESTRATOR_PID}"

# Wait for backends to be ready
echo -e "${YELLOW}⏳ Waiting for backends to start...${NC}"
for i in {1..30}; do
  if curl -s http://localhost:${ALICE_PORT}/api/health > /dev/null 2>&1 && \
     curl -s http://localhost:${BOB_PORT}/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backends are ready!${NC}"
    break
  fi
  echo "  Attempt $i/30 - waiting for backends..."
  sleep 2
done

# Check if backends started successfully
if ! curl -s http://localhost:${ALICE_PORT}/api/health > /dev/null 2>&1; then
  echo -e "${RED}❌ Alice backend failed to start${NC}"
  kill ${ORCHESTRATOR_PID} 2>/dev/null || true
  exit 1
fi

if ! curl -s http://localhost:${BOB_PORT}/api/health > /dev/null 2>&1; then
  echo -e "${RED}❌ Bob backend failed to start${NC}"
  kill ${ORCHESTRATOR_PID} 2>/dev/null || true
  exit 1
fi

# Start frontend with custom backend ports
echo -e "${YELLOW}🌐 Starting frontend with custom backend configuration...${NC}"
cd /home/hwilson/sync-experiments/app

# Create a temporary vite config that uses our test ports
cp vite.config.ts vite.config.test.ts
cat > vite.config.test.ts << 'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.FRONTEND_PORT || '5174'),
    strictPort: true,
  },
  define: {
    // Inject the backend URLs as environment variables
    'process.env.ALICE_BACKEND_URL': JSON.stringify(process.env.ALICE_BACKEND_URL || 'http://localhost:3011'),
    'process.env.BOB_BACKEND_URL': JSON.stringify(process.env.BOB_BACKEND_URL || 'http://localhost:3012'),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  }
})
EOF

# Start frontend
FRONTEND_PORT=${FRONTEND_PORT} ALICE_BACKEND_URL=http://localhost:${ALICE_PORT} BOB_BACKEND_URL=http://localhost:${BOB_PORT} \
  npm run dev -- --config vite.config.test.ts > frontend-test.log 2>&1 &
FRONTEND_PID=$!

echo "Frontend started with PID: ${FRONTEND_PID}"

# Wait for frontend to be ready
echo -e "${YELLOW}⏳ Waiting for frontend to start...${NC}"
for i in {1..20}; do
  if curl -s http://localhost:${FRONTEND_PORT} > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend is ready!${NC}"
    break
  fi
  echo "  Attempt $i/20 - waiting for frontend..."
  sleep 2
done

# Check if frontend started successfully
if ! curl -s http://localhost:${FRONTEND_PORT} > /dev/null 2>&1; then
  echo -e "${RED}❌ Frontend failed to start${NC}"
  kill ${ORCHESTRATOR_PID} ${FRONTEND_PID} 2>/dev/null || true
  exit 1
fi

# Update Cypress config to use our test frontend URL
cat > cypress.config.test.cjs << 'EOF'
const { defineConfig } = require('cypress')

module.exports = defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:5174',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    screenshotsFolder: 'cypress/screenshots',
    video: false,
    viewportWidth: 1280,
    viewportHeight: 720,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },
})
EOF

echo -e "${GREEN}🎯 Environment ready! Running Cypress tests...${NC}"
echo ""

# Run Cypress tests
CYPRESS_BASE_URL=http://localhost:${FRONTEND_PORT} \
  npm run cypress:run -- --config-file cypress.config.test.cjs --spec 'cypress/e2e/manual-file-transfer.cy.ts'

CYPRESS_EXIT_CODE=$?

# Cleanup
echo -e "${YELLOW}🧹 Cleaning up...${NC}"
kill ${ORCHESTRATOR_PID} ${FRONTEND_PID} 2>/dev/null || true

# Remove temporary files
rm -f /home/hwilson/sync-experiments/backend/test-orchestrator.ts
rm -f vite.config.test.ts
rm -f cypress.config.test.cjs
rm -f orchestrator-test.log
rm -f frontend-test.log

echo -e "${GREEN}✅ Cleanup complete${NC}"

if [ ${CYPRESS_EXIT_CODE} -eq 0 ]; then
  echo -e "${GREEN}🎉 All tests passed!${NC}"
else
  echo -e "${RED}❌ Some tests failed${NC}"
fi

exit ${CYPRESS_EXIT_CODE}