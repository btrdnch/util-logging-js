# util-logger

Singleton-first structured JSON logger built on [pino](https://getpino.io/).

- **Singleton by default** — `require('util-logger')` returns the same instance everywhere
- **stdout always on** — every log line goes to stdout; cannot be disabled
- **Custom async transports** — subclass `Transport` to fan out to any destination
- **Native pino children** — `logger.child(bindings)` returns a real pino child logger

## Quick start

```js
const logger = require('util-logger')

logger.info({ port: 3000 }, 'server started')
// {"level":30,"time":"<ISO>","port":3000,"msg":"server started"}

logger.warn({ percent: 92 }, 'disk usage high')
// {"level":40,"time":"<ISO>","percent":92,"msg":"disk usage high"}

logger.error(new Error('ECONNREFUSED'), 'connection refused')
// {"level":50,"time":"<ISO>","err":{"type":"Error","message":"ECONNREFUSED","stack":"..."},"msg":"connection refused"}
```

Log methods: `trace` · `debug` · `info` · `warn` · `error` · `fatal`

Each method is a pure pass-through to the underlying pino instance:

```js
logger.info(msg)
logger.info(obj, msg)
logger.info(obj)          // obj.msg used as message
logger.error(err, msg)   // pino serialises Error natively
```

## configure(options)

Rebuilds the logger in place. Affects all future log calls on the singleton.

| Option | Type | Default | Description |
|---|---|---|---|
| `level` | string | `'info'` | Minimum log level (`trace` / `debug` / `info` / `warn` / `error` / `fatal`) |
| `label` | string \| null | `null` | Added as `label` field on every line; omitted when null |
| `transports` | Transport[] | `[]` | Additional async transports (stdout is always included) |

```js
logger.configure({ level: 'debug', label: 'auth-service' })

logger.debug('debug now visible')
// {"level":20,"time":"<ISO>","label":"auth-service","msg":"debug now visible"}
```

Invalid level throws and leaves the previous configuration unchanged:

```js
try {
  logger.configure({ level: 'banana' })
} catch (err) {
  // logger still at previous level/label/transports
}
```

## Child loggers

`logger.child(bindings)` returns a native pino child. Bindings are merged into every line the child produces.

```js
logger.configure({ label: 'app' })

const child = logger.child({ module: 'auth', requestId: 'req-123' })
child.info('token validated')
// {"level":30,"time":"<ISO>","label":"app","module":"auth","requestId":"req-123","msg":"token validated"}

const grandchild = child.child({ handler: 'login' })
grandchild.info({ userId: 42 }, 'login attempt')
// {"level":30,"time":"<ISO>","label":"app","module":"auth","requestId":"req-123","handler":"login","userId":42,"msg":"login attempt"}
```

**Snapshot semantics** — a child captures the pino stream at creation time. A subsequent `logger.configure()` call rebuilds the parent's pino instance but does not affect existing children; they continue routing through the old stream.

## New instance

`logger.newInstance()` creates an independent `Logger` pre-configured with the singleton's current settings. Changes to either instance do not affect the other.

```js
logger.configure({ level: 'info', label: 'main' })

const isolated = logger.newInstance()
isolated.configure({ level: 'warn', label: 'isolated' })

isolated.info('dropped — below warn')   // not emitted
isolated.warn('isolated warn')          // {"label":"isolated",...}

logger.info('singleton unaffected')     // {"label":"main",...}
```

## Custom transport

Subclass `Transport` and implement `async write(entry)`. The `entry` argument is the parsed pino log object (plain JS object, same shape as the JSON stdout line).

```js
const { Transport } = require('util-logger')
const { setTimeout } = require('timers/promises')

class MemoryTransport extends Transport {
  constructor (options) {
    super(options)
    this.entries = []
  }

  async write (entry) {
    await setTimeout(0)
    this.entries.push(entry)
  }
}

const mem = new MemoryTransport({ level: 'warn' })
logger.configure({ level: 'info', transports: [mem] })

logger.info('stdout only — below mem.level warn')
logger.warn('stdout + mem')
logger.error({ code: 500 }, 'stdout + mem')

// after a tick:
// mem.entries.length === 2
// mem.entries[0].msg === 'stdout + mem'
```

If `write()` throws, the error is caught by the transport stream and a fallback JSON line is written to stdout. The transport loop continues for subsequent entries; the caller never sees the error.

```js
class FailingTransport extends Transport {
  async write (entry) { throw new Error('simulated write failure') }
}
// fallback line emitted to stdout:
// {"level":50,"label":"util-logger:internal","msg":"Transport write failed","transport":"FailingTransport","error":"simulated write failure",...}
```
