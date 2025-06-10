#!/bin/bash

echo "=== Testing Backend Integration ==="
echo ""

# Change to backend directory
cd /home/hwilson/sync-experiments/backend

# Kill any existing servers
echo "Cleaning up existing servers..."
pkill -f "tsx.*server.ts" 2>/dev/null || true
sleep 1

# Start backend servers
echo "Starting backend servers..."
DEVICE_ID=alice PORT=3001 npx tsx src/server.ts > alice.log 2>&1 &
ALICE_PID=$!
echo "  Alice backend started (PID: $ALICE_PID)"

sleep 2

DEVICE_ID=bob PORT=3002 npx tsx src/server.ts > bob.log 2>&1 &
BOB_PID=$!
echo "  Bob backend started (PID: $BOB_PID)"

sleep 2

# Test backend health endpoints
echo ""
echo "Testing backend health endpoints..."
echo -n "  Alice: "
curl -s http://localhost:3001/api/health | jq -c . || echo "FAILED"
echo -n "  Bob: "
curl -s http://localhost:3002/api/health | jq -c . || echo "FAILED"

# Change to app directory
cd /home/hwilson/sync-experiments/app

# Start the frontend dev server
echo ""
echo "Starting frontend dev server..."
npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!
echo "  Frontend started (PID: $FRONTEND_PID)"

sleep 5

# Run the Cypress test
echo ""
echo "Running Cypress test..."
npm run cypress:run -- --spec "cypress/e2e/backend-message-test.cy.ts"

# Cleanup
echo ""
echo "Cleaning up..."
kill $ALICE_PID $BOB_PID $FRONTEND_PID 2>/dev/null || true

echo ""
echo "Test completed!"