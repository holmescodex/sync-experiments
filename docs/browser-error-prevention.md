# Browser Console Error Prevention Guide

## My Updated Development Method

### 1. Before Any UI Changes

I will always check for and fix these common browser console errors:

#### React Errors
- **Missing dependencies in useEffect**
  ```typescript
  // BAD - Will cause "React Hook useEffect has missing dependencies" warning
  useEffect(() => {
    doSomething(value)
  }, []) // Missing 'value'

  // GOOD
  useEffect(() => {
    doSomething(value)
  }, [value])
  ```

- **Keys in lists**
  ```typescript
  // BAD - Will cause "Each child in a list should have a unique key" warning
  {items.map(item => <div>{item}</div>)}

  // GOOD
  {items.map(item => <div key={item.id}>{item}</div>)}
  ```

- **Controlled/uncontrolled components**
  ```typescript
  // BAD - Will cause "changing an uncontrolled input to be controlled" warning
  <input value={value || ''} />

  // GOOD
  <input value={value ?? ''} />
  ```

#### TypeScript/Type Errors
- **Undefined object access**
  ```typescript
  // BAD - "Cannot read properties of undefined"
  const name = user.profile.name

  // GOOD
  const name = user?.profile?.name
  ```

- **Array method on possibly null**
  ```typescript
  // BAD - "Cannot read properties of null (reading 'map')"
  {items.map(...)}

  // GOOD
  {items?.map(...) || []}
  ```

#### Async/Promise Errors
- **Unhandled promise rejections**
  ```typescript
  // BAD - "Uncaught (in promise)"
  fetch('/api/data')

  // GOOD
  fetch('/api/data').catch(err => console.error('API error:', err))
  ```

- **Async in useEffect**
  ```typescript
  // BAD - "useEffect must not return anything besides a function"
  useEffect(async () => {
    await fetchData()
  }, [])

  // GOOD
  useEffect(() => {
    const load = async () => {
      await fetchData()
    }
    load()
  }, [])
  ```

#### Network/Resource Errors
- **Failed resource loads**
  ```typescript
  // BAD - "Failed to load resource: net::ERR_CONNECTION_REFUSED"
  fetch('http://localhost:3001/api/health')

  // GOOD
  fetch('http://localhost:3001/api/health')
    .catch(() => null) // Handle connection errors gracefully
  ```

- **CORS errors**
  ```typescript
  // Check for proper CORS headers on backend
  // Or use proxy in development
  ```

### 2. My Pre-Commit Checklist

Before making any changes, I will:

1. **Run the app locally**
   ```bash
   npm run dev
   ```

2. **Open browser DevTools (F12)**
   - Check Console tab for any red errors
   - Check Network tab for failed requests
   - Check for yellow warnings

3. **Test common scenarios**
   - Page load
   - Component interactions
   - API calls
   - State changes

4. **Look for these specific errors**:
   - [ ] No "Cannot read property of undefined"
   - [ ] No "Each child in a list should have a unique key"
   - [ ] No "Can't perform a React state update on an unmounted component"
   - [ ] No "Maximum update depth exceeded"
   - [ ] No "Uncaught (in promise)" errors
   - [ ] No failed network requests (unless handled)
   - [ ] No "Invalid DOM property" warnings
   - [ ] No "Unknown prop" warnings

### 3. Error Boundary Implementation

I'll add error boundaries to catch runtime errors:

```typescript
// components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error caught by boundary:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong: {this.state.error?.message}</div>
    }
    return this.props.children
  }
}
```

### 4. Development-Time Error Detection

I'll add a development-only console monitor to the app:

```typescript
// utils/consoleMonitor.ts
if (process.env.NODE_ENV === 'development') {
  const originalError = console.error
  const originalWarn = console.warn
  
  let errorCount = 0
  let warnCount = 0

  console.error = (...args) => {
    errorCount++
    // Display in UI during development
    showDevNotification(`Console Error #${errorCount}: ${args[0]}`, 'error')
    originalError.apply(console, args)
  }

  console.warn = (...args) => {
    warnCount++
    // Filter out known harmless warnings
    const message = String(args[0])
    if (!message.includes('React DevTools')) {
      showDevNotification(`Console Warning #${warnCount}: ${args[0]}`, 'warn')
    }
    originalWarn.apply(console, args)
  }
}
```

### 5. Automated Browser Testing

I'll use Cypress to catch console errors automatically:

```typescript
// cypress/support/commands.ts
Cypress.on('window:before:load', (win) => {
  cy.stub(win.console, 'error').callsFake((msg) => {
    cy.now('task', 'error', msg)
    throw new Error(msg)
  })
})
```

### 6. Common Fixes I'll Apply

#### Fix: Module not found
```typescript
// Check import paths
// Ensure file extensions for non-TS files
import data from './data.json' // Need .json extension
```

#### Fix: Hydration errors
```typescript
// Ensure server and client render the same
// Avoid Date.now() or Math.random() in initial render
```

#### Fix: Memory leaks
```typescript
useEffect(() => {
  const timer = setTimeout(...)
  
  // Always cleanup
  return () => clearTimeout(timer)
}, [])
```

### 7. My Testing Protocol

For every change:
1. Run `npm run dev`
2. Open browser console
3. Navigate through affected components
4. Check for any console output
5. Fix all errors before proceeding
6. Run `npm test` to ensure no regressions

This way, you'll never see console errors because I'll catch and fix them first!