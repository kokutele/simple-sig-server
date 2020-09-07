const protooServer = require('protoo-server')
const express = require('express')
const cors = require('cors')
const http = require('http')
const { generateLiveId, generatePeerId } = require('./libs/util')

const db = new Map()
const app = express()

const port = process.env.PORT || 5000

app.use( cors() )

app.get('/liveness', (req, res) => {
  res.send('woking')
})

app.get('/live/:liveId', (req, res) => {
  const liveId = req.params.liveId

  const obj = db.get(liveId)
  if( obj ) {
    const {sender, receiverPeers} = obj
    res.json({sender, numReceiver: receiverPeers.size})
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
    senderPeer: null,
    receiverPeers: new Map() // Map<peerId, Peer>
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

const httpServer = http.createServer(app).listen(port, () => {
  console.log(`simple signaling server started on port ${port}`)
})

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
  let { peerId } = _params  ? _params.split("&")
    .reduce( (accum, curr) => {
      const [key, val] = curr.split("=")
      return Object.assign({}, accum, {[key]: val})
    }, {}) : { peerId: undefined }
  console.log(`liveId -> ${liveId}, peerId=${peerId}`)

  try {
    const liveObj = db.get(liveId)

    if( !!liveObj.room ) {
      let isSender = false

      if( peerId && liveObj.sender !== peerId ) {
        throw new TypeError('You are not registered as sender')
      } else if( peerId && liveObj.sender === peerId ) {
        console.log('connected as the sender', peerId)
        isSender = true
      } else {
        peerId = generatePeerId()
        console.log('connected as a receiver', peerId)
      }
      console.log('accept')
      const transport = accept()
      const peer = await liveObj.room.createPeer(peerId, transport)

      if( isSender ) {
        liveObj.senderPeer = peer
      } else {
        liveObj.receiverPeers.set( peerId, peer )
      }

      peer.on('request', async ( req, accept, reject ) => {
        switch( req.method ) {
        case 'peerId':
          accept( peerId )
          break
        case 'join':
        case 'leave':
        case 'offer':
          console.log( `request - ${req.method}: dst=${req.data.dst}, src=${req.data.src}, isSender=${isSender}` )
          const dstPeer = !isSender ?
            liveObj.senderPeer :
            liveObj.receiverPeers.get( req.data.dst )
          const res = await dstPeer.request( req.method, req.data )
          console.log(`accept for ${req.method}`)
          accept( res )
          break
        default:
          reject(400, `unknown method '${req.method}'`)
        }
      })

      peer.on('notification', async ( req ) => {
        console.log(`notification - ${req.method}: src=${req.data.src}, dst=${req.data.dst}`)
        const dstPeer = !isSender ?
          liveObj.senderPeer :
          liveObj.receiverPeers.get( req.data.dst )
        await dstPeer.notify( req.method, req.data )
        console.log(`notification ${req.method} sent`)
      })
    } else {
      throw new TypeError(`liveId '${liveId}' does not exists`)
    }
  } catch(err) {
    console.warn( err.message )
    reject(err.message)
  }
})

