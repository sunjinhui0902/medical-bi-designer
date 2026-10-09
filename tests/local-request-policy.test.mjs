import test from 'node:test'
import assert from 'node:assert/strict'
import { validateLocalRequest } from '../server/local-request-policy.mjs'

test('loopback CLI and local browser including the Vite proxy remain supported', () => {
  for (const host of ['127.0.0.1:5175', 'localhost:5174', '[::1]:5175']) {
    validateLocalRequest({ host })
    validateLocalRequest({ host, origin: 'http://127.0.0.1:5174', 'sec-fetch-site': 'same-origin' })
  }
  validateLocalRequest({ host: 'localhost:6000', origin: 'http://localhost:6000' }, 6000)
})

test('external webpage, rebinding Host and malformed origin are denied before routing', () => {
  for (const headers of [
    { host: 'evil.example:5175' }, { host: '127.0.0.1.evil.example:5175' },
    { host: 'user@127.0.0.1:5175' }, { host: '127.0.0.1:5175/path' }, {},
    { host: '127.0.0.1:5175', origin: 'https://evil.example' },
    { host: '127.0.0.1:5175', origin: 'null' },
    { host: '127.0.0.1:5175', origin: 'http://localhost:5174/' },
    { host: '127.0.0.1:5175', origin: 'http://localhost:8888' },
    { host: '127.0.0.1:5175', 'sec-fetch-site': 'cross-site' },
  ]) assert.throws(() => validateLocalRequest(headers), error => error.status === 403)
})
