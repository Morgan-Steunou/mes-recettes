import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, configureAuth } from '@/services/api'
import { useItemsStore } from '@/stores/items'

// Le token est gardé dans le navigateur pour rester connecté après un rechargement.
// Il expire côté serveur (60 min par défaut) ; l'interface le jette aussi à son expiration.
const STORAGE_KEY = 'mes-recettes.auth'

function loadSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved?.token && saved.expiresAt > Date.now()) return saved
  } catch {
    // Stockage indisponible ou contenu illisible : on repart sans session
  }
  return { token: null, expiresAt: 0 }
}

function saveSession(session) {
  try {
    if (session.token) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Navigation privée stricte : la session ne durera que le temps de l'onglet
  }
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref(loadSession())
  const user = ref(null)

  const isAuthenticated = computed(
    () => !!session.value.token && session.value.expiresAt > Date.now(),
  )

  function setSession(token, expiresInSeconds) {
    session.value = token
      ? { token, expiresAt: Date.now() + expiresInSeconds * 1000 }
      : { token: null, expiresAt: 0 }
    saveSession(session.value)
  }

  async function login(username, password) {
    const data = await api.postForm(
      '/auth/token',
      { username, password },
      // Un 401 ici signifie « mauvais identifiants », pas « session expirée »
      { skipAuthRedirect: true },
    )
    setSession(data.access_token, data.expires_in)
    await fetchMe()
  }

  async function fetchMe() {
    user.value = await api.get('/auth/me')
  }

  function logout() {
    setSession(null)
    user.value = null
    useItemsStore().reset()
  }

  return { session, user, isAuthenticated, login, fetchMe, logout }
})

// Branche le token et la déconnexion automatique sur le client HTTP
export function installAuth(pinia, router) {
  const auth = useAuthStore(pinia)
  configureAuth({
    tokenProvider: () => (auth.isAuthenticated ? auth.session.token : null),
    unauthorizedHandler: () => {
      auth.logout()
      const current = router.currentRoute.value
      if (current.meta.requiresAuth) {
        router.push({ name: 'login', query: { redirect: current.fullPath, expired: '1' } })
      }
    },
  })
  // Session reprise après un rechargement : on récupère l'utilisateur
  if (auth.isAuthenticated) auth.fetchMe().catch(() => {})
}
