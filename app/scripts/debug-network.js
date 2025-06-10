// Quick debug script to test network events
import { NetworkSimulator } from './src/network/simulator.js'

const network = new NetworkSimulator({ packetLossRate: 0.0, minLatency: 10, maxLatency: 10, jitter: 0 })
network.addDevice('alice')
network.addDevice('bob')

const events = []
network.onNetworkEvent((event) => {
  console.log('Event received:', event.status, event.type)
  events.push(event)
})

console.log('Sending event...')
const sentEvent = network.sendEvent('alice', 'bob', 'message', { content: 'Hello' })
console.log('Sent event status:', sentEvent.status)
console.log('Events array length after send:', events.length)

console.log('Ticking to 20ms...')
network.tick(20)
console.log('Events array length after tick:', events.length)
console.log('Events:', events.map(e => ({ status: e.status, type: e.type })))