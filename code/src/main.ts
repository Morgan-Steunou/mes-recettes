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
// Le routeur attend la reprise de la session (mode avec ou sans comptes compris) avant la
// première page
installAuth(pinia, router)
app.use(router)
app.mount('#app')
