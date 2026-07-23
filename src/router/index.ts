import { createRouter, createWebHistory } from 'vue-router'
import DesignerHome from '../views/DesignerHome.vue'
import DataSourceManager from '../views/DataSourceManager.vue'
import DatasetManager from '../views/DatasetManager.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'designer', component: DesignerHome },
    { path: '/data-sources', name: 'data-sources', component: DataSourceManager },
    { path: '/datasets', name: 'datasets', component: DatasetManager },
  ],
})

export default router
