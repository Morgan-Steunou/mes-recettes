import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Pinia } from 'pinia'
import type { Router } from 'vue-router'
import { api, ApiError, configureAuth } from '@/services/api'
import type { Token, User } from '@/types/api'
import { useRecipesStore } from '@/stores/recipes'

// Session en deux parties :
// - le token d'accès (15 min par défaut) reste en mémoire, jamais dans le stockage du
//   navigateur : un script injecté dans la page ne peut pas le retrouver après coup ;
// - le refresh token est un cookie HttpOnly posé par l'API, illisible ici. Il sert à obtenir
//   un nouveau token d'accès (POST /auth/refresh), au chargement de la page et à l'expiration.

// Ancienne version : token gardé dans le localStorage, effacé s'il y est encore
const LEGACY_STORAGE_KEY = 'mes-recettes.auth'
// Verrou partagé entre onglets : le cookie ne sert qu'une fois, un seul renouvellement à la fois
const REFRESH_LOCK = 'mes-recettes.auth-refresh'
// Renouvellement anticipé, pour ne pas envoyer un token sur le point d'expirer
const REFRESH_MARGIN_MS = 30_000

function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  return navigator.locks ? navigator.locks.request(REFRESH_LOCK, task) : task()
}

export const useAuthStore = defineStore('auth', () => {
  // Comptes activés côté API (AUTH_ENABLED dans le .env), lu au démarrage par restore()
  const enabled = ref(false)
  const accessToken = ref<string | null>(null)
  const expiresAt = ref(0)
  const user = ref<User | null>(null)

  // Comptes désactivés : tout le monde a accès, sans connexion
  const isAuthenticated = computed(() => !enabled.value || !!accessToken.value)

  async function loadMode() {
    try {
      enabled.value = (await api.get<{ auth?: boolean }>('/health')).auth === true
    } catch {
      // API injoignable : les pages afficheront l'erreur, inutile de proposer la connexion
      enabled.value = false
    }
  }

  function setAccess(data: Token) {
    accessToken.value = data.access_token
    expiresAt.value = Date.now() + data.expires_in * 1000
  }

  function clear() {
    accessToken.value = null
    expiresAt.value = 0
    user.value = null
    useRecipesStore().reset()
  }

  async function login(username: string, password: string) {
    const data = await api.postForm<Token>(
      '/auth/token',
      { username, password },
      // Un 401 ici signifie « mauvais identifiants », pas « session expirée »
      { auth: false, skipAuthRedirect: true },
    )
    setAccess(data)
    await fetchMe()
  }

  async function fetchMe() {
    user.value = await api.get<User>('/auth/me')
  }

  // Nouveau token d'accès à partir du cookie de session. Renvoie false si la session est
  // terminée (cookie absent, expiré ou révoqué). Les appels simultanés partagent le même.
  let refreshing: Promise<boolean> | null = null
  function refresh(): Promise<boolean> {
    refreshing ??= withRefreshLock(async () => {
      try {
        setAccess(
          await api.post<Token>('/auth/refresh', undefined, {
            auth: false,
            skipAuthRedirect: true,
          }),
        )
        return true
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) clear()
        return false
      }
    }).finally(() => {
      refreshing = null
    })
    return refreshing
  }

  // Token d'accès à envoyer, renouvelé s'il expire bientôt
  async function validToken() {
    if (accessToken.value && expiresAt.value - Date.now() < REFRESH_MARGIN_MS) await refresh()
    return accessToken.value
  }

  // Au chargement de la page : mode (avec ou sans comptes), puis reprise de la session s'il y
  // en a une
  let restoring: Promise<void> | null = null
  function restore(): Promise<void> {
    restoring ??= (async () => {
      await loadMode()
      if (!enabled.value) return
      try {
        localStorage.removeItem(LEGACY_STORAGE_KEY)
      } catch {
        // Stockage indisponible : rien à effacer
      }
      if (await refresh()) await fetchMe().catch(() => {})
    })()
    return restoring
  }

  async function logout() {
    if (!enabled.value) return
    clear()
    // Révoque la session côté serveur et efface le cookie
    await api
      .post('/auth/logout', undefined, { auth: false, skipAuthRedirect: true })
      .catch(() => {})
  }

  return { enabled, user, isAuthenticated, login, fetchMe, refresh, validToken, restore, logout }
})

// Branche le token, son renouvellement et la déconnexion automatique sur le client HTTP
export function installAuth(pinia: Pinia, router: Router): void {
  const auth = useAuthStore(pinia)
  configureAuth({
    tokenProvider: () => auth.validToken(),
    refreshHandler: () => auth.refresh(),
    unauthorizedHandler: () => {
      auth.logout()
      const current = router.currentRoute.value
      if (current.meta.requiresAuth) {
        router.push({ name: 'login', query: { redirect: current.fullPath, expired: '1' } })
      }
    },
  })
  auth.restore()
}
