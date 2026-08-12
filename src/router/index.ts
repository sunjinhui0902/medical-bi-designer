import { createRouter, createWebHistory } from 'vue-router'
import DesignerHome from '../views/DesignerHome.vue'
import DataSourceManager from '../views/DataSourceManager.vue'
import ParameterManager from '../views/ParameterManager.vue'
import DatasetManager from '../views/DatasetManager.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'designer', component: DesignerHome },
    { path: '/data-sources', name: 'data-sources', component: DataSourceManager },
    { path: '/parameters', name: 'parameters', component: ParameterManager },
    { path: '/datasets', name: 'datasets', component: DatasetManager },
  ],
})

export default router
