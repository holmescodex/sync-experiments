#!/bin/bash

echo "=== Manual Message Flow Trace ==="
echo "This script traces a message from Alice to Bob"
echo

# Unique message for tracing
TRACE_MSG="TRACE_$(date +%s)"
echo "Test message: $TRACE_MSG"
echo

# Check if services are running
echo "1. Checking services..."
if ! curl -s http://localhost:5001/api/health > /dev/null; then
    echo "❌ Alice backend not running on port 5001"
    echo "   Please start with: npm run dev"
    exit 1
fi
echo "✓ Alice backend is running"

if ! curl -s http://localhost:5002/api/health > /dev/null; then
    echo "❌ Bob backend not running on port 5002"
    exit 1
fi
echo "✓ Bob backend is running"

if ! curl -s http://localhost:5004/api/health > /dev/null; then
    echo "❌ Network service not running on port 5004"
    exit 1
fi
echo "✓ Network service is running"

echo
echo "2. Sending message from Alice..."
RESPONSE=$(curl -s -X POST http://localhost:5001/api/messages \
    -H "Content-Type: application/json" \
    -d "{\"content\":\"$TRACE_MSG\"}")

MESSAGE_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "✓ Message sent with ID: $MESSAGE_ID"

echo
echo "3. Checking Alice's messages..."
ALICE_COUNT=$(curl -s http://localhost:5001/api/messages | grep -c "$TRACE_MSG")
echo "✓ Message found in Alice's store ($ALICE_COUNT occurrence)"

echo
echo "4. Checking network statistics..."
NETWORK_STATS=$(curl -s http://localhost:5004/api/stats)
echo "Network stats: $NETWORK_STATS"

echo
echo "5. Waiting for propagation (10 seconds)..."
for i in {1..10}; do
    echo -n "."
    sleep 1
done
echo

echo
echo "6. Checking Bob's messages..."
BOB_MESSAGES=$(curl -s http://localhost:5002/api/messages)
BOB_COUNT=$(echo "$BOB_MESSAGES" | grep -c "$TRACE_MSG")

if [ $BOB_COUNT -gt 0 ]; then
    echo "✅ SUCCESS: Message found in Bob's store!"
    echo "   Bob received the message from Alice"
else
    echo "❌ FAILURE: Message NOT found in Bob's store"
    echo
    echo "Debugging information:"
    
    # Check sync status
    echo
    echo "Alice sync status:"
    curl -s http://localhost:5001/api/stats | jq .
    
    echo
    echo "Bob sync status:"
    curl -s http://localhost:5002/api/stats | jq .
    
    # Check recent network events
    echo
    echo "Recent network events:"
    curl -s "http://localhost:5004/api/events?limit=10" | jq '.[] | select(.type != "connection")'
    
    echo
    echo "Possible issues:"
    echo "1. SyncManager not broadcasting messages"
    echo "2. Network simulator not forwarding"
    echo "3. WebSocket connection issues"
    echo "4. Message decryption failure"
fi