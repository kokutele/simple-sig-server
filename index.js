const protooServer = require('protoo-server')
const express = require('express')
const http = require('http')
const { generateLiveId, generatePeerId } = require('./libs/util')

const db = new Map()
const app = express()

app.get('/liveness', (req, res) => {
  res.send('woking')
})

app.get('/live/:liveId', (req, res) => {
  const liveId = req.params.liveId
  const { sender } = req.query

  const obj = db.get(liveId)
  if( obj && obj.sender === sender ) {
    const {sender, receivers} = obj
    res.json({sender, numReceiver: receivers.length})
  } else if( obj && obj.sender !== sender ) {
    const mesg = `sender is wrong: ${sender}`
    console.warn(mesg)
    res.status(500).send(mesg)
  } else {
    const mesg = `cannot find liveId: ${liveId}`
    console.warn(mesg)
    res.status(500).send(mesg)
  }
})

app.post('/live', (req, res) => {
  const liveId = generateLiveId()
  const room = new protooServer.Room()
  const peerId = generatePeerId()
  db.set( liveId, {
    room,
    sender: peerId,
    receivers: []
  })
  res.json({liveId, peerId})
})

app.get('/liveIds', (req, res) => {
  const ret = []
  for( let key of db.keys() ) {
    ret.push(key)
  }
  res.json( ret )
})

const httpServer = http.createServer(app).listen(3000)

const options =
{
  maxReceivedFrameSize     : 960000, // 960 KBytes.
  maxReceivedMessageSize   : 960000,
  fragmentOutgoingMessages : true,
  fragmentationThreshold   : 960000
};

const server = new protooServer.WebSocketServer(httpServer, options)

server.on('connectionrequest', async(info, accept, reject) => {
  const url = info.request.url
  const [liveId, _params] = url.slice(1).split("?")
  let { peerId } = _params.split("&")
    .reduce( (accum, curr) => {
      const [key, val] = curr.split("=")
      return Object.assign({}, accum, {[key]: val})
    }, {})
  console.log(`liveId -> ${liveId}, peerId=${peerId}`)

  const { room, sender, receivers } = db.get(liveId)

  try {
    if( !!room ) {
      if( peerId && sender !== peerId ) {
        throw new TypeError('You are not registered as sender')
      } else if( peerId && sender === peerId ) {
        console.log('connected as the sender', peerId)
      } else {
        peerId = generatePeerId()
        receivers.push(peerId)
        console.log('connected as a receiver', peerId)
      }
      console.log('accept')
      const transport = accept()
      const peer = await room.createPeer(peerId, transport)
      _setHandler(peer)
    } else {
      throw new TypeError(`liveId '${liveId}' does not exists`)
    }
  } catch(err) {
    console.warn( err.message )
    reject(err.message)
  }
})

const _setHandler = (peer) => {
  peer.on('request', (req, accept, reject) => {
    switch( req.method ) {
      case 'peerId':
        accept( peer.id)
        break
      default:
        reject('unknown method')
    }
  })
}
