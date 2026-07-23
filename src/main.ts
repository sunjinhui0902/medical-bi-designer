import { createApp } from 'vue'
import '@tabler/core/dist/css/tabler.min.css'
import App from './App.vue'
import router from './router'
import './styles/app.css'

createApp(App).use(router).mount('#app')
