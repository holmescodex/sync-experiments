# Testing Guide

This document describes the reorganized testing structure across the sync-experiments project.

## Directory Structure

All tests and scripts have been organized into dedicated folders:

```
sync-experiments/
├── app/
│   ├── tests/
│   │   ├── unit/          # Core functionality tests
│   │   ├── integration/   # Multi-component tests  
│   │   ├── components/    # React component tests
│   │   └── test-setup.ts  # Test configuration
│   └── scripts/           # Development and debug scripts
├── backend/
│   ├── tests/
│   │   ├── unit/          # Individual module tests
│   │   ├── integration/   # Multi-service tests
│   │   ├── e2e/           # End-to-end scenarios
│   │   └── setup.ts       # Test configuration
│   └── scripts/           # Backend scripts and orchestrators
└── simulation-service/
    ├── tests/
    │   ├── unit/          # Simulation component tests
    │   ├── integration/   # Service integration tests
    │   └── e2e/           # Simulation scenarios
    └── scripts/           # (Future simulation scripts)
```

## Running Tests

### App Tests (Frontend)
```bash
cd app

# All tests
npm test

# Specific categories
npm test tests/unit
npm test tests/integration  
npm test tests/components

# Watch mode
npm test -- --watch
```

### Backend Tests
```bash
cd backend

# All tests
npm test

# Specific categories
npm run test:unit
npm run test:integration
npm run test:e2e

# Watch mode
npm run test:watch
```

### Simulation Service Tests
```bash
cd simulation-service

# All tests
npm test

# Specific categories  
npm test tests/unit
npm test tests/integration
npm test tests/e2e

# With coverage
npm test -- --coverage
```

## Test Categories

### Unit Tests
- **App**: Core functionality (simulation engine, storage, sync, crypto)
- **Backend**: Individual modules (crypto, API, sync managers)
- **Simulation**: Isolated components (generators, time controller)

### Integration Tests
- **App**: Multi-component scenarios (message flow, file sync)
- **Backend**: Multi-service coordination (UDP sync, orchestration)
- **Simulation**: Service integration (control server with backends)

### End-to-End Tests
- **Backend**: Complete workflows (event recording, sync scenarios)
- **Simulation**: Full simulation scenarios (time-controlled sync)

### Component Tests (App Only)
- React component behavior and interaction testing
- Chat interfaces, event logs, network visualization

## Import Path Changes

Tests now use absolute paths from their respective root directories:

**Before (app):**
```typescript
import { Component } from '../../components/Component'
```

**After (app):**
```typescript
import { Component } from '../../src/components/Component'
```

**Before (backend):**
```typescript
import { Service } from '../../crypto/Service'
```

**After (backend):**
```typescript
import { Service } from '../../../src/crypto/Service'
```

## Configuration Updates

- **Vitest configs** updated to point to new test directories
- **Package.json scripts** updated for new structure
- **Import paths** automatically updated via script

## Benefits

1. **Clear Organization**: Tests separated from source code
2. **Better Navigation**: Dedicated test folders are easier to find
3. **Cleaner Source**: Source directories focus on implementation
4. **Test Categories**: Unit/integration/e2e clearly separated
5. **Service Isolation**: Each service has its own complete test suite

## Migration Notes

- All import paths have been automatically updated
- Old test directories have been removed
- Configuration files updated to reflect new structure
- Script locations consolidated in dedicated folders