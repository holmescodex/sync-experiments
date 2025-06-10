#!/bin/bash

# Start all backend servers including simulation control

echo "Starting all backend servers using UniversalOrchestrator..."

# Kill any existing servers
pkill -f "tsx.*server.ts" 2>/dev/null || true
pkill -f "tsx.*SimulationControlServer.ts" 2>/dev/null || true
pkill -f "tsx.*NetworkSimulatorService.ts" 2>/dev/null || true
pkill -f "tsx.*start-unified-orchestrator.ts" 2>/dev/null || true
sleep 2

echo "Starting UniversalOrchestrator in direct-udp mode..."
cd /home/hwilson/sync-experiments/backend

# Start orchestrator with direct UDP mode
MODE=direct-udp npx tsx scripts/start-unified-orchestrator.ts &
ORCHESTRATOR_PID=$!
sleep 3

# Start Simulation Control Server (now in separate service)
echo "Starting Simulation Control Server on port 3005..."
cd /home/hwilson/sync-experiments/simulation-service && npm run dev &
SIM_CONTROL_PID=$!
cd /home/hwilson/sync-experiments/backend

echo ""
echo "All backend servers started:"
echo "  UniversalOrchestrator: Alice and Bob with direct UDP (PID: $ORCHESTRATOR_PID)"
echo "  Simulation Control: http://localhost:3005 (PID: $SIM_CONTROL_PID)"
echo ""
echo "Alice and Bob backends are managed by the orchestrator and communicate directly via UDP"
echo "Check orchestrator logs for device URLs and UDP ports"
echo ""
echo "Press Ctrl+C to stop all servers"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Stopping all servers..."
    kill $ORCHESTRATOR_PID $SIM_CONTROL_PID 2>/dev/null
    sleep 1
    # Force kill if still running
    kill -9 $ORCHESTRATOR_PID $SIM_CONTROL_PID 2>/dev/null
    exit 0
}

# Set trap for clean shutdown
trap cleanup INT TERM

# Wait for all background processes
wait