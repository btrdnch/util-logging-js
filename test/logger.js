'use strict'

const test = require('brittle')
const { setTimeout: sleep } = require('timers/promises')
const logger = require('..')
const { Transport } = require('..')

// ─── helpers ─────────────────────────────────────────────────────────────────

class MemoryTransport extends Transport {
  constructor (options) {
    super(options)
    this.entries = []
  }

  async write (entry) {
    await sleep(0)
    this.entries.push(entry)
  }
}

// ─── singleton structure ──────────────────────────────────────────────────────

test('singleton has all log methods', function (t) {
  const methods = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
  methods.forEach(function (m) {
    t.ok(typeof logger[m] === 'function', m + ' is a function')
  })
  t.ok(typeof logger.configure === 'function', 'configure is a function')
  t.ok(typeof logger.child === 'function', 'child is a function')
  t.ok(typeof logger.newInstance === 'function', 'newInstance is a function')
})

// ─── configure() ─────────────────────────────────────────────────────────────

test('configure - level filters output', async function (t) {
  const mem = new MemoryTransport()
  logger.configure({ level: 'warn', transports: [mem] })
  logger.info('below warn - dropped')
  logger.warn('at warn - captured')
  await sleep(50)
  t.is(mem.entries.length, 1)
  t.is(mem.entries[0].msg, 'at warn - captured')
})

test('configure - label appears in output', async function (t) {
  const mem = new MemoryTransport()
  logger.configure({ label: 'svc', transports: [mem] })
  logger.info('labelled')
  await sleep(50)
  t.is(mem.entries.length, 1)
  t.is(mem.entries[0].label, 'svc')
})

test('configure - null label absent from output', async function (t) {
  const mem = new MemoryTransport()
  logger.configure({ transports: [mem] })
  logger.info('no label')
  await sleep(50)
  t.is(mem.entries.length, 1)
  t.absent(mem.entries[0].label)
})

test('configure - invalid level throws', function (t) {
  t.exception(function () { logger.configure({ level: 'banana' }) }, /Invalid log level/)
})

test('configure - state preserved after invalid level', function (t) {
  logger.configure({ level: 'warn', label: 'before' })
  try {
    logger.configure({ level: 'banana' })
  } catch (err) {
    t.ok(err, 'configure threw')
  }
  t.is(logger._level, 'warn')
  t.is(logger._label, 'before')
})

test('configure - full replace discards old transport', async function (t) {
  const mem1 = new MemoryTransport()
  const mem2 = new MemoryTransport()
  logger.configure({ level: 'info', transports: [mem1] })
  logger.configure({ level: 'error', transports: [mem2] })
  logger.info('dropped - below error')
  logger.error('captured')
  await sleep(50)
  t.is(mem1.entries.length, 0)
  t.is(mem2.entries.length, 1)
  t.is(mem2.entries[0].msg, 'captured')
})

// ─── child() ─────────────────────────────────────────────────────────────────

test('child - bindings appear in output', async function (t) {
  const mem = new MemoryTransport()
  logger.configure({ transports: [mem] })
  const child = logger.child({ module: 'auth' })
  child.info('child msg')
  await sleep(50)
  t.is(mem.entries.length, 1)
  t.is(mem.entries[0].module, 'auth')
  t.is(mem.entries[0].msg, 'child msg')
})

test('child - grandchild merges parent bindings', async function (t) {
  const mem = new MemoryTransport()
  logger.configure({ transports: [mem] })
  const child = logger.child({ module: 'auth' })
  const grandchild = child.child({ handler: 'login' })
  grandchild.info('deep msg')
  await sleep(50)
  t.is(mem.entries.length, 1)
  t.is(mem.entries[0].module, 'auth')
  t.is(mem.entries[0].handler, 'login')
  t.is(mem.entries[0].msg, 'deep msg')
})

test('child - snapshot: routes via old pino after parent reconfigure', async function (t) {
  const mem = new MemoryTransport()
  logger.configure({ transports: [mem] })
  const child = logger.child({ snap: true })
  logger.configure({})
  child.info('via old pino')
  await sleep(50)
  t.is(mem.entries.length, 1)
  t.is(mem.entries[0].snap, true)
})

// ─── newInstance() ────────────────────────────────────────────────────────────

test('newInstance - independent level and label', async function (t) {
  logger.configure({ level: 'info', label: 'main' })
  const inst = logger.newInstance()
  const mem = new MemoryTransport()
  inst.configure({ level: 'warn', label: 'isolated', transports: [mem] })
  inst.info('dropped - below warn')
  inst.warn('captured')
  await sleep(50)
  t.is(mem.entries.length, 1)
  t.is(mem.entries[0].msg, 'captured')
  t.is(mem.entries[0].label, 'isolated')
  logger.configure({})
})

test('newInstance - does not mutate singleton state', function (t) {
  logger.configure({ level: 'info' })
  const inst = logger.newInstance()
  inst.configure({ level: 'error' })
  t.is(logger._level, 'info')
  t.is(inst._level, 'error')
  logger.configure({})
})

// ─── Transport ───────────────────────────────────────────────────────────────

test('transport - entry received with correct fields', async function (t) {
  const mem = new MemoryTransport()
  logger.configure({ transports: [mem] })
  logger.info({ key: 'val' }, 'transport msg')
  await sleep(50)
  t.is(mem.entries.length, 1)
  t.is(mem.entries[0].msg, 'transport msg')
  t.is(mem.entries[0].key, 'val')
  t.is(mem.entries[0].level, 30)
})

test('transport - own level filters entries', async function (t) {
  const mem = new MemoryTransport({ level: 'error' })
  logger.configure({ level: 'info', transports: [mem] })
  logger.info('below transport level - dropped')
  logger.error('at transport level - captured')
  await sleep(50)
  t.is(mem.entries.length, 1)
  t.is(mem.entries[0].msg, 'at transport level - captured')
})

test('transport - write failure does not crash caller', async function (t) {
  class BrokenTransport extends Transport {
    async write () { throw new Error('boom') }
  }
  const broken = new BrokenTransport()
  logger.configure({ transports: [broken] })
  t.execution(function () {
    logger.info('msg 1')
    logger.info('msg 2')
  })
  await sleep(50)
})
