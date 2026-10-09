import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'

const base = new URL(process.env.TYBI_API_URL || 'http://127.0.0.1:5175')
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('只允许验证本地 API')
const request = (pathname, options) => fetch(new URL(pathname, base), { signal: AbortSignal.timeout(5000), ...options })
const allowed = await request('/api/health', { headers: { Origin: 'http://127.0.0.1:5174' } })
assert.equal(allowed.status, 200)
assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5174')
for (const pathname of ['/api/datasources', '/api/model-settings']) {
  const response = await request(pathname, { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'text/plain' }, body: '{}' })
  assert.equal(response.status, 403)
  assert.equal(response.headers.get('access-control-allow-origin'), null)
}
const reboundStatus = await new Promise((resolve, reject) => {
  const rebound = httpRequest(new URL('/api/health', base), { headers: { Host: 'untrusted.example' } }, response => {
    response.resume()
    response.once('end', () => resolve(response.statusCode))
  })
  rebound.setTimeout(5000, () => rebound.destroy(new Error('API 校验超时')))
  rebound.once('error', reject)
  rebound.end()
})
assert.equal(reboundStatus, 403)
console.log(JSON.stringify({ status: 'PASS', localBrowser: true, rejectedExternalMutations: 2, rejectedForeignHost: true }))
