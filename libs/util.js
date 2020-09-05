const { v4: uuidv4 } = require('uuid')

exports.generateLiveId = () => {
  return uuidv4()
}

exports.generatePeerId = () => {
  return uuidv4().slice(0, 8)
}