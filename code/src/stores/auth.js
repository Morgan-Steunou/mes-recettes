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
  // Comptes activés côté API (AUTH_ENABLED dans le .env), lu au démarrage par loadMode()
  const enabled = ref(false)
  const session = ref(loadSession())
  const user = ref(null)

  // Comptes désactivés : tout le monde a accès, sans connexion
  const isAuthenticated = computed(
    () => !enabled.value || (!!session.value.token && session.value.expiresAt > Date.now()),
  )

  async function loadMode() {
    try {
      enabled.value = (await api.get('/health')).auth === true
    } catch {
      // API injoignable : les pages afficheront l'erreur, inutile de proposer la connexion
      enabled.value = false
    }
  }

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

  return { enabled, session, user, isAuthenticated, loadMode, login, fetchMe, logout }
})

// Branche le token et la déconnexion automatique sur le client HTTP.
// À attendre avant d'installer le routeur : la première page dépend du mode (avec ou sans comptes).
export async function installAuth(pinia, router) {
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
  await auth.loadMode()
  // Session reprise après un rechargement : on récupère l'utilisateur
  if (auth.enabled && auth.isAuthenticated) auth.fetchMe().catch(() => {})
}
