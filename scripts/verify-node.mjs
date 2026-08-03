import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
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
function run(name, command, commandArgs) {
  const startedAt = Date.now()
  console.log(`\n[TEST GATE] ${name}`)
  const result = spawnSync(command, commandArgs, { cwd: projectRoot, stdio: 'inherit', shell: false })
  const record = {
    name,
    command: [command, ...commandArgs].join(' '),
    status: result.status ?? 1,
    durationMs: Date.now() - startedAt,
    error: result.error?.message,
  }
  steps.push(record)
  if (record.status !== 0) finish(record.status)
}

function runNpm(name, npmArgs) {
  if (npmCli) return run(name, process.execPath, [npmCli, ...npmArgs])
  return run(name, process.platform === 'win32' ? 'npm.cmd' : 'npm', npmArgs)
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
  run(`节点 ${nodeId} 定向测试`, process.execPath, [
    '--experimental-strip-types', '--test', ...nodeTests[nodeId],
  ])
}
runNpm('全量单元与契约回归', ['test'])
runNpm('TypeScript 与生产构建', ['run', 'build'])

const browserNodes = new Set(['P8.5', 'P8.7'])
if (full || browserNodes.has(nodeId)) runNpm('Chromium 关键链路测试', ['run', 'test:e2e'])
if (full) runNpm('高危依赖审计', [
  'audit', '--audit-level=high', '--registry=https://registry.npmjs.org',
])

finish(0)
