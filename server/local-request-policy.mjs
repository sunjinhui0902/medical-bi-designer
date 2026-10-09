const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])

export function validateLocalRequest(headers, apiPort = 5175) {
  const deny = () => { throw Object.assign(new Error('仅允许本地应用访问此 API'), { status: 403 }) }
  let host
  try { host = new URL(`http://${headers.host}`) } catch { deny() }
  if (!loopbackHosts.has(host.hostname) || host.username || host.password || host.pathname !== '/' || host.search || host.hash) deny()
  if (headers['sec-fetch-site'] === 'cross-site') deny()
  if (headers.origin !== undefined) {
    let origin
    try { origin = new URL(headers.origin) } catch { deny() }
    if (origin.origin !== headers.origin || origin.protocol !== 'http:' || !loopbackHosts.has(origin.hostname) || !new Set(['5173', '5174', '5175', String(apiPort)]).has(origin.port)) deny()
  }
}
