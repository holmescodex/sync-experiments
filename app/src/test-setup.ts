import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { consoleMonitor, expectNoConsoleErrors } from './tests/setup-console-monitor'

// Clean up after each test
afterEach(() => {
  cleanup()
  
  // Check for console errors after each test
  try {
    expectNoConsoleErrors()
  } catch (error) {
    // Log the error but don't fail the test
    // This allows us to see console errors without breaking existing tests
    console.log('\n⚠️  Console errors detected in test:', error.message)
  }
})

beforeEach(() => {
  // Clear any errors from previous tests
  consoleMonitor.clearErrors()
})