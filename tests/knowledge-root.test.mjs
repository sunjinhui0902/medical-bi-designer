import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getKnowledgeOverview } from '../server/knowledge.mjs'

test('explicit knowledge root is used and invalid roots do not silently switch repositories', async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'tybi-knowledge-root-')),previous=process.env.TYBI_KNOWLEDGE_ROOT
 try{
  await mkdir(path.join(root,'02_assets'))
  process.env.TYBI_KNOWLEDGE_ROOT=root
  assert.equal((await getKnowledgeOverview()).ready,true)
  process.env.TYBI_KNOWLEDGE_ROOT=path.join(root,'absent')
  await assert.rejects(getKnowledgeOverview(),/TYBI_KNOWLEDGE_ROOT/)
 }finally{if(previous===undefined)delete process.env.TYBI_KNOWLEDGE_ROOT;else process.env.TYBI_KNOWLEDGE_ROOT=previous;await rm(root,{recursive:true,force:true})}
})
