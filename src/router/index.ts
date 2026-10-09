import { createRouter, createWebHistory } from 'vue-router'
const DesignerHome = () => import('../views/DesignerHome.vue')
const DataSourceManager = () => import('../views/DataSourceManager.vue')
const ParameterManager = () => import('../views/ParameterManager.vue')
const DatasetManager = () => import('../views/DatasetManager.vue')
const KnowledgeManager = () => import('../views/KnowledgeManager.vue')
const ModelSettings = () => import('../views/ModelSettings.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'designer', component: DesignerHome },
    { path: '/data-sources', name: 'data-sources', component: DataSourceManager },
    { path: '/parameters', name: 'parameters', component: ParameterManager },
    { path: '/datasets', name: 'datasets', component: DatasetManager },
    { path: '/knowledge', name: 'knowledge', component: KnowledgeManager },
    { path: '/model-settings', name: 'model-settings', component: ModelSettings },
  ],
})

export default router
