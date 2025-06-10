#!/bin/bash

# Start all backend servers including simulation control

echo "Starting all backend servers..."

# Kill any existing servers
pkill -f "tsx.*server.ts" 2>/dev/null || true
pkill -f "tsx.*SimulationControlServer.ts" 2>/dev/null || true
pkill -f "tsx.*NetworkSimulatorService.ts" 2>/dev/null || true
sleep 2

# Set ports
export ALICE_PORT=3001
export BOB_PORT=3002
export NETWORK_SIMULATOR_PORT=3003
export NETWORK_HTTP_PORT=3004
export SIMULATION_CONTROL_PORT=3005

# Start Network Simulator Service first
echo "Starting Network Simulator Service on ports 3003/3004..."
cd /home/hwilson/sync-experiments/backend
npx tsx src/simulation/NetworkSimulatorService.ts &
NETWORK_PID=$!
sleep 2

# Start Alice backend
echo "Starting Alice backend on port 3001..."
DEVICE_ID=alice PORT=3001 npx tsx src/server.ts &
ALICE_PID=$!
sleep 2

# Start Bob backend  
echo "Starting Bob backend on port 3002..."
DEVICE_ID=bob PORT=3002 npx tsx src/server.ts &
BOB_PID=$!
sleep 2

# Start Simulation Control Server (now in separate service)
echo "Starting Simulation Control Server on port 3005..."
cd /home/hwilson/sync-experiments/simulation-service && npm run dev &
SIM_CONTROL_PID=$!
cd /home/hwilson/sync-experiments/backend

echo ""
echo "All backend servers started:"
echo "  Network Simulator: ws://localhost:3003, http://localhost:3004 (PID: $NETWORK_PID)"
echo "  Alice Backend: http://localhost:3001 (PID: $ALICE_PID)"
echo "  Bob Backend: http://localhost:3002 (PID: $BOB_PID)"
echo "  Simulation Control: http://localhost:3005 (PID: $SIM_CONTROL_PID)"
echo ""
echo "Press Ctrl+C to stop all servers"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Stopping all servers..."
    kill $NETWORK_PID $ALICE_PID $BOB_PID $SIM_CONTROL_PID 2>/dev/null
    sleep 1
    # Force kill if still running
    kill -9 $NETWORK_PID $ALICE_PID $BOB_PID $SIM_CONTROL_PID 2>/dev/null
    exit 0
}

# Set trap for clean shutdown
trap cleanup INT TERM

# Wait for all background processes
wait