import { checkServerIdentity } from 'node:tls'

export function databaseTlsOptions(source) {
  const mode = source.sslMode || (source.ssl ? 'require' : 'disable')
  if (mode === 'verify-full') return { rejectUnauthorized: true, checkServerIdentity }
  if (mode === 'verify-ca') return { rejectUnauthorized: true, checkServerIdentity: () => undefined }
  if (mode === 'require' || mode === 'prefer') return { rejectUnauthorized: false }
  return false
}

// Retry the connection handshake only; SQL and authentication errors never retry.
export function createNegotiatingPool(PoolClass, config, source) {
  const mode = source.sslMode || (source.ssl ? 'require' : 'disable')
  let pool = new PoolClass({ ...config, ssl: databaseTlsOptions(source) }), retried = false
  async function connect() {
    try { return await pool.connect() }
    catch(error) {
      const preferFallback = mode === 'prefer' && error.message === 'The server does not support SSL connections'
      const allowUpgrade = mode === 'allow' && error.code === '28000' && /SSL off|no encryption/i.test(error.message)
      if(retried || (!preferFallback && !allowUpgrade))throw error
      retried = true
      await pool.end()
      pool = new PoolClass({ ...config, ssl: preferFallback ? false : { rejectUnauthorized: false } })
      return pool.connect()
    }
  }
  return { connect, async query(...args) { const client=await connect();try{return await client.query(...args)}finally{client.release()} }, end:()=>pool.end() }
}
