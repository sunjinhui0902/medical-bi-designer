import { mkdir, readdir, stat } from 'node:fs/promises'
import { readJson, writeJson, withJsonMutation } from './json-storage.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverRoot = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(serverRoot, '..')
const codexRoot = path.resolve(projectRoot, '..')

// Candidate locations for knowledge repository
const knowledgeCandidates = [
  path.join(codexRoot, '.ai-team-worktrees', 'ka1-rework-r2-a'),
  path.join(codexRoot, '.ai-team-worktrees', 'ka1-review-final-by-b'),
  path.join(codexRoot, 'medical-bi-ai-knowledge'),
]

async function findKnowledgeRoot() {
  if (process.env.TYBI_KNOWLEDGE_ROOT?.trim()) {
    const configured = path.resolve(process.env.TYBI_KNOWLEDGE_ROOT.trim())
    const valid = await stat(path.join(configured, '02_assets')).then(s => s.isDirectory()).catch(() => false)
    if (!valid) throw new Error('TYBI_KNOWLEDGE_ROOT 无效：需要包含 02_assets 目录')
    return configured
  }
  for (const candidate of knowledgeCandidates) {
    try {
      const s = await stat(candidate)
      if (s.isDirectory()) {
        const hasAssets = await stat(path.join(candidate, '02_assets')).then((res) => res.isDirectory()).catch(() => false)
        if (hasAssets) return candidate
      }
    } catch {
      // Continue searching
    }
  }
  return null
}

async function readJsonFile(filePath, fallback = null) {
  return readJson(filePath, fallback)
}

async function writeJsonFile(filePath, data) {
  await writeJson(filePath, data)
}

// 递归扫描目录下的所有 .json 文件
async function getAllJsonFiles(dirPath) {
  const filePaths = []
  async function walk(current) {
    let entries = []
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.name.endsWith('.json')) {
        filePaths.push(fullPath)
      }
    }
  }
  await walk(dirPath)
  return filePaths
}

const categoryMetaMap = {
  business_scenario: { name: '业务场景', icon: 'IconBuildingHospital', order: 1, description: '临床科室、门急诊、住院等医疗运营业务主线与子场景' },
  metric_definition: { name: '指标定义', icon: 'IconChartBar', order: 2, description: '医疗业务指标、计算公式、可加性与生产口径' },
  data_model_definition: { name: '数仓模型', icon: 'IconDatabase', order: 3, description: '事实大宽表、维度表、物理字段与生产快照' },
  sql_case: { name: 'SQL 查询模式', icon: 'IconCode', order: 4, description: '参数化查询模式、标准模板与已上线 SQL 证据簇' },
  dashboard_template_blueprint: { name: '看板蓝图', icon: 'IconLayoutDashboard', order: 5, description: 'Dashboard V3 排版蓝图、组件与插槽映射' },
  bi_design_rule: { name: 'BI 设计规则', icon: 'IconEye', order: 6, description: '医疗图表、色彩语义与交互规范' },
  policy_rule: { name: '安全与策略', icon: 'IconShieldCheck', order: 7, description: 'SQL 只读纵深防御、AST 解析拦截与安全红线' },
  permission_knowledge: { name: '权限知识', icon: 'IconLock', order: 8, description: '科室行级权限与角色数据范围控制' },
  industry_pattern: { name: '行业模式', icon: 'IconDeviceDesktopAnalytics', order: 9, description: '开源方案模式（WrenAI、OpenChatBI 等）' },
  algorithm_definition: { name: '算法定义', icon: 'IconActivityHeartbeat', order: 10, description: '时间序列移动平均、SQLGlot AST 分析等' },
  mining_task_template: { name: '数据挖掘', icon: 'IconTrendingUp', order: 11, description: '科室收入异动检测与挖掘任务模板' },
  evaluation_case: { name: '评测用例', icon: 'IconTarget', order: 12, description: 'Golden Questions 评测用例与正负向断言' },
  terminology_mapping: { name: '术语映射', icon: 'IconBookmark', order: 13, description: '医疗业务术语与标准命名映射' },
  change_record: { name: '变更记录', icon: 'IconRefresh', order: 14, description: '知识资产版本变更记录与发布日志' },
}

