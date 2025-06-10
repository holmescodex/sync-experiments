#!/bin/bash

# Backend Test Runner with Fresh Orchestrator Setup
# This script starts a complete orchestrated backend environment with unique ports
# and then runs backend tests (Vitest) against it.

set -e  # Exit on any error

# Configuration - Use unique ports to avoid conflicts with Cypress or other tests
ALICE_PORT=4011
BOB_PORT=4012
NETWORK_SIMULATOR_PORT=4013
NETWORK_HTTP_PORT=4014

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🧪 Starting Backend Test Environment${NC}"
echo "Configuration:"
echo "  Alice Backend: http://localhost:${ALICE_PORT}"
echo "  Bob Backend: http://localhost:${BOB_PORT}"
echo "  Network Simulator: ws://localhost:${NETWORK_SIMULATOR_PORT}"
echo "  Network HTTP API: http://localhost:${NETWORK_HTTP_PORT}"
echo ""

# Kill any existing processes on our test ports
echo -e "${YELLOW}🧹 Cleaning up existing processes...${NC}"
pkill -f "port.*${ALICE_PORT}" 2>/dev/null || true
pkill -f "port.*${BOB_PORT}" 2>/dev/null || true
pkill -f "port.*${NETWORK_SIMULATOR_PORT}" 2>/dev/null || true
pkill -f "port.*${NETWORK_HTTP_PORT}" 2>/dev/null || true
lsof -ti:${ALICE_PORT} | xargs kill -9 2>/dev/null || true
lsof -ti:${BOB_PORT} | xargs kill -9 2>/dev/null || true
lsof -ti:${NETWORK_SIMULATOR_PORT} | xargs kill -9 2>/dev/null || true
lsof -ti:${NETWORK_HTTP_PORT} | xargs kill -9 2>/dev/null || true

sleep 2

# Start the orchestrator with custom ports
echo -e "${YELLOW}🎬 Starting simulation orchestrator for backend tests...${NC}"
cd /home/hwilson/sync-experiments/backend

# Create a custom orchestrator script for backend testing
cat > backend-test-orchestrator.ts << 'EOF'
import { SimulationOrchestrator } from './src/simulation/SimulationOrchestrator'
import { NetworkSimulatorService } from './src/simulation/NetworkSimulatorService'

interface DeviceConfig {
  deviceId: string
  port: number
  publicKey?: string
  privateKey?: string
}

class BackendTestOrchestrator {
  private orchestrator: SimulationOrchestrator
  private alicePort: number
  private bobPort: number
  private networkPort: number
  private networkHttpPort: number
  
  constructor() {
    this.alicePort = parseInt(process.env.ALICE_PORT || '4011')
    this.bobPort = parseInt(process.env.BOB_PORT || '4012')
    this.networkPort = parseInt(process.env.NETWORK_SIMULATOR_PORT || '4013')
    this.networkHttpPort = parseInt(process.env.NETWORK_HTTP_PORT || '4014')
    
    this.orchestrator = new SimulationOrchestrator()
    
    // Access the private deviceConfigs through reflection
    const configs = (this.orchestrator as any).deviceConfigs as Map<string, DeviceConfig>
    configs.clear()
    configs.set('alice', { deviceId: 'alice', port: this.alicePort })
    configs.set('bob', { deviceId: 'bob', port: this.bobPort })
    
    console.log(`[BackendTestOrchestrator] Configured for Alice:${this.alicePort}, Bob:${this.bobPort}, Network:${this.networkPort}, HTTP:${this.networkHttpPort}`)
  }
  
  async start() {
    // Override the network service start method
    const originalStartNetworkService = (this.orchestrator as any).startNetworkService.bind(this.orchestrator)
    ;(this.orchestrator as any).startNetworkService = async () => {
      console.log('[BackendTestOrchestrator] Starting network simulator service on custom ports...')
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

const backendTestOrchestrator = new BackendTestOrchestrator()

process.on('SIGINT', async () => {
  console.log('\n[BackendTestOrchestrator] Shutting down...')
  await backendTestOrchestrator.stop()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n[BackendTestOrchestrator] Shutting down...')
  await backendTestOrchestrator.stop()
  process.exit(0)
})

backendTestOrchestrator.start().catch(console.error)
EOF

# Start the test orchestrator in the background
ALICE_PORT=${ALICE_PORT} BOB_PORT=${BOB_PORT} NETWORK_SIMULATOR_PORT=${NETWORK_SIMULATOR_PORT} NETWORK_HTTP_PORT=${NETWORK_HTTP_PORT} \
  npx tsx backend-test-orchestrator.ts > backend-test-orchestrator.log 2>&1 &
ORCHESTRATOR_PID=$!

echo "Backend test orchestrator started with PID: ${ORCHESTRATOR_PID}"

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
  cat backend-test-orchestrator.log
  exit 1
fi

if ! curl -s http://localhost:${BOB_PORT}/api/health > /dev/null 2>&1; then
  echo -e "${RED}❌ Bob backend failed to start${NC}"
  kill ${ORCHESTRATOR_PID} 2>/dev/null || true
  cat backend-test-orchestrator.log
  exit 1
fi

echo -e "${GREEN}🎯 Backend environment ready! Running tests...${NC}"
echo ""

# Create a test-specific vitest config that uses our backend URLs
cat > vitest.config.test.ts << 'EOF'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'],
    env: {
      ALICE_BACKEND_URL: process.env.ALICE_BACKEND_URL || 'http://localhost:4011',
      BOB_BACKEND_URL: process.env.BOB_BACKEND_URL || 'http://localhost:4012',
      NETWORK_HTTP_URL: process.env.NETWORK_HTTP_URL || 'http://localhost:4014',
      TEST_MODE: 'orchestrated'
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
EOF

# Run backend tests with the custom configuration
ALICE_BACKEND_URL=http://localhost:${ALICE_PORT} \
BOB_BACKEND_URL=http://localhost:${BOB_PORT} \
NETWORK_HTTP_URL=http://localhost:${NETWORK_HTTP_PORT} \
TEST_MODE=orchestrated \
  npm run test:run -- --config vitest.config.test.ts

TEST_EXIT_CODE=$?

# Cleanup
echo -e "${YELLOW}🧹 Cleaning up...${NC}"
kill ${ORCHESTRATOR_PID} 2>/dev/null || true

# Remove temporary files
rm -f backend-test-orchestrator.ts
rm -f vitest.config.test.ts
rm -f backend-test-orchestrator.log

echo -e "${GREEN}✅ Cleanup complete${NC}"

if [ ${TEST_EXIT_CODE} -eq 0 ]; then
  echo -e "${GREEN}🎉 All backend tests passed!${NC}"
else
  echo -e "${RED}❌ Some backend tests failed${NC}"
fi

exit ${TEST_EXIT_CODE}