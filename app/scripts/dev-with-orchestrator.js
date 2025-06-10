#!/usr/bin/env node

/**
 * Comprehensive development script that:
 * 1. Starts the backend orchestrator
 * 2. Waits for port allocation 
 * 3. Starts frontend with discovered ports
 * 4. Manages all processes together
 */

import { spawn } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'

let orchestratorProcess = null
let frontendProcess = null

async function startOrchestrator() {
  console.log('🚀 Starting backend orchestrator...')
  
  orchestratorProcess = spawn('npm', ['run', 'dev'], {
    cwd: '../backend',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true
  })
  
  return new Promise((resolve, reject) => {
    let stdoutBuffer = ''
    let stderrBuffer = ''
    
    orchestratorProcess.stdout.on('data', (data) => {
      const output = data.toString()
      stdoutBuffer += output
      console.log(`[Backend] ${output.trim()}`)
      
      // Look for port allocation completion
      if (output.includes('All services started successfully') || 
          (output.includes('alice: http://localhost:') && output.includes('bob: http://localhost:'))) {
        // Extract ports from output
        const aliceMatch = stdoutBuffer.match(/alice: http:\/\/localhost:(\d+)/)
        const bobMatch = stdoutBuffer.match(/bob: http:\/\/localhost:(\d+)/)
        
        if (aliceMatch && bobMatch) {
          const ports = {
            alice: parseInt(aliceMatch[1]),
            bob: parseInt(bobMatch[1])
          }
          console.log(`✅ Backend ports allocated: Alice=${ports.alice}, Bob=${ports.bob}`)
          resolve(ports)
        }
      }
    })
    
    orchestratorProcess.stderr.on('data', (data) => {
      const output = data.toString()
      stderrBuffer += output
      console.error(`[Backend Error] ${output.trim()}`)
    })
    
    orchestratorProcess.on('error', (error) => {
      console.error('❌ Failed to start orchestrator:', error)
      reject(error)
    })
    
    orchestratorProcess.on('exit', (code) => {
      if (code !== 0) {
        console.error(`❌ Orchestrator exited with code ${code}`)
        reject(new Error(`Orchestrator failed with exit code ${code}`))
      }
    })
    
    // Timeout after 30 seconds
    setTimeout(() => {
      reject(new Error('Timeout waiting for orchestrator to start'))
    }, 30000)
  })
}

async function startFrontend(ports) {
  console.log(`🚀 Starting frontend with backend ports...`)
  
  const env = {
    ...process.env,
    VITE_ALICE_BACKEND_URL: `http://localhost:${ports.alice}`,
    VITE_BOB_BACKEND_URL: `http://localhost:${ports.bob}`,
    VITE_SIMULATION_CONTROL_URL: 'http://localhost:3005' // Fixed simulation control port
  }
  
  frontendProcess = spawn('vite', [], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true
  })
  
  return new Promise((resolve) => {
    let frontendUrl = null
    
    frontendProcess.stdout.on('data', (data) => {
      const output = data.toString()
      console.log(`[Frontend] ${output.trim()}`)
      
      // Extract frontend URL from Vite output
      const urlMatch = output.match(/➜\s+Local:\s+(http:\/\/localhost:\d+)/)
      if (urlMatch && !frontendUrl) {
        frontendUrl = urlMatch[1]
        resolve(frontendUrl)
      }
    })
    
    frontendProcess.stderr.on('data', (data) => {
      console.error(`[Frontend Error] ${data.toString().trim()}`)
    })
    
    frontendProcess.on('error', (error) => {
      console.error('❌ Failed to start frontend:', error)
      resolve(null)
    })
    
    frontendProcess.on('exit', (code) => {
      console.log(`Frontend exited with code ${code}`)
    })
    
    // Timeout after 15 seconds
    setTimeout(() => {
      if (!frontendUrl) {
        resolve('http://localhost:5173') // Default fallback
      }
    }, 15000)
  })
}

function setupGracefulShutdown() {
  const shutdown = (signal) => {
    console.log(`\n🛑 Received ${signal}, shutting down...`)
    
    if (frontendProcess) {
      console.log('Stopping frontend...')
      frontendProcess.kill('SIGTERM')
    }
    
    if (orchestratorProcess) {
      console.log('Stopping orchestrator...')
      orchestratorProcess.kill('SIGTERM')
    }
    
    setTimeout(() => {
      console.log('Force killing processes...')
      if (frontendProcess) frontendProcess.kill('SIGKILL')
      if (orchestratorProcess) orchestratorProcess.kill('SIGKILL')
      process.exit(1)
    }, 5000)
  }
  
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGBREAK', () => shutdown('SIGBREAK'))
}

async function main() {
  console.log('🎯 Starting full development environment...')
  
  setupGracefulShutdown()
  
  try {
    // Start orchestrator and wait for port allocation
    const ports = await startOrchestrator()
    
    // Small delay to ensure backend is fully ready
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Start frontend with discovered ports
    const frontendUrl = await startFrontend(ports)
    
    console.log('✅ Development environment ready!')
    console.log('')
    console.log(`🌐 FRONTEND: ${frontendUrl}`)
    console.log('')
    console.log(`🔧 Alice Backend: http://localhost:${ports.alice}`)
    console.log(`🔧 Bob Backend: http://localhost:${ports.bob}`)
    
    // Keep process alive
    process.stdin.resume()
    
  } catch (error) {
    console.error('❌ Failed to start development environment:', error.message)
    process.exit(1)
  }
}

main()