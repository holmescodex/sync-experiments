#!/bin/bash

echo "=== Testing Dynamic Port Allocation ==="
echo "This test will start two instances and verify they use different ports"
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Start first instance in background
echo -e "${BLUE}Starting first instance...${NC}"
./run-dev-with-unique-ports.sh > instance1.log 2>&1 &
PID1=$!
echo "Instance 1 PID: $PID1"

# Wait for first instance to start
sleep 5

# Extract ports from log
PORTS1=$(grep "Starting SimulationOrchestrator with ports:" instance1.log -A 4 | tail -4)
echo -e "${GREEN}Instance 1 ports:${NC}"
echo "$PORTS1"

# Check if Alice backend is responding
ALICE1_PORT=$(echo "$PORTS1" | grep "Alice Backend:" | grep -o '[0-9]\+')
if curl -s "http://localhost:$ALICE1_PORT/api/health" > /dev/null; then
    echo -e "${GREEN}✓ Instance 1 Alice backend is running on port $ALICE1_PORT${NC}"
else
    echo -e "${RED}✗ Instance 1 Alice backend failed to start${NC}"
fi

echo

# Start second instance in background
echo -e "${BLUE}Starting second instance...${NC}"
./run-dev-with-unique-ports.sh > instance2.log 2>&1 &
PID2=$!
echo "Instance 2 PID: $PID2"

# Wait for second instance to start
sleep 5

# Extract ports from log
PORTS2=$(grep "Starting SimulationOrchestrator with ports:" instance2.log -A 4 | tail -4)
echo -e "${GREEN}Instance 2 ports:${NC}"
echo "$PORTS2"

# Check if Alice backend is responding
ALICE2_PORT=$(echo "$PORTS2" | grep "Alice Backend:" | grep -o '[0-9]\+')
if curl -s "http://localhost:$ALICE2_PORT/api/health" > /dev/null; then
    echo -e "${GREEN}✓ Instance 2 Alice backend is running on port $ALICE2_PORT${NC}"
else
    echo -e "${RED}✗ Instance 2 Alice backend failed to start${NC}"
fi

echo

# Verify ports are different
if [ "$ALICE1_PORT" != "$ALICE2_PORT" ]; then
    echo -e "${GREEN}✓ SUCCESS: Instances are using different ports!${NC}"
    echo "  Instance 1 Alice: $ALICE1_PORT"
    echo "  Instance 2 Alice: $ALICE2_PORT"
else
    echo -e "${RED}✗ FAILURE: Both instances are trying to use the same port${NC}"
fi

echo
echo "Testing independent operation..."

# Send a message to each instance
curl -s -X POST "http://localhost:$ALICE1_PORT/api/messages" \
    -H "Content-Type: application/json" \
    -d '{"content":"Message to instance 1"}' > /dev/null

curl -s -X POST "http://localhost:$ALICE2_PORT/api/messages" \
    -H "Content-Type: application/json" \
    -d '{"content":"Message to instance 2"}' > /dev/null

# Get messages from each instance
MSG1=$(curl -s "http://localhost:$ALICE1_PORT/api/messages" | grep -o "Message to instance [0-9]")
MSG2=$(curl -s "http://localhost:$ALICE2_PORT/api/messages" | grep -o "Message to instance [0-9]")

echo "Instance 1 messages: $MSG1"
echo "Instance 2 messages: $MSG2"

if [[ "$MSG1" == *"instance 1"* ]] && [[ "$MSG2" == *"instance 2"* ]]; then
    echo -e "${GREEN}✓ Instances are operating independently${NC}"
else
    echo -e "${RED}✗ Messages may have crossed between instances${NC}"
fi

echo
echo "Cleaning up..."

# Kill both instances
kill $PID1 2>/dev/null
kill $PID2 2>/dev/null

# Give them time to shut down gracefully
sleep 2

# Force kill if still running
kill -9 $PID1 2>/dev/null
kill -9 $PID2 2>/dev/null

# Clean up log files
rm -f instance1.log instance2.log

echo -e "${GREEN}Test complete!${NC}"