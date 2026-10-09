// Node 22.21+ reads proxy variables only when proxy support is enabled at startup.
// Keep loopback BI requests outside the proxy, including when NO_PROXY is absent.
export function apiNetworkEnv(env = process.env, nodeVersion = process.versions.node) {
  const result = { ...env }
  const [major, minor] = nodeVersion.split('.').map(Number)
  const supported = (major === 22 && minor >= 21) || (major === 24 && minor >= 5) || major > 24
  const proxyPresent = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'].some(name => env[name]?.trim())
  if (proxyPresent && supported && env.NODE_USE_ENV_PROXY === undefined) result.NODE_USE_ENV_PROXY = '1'
  if (result.NODE_USE_ENV_PROXY === '1') {
    const bypass = [...new Set([...(env.NO_PROXY || '').split(','), ...(env.no_proxy || '').split(','), 'localhost', '127.0.0.1', '::1', '[::1]'].map(value => value.trim()).filter(Boolean))].join(',')
    result.NO_PROXY = bypass
    result.no_proxy = bypass
  }
  return result
}
