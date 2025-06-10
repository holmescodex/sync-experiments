#!/bin/bash

# Development environment with dynamic port allocation
# This finds available ports to allow multiple instances

echo "[Dev] Finding available ports for development..."

# Use the enhanced port finder with development type
PORT_EXPORTS=$(npx tsx src/utils/find-test-ports.ts dev "dev-$(date +%s)")

if [ $? -ne 0 ]; then
  echo "[Dev] Failed to find available ports"
  exit 1
fi

# Evaluate the export commands
eval "$PORT_EXPORTS"

echo "[Dev] Starting SimulationOrchestrator with ports:"
echo "[Dev] - Alice Backend: ${ALICE_PORT}"
echo "[Dev] - Bob Backend: ${BOB_PORT}"
echo "[Dev] - Network Simulator: ${NETWORK_SIMULATOR_PORT}"
echo "[Dev] - Network HTTP API: ${NETWORK_HTTP_PORT}"

# Update frontend .env.development if ports are different from defaults
if [ "$ALICE_PORT" != "5001" ] || [ "$BOB_PORT" != "5002" ]; then
  echo "[Dev] Note: Frontend needs to be configured with:"
  echo "[Dev]   VITE_ALICE_BACKEND_URL=http://localhost:${ALICE_PORT}"
  echo "[Dev]   VITE_BOB_BACKEND_URL=http://localhost:${BOB_PORT}"
fi

# Run the orchestrator
npx tsx src/simulation/SimulationOrchestrator.ts