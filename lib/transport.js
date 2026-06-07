'use strict'

const build = require('pino-abstract-transport')

class Transport {
  constructor (options = {}) {
    this.level = options.level ?? null
    this._stream = this._createStream()
  }

  async write (entry) {
    throw new Error('Transport.write() not implemented in ' + this.constructor.name)
  }

  _createStream () {
    const self = this
    return build(async function (source) {
      for await (const obj of source) {
        try {
          await self.write(obj)
        } catch (err) {
          process.stdout.write(JSON.stringify({
            level: 50,
            time: new Date().toISOString(),
            label: 'util-logger:internal',
            msg: 'Transport write failed',
            transport: self.constructor.name,
            error: err.message
          }) + '\n')
        }
      }
    })
  }
}

module.exports = Transport
