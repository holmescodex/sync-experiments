const { defineConfig } = require('cypress')

module.exports = defineConfig({
  e2e: {
    // No baseUrl since we're testing APIs directly
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
    specPattern: 'cypress/e2e/backend-*.cy.ts',
    supportFile: false, // Skip support file for API tests
  },
})