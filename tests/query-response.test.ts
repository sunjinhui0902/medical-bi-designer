import test from 'node:test'
import assert from 'node:assert/strict'
import { readQueryResponseV3 } from '../src/services/queryResponseV3.ts'

test('legal empty data is accepted but missing rows and malformed success are explicit errors', async () => {
  assert.deepEqual(await readQueryResponseV3(new Response('{"rows":[]}')), { rows: [] })
  await assert.rejects(readQueryResponseV3(new Response('{}')), /缺少明细/)
  await assert.rejects(readQueryResponseV3(new Response('{bad')), /解析失败/)
})
test('body read cancellation is preserved instead of returning an empty object', async () => {
  const response = new Response('{"rows":[1]}'), controller = new AbortController()
  response.json = async () => { controller.abort(); throw new DOMException('cancelled body', 'AbortError') }
  await assert.rejects(readQueryResponseV3(response, controller.signal), { name: 'AbortError' })
})
test('a cancelled response which resolves late is rejected, and HTTP errors keep their message', async () => {
  const controller = new AbortController(); controller.abort()
  await assert.rejects(readQueryResponseV3(new Response('{"rows":[]}'), controller.signal), { name: 'AbortError' })
  await assert.rejects(readQueryResponseV3(new Response('{"error":"请求拒绝"}', { status: 400 })), /请求拒绝/)
})
