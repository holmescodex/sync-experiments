#!/bin/bash

# Universal test runner with dynamic port allocation and orchestration
# Based on the existing run-dev-with-unique-ports.sh pattern

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_TYPE=${1:-"test"}  # unit, test, cypress, e2e
ORCHESTRATOR_TYPE=${2:-$TEST_TYPE}
INSTANCE_ID=${3:-"${TEST_TYPE}-$(date +%s)"}

echo -e "${BLUE}🧪 Universal Test Runner${NC}"
echo -e "${BLUE}Test Type: ${TEST_TYPE}${NC}"
echo -e "${BLUE}Orchestrator: ${ORCHESTRATOR_TYPE}${NC}"
echo -e "${BLUE}Instance ID: ${INSTANCE_ID}${NC}"
echo ""

# Validate test type
case $TEST_TYPE in
  "unit"|"test"|"cypress"|"e2e")
    ;;
  *)
    echo -e "${RED}❌ Invalid test type: ${TEST_TYPE}${NC}"
    echo "Usage: $0 <unit|test|cypress|e2e> [orchestrator_type] [instance_id]"
    echo ""
    echo "Examples:"
    echo "  $0 unit          # Unit tests with minimal orchestrator"
    echo "  $0 test          # Integration tests with backend orchestrator"
    echo "  $0 cypress       # E2E tests with full orchestrator"
    exit 1
    ;;
esac

# Find available ports using enhanced port finder
echo -e "${YELLOW}🔍 Finding available ports for ${TEST_TYPE} tests...${NC}"
PORT_OUTPUT=$(npx tsx src/utils/find-test-ports.ts $TEST_TYPE $INSTANCE_ID 2>&1)
PORT_EXIT_CODE=$?

if [ $PORT_EXIT_CODE -ne 0 ]; then
  echo -e "${RED}❌ Failed to find available ports for ${TEST_TYPE}${NC}"
  echo "$PORT_OUTPUT"
  exit 1
fi

# Extract just the export commands (stdout)
PORT_EXPORTS=$(echo "$PORT_OUTPUT" | grep "^export")

# Show the debug info (stderr) 
echo "$PORT_OUTPUT" | grep -E "^\[Port|^\s" >&2

# Evaluate the export commands
eval "$PORT_EXPORTS"

echo -e "${GREEN}✅ Port allocation complete!${NC}"
echo -e "${YELLOW}Ports allocated:${NC}"
echo "  Alice Backend: ${ALICE_PORT}"
echo "  Bob Backend: ${BOB_PORT}"
if [ -n "$NETWORK_SIMULATOR_PORT" ]; then
  echo "  Network Simulator: ${NETWORK_SIMULATOR_PORT}"
  echo "  Network HTTP API: ${NETWORK_HTTP_PORT}"
fi
if [ -n "$FRONTEND_PORT" ]; then
  echo "  Frontend Server: ${FRONTEND_PORT}"
fi
echo ""

# Function to cleanup on exit
cleanup() {
  echo -e "${YELLOW}🧹 Cleaning up orchestrator...${NC}"
  
  # Kill orchestrator if it's running
  if [ -n "$ORCHESTRATOR_PID" ]; then
    kill $ORCHESTRATOR_PID 2>/dev/null || true
    wait $ORCHESTRATOR_PID 2>/dev/null || true
  fi
  
  # Release ports
  npx tsx src/utils/release-ports.ts $INSTANCE_ID 2>/dev/null || true
  
  echo -e "${GREEN}✅ Cleanup complete${NC}"
}

# Set up cleanup trap
trap cleanup EXIT INT TERM

# Start appropriate orchestrator
echo -e "${YELLOW}🎬 Starting ${ORCHESTRATOR_TYPE} orchestrator...${NC}"

case $ORCHESTRATOR_TYPE in
  "unit"|"minimal")
    # Minimal orchestrator - just environment setup
    echo -e "${BLUE}Starting minimal orchestrator for unit tests...${NC}"
    npx tsx src/scripts/start-minimal-orchestrator.ts &
    ORCHESTRATOR_PID=$!
    ;;
    
  "test"|"integration"|"backend")
    # Backend orchestrator - backends + network service
    echo -e "${BLUE}Starting backend orchestrator for integration tests...${NC}"
    npx tsx src/scripts/start-backend-orchestrator.ts &
    ORCHESTRATOR_PID=$!
    ;;
    
  "cypress"|"e2e"|"full")
    # Full orchestrator - everything + frontend
    echo -e "${BLUE}Starting full orchestrator for E2E tests...${NC}"
    echo -e "${YELLOW}Note: Full orchestrator not yet implemented, using backend orchestrator${NC}"
    npx tsx src/scripts/start-backend-orchestrator.ts &
    ORCHESTRATOR_PID=$!
    ;;
    
  *)
    echo -e "${RED}❌ Unknown orchestrator type: ${ORCHESTRATOR_TYPE}${NC}"
    exit 1
    ;;
esac

# Wait for orchestrator to start
echo -e "${YELLOW}⏳ Waiting for orchestrator to be ready...${NC}"
sleep 3

# Verify orchestrator is running
if ! kill -0 $ORCHESTRATOR_PID 2>/dev/null; then
  echo -e "${RED}❌ Orchestrator failed to start${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Orchestrator ready!${NC}"
echo ""

# Run tests with orchestrated environment
echo -e "${YELLOW}🧪 Running ${TEST_TYPE} tests with orchestrated environment...${NC}"
echo ""

case $TEST_TYPE in
  "unit")
    # Run unit tests only (crypto, utilities)
    TEST_MODE=orchestrated npx vitest run src/tests/crypto/ src/tests/utils/ --reporter=verbose
    ;;
  "test"|"integration")
    # Run integration tests
    TEST_MODE=orchestrated npx vitest run src/tests/integration/ src/tests/sync/ src/tests/api/ --reporter=verbose
    ;;
  "cypress")
    # Run Cypress tests (need to implement Cypress config with our ports)
    echo -e "${YELLOW}Note: Cypress integration not yet implemented${NC}"
    echo "Would run: cypress run with backend URLs:"
    echo "  ALICE_BACKEND_URL=${ALICE_BACKEND_URL}"
    echo "  BOB_BACKEND_URL=${BOB_BACKEND_URL}"
    ;;
  "e2e")
    # Run all tests
    TEST_MODE=orchestrated npx vitest run --reporter=verbose
    ;;
esac

TEST_EXIT_CODE=$?

if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo ""
  echo -e "${GREEN}✅ All tests passed!${NC}"
else
  echo ""
  echo -e "${RED}❌ Some tests failed (exit code: $TEST_EXIT_CODE)${NC}"
fi

# Cleanup will happen automatically via trap
exit $TEST_EXIT_CODE