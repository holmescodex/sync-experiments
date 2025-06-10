// Test setup and utilities for simulation service tests

import { beforeEach, afterEach } from 'vitest'

// Global test setup
beforeEach(() => {
  // Set test environment
  process.env.NODE_ENV = 'test'
  process.env.TEST_MODE = 'unit'
})

afterEach(() => {
  // Clean up any global state
})

// Helper functions for tests
export const testHelpers = {
  async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  },

  generateRandomPort(): number {
    return 10000 + Math.floor(Math.random() * 50000)
  },

  isPortAvailable(port: number): Promise<boolean> {
    const net = require('net')
    return new Promise((resolve) => {
      const server = net.createServer()
      server.listen(port, () => {
        server.close(() => resolve(true))
      })
      server.on('error', () => resolve(false))
    })
  }
}

export default testHelpers