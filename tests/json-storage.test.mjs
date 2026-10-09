import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readJson, writeJson, ensureFile, withJsonMutation } from '../server/json-storage.mjs'

async function fixture(work) {
  const directory = await mkdtemp(path.join(tmpdir(), 'tybi-storage-'))
  try { await work(path.join(directory, 'config.json'), directory) }
  finally { await rm(directory, { recursive: true, force: true }) }
}

test('missing configuration initializes; malformed or unreadable content never becomes empty', () => fixture(async (file, directory) => {
  assert.deepEqual(await readJson(file, []), [])
  await ensureFile(file, '[]')
  await writeFile(file, '{broken')
  await assert.rejects(readJson(file, []), SyntaxError)
  await ensureFile(file, '[]')
  assert.equal(await readFile(file, 'utf8'), '{broken')
  await writeFile(file, '{}')
  await assert.rejects(readJson(file, []), /格式无效/)
  await assert.rejects(readJson(directory, []))
}))

test('atomic replacement keeps valid JSON and removes temporary files on failure', () => fixture(async (file, directory) => {
  await writeJson(file, [{ id: 1 }])
  await writeJson(file, [{ id: 2 }])
  assert.deepEqual(await readJson(file, []), [{ id: 2 }])
  await assert.rejects(writeJson(directory, []))
  assert.deepEqual(await readdir(directory), ['config.json'])
}))

test('concurrent read/change/write operations retain every update and recover after rejected work', () => fixture(async file => {
  await writeJson(file, [])
  await assert.rejects(withJsonMutation(file, async () => { throw new Error('rejected change') }))
  await Promise.all(Array.from({ length: 20 }, (_, id) => withJsonMutation(file, async () => {
    const rows = await readJson(file, [])
    await new Promise(resolve => setTimeout(resolve, 2))
    await writeJson(file, [...rows, { id }])
  })))
  assert.deepEqual((await readJson(file, [])).map(row => row.id), Array.from({ length: 20 }, (_, id) => id))
}))
