// Console error monitoring for tests
// This file is imported by test-setup.ts to catch console errors during tests

interface ConsoleError {
  message: string
  stack?: string
  timestamp: number
  type: 'error' | 'warn'
}

class ConsoleMonitor {
  private errors: ConsoleError[] = []
  private originalError: typeof console.error
  private originalWarn: typeof console.warn
  private ignorePatterns: RegExp[] = [
    // Add patterns for expected/harmless warnings here
    /Download the React DevTools/,
    /ReactDOM.render is no longer supported/,
  ]

  constructor() {
    this.originalError = console.error
    this.originalWarn = console.warn
    this.setupInterceptors()
  }

  private setupInterceptors() {
    // Intercept console.error
    console.error = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ')
      
      if (!this.shouldIgnore(message)) {
        this.errors.push({
          message,
          stack: new Error().stack,
          timestamp: Date.now(),
          type: 'error'
        })
      }
      
      // Still log to original console
      this.originalError.apply(console, args)
    }

    // Intercept console.warn
    console.warn = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ')
      
      if (!this.shouldIgnore(message)) {
        this.errors.push({
          message,
          stack: new Error().stack,
          timestamp: Date.now(),
          type: 'warn'
        })
      }
      
      // Still log to original console
      this.originalWarn.apply(console, args)
    }
  }

  private shouldIgnore(message: string): boolean {
    return this.ignorePatterns.some(pattern => pattern.test(message))
  }

  getErrors(): ConsoleError[] {
    return [...this.errors]
  }

  clearErrors() {
    this.errors = []
  }

  hasErrors(): boolean {
    return this.errors.length > 0
  }

  getErrorSummary(): string {
    if (!this.hasErrors()) return 'No console errors detected'
    
    const summary = this.errors.map(err => 
      `[${err.type.toUpperCase()}] ${err.message}`
    ).join('\n')
    
    return `Found ${this.errors.length} console errors:\n${summary}`
  }

  restore() {
    console.error = this.originalError
    console.warn = this.originalWarn
  }
}

// Global instance
export const consoleMonitor = new ConsoleMonitor()

// Helper for tests
export function expectNoConsoleErrors() {
  const errors = consoleMonitor.getErrors()
  if (errors.length > 0) {
    const summary = consoleMonitor.getErrorSummary()
    consoleMonitor.clearErrors() // Clear for next test
    throw new Error(`Console errors detected:\n${summary}`)
  }
}