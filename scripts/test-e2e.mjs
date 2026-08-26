import { spawn } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'

const HOST = '127.0.0.1'
const owned = new Set()
let shutdownPromise
let interruptedExitCode

function isListening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: HOST, port })
    const done = (listening) => {
      socket.destroy()
      resolve(listening)
    }
    socket.setTimeout(300, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

function spawnOwned(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  })
  owned.add(child)
  child.once('close', () => owned.delete(child))
  return child
}

function waitForClose(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)
    timer.unref()
    child.once('close', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function stopOwned(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    // These servers are direct Node children. Terminate the owned process first;
    // taskkill can be unavailable in restricted Windows sessions even when the
    // child itself remains terminable through Node's process handle.
    child.kill()
    await waitForClose(child, 2_000)
    if (child.exitCode !== null || child.signalCode !== null) return
    await new Promise((resolve) => {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      const timer = setTimeout(resolve, 5_000)
      timer.unref()
      const done = () => {
        clearTimeout(timer)
        resolve()
      }
      killer.once('error', done)
      killer.once('close', done)
    })
  } else {
    child.kill('SIGTERM')
  }
  await waitForClose(child, 2_000)
}

function shutdown() {
  if (shutdownPromise) return shutdownPromise
  const fallback = setTimeout(() => process.exit(interruptedExitCode ?? 1), 10_000)
  fallback.unref()
  shutdownPromise = Promise.allSettled([...owned].map(stopOwned)).then(() => {
    clearTimeout(fallback)
  })
  return shutdownPromise
}

async function waitForOwnedPortsToClose(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const listening = await Promise.all([5174, 5175].map(isListening))
    if (listening.every((value) => !value)) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return false
}

async function flushOutput() {
  const flush = (stream) => new Promise((resolve) => {
    if (!stream.writable) return resolve()
    stream.write('', resolve)
  })
  await Promise.race([
    Promise.allSettled([flush(process.stdout), flush(process.stderr)]),
    new Promise((resolve) => setTimeout(resolve, 1_000)),
  ])
}

async function exitAfterShutdown(exitCode) {
  await shutdown()
  if (!await waitForOwnedPortsToClose()) {
    console.error('[test-e2e] owned servers still listen on port 5174 or 5175 after shutdown')
    exitCode = 1
  }
  await flushOutput()
  process.exit(exitCode)
}

async function waitForHealth(url, child, label) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`${label} exited before becoming ready`)
    }
    try {
      const healthy = await new Promise((resolve) => {
        const request = http.get(url, {
          agent: false,
          headers: { connection: 'close' },
        }, (response) => {
          response.resume()
          response.once('end', () => resolve((response.statusCode ?? 500) < 400))
        })
        request.setTimeout(1_000, () => request.destroy())
        request.once('error', () => resolve(false))
      })
      if (healthy) return
    } catch {
      // The owned server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`${label} did not become ready within 30 seconds`)
}

function waitForResult(child) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      child.off('exit', onExit)
      reject(error)
    }
    const onExit = (code, signal) => {
      child.off('error', onError)
      resolve(code ?? (signal ? 1 : 0))
    }
    child.once('error', onError)
    child.once('exit', onExit)
  })
}

async function main() {
  const occupied = []
  for (const port of [5174, 5175]) {
    if (await isListening(port)) occupied.push(port)
  }
  if (occupied.length) {
    throw new Error(`E2E refused to reuse occupied port(s): ${occupied.join(', ')}`)
  }

  const api = spawnOwned(process.execPath, ['server/index.mjs'], {
    env: { ...process.env, BI_API_PORT: '5175' },
  })
  const vite = spawnOwned(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--configLoader', 'runner', '--host', HOST, '--port', '5174', '--strictPort'],
  )
  await Promise.all([
    waitForHealth('http://127.0.0.1:5175/api/health', api, 'API server'),
    waitForHealth('http://127.0.0.1:5174/', vite, 'Vite server'),
  ])

  const playwright = spawnOwned(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
    { env: { ...process.env, TY_BI_E2E_EXTERNAL_SERVER: '1' } },
  )
  return await waitForResult(playwright)
}

for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.on(signal, () => {
    interruptedExitCode = exitCode
    void exitAfterShutdown(exitCode)
  })
}

let exitCode = 1
try {
  exitCode = await main()
} catch (error) {
  console.error(`[test-e2e] ${error instanceof Error ? error.message : String(error)}`)
}
await exitAfterShutdown(interruptedExitCode ?? exitCode)
