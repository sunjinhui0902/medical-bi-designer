import { readFile, writeFile, rename, unlink, open } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

const mutations = new Map()
async function lockedMutation(file, work) {
  const lockFile = `${file}.mutation.lock`, start = Date.now()
  let lock
  while(!lock) {
    try { lock = await open(lockFile, 'wx', 0o600) }
    catch(error) {
      if(error.code !== 'EEXIST')throw error
      if(Date.now()-start >= 10000)throw new Error(`本地配置正在被其他进程修改：${path.basename(file)}；未覆盖原文件。若进程已退出，请检查对应 .mutation.lock。`)
      await new Promise(resolve => setTimeout(resolve, 25))
    }
  }
  try { await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()})); return await work() }
  finally { await lock.close(); await unlink(lockFile) }
}

export async function readJson(file, fallback) {
  let raw
  try { raw = await readFile(file, 'utf8') }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error }
  let value
  try { value = JSON.parse(raw) }
  catch { throw new SyntaxError(`本地配置 JSON 无效：${path.basename(file)}；已保留原文件`) }
  if (Array.isArray(fallback) && !Array.isArray(value)) throw new Error(`本地配置格式无效：${path.basename(file)}`)
  return value
}

export async function writeJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await rename(temporary, file)
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
}

// Serialize the entire read/change/write operation, not just the final write.
export function withJsonMutation(file, work) {
  const key = path.resolve(file)
  const perform = () => lockedMutation(key, work)
  const pending = (mutations.get(key) ?? Promise.resolve()).then(perform, perform)
  const tail = pending.catch(() => {})
  mutations.set(key, tail)
  void tail.then(() => { if (mutations.get(key) === tail) mutations.delete(key) })
  return pending
}

export async function ensureFile(file, initial) {
  try { return await readFile(file) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  try { await writeFile(file, initial, { mode: 0o600, flag: 'wx' }) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  return readFile(file)
}
