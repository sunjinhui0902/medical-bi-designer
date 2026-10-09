import test from 'node:test'
import assert from 'node:assert/strict'
import { databaseTlsOptions, createNegotiatingPool } from '../server/database-tls.mjs'

test('verify modes enforce certificate trust and full mode rejects a mismatched server identity', () => {
  const full = databaseTlsOptions({ sslMode: 'verify-full', ssl: false })
  const ca = databaseTlsOptions({ sslMode: 'verify-ca', ssl: true })
  assert.equal(full.rejectUnauthorized, true)
  assert.equal(ca.rejectUnauthorized, true)
  const certificate = { subject: { CN: 'database.example' }, subjectaltname: 'DNS:database.example' }
  assert.equal(full.checkServerIdentity('database.example', certificate), undefined)
  assert.equal(full.checkServerIdentity('other.example', certificate).code, 'ERR_TLS_CERT_ALTNAME_INVALID')
  assert.equal(ca.checkServerIdentity('other.example', certificate), undefined)
})

test('prefer/allow negotiate once on recognized transport errors without repeating SQL or authentication', async () => {
 async function scenario(mode, errors, queryError) {
  const configs=[],closed=[],queries=[]
  class FakePool {
   constructor(config){this.id=configs.length;configs.push(config)}
   async connect(){const error=errors[this.id];if(error)throw error;return {query:async sql=>{queries.push(sql);if(queryError)throw queryError;return {rows:[]}},release(){}}}
   async end(){closed.push(this.id)}
  }
  const pool=createNegotiatingPool(FakePool,{host:'fixture'},{sslMode:mode})
  try{await pool.query('SELECT 1');return {configs,closed,queries}}finally{await pool.end()}
 }
 const prefer=await scenario('prefer',[new Error('The server does not support SSL connections')])
 assert.equal(prefer.configs.length,2);assert.equal(prefer.configs[0].ssl.rejectUnauthorized,false);assert.equal(prefer.configs[1].ssl,false);assert.deepEqual(prefer.queries,['SELECT 1'])
 const allow=await scenario('allow',[Object.assign(new Error('no pg_hba.conf entry, no encryption'),{code:'28000'})])
 assert.equal(allow.configs[0].ssl,false);assert.equal(allow.configs[1].ssl.rejectUnauthorized,false)
 for(const mode of ['prefer','require','verify-full'])await assert.rejects(scenario(mode,[Object.assign(new Error('password authentication failed'),{code:'28P01'})]),/password/)
 await assert.rejects(scenario('prefer',[],new Error('SQL rejected')),/SQL rejected/)
 await assert.rejects(scenario('prefer',[new Error('certificate has expired')]),/certificate/)
})

test('explicit non-TLS and legacy require profiles retain their connection behavior', () => {
  assert.equal(databaseTlsOptions({ sslMode: 'disable', ssl: true }), false)
  assert.equal(databaseTlsOptions({ ssl: false }), false)
  assert.equal(databaseTlsOptions({ ssl: true }).rejectUnauthorized, false)
  assert.equal(databaseTlsOptions({ sslMode: 'require' }).rejectUnauthorized, false)
})
