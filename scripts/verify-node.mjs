import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npmCli = process.env.npm_execpath
const args = process.argv.slice(2)
const full = args.includes('--full')
const nodeId = args.find((arg) => !arg.startsWith('--'))?.toUpperCase()

const nodeTests = {
  'P8.0': ['tests/phase1-query-result.test.ts', 'tests/phase7-delivery.test.ts'],
  'P8.1': ['tests/phase8-dashboard-schema.test.ts'],
  'P8.2': ['tests/phase8-parameter-runtime.test.ts'],
  'P8.3': ['tests/phase8-parameter-binding.test.ts'],
  'P8.4': ['tests/phase8-query-parameters.test.ts'],
  'P8.5': ['tests/phase8-controls-refresh.test.ts'],
  'P8.6': ['tests/phase8-query-cache.test.ts'],
  'P8.7': ['tests/phase8-delivery.test.ts'],
  'P9.0': ['tests/phase9-baseline.test.ts'],
  'P9.1': ['tests/phase9-page-model.test.ts', 'tests/phase9-page-operations.test.ts'],
  'P9.2': ['tests/phase9-page-session.test.ts'],
  'P9.3': ['tests/phase9-event-authoring.test.ts'],
  'P9.4': ['tests/phase9-event-runtime.test.ts'],
  'P9.5': ['tests/phase9-set-parameter-action.test.ts', 'tests/phase9-event-runtime.test.ts'],
  'P9.6': ['tests/phase9-refresh-action.test.ts', 'tests/phase9-set-parameter-action.test.ts', 'tests/phase9-event-runtime.test.ts'],
  'P9.7': ['tests/phase9-designer-runtime-integration.test.ts', 'tests/phase9-refresh-action.test.ts', 'tests/phase9-set-parameter-action.test.ts', 'tests/phase9-event-runtime.test.ts'],
  'P10.0': ['tests/phase10-navigation-contract.test.ts'],
  'P10.1': ['tests/phase10-navigation-contract.test.ts', 'tests/phase9-page-model.test.ts', 'tests/phase9-page-operations.test.ts', 'tests/phase9-event-authoring.test.ts'],
  'P10.2': ['tests/phase10-page-runtime.test.ts', 'tests/phase10-navigation-contract.test.ts', 'tests/phase9-designer-runtime-integration.test.ts', 'tests/phase9-event-runtime.test.ts', 'tests/phase9-set-parameter-action.test.ts'],
  'P10.3': ['tests/phase10-linkage-runtime.test.ts', 'tests/phase10-page-runtime.test.ts', 'tests/phase9-designer-runtime-integration.test.ts', 'tests/phase9-event-runtime.test.ts', 'tests/phase9-set-parameter-action.test.ts'],
  'P10.4': ['tests/phase10-drill-runtime.test.ts', 'tests/phase10-designer-drill-runtime.test.ts', 'tests/phase10-page-runtime.test.ts', 'tests/phase10-linkage-runtime.test.ts', 'tests/phase10-navigation-contract.test.ts', 'tests/phase9-designer-runtime-integration.test.ts', 'tests/phase9-event-runtime.test.ts', 'tests/phase9-set-parameter-action.test.ts', 'tests/phase9-refresh-action.test.ts'],
  'P10.5': ['tests/phase10-dialog-geometry.test.ts', 'tests/phase10-dialog-runtime.test.ts', 'tests/phase10-drill-runtime.test.ts', 'tests/phase10-linkage-runtime.test.ts', 'tests/phase10-page-runtime.test.ts', 'tests/phase9-designer-runtime-integration.test.ts', 'tests/phase9-event-runtime.test.ts'],
  'P10.6': ['tests/phase10-safe-browser.test.ts', 'tests/phase10-navigation-contract.test.ts', 'tests/phase10-page-runtime.test.ts', 'tests/phase9-event-authoring.test.ts', 'tests/phase9-event-runtime.test.ts'],
  'P10.7': ['tests/phase10-dialog-geometry.test.ts', 'tests/phase10-dialog-runtime.test.ts', 'tests/phase10-safe-browser.test.ts', 'tests/phase10-drill-runtime.test.ts', 'tests/phase10-designer-drill-runtime.test.ts', 'tests/phase10-linkage-runtime.test.ts', 'tests/phase10-page-runtime.test.ts', 'tests/phase10-navigation-contract.test.ts', 'tests/phase9-designer-runtime-integration.test.ts', 'tests/phase9-event-runtime.test.ts'],
}

if (!full && !nodeId) {
  console.error('用法：npm run verify:node -- P8.2，或 npm run verify:full')
  process.exit(2)
}
if (!full && !nodeTests[nodeId]) {
  console.error(`未知节点：${nodeId}。支持：${Object.keys(nodeTests).join('、')}`)
  process.exit(2)
}

const missingTests = full ? [] : nodeTests[nodeId].filter((file) => !existsSync(path.join(projectRoot, file)))
if (missingTests.length) {
  console.error(`节点 ${nodeId} 缺少规定的自动化测试：\n- ${missingTests.join('\n- ')}`)
  process.exit(2)
}

const steps = []
let activeChild
let activeStop
let interruptionExitCode

function terminateOwnedProcessTree(child, onFailure = () => {}, onSettled = () => {}) {
  if (!child?.pid || child.exitCode !== null) {
    onSettled()
    return { ok: true }
  }
  if (process.platform === 'win32') {
    try {
      let killerSettled = false
      const settleKiller = () => {
        if (killerSettled) return
        killerSettled = true
        onSettled()
      }
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.once('error', (error) => {
        onFailure(error.message)
        settleKiller()
      })
      killer.once('close', (status) => {
        if (status !== 0) onFailure(`taskkill exit ${status}`)
        settleKiller()
      })
      killer.unref()
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      onFailure(message)
      onSettled()
      return { ok: false, error: message }
    }
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
    onSettled()
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    onFailure(message)
    onSettled()
    return { ok: false, error: message }
  }
}

