import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { installAuth } from './stores/auth'
// Polices auto-hébergées (aucune requête vers un service externe)
import '@fontsource-variable/inter'
import '@fontsource-variable/fraunces/opsz.css'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
installAuth(pinia, router).then(() => {
  app.use(router)
  app.mount('#app')
})
