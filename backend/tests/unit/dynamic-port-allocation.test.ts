import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, ChildProcess } from 'child_process'
import fetch from 'node-fetch'
import { isPortAvailable, findAvailablePorts, getPortsForEnvironment } from '../utils/port-finder'

describe('Dynamic Port Allocation', () => {
  let instance1: ChildProcess | null = null
  let instance2: ChildProcess | null = null
  let instance1Ports: any = null
  let instance2Ports: any = null

  const waitForPort = async (port: number, maxAttempts = 30): Promise<boolean> => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`http://localhost:${port}/api/health`)
        if (response.ok) return true
      } catch (e) {
        // Port not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    return false
  }

  const extractPortsFromOutput = (output: string): any => {
    const aliceMatch = output.match(/Alice Backend: (\d+)/)
    const bobMatch = output.match(/Bob Backend: (\d+)/)
    const networkMatch = output.match(/Network Simulator: (\d+)/)
    const httpMatch = output.match(/Network HTTP API: (\d+)/)
    
    if (aliceMatch && bobMatch && networkMatch && httpMatch) {
      return {
        alice: parseInt(aliceMatch[1]),
        bob: parseInt(bobMatch[1]),
        network: parseInt(networkMatch[1]),
        http: parseInt(httpMatch[1])
      }
    }
    return null
  }

  it('should allocate different ports for multiple instances', async () => {
    // Start first instance
    console.log('Starting first instance...')
    instance1 = spawn('./run-dev-with-unique-ports.sh', [], {
      cwd: process.cwd(),
      shell: true,
      env: { ...process.env }
    })

    let instance1Output = ''
    instance1.stdout?.on('data', (data) => {
      const text = data.toString()
      instance1Output += text
      console.log('[Instance1]', text.trim())
    })
    instance1.stderr?.on('data', (data) => {
      console.error('[Instance1 Error]', data.toString().trim())
    })

    // Wait for first instance to start and extract ports
    await new Promise(resolve => setTimeout(resolve, 3000))
    instance1Ports = extractPortsFromOutput(instance1Output)
    expect(instance1Ports).toBeTruthy()
    expect(instance1Ports.alice).toBe(5001) // Should get primary ports

    // Verify first instance is running
    const aliceReady = await waitForPort(instance1Ports.alice)
    expect(aliceReady).toBe(true)

    // Start second instance
    console.log('\nStarting second instance...')
    instance2 = spawn('./run-dev-with-unique-ports.sh', [], {
      cwd: process.cwd(),
      shell: true,
      env: { ...process.env }
    })

    let instance2Output = ''
    instance2.stdout?.on('data', (data) => {
      const text = data.toString()
      instance2Output += text
      console.log('[Instance2]', text.trim())
    })
    instance2.stderr?.on('data', (data) => {
      console.error('[Instance2 Error]', data.toString().trim())
    })

    // Wait for second instance to start and extract ports
    await new Promise(resolve => setTimeout(resolve, 3000))
    instance2Ports = extractPortsFromOutput(instance2Output)
    expect(instance2Ports).toBeTruthy()
    expect(instance2Ports.alice).toBe(5101) // Should get secondary ports

    // Verify second instance is running on different ports
    const alice2Ready = await waitForPort(instance2Ports.alice)
    expect(alice2Ready).toBe(true)

    // Verify ports are different
    expect(instance2Ports.alice).not.toBe(instance1Ports.alice)
    expect(instance2Ports.bob).not.toBe(instance1Ports.bob)
    expect(instance2Ports.network).not.toBe(instance1Ports.network)
    expect(instance2Ports.http).not.toBe(instance1Ports.http)

    // Test that both instances work independently
    console.log('\nTesting independent operation...')
    
    // Send message to instance 1
    const response1 = await fetch(`http://localhost:${instance1Ports.alice}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Test message instance 1' })
    })
    expect(response1.ok).toBe(true)

    // Send message to instance 2
    const response2 = await fetch(`http://localhost:${instance2Ports.alice}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Test message instance 2' })
    })
    expect(response2.ok).toBe(true)

    // Verify messages are isolated
    const messages1 = await fetch(`http://localhost:${instance1Ports.alice}/api/messages`).then(r => r.json())
    const messages2 = await fetch(`http://localhost:${instance2Ports.alice}/api/messages`).then(r => r.json())

    // Each instance should have its own message
    expect(messages1.some((m: any) => m.content === 'Test message instance 1')).toBe(true)
    expect(messages2.some((m: any) => m.content === 'Test message instance 2')).toBe(true)
    
    // Messages should not cross instances
    expect(messages1.some((m: any) => m.content === 'Test message instance 2')).toBe(false)
    expect(messages2.some((m: any) => m.content === 'Test message instance 1')).toBe(false)
  }, 60000) // 60 second timeout

  afterAll(async () => {
    // Clean up instances
    if (instance1) {
      instance1.kill('SIGTERM')
      await new Promise(resolve => setTimeout(resolve, 1000))
      if (!instance1.killed) instance1.kill('SIGKILL')
    }
    if (instance2) {
      instance2.kill('SIGTERM')
      await new Promise(resolve => setTimeout(resolve, 1000))
      if (!instance2.killed) instance2.kill('SIGKILL')
    }
  })
})

describe('Port Finder Utilities', () => {
  it('should correctly identify available and occupied ports', async () => {
    const available = await isPortAvailable(59999) // High port likely to be free
    expect(available).toBe(true)

    const occupied = await isPortAvailable(80) // System port likely occupied
    expect(occupied).toBe(false)
  })

  it('should find consecutive available ports', async () => {
    const ports = await findAvailablePorts(58000, 4)
    expect(ports).toHaveLength(4)
    expect(ports[1]).toBe(ports[0] + 1)
    expect(ports[2]).toBe(ports[0] + 2)
    expect(ports[3]).toBe(ports[0] + 3)
  })

  it('should handle environment-based port allocation', async () => {
    const devPorts = await getPortsForEnvironment('DEVELOPMENT')
    expect(devPorts.alice).toBeGreaterThanOrEqual(5001)
    expect(devPorts.bob).toBe(devPorts.alice + 1)
    expect(devPorts.networkSimulator).toBe(devPorts.alice + 2)
    expect(devPorts.networkHttp).toBe(devPorts.alice + 3)
  })
})