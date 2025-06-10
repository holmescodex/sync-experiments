# Screenshot Workflow for UI Development

This document outlines the systematic approach for capturing screenshots of completed UI work using Cypress for automated, consistent, and repeatable visual documentation.

## Overview

Screenshots are essential for:
- **Visual verification** of UI changes and improvements
- **Before/after comparisons** to demonstrate progress
- **Documentation** of different UI states and interactions
- **Debugging** layout issues across different viewport sizes
- **Stakeholder communication** to show completed work

## Setup Process

### 1. Install Cypress
```bash
npm install --save-dev cypress
```

### 2. Configure Cypress
Create `cypress.config.cjs` (using CommonJS for ES module compatibility):

```javascript
const { defineConfig } = require('cypress')

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173', // Vite dev server
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    screenshotsFolder: 'cypress/screenshots',
    videosFolder: 'cypress/videos',
    video: false, // Disable video for faster execution
    viewportWidth: 1280,
    viewportHeight: 720,
  },
})
```

### 3. Create Support Commands
`cypress/support/commands.ts`:

```typescript
declare global {
  namespace Cypress {
    interface Chainable {
      captureUI(name: string): Chainable<void>
      waitForSimulation(): Chainable<void>
    }
  }
}

Cypress.Commands.add('captureUI', (name: string) => {
  cy.screenshot(name, { 
    capture: 'viewport',
    overwrite: true 
  })
})

Cypress.Commands.add('waitForSimulation', () => {
  cy.get('[data-testid="simulation-app"]', { timeout: 10000 }).should('be.visible')
  cy.get('.chat-interface', { timeout: 5000 }).should('have.length', 2)
  cy.wait(2000) // Let simulation stabilize
})
```

### 4. Add Test Data Attributes
Add `data-testid` attributes to key components for reliable element selection:

```jsx
<div className="app" data-testid="simulation-app">
```

### 5. Package.json Scripts
```json
{
  "scripts": {
    "cypress:open": "cypress open",
    "cypress:run": "cypress run",
    "cypress:screenshots": "cypress run --spec 'cypress/e2e/ui-screenshots.cy.ts'"
  }
}
```

## Screenshot Workflow

### 1. Create Screenshot Test Files
Organize by feature or milestone:

```
cypress/e2e/
├── ui-screenshots.cy.ts           # Original layout
├── new-layout-screenshots.cy.ts   # Redesigned layout  
├── clean-ui-screenshots.cy.ts     # Final clean version
└── feature-specific.cy.ts         # Individual features
```

### 2. Test Structure Pattern
```typescript
describe('Feature Screenshots', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('captures initial state', () => {
    cy.waitForSimulation()
    cy.captureUI('feature-initial-state')
  })

  it('captures after interaction', () => {
    cy.waitForSimulation()
    
    // Perform specific interactions
    cy.get('.some-element').click()
    cy.wait(1000)
    
    cy.captureUI('feature-after-interaction')
  })

  it('captures responsive states', () => {
    cy.waitForSimulation()
    
    // Test different viewport sizes
    cy.viewport(1200, 800)
    cy.captureUI('feature-medium-screen')
    
    cy.viewport(768, 800)
    cy.captureUI('feature-mobile')
  })
})
```

### 3. Systematic Capture Process

#### A. Initial State Capture
```typescript
// Wait for app to load and stabilize
cy.waitForSimulation()
cy.captureUI('initial-state')
```

#### B. Time-based Captures
```typescript
// Let simulation run to show dynamic content
cy.wait(5000) // 5 seconds for events to accumulate
cy.captureUI('with-generated-content')

cy.wait(10000) // 10 seconds for more events
cy.captureUI('with-many-events')
```

#### C. Interaction Captures
```typescript
// Test user interactions
cy.get('.message-input').type('Test message')
cy.get('.send-button').click()
cy.wait(1000)
cy.captureUI('after-manual-input')
```

#### D. Responsive Testing
```typescript
// Test different screen sizes
const viewports = [
  { width: 1400, height: 900, name: 'desktop' },
  { width: 1200, height: 800, name: 'medium' },
  { width: 768, height: 800, name: 'mobile' }
]

viewports.forEach(viewport => {
  cy.viewport(viewport.width, viewport.height)
  cy.wait(1000) // Let layout adjust
  cy.captureUI(`layout-${viewport.name}`)
})
```

#### E. Focus on Specific Sections
```typescript
// Scroll to and capture specific UI sections
cy.get('.event-timeline').scrollIntoView()
cy.captureUI('event-timeline-detailed')

cy.get('.chat-interfaces').scrollIntoView()
cy.captureUI('chat-interfaces-detailed')
```

