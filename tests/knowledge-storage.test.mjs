import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { updateKnowledgeAsset } from '../server/knowledge.mjs'

test('knowledge edits preserve concurrent fields and refuse corrupted assets in an isolated repository', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tybi-knowledge-'))
  const assets = path.join(root, '02_assets'), file = path.join(assets, 'fixture.json')
  try {
    await mkdir(assets)
    await writeFile(file, JSON.stringify({ assetId: 'fixture', name: '指标', payload: { original: true } }))
    await Promise.all([
      updateKnowledgeAsset('fixture', { name: '已修改', payload: { first: 1 } }, root),
      updateKnowledgeAsset('fixture', { description: '独立说明', payload: { second: 2 } }, root),
    ])
    const saved = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(saved.name, '已修改')
    assert.equal(saved.description, '独立说明')
    assert.deepEqual(saved.payload, { original: true, first: 1, second: 2 })
    await writeFile(file, '{broken')
    await assert.rejects(updateKnowledgeAsset('fixture', { name: '不得覆盖' }, root), /JSON 无效/)
    assert.equal(await readFile(file, 'utf8'), '{broken')
  } finally { await rm(root, { recursive: true, force: true }) }
})
