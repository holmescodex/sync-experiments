import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'],
    env: {
      ALICE_BACKEND_URL: process.env.ALICE_BACKEND_URL || 'http://localhost:4011',
      BOB_BACKEND_URL: process.env.BOB_BACKEND_URL || 'http://localhost:4012',
      NETWORK_HTTP_URL: process.env.NETWORK_HTTP_URL || 'http://localhost:4014',
      TEST_MODE: 'orchestrated'
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
