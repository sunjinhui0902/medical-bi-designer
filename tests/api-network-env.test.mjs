import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { spawn } from 'node:child_process'
import { apiNetworkEnv } from '../scripts/api-network-env.mjs'

test('enables existing proxies on supported Node, preserves opt-out and bypasses local addresses', () => {
  const input = { HTTPS_PROXY: 'http://127.0.0.1:7897', NO_PROXY: '.company.test', no_proxy: 'internal.test' }
  const result = apiNetworkEnv(input, '22.22.1')
  assert.equal(result.NODE_USE_ENV_PROXY, '1')
  for (const value of ['.company.test', 'internal.test', 'localhost', '127.0.0.1', '::1']) assert.ok(result.NO_PROXY.split(',').includes(value))
  assert.equal(result.NO_PROXY, result.no_proxy)
  assert.equal(input.NODE_USE_ENV_PROXY, undefined)
  assert.equal(apiNetworkEnv({ ...input, NODE_USE_ENV_PROXY: '0' }).NODE_USE_ENV_PROXY, '0')
  assert.equal(apiNetworkEnv(input, '22.20.0').NODE_USE_ENV_PROXY, undefined)
  assert.equal(apiNetworkEnv(input, '24.5.0').NODE_USE_ENV_PROXY, '1')
  assert.equal(apiNetworkEnv({}, '22.22.1').NODE_USE_ENV_PROXY, undefined)
})

test('actual child-process fetch uses configured proxy and keeps loopback direct', async () => {
  let tunnelCount = 0
  const sockets = new Set()
  const keep = server => server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
  const target = keep(createServer((req, res) => { res.end('local-fixture-ok') }))
  const proxy = keep(createServer((_req, res) => { res.end('local-fixture-ok'); tunnelCount++ }))
  await new Promise(done => target.listen(0, '127.0.0.1', done))
  proxy.on('connect', (_req, socket, head) => {
    tunnelCount++
    const upstream = connect(target.address().port, '127.0.0.1', () => { socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) upstream.write(head); socket.pipe(upstream); upstream.pipe(socket) })
    sockets.add(upstream); upstream.once('close', () => sockets.delete(upstream))
    upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy()); socket.once('close', () => upstream.destroy())
  })
  await new Promise(done => proxy.listen(0, '127.0.0.1', done))
  try {
    const address = `http://127.0.0.1:${proxy.address().port}`
    const env = apiNetworkEnv({ ...process.env, HTTP_PROXY: address, http_proxy: address, HTTPS_PROXY: address, https_proxy: address, NO_PROXY: '', no_proxy: '', NODE_USE_ENV_PROXY: undefined })
    const script = `for(const url of ['http://model.invalid/probe','http://127.0.0.1:${target.address().port}/probe']){const r=await fetch(url,{signal:AbortSignal.timeout(5000)});if(await r.text()!=='local-fixture-ok')process.exit(1)}`
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let errors = ''; child.stderr.on('data', data => { errors += data })
    const code = await new Promise((done, reject) => { child.once('exit', done); child.once('error', reject) })
    assert.equal(code, 0, errors); assert.equal(tunnelCount, 1)
  } finally { for (const socket of sockets) socket.destroy(); await Promise.all([new Promise(done => proxy.close(done)), new Promise(done => target.close(done))]) }
})
