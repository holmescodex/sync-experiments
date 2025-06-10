#!/bin/bash

# Start P2P backends for development
# Each backend knows about the other via environment variables

echo "🚀 Starting P2P backends..."
echo "Alice: HTTP=3001, UDP=8001"
echo "Bob: HTTP=3002, UDP=8002"

# Kill any existing processes on these ports
lsof -ti:3001,3002,8001,8002 | xargs kill -9 2>/dev/null || true

# Start Alice in background
DEVICE_ID=alice PORT=3001 UDP_PORT=8001 PEER_ENDPOINTS="bob:localhost:8002" npx tsx src/server.ts &
ALICE_PID=$!

# Start Bob in background
DEVICE_ID=bob PORT=3002 UDP_PORT=8002 PEER_ENDPOINTS="alice:localhost:8001" npx tsx src/server.ts &
BOB_PID=$!

echo "✅ Backends started"
echo "Alice PID: $ALICE_PID"
echo "Bob PID: $BOB_PID"

# Function to cleanup on exit
cleanup() {
    echo -e "\n🧹 Cleaning up..."
    kill $ALICE_PID $BOB_PID 2>/dev/null || true
    echo "✅ Cleanup complete"
}

# Set up trap to cleanup on exit
trap cleanup EXIT INT TERM

# Wait for user to press Ctrl+C
echo -e "\nPress Ctrl+C to stop..."
wait