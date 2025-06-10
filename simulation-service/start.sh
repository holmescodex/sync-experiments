#!/bin/bash

# Start the Simulation Control Service

echo "Starting Simulation Control Service..."

# Set default port if not provided
export SIMULATION_CONTROL_PORT="${SIMULATION_CONTROL_PORT:-3005}"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the service
npm run dev