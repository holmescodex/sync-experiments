const dgram = require('dgram')

// Create two test UDP sockets
const alice = dgram.createSocket('udp4')
const bob = dgram.createSocket('udp4')

alice.on('message', (msg, rinfo) => {
  console.log(`Alice received from ${rinfo.address}:${rinfo.port}: ${msg}`)
})

bob.on('message', (msg, rinfo) => {
  console.log(`Bob received from ${rinfo.address}:${rinfo.port}: ${msg}`)
})

alice.bind(8001, () => {
  console.log('Alice listening on 8001')
  
  // Send test message to Bob
  const packet = `alice:bob:test:${JSON.stringify({hello: 'world'})}`
  alice.send(Buffer.from(packet), 8002, 'localhost', (err) => {
    if (err) console.error('Alice send error:', err)
    else console.log('Alice sent:', packet)
  })
})

bob.bind(8002, () => {
  console.log('Bob listening on 8002')
})

// Keep alive
setTimeout(() => {
  console.log('Closing...')
  alice.close()
  bob.close()
}, 2000)