import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readJson, writeJson } from '../server/json-storage.mjs'

test('separate processes serialize local configuration changes and release locks', async () => {
 const directory=await mkdtemp(path.join(tmpdir(),'tybi-process-storage-')),file=path.join(directory,'state.json')
 try {
  await writeJson(file,[])
  const source=`import {readJson,writeJson,withJsonMutation} from ${JSON.stringify(new URL('../server/json-storage.mjs',import.meta.url).href)}; const [file,id]=process.argv.slice(1); for(let i=0;i<8;i++)await withJsonMutation(file,async()=>{const rows=await readJson(file,[]);await new Promise(r=>setTimeout(r,5));await writeJson(file,[...rows,{id,i}])})`
  await Promise.all(Array.from({length:3},(_,id)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','--eval',source,file,String(id)],{stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',s=>error+=s);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(error||String(code))))})))
  const rows=await readJson(file,[])
  assert.equal(rows.length,24);assert.equal(new Set(rows.map(r=>`${r.id}:${r.i}`)).size,24)
  assert.deepEqual(await readdir(directory),['state.json'])
 }finally{await rm(directory,{recursive:true,force:true})}
})