export async function getKnowledgeOverview() {
  const root = await findKnowledgeRoot()
  if (!root) {
    return {
      ready: false,
      message: '未找到知识库根目录 (ka1-rework-r2-a 或 medical-bi-ai-knowledge)',
      categories: [],
      totalAssets: 0,
      totalRelations: 0,
      statusSummary: { candidate: 0, verified: 0, approved: 0 },
      scopeSummary: { hospital_dehong: 0, public: 0, private_demo: 0, product: 0 },
      unresolvedCount: 0,
    }
  }

  const assetsDir = path.join(root, '02_assets')
  const jsonFiles = await getAllJsonFiles(assetsDir)

  const categoryStats = {}
  const statusSummary = { candidate: 0, verified: 0, approved: 0, deprecated: 0, unverified: 0 }
  const scopeSummary = { hospital_dehong: 0, public: 0, private_demo: 0, product: 0 }
  let totalUnresolved = 0

  for (const filePath of jsonFiles) {
    const asset = await readJsonFile(filePath)
    if (!asset || !asset.assetId) continue

    const assetType = asset.assetType || 'unknown'
    const scope = asset.scope || 'public'
    const status = asset.status || 'candidate'

    // 统计状态
    if (status === 'approved') statusSummary.approved++
    else if (status === 'verified') statusSummary.verified++
    else if (status === 'deprecated') statusSummary.deprecated++
    else statusSummary.candidate++

    // 统计 Scope
    scopeSummary[scope] = (scopeSummary[scope] || 0) + 1

    // 统计未决问题
    const uqs = Array.isArray(asset.unresolvedQuestions) ? asset.unresolvedQuestions : []
    totalUnresolved += uqs.length

    // 统计各分类
    if (!categoryStats[assetType]) {
      const meta = categoryMetaMap[assetType] || {
        name: assetType,
        icon: 'IconTable',
        order: 99,
        description: assetType,
      }
      categoryStats[assetType] = {
        key: assetType,
        name: meta.name,
        icon: meta.icon,
        order: meta.order,
        description: meta.description,
        count: 0,
        candidateCount: 0,
        verifiedCount: 0,
        approvedCount: 0,
        unresolvedCount: 0,
      }
    }
    categoryStats[assetType].count++
    if (status === 'approved') categoryStats[assetType].approvedCount++
    else if (status === 'verified') categoryStats[assetType].verifiedCount++
    else categoryStats[assetType].candidateCount++

    categoryStats[assetType].unresolvedCount += uqs.length
  }

  const categories = Object.values(categoryStats).sort((a, b) => a.order - b.order)

  const relationsData = await readJsonFile(path.join(root, '03_relations', 'asset_relations.json'), {})
  const totalRelations = Array.isArray(relationsData.relations) ? relationsData.relations.length : 0

  const sourcesData = await readJsonFile(path.join(root, '01_sources', 'source_manifest.json'), {})
  const totalSources = Array.isArray(sourcesData.sources) ? sourcesData.sources.length : 0

  const evalQuestions = await readJsonFile(path.join(root, '05_evaluations', 'golden_questions.json'), {})
  const totalQuestions = Array.isArray(evalQuestions.questions) ? evalQuestions.questions.length : 0

  return {
    ready: true,
    rootPath: root,
    totalAssets: jsonFiles.length,
    totalRelations,
    totalSources,
    totalQuestions,
    statusSummary,
    scopeSummary,
    unresolvedCount: totalUnresolved,
    categories,
    lastUpdated: new Date().toISOString(),
  }
}

