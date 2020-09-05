const protooClient = require('protoo-client')
const request = require('async-request')


const run = async () => {
  const res = await request(
    'http://localhost:3000/live', 
    {
      method: 'POST', 
      headers: {
        'content-type':'application/json'
      }
    }
  )
  const {liveId, peerId} = JSON.parse(res.body)
  console.log( `liveId: ${liveId}, peerId: ${peerId}` )
  const transport = 
    new protooClient.WebSocketTransport(`ws://localhost:3000/${liveId}?peerId=${peerId}`)

  transport.on('open', async _ => {
    console.log('opened')
    const peer = new protooClient.Peer(transport)

    const peerId = await peer.request('peerId')
    console.log( `peerId: ${peerId}` )
  })
  transport.on('failed', mesg => {
    transport.close()
    throw( new TypeError(mesg))
  })
}

run()