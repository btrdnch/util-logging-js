'use strict'

const pino = require('pino')
const LEVELS = require('./levels')

const LEVEL_NAMES = Object.keys(LEVELS)

function validateLevel (level) {
  if (LEVELS[level] === undefined) {
    throw new Error('Invalid log level: ' + level)
  }
}

class Logger {
  constructor () {
    this._level = 'info'
    this._label = null
    this._transports = []
    this._pino = null
    this._rebuild()
  }

  configure (options = {}) {
    const level = options.level ?? 'info'
    const label = options.label ?? null
    const transports = options.transports ?? []

    validateLevel(level)

    this._level = level
    this._label = label
    this._transports = transports
    this._rebuild()
  }

  child (bindings) {
    return this._pino.child(bindings)
  }

  _rebuild () {
    const streams = [{ stream: pino.destination(1), level: this._level }]
    for (const t of this._transports) {
      streams.push({ stream: t._stream, level: t.level || this._level })
    }
    this._pino = pino({
      level: this._level,
      base: this._label !== null ? { label: this._label } : null,
      timestamp: pino.stdTimeFunctions.isoTime
    }, pino.multistream(streams))
  }
}

LEVEL_NAMES.forEach(function (levelName) {
  Logger.prototype[levelName] = function (...args) {
    this._pino[levelName](...args)
  }
})

module.exports = Logger