export async function getKnowledgeAssets(categoryFilter = null, keyword = '', statusFilter = '', scopeFilter = '', unresolvedOnly = false) {
  const root = await findKnowledgeRoot()
  if (!root) return []

  const assetsDir = path.join(root, '02_assets')
  const jsonFiles = await getAllJsonFiles(assetsDir)
  const results = []

  for (const filePath of jsonFiles) {
    const asset = await readJsonFile(filePath)
    if (!asset || !asset.assetId) continue

    const assetType = asset.assetType || 'unknown'
    const scope = asset.scope || 'public'
    const status = asset.status || 'candidate'

    // 过滤条件
    if (categoryFilter && categoryFilter !== 'all' && assetType !== categoryFilter) continue
    if (statusFilter && status !== statusFilter) continue
    if (scopeFilter && scopeFilter !== 'all' && scope !== scopeFilter) continue

    const uqs = Array.isArray(asset.unresolvedQuestions) ? asset.unresolvedQuestions : []
    if (unresolvedOnly && uqs.length === 0) continue

    if (keyword) {
      const kw = keyword.toLowerCase()
      const searchStr = `${asset.assetId} ${asset.name || ''} ${asset.description || ''} ${JSON.stringify(asset.payload || {})} ${JSON.stringify(uqs)}`.toLowerCase()
      if (!searchStr.includes(kw)) continue
    }

    // 计算生产证据数量
    let productionEvidenceCount = 0
    if (asset.payload?.evidenceCount !== undefined) {
      productionEvidenceCount = asset.payload.evidenceCount
    } else if (asset.payload?.evidenceReferencesCount !== undefined) {
      productionEvidenceCount = asset.payload.evidenceReferencesCount
    } else if (Array.isArray(asset.payload?.referencedByEvidenceIds)) {
      productionEvidenceCount = asset.payload.referencedByEvidenceIds.length
    } else if (Array.isArray(asset.evidenceRefs)) {
      productionEvidenceCount = asset.evidenceRefs.length
    }

    const catMeta = categoryMetaMap[assetType] || { name: assetType, order: 99 }

    results.push({
      categoryKey: assetType,
      categoryName: catMeta.name,
      fileName: path.basename(filePath),
      filePath: path.relative(root, filePath),
      assetId: asset.assetId,
      version: asset.version || '0.2.0',
      name: asset.name || asset.assetId,
      status,
      scope,
      securityLevel: asset.security?.level || 'internal',
      confidence: asset.confidence || 'reviewed',
      description: asset.description || asset.payload?.tableComment || asset.payload?.businessDefinition || '',
      productionEvidenceCount,
      unresolvedQuestions: uqs,
      hasUnresolved: uqs.length > 0,
      parameters: asset.payload?.parameters || [],
      evidenceRefs: asset.evidenceRefs || [],
      tags: asset.tags || [],
      updatedAt: asset.updatedAt || '',
      payload: asset.payload || {},
    })
  }

  // 排序：按未决问题优先，其次按生产证据数降序
  return results.sort((a, b) => {
    if (a.hasUnresolved !== b.hasUnresolved) return a.hasUnresolved ? -1 : 1
    return (b.productionEvidenceCount || 0) - (a.productionEvidenceCount || 0)
  })
}

export async function getKnowledgeAssetDetail(assetId) {
  const root = await findKnowledgeRoot()
  if (!root) return null

  const assetsDir = path.join(root, '02_assets')
  const jsonFiles = await getAllJsonFiles(assetsDir)

  for (const filePath of jsonFiles) {
    const asset = await readJsonFile(filePath)
    if (asset && asset.assetId === assetId) {
      const assetType = asset.assetType || 'unknown'
      const relationsData = await readJsonFile(path.join(root, '03_relations', 'asset_relations.json'), {})
      const allRelations = Array.isArray(relationsData.relations) ? relationsData.relations : []
      const relatedOut = allRelations.filter((r) => r.source?.assetId === assetId)
      const relatedIn = allRelations.filter((r) => r.target?.assetId === assetId)

      const sourcesData = await readJsonFile(path.join(root, '01_sources', 'source_manifest.json'), {})
      const allSources = Array.isArray(sourcesData.sources) ? sourcesData.sources : []
      const evidenceSources = (asset.evidenceRefs || []).map((ref) => {
        const matched = allSources.find((s) => s.sourceId === ref.sourceId)
        return {
          ...ref,
          sourceDetail: matched || null,
        }
      })

      let executableContent = null
      const fixtureRef = asset.payload?.verification?.fixtureRef
      if (fixtureRef) {
        const fixturePath = path.join(root, fixtureRef)
        executableContent = await readJsonFile(fixturePath)
      }

      let sqlContent = null
      if (asset.payload?.canonicalTemplateSql) {
        sqlContent = asset.payload.canonicalTemplateSql
      } else if (asset.payload?.executableDefaultSql) {
        sqlContent = asset.payload.executableDefaultSql
      } else if (asset.payload?.sqlTemplate) {
        sqlContent = asset.payload.sqlTemplate
      }

      return {
        categoryKey: assetType,
        categoryName: categoryMetaMap[assetType]?.name || assetType,
        fileName: path.basename(filePath),
        filePath: path.relative(root, filePath),
        asset,
        scope: asset.scope || 'public',
        security: asset.security || { level: 'internal' },
        unresolvedQuestions: asset.unresolvedQuestions || [],
        parameters: asset.payload?.parameters || [],
        relatedOut,
        relatedIn,
        evidenceSources,
        executableContent,
        sqlContent,
      }
    }
  }

  return null
}

