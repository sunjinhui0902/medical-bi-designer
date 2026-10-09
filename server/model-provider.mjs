import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

export const modelPresets = [
 {id:'gemini',name:'Gemini',baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',model:'gemini-3.8-flash',docsUrl:'https://ai.google.dev/gemini-api/docs/openai'},
 {id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',docsUrl:'https://api-docs.deepseek.com/'},
 {id:'qwen',name:'通义千问（阿里云百炼）',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:'qwen-plus',docsUrl:'https://help.aliyun.com/zh/model-studio/model-calling-in-sub-workspace'},
 {id:'compatible',name:'其他 OpenAI 兼容服务',baseUrl:'',model:'',docsUrl:''},
]
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})}
export function modelConnectionFailure(error) {
 if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return '模型请求超时，请检查网络或稍后重试'
 const causes = [error, error?.cause, ...(Array.isArray(error?.cause?.errors) ? error.cause.errors : [])]
 const code = causes.map(item => item?.code).find(value => typeof value === 'string')
 if (['UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT'].includes(code)) return `连接模型服务超时（${code}）。请确认后端已启用网络代理，并重启 BI 服务`
 if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return `模型服务域名解析失败（${code}），请检查 API 地址和 DNS`
 if (code === 'ECONNREFUSED') return '模型连接被拒绝（ECONNREFUSED），请检查 API 地址或本机代理是否运行'
 if (['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(code)) return '模型服务证书验证失败，请检查代理证书或系统时间'
 return '模型连接失败，请检查 API 地址和后端网络代理配置'
}
export function normalizeModelProfile(input,previous={}) {
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['provider','baseUrl','model','apiKey','clearKey'].includes(k)))fail('模型配置包含未支持的字段')
 const preset=modelPresets.find(p=>p.id===input.provider);if(!preset)fail('请选择支持的模型服务')
 const baseUrl=String(input.baseUrl??previous.baseUrl??preset.baseUrl).trim().replace(/\/+$/,''),model=String(input.model??previous.model??preset.model).trim()
 if(!baseUrl||baseUrl.length>500)fail('请填写 API 地址')
 let url;try{url=new URL(baseUrl)}catch{fail('API 地址格式不正确')}
 if(url.username||url.password||url.search||url.hash||!['https:','http:'].includes(url.protocol))fail('API 地址不能包含账号、密钥或查询参数')
 if(url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))fail('远程 API 地址需要使用 HTTPS')
 if(!model||model.length>100||/[\r\n]/.test(model))fail('请填写有效的模型名称')
 if(input.apiKey!==undefined&&(typeof input.apiKey!=='string'||input.apiKey.length>4096||/[\r\n]/.test(input.apiKey)))fail('API Key 格式不正确')
 if(input.clearKey!==undefined&&typeof input.clearKey!=='boolean')fail('清除密钥选项无效')
 return {provider:preset.id,baseUrl,model,apiKey:input.apiKey?.trim()||'',clearKey:input.clearKey===true}
}
export function parseModelJson(content) {
 if(typeof content!=='string'||!content.trim())fail('模型没有返回有效内容',502)
 const text=content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')
 try{return JSON.parse(text)}catch{fail('模型返回的内容不是有效 JSON，请调整模型或重试',502)}
}
export function createModelProviderService({file,encrypt,decrypt,fetchImpl=fetch,timeoutMs=60000}) {
 let mutations=Promise.resolve()
 function mutate(work){const pending=mutations.then(work,work);mutations=pending.catch(()=>{});return pending}
 async function read(){try{const config=JSON.parse(await readFile(file,'utf8'));if(config.version!==1||!config.profiles)fail('本地模型配置格式无效',500);return config}catch(e){if(e.code==='ENOENT')return {version:1,activeProvider:'chatgpt-web',profiles:{}};throw e}}
 async function write(config){await mkdir(path.dirname(file),{recursive:true});const temporary=`${file}.${randomUUID()}.tmp`;await writeFile(temporary,JSON.stringify(config,null,2),{encoding:'utf8',mode:0o600});await rename(temporary,file)}
 const publicSummary=config=>({activeProvider:config.activeProvider,providers:modelPresets.map(p=>{const saved=config.profiles[p.id];return {...p,baseUrl:saved?.baseUrl??p.baseUrl,model:saved?.model??p.model,hasKey:Boolean(saved?.keyEncrypted),configured:Boolean(saved?.keyEncrypted),updatedAt:saved?.updatedAt||null}})})
 async function resolve(input){const config=await read(),previous=config.profiles[input?.provider]||{},profile=normalizeModelProfile(input,previous),key=profile.clearKey?'':profile.apiKey||(previous.keyEncrypted?await decrypt(previous.keyEncrypted):'');if(!key)fail('请填写 API Key；已保存密钥时可留空');return {profile,key}}
 async function chat(profile,key,messages){
  const started=Date.now(),endpoint=profile.baseUrl.endsWith('/chat/completions')?profile.baseUrl:`${profile.baseUrl}/chat/completions`
  let response;try{response=await fetchImpl(endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model:profile.model,messages,response_format:{type:'json_object'},stream:false,max_tokens:2048}),signal:AbortSignal.timeout(timeoutMs)})}catch(e){fail(modelConnectionFailure(e),502)}
  if(!response.ok){const reasons={400:'模型或请求格式不受支持',401:'API Key 无效',403:'没有该模型的调用权限',404:'API 地址或模型不存在',429:'额度不足或请求过于频繁'};fail(`模型服务返回 ${response.status}：${reasons[response.status]||'服务暂时不可用'}`,502)}
  let body;try{const text=await response.text();if(text.length>1024*1024)fail('模型响应过大',502);body=JSON.parse(text)}catch{fail('模型服务返回格式异常',502)}
  const content=body.choices?.[0]?.message?.content;if(typeof content!=='string'||body.choices?.[0]?.finish_reason==='length')fail('模型内容为空或被截断，请调整模型后重试',502)
  return {value:parseModelJson(content),provider:profile.provider,model:profile.model,requestId:typeof body.id==='string'?body.id.slice(0,200):null,durationMs:Date.now()-started}
 }
 return {
  async summary(){return publicSummary(await read())},
  async save(input){return mutate(async()=>{const config=await read(),profile=normalizeModelProfile(input,config.profiles[input?.provider]),previous=config.profiles[profile.provider]||{};config.profiles[profile.provider]={baseUrl:profile.baseUrl,model:profile.model,keyEncrypted:profile.clearKey?'':profile.apiKey?await encrypt(profile.apiKey):previous.keyEncrypted||'',updatedAt:new Date().toISOString()};if(profile.clearKey&&config.activeProvider===profile.provider)config.activeProvider='chatgpt-web';await write(config);return publicSummary(config)})},
  async activate(provider){return mutate(async()=>{const config=await read();if(provider!=='chatgpt-web'&&!modelPresets.some(p=>p.id===provider))fail('模型服务无效');if(provider!=='chatgpt-web'&&!config.profiles[provider]?.keyEncrypted)fail('请先保存该服务的 API Key');config.activeProvider=provider;await write(config);return publicSummary(config)})},
  async test(input){const {profile,key}=await resolve(input);const result=await chat(profile,key,[{role:'system',content:'You are testing a model connection. Return only JSON: {"ok":true}.'},{role:'user',content:'Return JSON {"ok":true}.'}]);if(result.value?.ok!==true)fail('连接已响应，但未返回要求的 JSON 结果',502);const {value,...safe}=result;return {status:'connected',...safe}},
  async generate(context,providerOverride){if(providerOverride!==undefined&&typeof providerOverride!=='string')fail('模型服务选项无效');const config=await read(),id=providerOverride??config.activeProvider;if(id==='chatgpt-web')fail('当前默认入口是 ChatGPT 网页，请选择已配置的 API 模型');const {profile,key}=await resolve({provider:id});return chat(profile,key,[{role:'system',content:'你是医疗BI看板规划模型。仅输出JSON，遵循输入schema。禁止输出SQL、脚本、数值、未声明区域或字段。月份必须等于输入month。schemaVersion必须为数字1，template必须为hospital-overview，title为普通字符串，sections从允许清单选择，notes字符串。预算保持null。'},{role:'user',content:JSON.stringify({...context,example:{schemaVersion:1,template:'hospital-overview',title:'医院运营概览',month:context.month,comparison:'yoy',sections:['summary','operations','trend','departments','composition','beds','costs'],notes:'本地ADS只读快照，预算留空，知识口径暂定。'}})}])}
 }
}
