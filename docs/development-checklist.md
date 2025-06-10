# Development Checklist for Error-Free Code

## Before Committing Any Code Changes

### 1. Run Tests with Console Monitoring
```bash
npm test                    # Run all tests
npm test -- --reporter=verbose  # See detailed output
```

### 2. Check for Common Console Errors

#### TypeScript/Build Errors
- [ ] No TypeScript errors: `npm run typecheck`
- [ ] No linting errors: `npm run lint`
- [ ] Clean build: `npm run build`

#### React Errors
- [ ] No missing key props in lists
- [ ] No invalid DOM nesting (e.g., <p> inside <p>)
- [ ] No undefined props being accessed
- [ ] No setState on unmounted components

#### Async/Promise Errors
- [ ] All promises have .catch() handlers
- [ ] No unhandled promise rejections
- [ ] Async functions properly await critical operations

#### Import/Module Errors
- [ ] All imports resolve correctly
- [ ] No circular dependencies
- [ ] Correct import paths (relative vs absolute)

### 3. Browser Testing
```bash
npm run dev
# Open browser console (F12)
# Check for any red errors or yellow warnings
```

### 4. Common Patterns to Avoid

#### Undefined Access
```typescript
// BAD
const value = object.property.nested  // property might be undefined

// GOOD
const value = object?.property?.nested
```

#### Missing Error Boundaries
```typescript
// BAD
<Component /> // Might throw

// GOOD
<ErrorBoundary>
  <Component />
</ErrorBoundary>
```

#### Unhandled Async
```typescript
// BAD
async function doWork() {
  await riskyOperation()
}
doWork() // No error handling

// GOOD
doWork().catch(error => {
  console.error('Operation failed:', error)
})
```

### 5. Test-Specific Checks

#### Database Cleanup
- [ ] All database connections closed in afterEach
- [ ] Temporary files deleted
- [ ] Event listeners removed

#### Mock Restoration
- [ ] All mocked functions restored
- [ ] Console methods restored if overridden
- [ ] Global state reset

### 6. Performance Checks
- [ ] No infinite loops
- [ ] No excessive re-renders
- [ ] No memory leaks (check with Chrome DevTools)

## Automated Console Error Detection

The test suite now includes automatic console error detection via `setup-console-monitor.ts`:

1. **All tests monitor console.error and console.warn**
2. **Errors are reported after each test**
3. **Known harmless warnings are filtered**

To make a test fail on console errors:
```typescript
import { expectNoConsoleErrors } from './setup-console-monitor'

it('should not produce console errors', () => {
  // Your test code
  doSomething()
  
  // Explicitly check for console errors
  expectNoConsoleErrors()
})
```

## Quick Commands

```bash
# Full check before committing
npm run lint && npm run typecheck && npm test && npm run build

# Check specific file for issues
npm run lint -- src/path/to/file.ts
npm test -- src/path/to/file.test.ts
```

## VS Code Extensions

Install these to catch errors while coding:
- ESLint
- Error Lens (shows errors inline)
- TypeScript Error Translator

## Git Pre-commit Hook

Add to `.git/hooks/pre-commit`:
```bash
#!/bin/sh
npm run lint || exit 1
npm run typecheck || exit 1
npm test || exit 1
```

This ensures no code with errors gets committed.