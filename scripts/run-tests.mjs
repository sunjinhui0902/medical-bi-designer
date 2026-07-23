import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testRoot = path.join(projectRoot, 'tests')
const testFiles = readdirSync(testRoot)
  .filter((name) => name.endsWith('.test.ts'))
  .sort()
  .map((name) => path.join(testRoot, name))

if (!testFiles.length) {
  console.error('No test files were found.')
  process.exitCode = 1
} else {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--test', ...testFiles],
    { cwd: projectRoot, stdio: 'inherit' },
  )
  process.exitCode = result.status ?? 1
}
