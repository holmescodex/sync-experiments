import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    timeout: 30000,
    testTimeout: 30000,
    hookTimeout: 10000,
    teardownTimeout: 10000,
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/types/**']
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})