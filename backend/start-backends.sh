#\!/bin/bash

# Start both backend servers for testing

echo "Starting backend servers..."

# Kill any existing servers
pkill -f "tsx.*server.ts" 2>/dev/null || true
sleep 1

# Start Alice backend
echo "Starting Alice backend on port 3001..."
cd /home/hwilson/sync-experiments/backend
DEVICE_ID=alice PORT=3001 npx tsx src/server.ts &
ALICE_PID=$\!

sleep 2

# Start Bob backend  
echo "Starting Bob backend on port 3002..."
DEVICE_ID=bob PORT=3002 npx tsx src/server.ts &
BOB_PID=$\!

echo ""
echo "Backend servers started:"
echo "  Alice: http://localhost:3001 (PID: $ALICE_PID)"
echo "  Bob: http://localhost:3002 (PID: $BOB_PID)"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait and handle shutdown
trap "echo 'Stopping servers...'; kill $ALICE_PID $BOB_PID 2>/dev/null; exit" INT TERM
wait
EOF < /dev/null
