'use strict'

const Logger = require('./lib/logger')
const Transport = require('./lib/transport')

const singleton = new Logger()

singleton.Transport = Transport

singleton.newInstance = function () {
  const instance = new Logger()
  instance.configure({
    level: singleton._level,
    label: singleton._label,
    transports: singleton._transports.slice()
  })
  instance.Transport = Transport
  return instance
}

module.exports = singleton
