import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'],
    env: {
      // Port configuration from orchestrator
      ALICE_BACKEND_URL: process.env.ALICE_BACKEND_URL || 'http://localhost:5001',
      BOB_BACKEND_URL: process.env.BOB_BACKEND_URL || 'http://localhost:5002',
      NETWORK_HTTP_URL: process.env.NETWORK_HTTP_URL || 'http://localhost:5004',
      
      // Always orchestrated mode
      TEST_MODE: 'orchestrated',
      
      // Instance tracking
      INSTANCE_ID: process.env.INSTANCE_ID || 'test-instance',
      
      // Crypto keys (provided by orchestrator)
      PRIVATE_KEY: process.env.PRIVATE_KEY || '',
      PUBLIC_KEY: process.env.PUBLIC_KEY || '',
      PEER_KEYS: process.env.PEER_KEYS || '{}',
      TRUSTED_PEERS: process.env.TRUSTED_PEERS || '',
      
      // Network configuration
      NETWORK_SIMULATOR_PORT: process.env.NETWORK_SIMULATOR_PORT || '5003',
      NETWORK_HTTP_PORT: process.env.NETWORK_HTTP_PORT || '5004',
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    
    // Separate test files by type for better organization
    include: [
      'src/tests/**/*.test.ts'
    ],
    
    // Exclude files that aren't tests
    exclude: [
      'src/tests/setup.ts',
      'node_modules/**',
      'dist/**'
    ],
    
    // Reporter configuration
    reporter: ['verbose', 'json'],
    outputFile: {
      json: './test-results/results.json'
    },
    
    // Coverage configuration (optional)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './test-results/coverage'
    }
  }
})