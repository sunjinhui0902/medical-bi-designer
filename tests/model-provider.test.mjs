import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp,readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createCipheriv,createDecipheriv,randomBytes } from 'node:crypto'
import {createModelProviderService,normalizeModelProfile,parseModelJson,modelPresets,modelConnectionFailure} from '../server/model-provider.mjs'
import {validateHospitalModelPlan} from '../server/hospital-generation.mjs'
const key=randomBytes(32)
const encrypt=async v=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([cipher.update(v,'utf8'),cipher.final()]);return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${body.toString('base64')}`}
const decrypt=async v=>{const [iv,tag,body]=v.split('.').map(p=>Buffer.from(p,'base64')),c=createDecipheriv('aes-256-gcm',key,iv);c.setAuthTag(tag);return Buffer.concat([c.update(body),c.final()]).toString('utf8')}
test('presets, invalid endpoints and strict JSON parsing',()=>{
 assert.equal(modelPresets.length,4)
 for(const provider of ['gemini','deepseek','qwen'])assert.ok(normalizeModelProfile({provider}).baseUrl.startsWith('https://'))
 for(const baseUrl of ['http://example.com','https://u:p@example.com','https://example.com?key=x','file:///x'])assert.throws(()=>normalizeModelProfile({provider:'qwen',baseUrl}))
 assert.throws(()=>normalizeModelProfile({provider:'invented'}));assert.throws(()=>normalizeModelProfile({provider:'qwen',sql:'select 1'}));assert.throws(()=>parseModelJson('not json'));assert.deepEqual(parseModelJson('```json\n{"ok":true}\n```'),{ok:true})
})
test('connection diagnostics distinguish network causes without echoing credentials',()=>{
 for(const [code,expected] of [['UND_ERR_CONNECT_TIMEOUT','代理'],['ENOTFOUND','DNS'],['ECONNREFUSED','代理'],['CERT_HAS_EXPIRED','证书']]) {
  const message=modelConnectionFailure({message:'fixture-secret-key',cause:{code,message:'fixture-secret-key'}})
  assert.ok(message.includes(expected));assert.ok(!message.includes('fixture-secret-key'))
 }
 assert.match(modelConnectionFailure({name:'TimeoutError'}),/超时/)
 assert.ok(!modelConnectionFailure(new Error('fixture-secret-key')).includes('fixture-secret-key'))
})
test('encrypted persistence, concurrent profiles, blank preserve, clear and defaults',async()=>{
 const file=path.join(await mkdtemp(path.join(tmpdir(),'bi-model-config-')),'profiles.json'),service=createModelProviderService({file,encrypt,decrypt})
 assert.equal((await service.summary()).activeProvider,'chatgpt-web')
 await Promise.all(['gemini','deepseek','qwen'].map(provider=>service.save({provider,apiKey:'fixture-key-'+provider})))
 const raw=await readFile(file,'utf8');assert.ok(!raw.includes('fixture-key'));assert.equal((await service.summary()).providers.filter(p=>p.hasKey).length,3)
 await service.save({provider:'qwen',model:'my-qwen',apiKey:''});await service.activate('qwen')
 const reopened=createModelProviderService({file,encrypt,decrypt});assert.equal((await reopened.summary()).activeProvider,'qwen');assert.equal((await reopened.summary()).providers.find(p=>p.id==='qwen').model,'my-qwen')
 await reopened.save({provider:'qwen',clearKey:true});assert.equal((await reopened.summary()).activeProvider,'chatgpt-web');assert.equal((await reopened.summary()).providers.find(p=>p.id==='qwen').hasKey,false);await assert.rejects(()=>reopened.activate('qwen'))
 assert.ok(!JSON.stringify(await reopened.summary()).includes('keyEncrypted'))
})
test('actual HTTP request, authentication, generation and safe failure paths',async()=>{
 let status=200,content='{"ok":true}',seen
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;seen={url:req.url,auth:req.headers.authorization,body:JSON.parse(body)};res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({id:'fixture-request',error:'echo fixture-api-key',choices:[{message:{content},finish_reason:'stop'}]}))})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 try{
  const file=path.join(await mkdtemp(path.join(tmpdir(),'bi-model-http-')),'profiles.json'),service=createModelProviderService({file,encrypt,decrypt}),input={provider:'compatible',baseUrl:`http://127.0.0.1:${server.address().port}/v1`,model:'fixture-model',apiKey:'fixture-api-key'}
  const result=await service.test(input);assert.equal(result.status,'connected');assert.equal(seen.url,'/v1/chat/completions');assert.equal(seen.auth,'Bearer fixture-api-key');assert.equal(seen.body.model,'fixture-model');assert.equal(seen.body.response_format.type,'json_object');assert.ok(!JSON.stringify(result).includes('fixture-api-key'))
  await service.save(input);await service.activate('compatible')
  const plan={schemaVersion:1,template:'hospital-overview',title:'医院概览',month:'2026-08',comparison:'yoy',sections:['summary','trend'],notes:'预算保持null'};content=JSON.stringify(plan)
  const generated=await service.generate({month:'2026-08'});assert.deepEqual(validateHospitalModelPlan(generated.value,{month:'2026-08'}),plan)
  await service.save({provider:'gemini',baseUrl:input.baseUrl,model:'fixture-gemini',apiKey:'fixture-gemini-key'})
  const chosen=await service.generate({month:'2026-08'},'gemini');assert.equal(chosen.provider,'gemini');assert.equal((await service.summary()).activeProvider,'compatible');assert.equal(seen.auth,'Bearer fixture-gemini-key')
  await assert.rejects(()=>service.generate({month:'2026-08'},'invented'),/模型服务/)
  assert.throws(()=>validateHospitalModelPlan({...plan,sql:'select 1'},{month:'2026-08'}));assert.throws(()=>validateHospitalModelPlan({...plan,sections:['invented']},{month:'2026-08'}))
  status=401;await assert.rejects(()=>service.test({provider:'compatible'}),e=>e.message.includes('401')&&!e.message.includes('fixture-api-key'))
  status=500;await assert.rejects(()=>service.test({provider:'compatible'}),/500/)
  status=200;content='not-json';await assert.rejects(()=>service.test({provider:'compatible'}),/JSON/)
  const timeout=createModelProviderService({file,encrypt,decrypt,timeoutMs:5,fetchImpl:async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))});await assert.rejects(()=>timeout.test({provider:'compatible'}),/超时/)
 }finally{await new Promise(resolve=>server.close(resolve))}
})