for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.once(signal, () => {
    interruptionExitCode = exitCode
    if (activeStop) activeStop('interrupted')
    else finish(exitCode)
  })
}

async function run(name, command, commandArgs, options = {}) {
  const startedAt = Date.now()
  console.log(`\n[TEST GATE] ${name}`)
  const timeoutMs = options.timeoutMs ?? 300_000
  let timedOut = false
  let launchError
  let cleanupError
  let outputTail = ''
  const captureOutput = options.securityAudit === true
  const result = await new Promise((resolve) => {
    let settled = false
    let stopping = false
    let cleanupSettled = true
    let childResult
    let timeout
    let killGrace
    const settle = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      clearTimeout(killGrace)
      if (activeChild === child) activeChild = undefined
      activeStop = undefined
      resolve(value)
    }
    const settleWhenReady = () => {
      if (childResult && (!stopping || cleanupSettled)) settle(childResult)
    }
    const child = spawn(command, commandArgs, {
      cwd: projectRoot,
      stdio: captureOutput ? ['inherit', 'pipe', 'pipe'] : 'inherit',
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
    })
    activeChild = child
    if (captureOutput) {
      const forward = (stream) => (chunk) => {
        const text = chunk.toString()
        stream.write(text)
        outputTail = `${outputTail}${text}`.slice(-6000)
      }
      child.stdout.on('data', forward(process.stdout))
      child.stderr.on('data', forward(process.stderr))
    }
    child.once('error', (error) => {
      launchError = error
      settle({ status: 1 })
    })
    const stop = (reason) => {
      if (stopping || settled) return
      stopping = true
      cleanupSettled = false
      if (reason === 'timeout') {
        timedOut = true
        console.error(`[TEST GATE] ${name} 超过 ${Math.round(timeoutMs / 1000)} 秒，终止本步骤自有进程树`)
      }
      const cleanupTimedOut = () => {
        cleanupError ||= '子进程树在 10 秒清理期限内未报告退出'
        settle({ status: 1, signal: 'CLEANUP_TIMEOUT' })
      }
      killGrace = setTimeout(cleanupTimedOut, 10_000)
      const cleanup = terminateOwnedProcessTree(child, (error) => {
        cleanupError ||= error
      }, () => {
        cleanupSettled = true
        settleWhenReady()
      })
      cleanupError ||= cleanup.error
    }
    activeStop = stop
    timeout = setTimeout(() => stop('timeout'), timeoutMs)
    child.once('close', (status, signal) => {
      childResult = { status, signal }
      settleWhenReady()
    })
  })
  const effectiveStatus = interruptionExitCode
    ?? (timedOut || launchError || cleanupError ? 1 : (result.status ?? 1))
  const failureType = timedOut
    ? cleanupError ? 'cleanup-failed' : 'timeout'
    : launchError
      ? 'tool-start-failed'
      : interruptionExitCode
        ? 'interrupted'
        : effectiveStatus === 0
          ? undefined
          : options.securityAudit
            ? /EAI_AGAIN|ENOTFOUND|ENETUNREACH|EHOSTUNREACH|ECONN|ETIMEDOUT|CERT_|TLS|HTTP\s+5\d\d|audit endpoint|registry/i.test(outputTail)
              ? 'infrastructure-failed'
              : 'security-failed'
            : 'command-failed'
  const record = {
    name,
    command: [command, ...commandArgs].join(' '),
    status: effectiveStatus,
    durationMs: Date.now() - startedAt,
    failureType,
    signal: result.signal ?? undefined,
    error: launchError?.message || cleanupError,
    cleanupFailure: cleanupError || undefined,
    outputSummary: failureType ? outputTail.trim().slice(-3000) || undefined : undefined,
  }
  steps.push(record)
  if (record.status !== 0) finish(record.status)
  if (interruptionExitCode) finish(interruptionExitCode)
}

function runNpm(name, npmArgs, options) {
  if (npmCli) return run(name, process.execPath, [npmCli, ...npmArgs], options)
  return run(name, process.platform === 'win32' ? 'npm.cmd' : 'npm', npmArgs, options)
}

function finish(exitCode = 0) {
  const resultRoot = path.join(projectRoot, 'test-results')
  mkdirSync(resultRoot, { recursive: true })
  const summary = {
    gate: full ? 'full' : nodeId,
    passed: exitCode === 0,
    finishedAt: new Date().toISOString(),
    steps,
  }
  writeFileSync(path.join(resultRoot, 'latest-gate.json'), `${JSON.stringify(summary, null, 2)}\n`)
  console.log(`\n[TEST GATE] ${summary.passed ? '通过' : '失败'}：${summary.gate}`)
  process.exit(exitCode)
}

if (!full && nodeTests[nodeId].length) {
  await run(`节点 ${nodeId} 定向测试`, process.execPath, [
    '--experimental-strip-types', '--test', ...nodeTests[nodeId],
  ])
}
await runNpm('全量单元与契约回归', ['test'])
await runNpm('TypeScript 与生产构建', ['run', 'build'])

const browserNodes = new Set(['P8.5', 'P8.7', 'P9.2', 'P10.5', 'P10.6', 'P10.7'])
if (full || browserNodes.has(nodeId)) await runNpm('Chromium 关键链路测试', ['run', 'test:e2e'])
if (full) await runNpm('高危依赖审计', [
  'audit', '--json', '--audit-level=high', '--registry=https://registry.npmjs.org',
], { timeoutMs: 120_000, securityAudit: true })

finish(0)