## Execution Commands

### Run Screenshot Tests
```bash
# Run all screenshot tests
npm run cypress:screenshots

# Run specific test file
npm run cypress:run -- --spec 'cypress/e2e/clean-ui-screenshots.cy.ts'

# Open Cypress UI for interactive development
npm run cypress:open
```

### Screenshot Output
Screenshots are saved to:
```
cypress/screenshots/
├── test-file-name.cy.ts/
│   ├── screenshot-name-1.png
│   ├── screenshot-name-2.png
│   └── failed-test.png (if any failures)
```

## Best Practices

### 1. Naming Conventions
- **Descriptive names**: `clean-layout-with-chat-messages.png`
- **State indicators**: `before-redesign.png`, `after-cleanup.png`
- **Screen sizes**: `layout-mobile.png`, `layout-desktop.png`
- **Features**: `chat-interface-detailed.png`

### 2. Wait Strategies
```typescript
// Wait for elements to appear
cy.get('.loading-spinner').should('not.exist')

// Wait for animations to complete
cy.wait(500)

// Wait for dynamic content
cy.get('.message').should('have.length.gte', 3)
```

### 3. Consistent Timing
```typescript
// Standardize wait times for consistency
const WAIT_TIMES = {
  SIMULATION_LOAD: 2000,
  UI_TRANSITION: 1000,
  CONTENT_GENERATION: 5000,
  LONG_SIMULATION: 10000
}

cy.wait(WAIT_TIMES.SIMULATION_LOAD)
```

### 4. Error Handling
```typescript
// Handle potential UI state variations
cy.get('.optional-element').then($el => {
  if ($el.length) {
    cy.captureUI('with-optional-element')
  } else {
    cy.captureUI('without-optional-element')
  }
})
```

## Integration with Development Workflow

### 1. Before/After Documentation
```typescript
// Capture "before" state
it('documents current layout', () => {
  cy.waitForSimulation()
  cy.captureUI('before-redesign')
})

// After implementing changes
it('documents improved layout', () => {
  cy.waitForSimulation()
  cy.captureUI('after-redesign')
})
```

### 2. Feature Development Cycle
1. **Plan**: Create screenshot test outline
2. **Develop**: Implement feature
3. **Capture**: Run screenshot tests
4. **Review**: Analyze screenshots for issues
5. **Iterate**: Refine and re-capture
6. **Document**: Save final screenshots

### 3. Automated Verification
```typescript
// Verify key elements exist before capturing
cy.get('[data-testid="simulation-app"]').should('be.visible')
cy.get('.chat-interface').should('have.length', 2)
cy.get('.event-timeline').should('exist')

// Then capture
cy.captureUI('verified-complete-ui')
```

## Troubleshooting

### Common Issues

**Element not found errors:**
- Update selectors if UI structure changed
- Add proper wait conditions
- Use data-testid attributes for stability

**Timing issues:**
- Increase wait times for slow operations
- Use element-based waits instead of fixed timeouts
- Check for loading states

**Screenshot inconsistencies:**
- Ensure viewport size is set consistently
- Wait for animations to complete
- Clear dynamic content between tests

### Debugging Commands
```typescript
// Debug element visibility
cy.get('.problematic-element').should('be.visible').debug()

// Log current state
cy.window().then(win => console.log(win.location.href))

// Pause execution for manual inspection
cy.pause()
```

## File Organization

```
project/
├── cypress/
│   ├── e2e/
│   │   ├── ui-screenshots.cy.ts        # Main UI documentation
│   │   ├── feature-screenshots.cy.ts   # Specific features
│   │   └── responsive-tests.cy.ts      # Responsive design
│   ├── screenshots/                    # Generated screenshots
│   ├── support/
│   │   ├── commands.ts                 # Custom commands
│   │   └── e2e.ts                      # Support file
│   └── fixtures/                       # Test data
├── cypress.config.cjs                  # Cypress configuration
└── docs/
    └── screenshot-workflow.md          # This documentation
```

## Benefits of This Approach

1. **Automation**: Screenshots capture automatically during development
2. **Consistency**: Same viewport sizes and conditions every time
3. **Documentation**: Visual record of UI evolution
4. **Debugging**: Easy to spot layout issues across breakpoints
5. **Communication**: Clear visual evidence of completed work
6. **Regression Testing**: Compare new screenshots to baseline versions

This systematic approach ensures comprehensive visual documentation of UI development work while maintaining consistency and reliability across the development process.