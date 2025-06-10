import { SimulationControlServer } from './SimulationControlServer'

const port = parseInt(process.env.SIMULATION_CONTROL_PORT || '3005')

async function main() {
  console.log('Starting Simulation Control Service...')
  
  const server = new SimulationControlServer(port)
  
  await server.start()
  
  console.log(`Simulation Control Service running on port ${port}`)
  console.log('Available endpoints:')
  console.log('  GET  /api/health')
  console.log('  GET  /api/simulation/config')
  console.log('  GET  /api/simulation/status')
  console.log('  POST /api/devices/:deviceId/enabled')
  console.log('  GET  /api/devices/:deviceId/status')
  console.log('  POST /api/simulation/message-rate')
  console.log('  POST /api/simulation/attachment-rate')
  console.log('  POST /api/simulation/start')
  console.log('  POST /api/simulation/pause')
  console.log('  POST /api/simulation/speed')
}

main().catch(console.error)

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...')
  process.exit(0)
})