import { spawn } from 'node:child_process'

const children = new Set()
let stopping = false

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  })
  children.add(child)
  child.once('exit', (code, signal) => {
    children.delete(child)
    if (!stopping) {
      stopping = true
      for (const sibling of children) sibling.kill('SIGTERM')
      process.exitCode = code ?? (signal ? 1 : 0)
    }
  })
  return child
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

start(
  process.execPath,
  ['--watch', 'server/index.mjs'],
  { env: { ...process.env, BI_API_PORT: '5175' } },
)
start(
  npmCommand,
  ['run', 'dev:web'],
  { shell: process.platform === 'win32' },
)

function stop() {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
