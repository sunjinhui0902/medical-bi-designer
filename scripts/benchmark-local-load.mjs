import assert from 'node:assert/strict'
import http from 'node:http'
import { performance } from 'node:perf_hooks'
import { mkdir, writeFile } from 'node:fs/promises'
import { applyDatasetRuntimeView } from '../server/query-plan.mjs'
const evidence = process.env.TY_BI_LOAD_EVIDENCE || 'E:/codex/work/tybi-interaction-perf-20261009/load'
await mkdir(evidence, { recursive: true })
const results = [], base = { dimensions: [], measures: [{ name: 'value', aggregation: 'min' }, { name: 'peak', aggregation: 'max' }], sort: [], limit: 20 }
let server
try {
  for (const count of [100000, 1000000]) {
    const rows = Array.from({ length: count }, (_, index) => ({ category: `synthetic-${index % 1000}`, value: index, peak: index }))
    const start = performance.now(), heap = process.memoryUsage().heapUsed
    const total = applyDatasetRuntimeView(rows, base)
    assert.equal(total[0].value, 0); assert.equal(total[0].peak, count - 1)
    const view = { dimensions: [{ name: 'category' }], measures: [{ name: 'value', aggregation: 'sum' }], sort: [{ name: 'value', direction: 'desc' }], limit: 20 }
    const result = applyDatasetRuntimeView(rows, view)
    assert.equal(result.length, 20)
    results.push({ inputRows: count, aggregateAndTop20Ms: Math.round(performance.now() - start), heapDeltaMB: +((process.memoryUsage().heapUsed - heap) / 1048576).toFixed(1), responseBytes: Buffer.byteLength(JSON.stringify(result)) })
    if (count === 1000000) {
      server = http.createServer((_request, response) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(applyDatasetRuntimeView(rows, view))) })
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
      const url = `http://127.0.0.1:${server.address().port}`
      const latencies = await Promise.all(Array.from({ length: 4 }, async () => { const start = performance.now(), response = await fetch(url), result = await response.json(); assert.equal(result.length, 20); return Math.round(performance.now() - start) }))
      results.push({ concurrentRequests: 4, rowsPerRequest: count, latencyMs: latencies, limitation: 'Isolated fixture server, not TY_BI database/API production load; synchronous in-memory aggregation queues requests.' })
    }
  }
  const result = { status: 'PASS', source: 'Independent synthetic data, not ODR records or business conclusions', results }
  await writeFile(`${evidence}/result.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result))
} catch (error) { await writeFile(`${evidence}/failure.txt`, error.stack); process.exitCode = 1; console.error(error) }
finally { if (server) await new Promise(resolve => server.close(resolve)) }
