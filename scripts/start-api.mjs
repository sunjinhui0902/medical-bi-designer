import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { apiNetworkEnv } from './api-network-env.mjs'

const child = spawn(process.execPath, [fileURLToPath(new URL('../server/index.mjs', import.meta.url))], {
  stdio: 'inherit', windowsHide: true, env: apiNetworkEnv(),
})
child.once('error', error => { console.error(error.message); process.exitCode = 1 })
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
