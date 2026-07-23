import { spawn, spawnSync } from 'node:child_process'
import { mkdir, open, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stateRoot = path.join(projectRoot, '.vite')
const pidFile = path.join(stateRoot, 'dev.pid')
const webPort = 5174
const apiPort = 5175

await mkdir(stateRoot, { recursive: true })

function killProcessTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    return
  }
  try { process.kill(-pid, 'SIGTERM') } catch {}
}

function listeningPids(port) {
  if (process.platform !== 'win32') return []
  const result = spawnSync('netstat.exe', ['-ano', '-p', 'tcp'], {
    windowsHide: true,
    encoding: 'utf8',
  })
  return String(result.stdout || '')
    .split(/\r?\n/)
    .filter((line) => line.includes(`:${port} `))
    .map((line) => Number(line.trim().split(/\s+/).at(-1)))
    .filter((pid) => Number.isInteger(pid) && pid > 0)
}

try {
  killProcessTree(Number((await readFile(pidFile, 'utf8')).trim()))
} catch {}

for (const port of [webPort, apiPort]) {
  for (const pid of new Set(listeningPids(port))) killProcessTree(pid)
}
await new Promise((resolve) => setTimeout(resolve, 600))

const stdout = await open(path.join(stateRoot, 'dev.out.log'), 'a')
const stderr = await open(path.join(stateRoot, 'dev.err.log'), 'a')
const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const child = spawn(command, ['run', 'dev'], {
  cwd: projectRoot,
  detached: true,
  windowsHide: true,
  stdio: ['ignore', stdout.fd, stderr.fd],
  shell: process.platform === 'win32',
})
child.unref()
await writeFile(pidFile, `${child.pid}\n`, 'utf8')
await stdout.close()
await stderr.close()

let ready = false
let lastError = ''
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${webPort}/api/health`)
    if (response.ok) {
      ready = true
      break
    }
    lastError = `HTTP ${response.status}`
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
  }
  await new Promise((resolve) => setTimeout(resolve, 500))
}

if (!ready) {
  throw new Error(`开发服务未能在预期时间内就绪：${lastError}`)
}

console.log(`医疗BI Designer 已启动：http://127.0.0.1:${webPort}`)
console.log(`API 健康检查已通过：http://127.0.0.1:${webPort}/api/health`)
