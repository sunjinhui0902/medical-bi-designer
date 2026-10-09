<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
interface Provider {id:string;name:string;baseUrl:string;model:string;hasKey:boolean;configured:boolean;docsUrl:string}
const providers=ref<Provider[]>([]),active=ref('chatgpt-web'),selected=ref('gemini'),busy=ref(false),message=ref(''),error=ref('')
const form=reactive({baseUrl:'',model:'',apiKey:'',clearKey:false})
const current=computed(()=>providers.value.find(p=>p.id===selected.value))
const activeName=computed(()=>active.value==='chatgpt-web'?'ChatGPT 网页（Codex协作）':providers.value.find(p=>p.id===active.value)?.name||active.value)
function populate(){const p=current.value;if(p){form.baseUrl=p.baseUrl;form.model=p.model;form.apiKey='';form.clearKey=false}message.value='';error.value=''}
watch(selected,populate)
watch(()=>[form.baseUrl,form.model,form.apiKey,form.clearKey],()=>{message.value=''}, {flush:'sync'})
async function call(url:string,body?:unknown){const response=await fetch(url,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error||result.message||'操作失败');return result}
async function load(){try{const result=await call('/api/model-settings');providers.value=result.providers;active.value=result.activeProvider;populate()}catch(e){error.value=e instanceof Error?e.message:'读取失败'}}
async function act(kind:'save'|'test'|'activate'|'web'){
 busy.value=true;error.value='';message.value=''
 try{
  if(kind==='test'){const result=await call('/api/model-settings/test',{provider:selected.value,...form});message.value=`连接成功 · ${result.model} · ${result.durationMs} ms`}
  else{const result=kind==='save'?await call('/api/model-settings',{provider:selected.value,...form}):await call('/api/model-settings/active',{provider:kind==='web'?'chatgpt-web':selected.value});providers.value=result.providers;active.value=result.activeProvider;populate();message.value=kind==='save'?'配置已保存':`默认入口已切换为 ${activeName.value}`}
 }catch(e){error.value=e instanceof Error?e.message:'操作失败'}finally{busy.value=false}
}
onMounted(load)
</script>
<template>
 <main class="model-settings"><nav><RouterLink to="/">返回设计器</RouterLink><RouterLink to="/knowledge">知识库与看板助手</RouterLink></nav>
 <header><small>AI MODELS</small><h1>模型 API 配置</h1><p>选择服务，填写 API Key，测试后设为默认。不同服务的配置会分别保留。</p></header>
 <div class="model-layout"><aside><h2>默认生成入口</h2><strong>{{activeName}}</strong><p>API 模式可直接生成看板方案。ChatGPT 网页模式由当前 Codex 会话协作完成。</p><button :disabled="busy" @click="act('web')">使用 ChatGPT 网页</button><h2 style="margin-top:28px">已保存模型</h2><div class="saved-models"><button v-for="p in providers.filter(item=>item.hasKey)" :key="p.id" type="button" :disabled="busy" :aria-pressed="selected===p.id" @click="selected=p.id"><b>{{p.name}}</b><small>{{p.model}}</small><span>{{active===p.id?'默认生成模型':'已保存配置'}}</span></button><p v-if="!providers.some(p=>p.hasKey)">尚未保存模型。</p></div><p>设计器“本地看板助手”中可选择本次调用的模型。</p></aside>
 <section><form @submit.prevent="act('save')"><fieldset :disabled="busy">
 <label for="model-provider">模型服务</label><select id="model-provider" v-model="selected"><option v-for="p in providers" :key="p.id" :value="p.id">{{p.name}}</option></select>
 <label for="model-base-url">API 地址</label><input id="model-base-url" v-model="form.baseUrl" type="url" required maxlength="500" placeholder="https://服务地址/v1"><small>预填官方兼容地址。阿里云地域或专属空间地址可在这里调整。</small>
 <label for="model-name">模型名称</label><input id="model-name" v-model="form.model" required maxlength="100" placeholder="填服务控制台中的模型名称"><small>预设名称可修改，以你的账号支持的模型为准。</small>
 <label for="model-api-key">API Key</label><input id="model-api-key" v-model="form.apiKey" type="password" autocomplete="new-password" maxlength="4096" :placeholder="current?.hasKey?'已保存；留空保留现有密钥':'输入 API Key'" :disabled="form.clearKey"><small>{{current?.hasKey?'已保存密钥，页面不会读取或回显。':'尚未保存密钥。'}} 密钥加密保存在本机服务端。</small>
 <label v-if="current?.hasKey" class="clear-key"><input v-model="form.clearKey" type="checkbox">清除这个服务的已保存密钥</label>
 <div class="actions"><button type="submit" class="primary">保存配置</button><button type="button" :disabled="form.clearKey" @click="act('test')">测试连接</button><button type="button" :disabled="!current?.configured||form.clearKey" @click="act('activate')">设为默认</button></div>
 </fieldset></form><p v-if="busy" role="status">处理中…</p><p v-if="message" role="status" class="success">{{message}}</p><p v-if="error" role="alert" class="error">{{error}}</p>
 <p class="note">连接测试会向所选服务发送一个短请求，可能消耗少量额度。保存配置不会调用模型。切换服务前请先保存当前修改。</p><a v-if="current?.docsUrl" :href="current.docsUrl" target="_blank" rel="noopener">查看官方 API 文档</a>
 </section></div></main>
</template>
<style scoped>
.saved-models{display:grid;gap:10px}.saved-models button{text-align:left;display:grid;gap:4px;width:100%;background:#f6f9fd}.saved-models button[aria-pressed=true]{border-color:#2563eb;background:#eff6ff}.saved-models span{font-size:11px;color:#12844a}
.model-settings{max-width:1060px;margin:0 auto;padding:30px 24px 60px;color:#243447}.model-settings nav{display:flex;gap:22px;margin-bottom:35px}.model-settings a{color:#2563eb}.model-settings header small{color:#2563eb;font-weight:700;letter-spacing:2px}.model-settings h1{font-size:30px;margin:10px 0}.model-settings header p,.model-settings aside p{color:#6a7b90;line-height:1.8}.model-layout{display:grid;grid-template-columns:280px 1fr;gap:24px;margin-top:28px}.model-layout>aside,.model-layout>section{background:#fff;border:1px solid #e0e7f0;border-radius:14px;padding:26px}.model-settings h2{font-size:16px}.model-settings strong{display:block;margin:20px 0;color:#2563eb}.model-settings fieldset{border:0;padding:0;margin:0}.model-settings label{display:block;font-weight:600;margin:17px 0 7px}.model-settings input:not([type=checkbox]),.model-settings select{width:100%;padding:11px 12px;border:1px solid #cdd7e4;border-radius:7px;font:inherit;background:#fff}.model-settings small{display:block;color:#7a889c;font-size:12px;margin-top:6px}.model-settings .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:25px}.model-settings button{border:1px solid #ccd8e8;background:#fff;border-radius:7px;padding:10px 14px;cursor:pointer;font:inherit}.model-settings .primary{background:#2563eb;color:white;border-color:#2563eb}.model-settings button:disabled{opacity:.5;cursor:default}.model-settings .clear-key{font-size:13px;font-weight:400}.model-settings .note{font-size:12px;color:#7a889c;line-height:1.8;margin-top:23px}.success{color:#12844a}.error{color:#b42318}@media(max-width:700px){.model-layout{grid-template-columns:1fr}.model-settings{padding:20px 14px}.model-layout>aside,.model-layout>section{padding:20px}}
</style>