export async function updateKnowledgeAsset(assetId, updatePayload, rootOverride) {
  const root = rootOverride || await findKnowledgeRoot()
  if (!root) throw new Error('未找到知识库根目录')

  const assetsDir = path.join(root, '02_assets')
  const jsonFiles = await getAllJsonFiles(assetsDir)

  for (const filePath of jsonFiles) {
    const asset = await readJsonFile(filePath)
    if (asset && asset.assetId === assetId) {
      return withJsonMutation(filePath, async () => {
        const current = await readJsonFile(filePath)
        if (!current || current.assetId !== assetId) throw new Error('资产已变更，请重新加载后再保存')
        const updated = {
          ...current,
          name: updatePayload.name !== undefined ? updatePayload.name : current.name,
          description: updatePayload.description !== undefined ? updatePayload.description : current.description,
          status: updatePayload.status !== undefined ? updatePayload.status : current.status,
          tags: Array.isArray(updatePayload.tags) ? updatePayload.tags : current.tags,
          updatedAt: new Date().toISOString(),
          payload: { ...(current.payload || {}), ...(updatePayload.payload || {}) },
        }
        await writeJsonFile(filePath, updated)
        return updated
      })
    }
  }

  throw new Error(`未找到资产 ID: ${assetId}`)
}

export async function updateKnowledgeAssetStatus(assetId, status) {
  return await updateKnowledgeAsset(assetId, { status })
}

export async function getKnowledgeRelationsGraph() {
  const root = await findKnowledgeRoot()
  if (!root) return { nodes: [], links: [] }

  const relationsData = await readJsonFile(path.join(root, '03_relations', 'asset_relations.json'), {})
  const relations = Array.isArray(relationsData.relations) ? relationsData.relations : []

  const nodeMap = new Map()
  const links = []

  for (const r of relations) {
    const sId = r.source?.assetId
    const tId = r.target?.assetId
    if (!sId || !tId) continue

    if (!nodeMap.has(sId)) {
      nodeMap.set(sId, { id: sId, label: r.source.name || sId, type: r.source.type || 'asset' })
    }
    if (!nodeMap.has(tId)) {
      nodeMap.set(tId, { id: tId, label: r.target.name || tId, type: r.target.type || 'asset' })
    }

    links.push({
      source: sId,
      target: tId,
      relationId: r.relationId,
      type: r.type || r.relationType || 'uses',
      description: r.description || '',
    })
  }

  return {
    nodes: Array.from(nodeMap.values()),
    links,
  }
}

export async function getKnowledgeSources() {
  const root = await findKnowledgeRoot()
  if (!root) return []
  const data = await readJsonFile(path.join(root, '01_sources', 'source_manifest.json'), {})
  return Array.isArray(data.sources) ? data.sources : []
}

export async function getKnowledgeEvaluations() {
  const root = await findKnowledgeRoot()
  if (!root) return { questions: [], cases: [] }
  const questionsData = await readJsonFile(path.join(root, '05_evaluations', 'golden_questions.json'), {})
  return {
    questions: Array.isArray(questionsData.questions) ? questionsData.questions : [],
    cases: [],
  }
}

export async function getKnowledgeUserProfile() {
  const root = await findKnowledgeRoot()
  if (!root) return { confirmed: [], inferred: [] }
  const confirmedData = await readJsonFile(path.join(root, '90_user_profile', 'owner_confirmed_preferences.json'), {})
  const inferredData = await readJsonFile(path.join(root, '90_user_profile', 'inferred_candidate_preferences.json'), {})
  return {
    confirmed: Array.isArray(confirmedData.preferences) ? confirmedData.preferences : (confirmedData.items || []),
    inferred: Array.isArray(inferredData.preferences) ? inferredData.preferences : (inferredData.items || []),
  }
}

export async function importKnowledgeSource() {
  const error = new Error('知识来源导入尚未完成审核，当前不可用')
  error.status = 403
  throw error
}
