import { afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// Don't clean up in beforeAll as tests run in parallel
// Each test should manage its own setup

afterAll(() => {
  // Clean up test keys directory after tests
  const keysDir = path.join(__dirname, '..', '..', 'keys')
  if (fs.existsSync(keysDir)) {
    fs.rmSync(keysDir, { recursive: true, force: true })
  }
})