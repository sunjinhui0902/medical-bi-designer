import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testRoot = path.join(projectRoot, 'tests')
// These suites read the owner's ignored ADS snapshots or knowledge workspace.
// Keep the public regression reproducible without private data.
const localSuites = new Set(['outpatient-pagination.test.mjs', 'outpatient-operations.test.ts', 'hospital-overview-range.test.mjs', 'local-baselines.test.mjs', 'local-dashboard-plan.test.mjs', 'local-question-plan.test.mjs'])
const args = process.argv.slice(2)
if (args.some(arg => !['--local', '--all', '--list'].includes(arg)) || (args.includes('--local') && args.includes('--all'))) {
  console.error('用法：node scripts/run-tests.mjs [--local | --all] [--list]')
  process.exit(2)
}
const testFiles = readdirSync(testRoot)
  .filter((name) => /\.test\.(ts|mjs)$/.test(name))
  .filter(name => args.includes('--all') || (args.includes('--local') ? localSuites.has(name) : !localSuites.has(name)))
  .sort()
  .map((name) => path.join(testRoot, name))

if (args.includes('--list')) {
  console.log(testFiles.map(file => path.relative(projectRoot, file)).join('\n'))
} else if (!testFiles.length) {
  console.error('No test files were found.')
  process.exitCode = 1
} else {
  console.log(`[TEST] ${args.includes('--all') ? '全部' : args.includes('--local') ? '本地证据' : '公开回归'}：${testFiles.length} 个测试文件`)
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--test', ...testFiles],
    { cwd: projectRoot, stdio: 'inherit' },
  )
  process.exitCode = result.status ?? 1
}
