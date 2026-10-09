import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { assembleOverview, readOverviewSnapshot, overviewDefinitions } from './hospital-overview.mjs'
const root=new URL('./.data/hospital-generation/',import.meta.url)
export const sections=['summary','operations','trend','departments','composition','beds','costs']
export function validateHospitalModelPlan(plan,context) {
 if(!plan||typeof plan!=='object'||Array.isArray(plan)||Object.keys(plan).some(k=>!['schemaVersion','template','title','month','comparison','sections','notes'].includes(k)))throw new Error('模型结果包含未声明字段')
 if(plan.schemaVersion!==1||plan.template!=='hospital-overview'||plan.month!==context.month||!['yoy','mom'].includes(plan.comparison)||typeof plan.title!=='string'||!plan.title.trim()||plan.title.length>60||typeof plan.notes!=='string'||plan.notes.length>600||!Array.isArray(plan.sections)||!plan.sections.length||new Set(plan.sections).size!==plan.sections.length||plan.sections.some(s=>!sections.includes(s)))throw new Error('模型计划格式、月份或区域不合法')
 return plan
}
export async function createHospitalGeneration(question,month,{apiService,mode='chatgpt-web',provider}={}) {
 if(typeof question!=='string'||!question.trim()||question.length>500)throw Object.assign(new Error('请填写500字以内需求'),{status:400})
 const data=assembleOverview(await readOverviewSnapshot(),month),id=randomUUID();const context={requestId:id,provider:'chatgpt-web-codex',status:'awaiting_model',question,month,observedAt:data.observedAt,metrics:overviewDefinitions,sections,knowledgeRefs:data.knowledgeRefs,nullPolicy:{budget:null},schema:{schemaVersion:1,template:'hospital-overview',title:'string <=60',month,comparison:'yoy|mom',sections:'allowlisted section array',notes:'string <=600'},instructions:'根据需求和蓝白医院概览模板选取区域，输出严格JSON。禁止SQL/JS/编造指标/填预算。真实模型由当前Codex会话调用已连接ChatGPT网页完成。'}
 if(mode==='api') {
  if(!apiService)throw Object.assign(new Error('API 模型服务未配置'),{status:400})
  const result=await apiService.generate({...context,provider:'configured-api',instructions:'输出符合schema的JSON医院概览计划，预算保持null。'},provider);validateHospitalModelPlan(result.value,context)
  context.provider=result.provider;context.status='ready';await mkdir(root,{recursive:true});await writeFile(new URL(`${id}.request.json`,root),JSON.stringify(context,null,2));await writeFile(new URL(`${id}.result.json`,root),JSON.stringify({plan:result.value,provider:result.provider,model:result.model,modelRequestId:result.requestId,completedAt:new Date().toISOString()},null,2));return {...context,plan:result.value,model:result.model}
 }
 await mkdir(root,{recursive:true});await writeFile(new URL(`${id}.request.json`,root),JSON.stringify(context,null,2));return context
}
export async function getHospitalGeneration(id) {if(!/^[a-f0-9-]{36}$/.test(id))throw Object.assign(new Error('请求编号无效'),{status:400});const context=JSON.parse(await readFile(new URL(`${id}.request.json`,root),'utf8'));try {const result=JSON.parse(await readFile(new URL(`${id}.result.json`,root),'utf8'));validateHospitalModelPlan(result.plan,context);return {...result,status:'ready',requestId:id,provider:context.provider}}catch(e){if(e.code!=='ENOENT')throw e;return {requestId:id,status:'awaiting_model',provider:context.provider,message:'等待当前Codex会话调用ChatGPT网页。不会自动退回规则生成。'}}}
export async function completeHospitalGeneration(id,plan,conversationUrl) {if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('请求编号无效');const context=JSON.parse(await readFile(new URL(`${id}.request.json`,root),'utf8'));validateHospitalModelPlan(plan,context);if(typeof conversationUrl!=='string'||!conversationUrl.startsWith('https://chatgpt.com/'))throw new Error('必须记录真实ChatGPT来源');await writeFile(new URL(`${id}.result.json`,root),JSON.stringify({plan,provider:context.provider,conversationUrl,completedAt:new Date().toISOString()},null,2));return plan}
