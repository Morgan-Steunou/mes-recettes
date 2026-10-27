// Base commune des tests E2E : importer { test, expect } depuis ce fichier.
// Par défaut, chaque test démarre sur une liste vide, connecté avec le compte de test principal
// si les comptes sont activés.
// Pour un test qui doit démarrer déconnecté : test.use({ loggedIn: false })
import { test as base, expect } from '@playwright/test'

// Comptes créés dans la base de test uniquement (voir global-setup.js)
export const TEST_USER = {
  main: { username: 'e2e-alice', password: 'e2e-mot-de-passe-alice' },
  other: { username: 'e2e-bob', password: 'e2e-mot-de-passe-bob' },
}

// Clé sous laquelle l'interface garde la session (voir src/stores/auth.js)
export const STORAGE_KEY = 'mes-recettes.auth'

export async function getToken(request, user = TEST_USER.main) {
  const res = await request.post('/api/auth/token', { form: user })
  expect(res.ok(), `connexion de ${user.username}`).toBeTruthy()
  return (await res.json()).access_token
}

export async function clearItems(request, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const items = await (await request.get('/api/items', { headers })).json()
  for (const item of items) await request.delete(`/api/items/${item.id}`, { headers })
}

export const test = base.extend({
  loggedIn: [true, { option: true }],

  // Comptes activés dans l'API de test (AUTH_ENABLED du .env, ou de l'environnement :
  // AUTH_ENABLED=true npx playwright test)
  authEnabled: async ({ request }, use) => {
    const health = await (await request.get('/api/health')).json()
    await use(health.auth === true)
  },

  // Token du compte principal (null si les comptes sont désactivés),
  // avec sa liste d'items vidée avant chaque test
  token: async ({ request, authEnabled }, use) => {
    const token = authEnabled ? await getToken(request) : null
    await clearItems(request, token)
    await use(token)
  },

  // La page démarre avec la session déjà enregistrée (comme après une connexion).
  // Le script se relance à chaque chargement de page : il n'écrit la session qu'une fois
  // par onglet, pour qu'une déconnexion ou une session altérée par un test soit conservée.
  page: async ({ page, loggedIn, token }, use) => {
    if (loggedIn && token) {
      await page.addInitScript(
        ([key, value]) => {
          if (window.sessionStorage.getItem('e2e-session-seeded')) return
          window.localStorage.setItem(key, value)
          window.sessionStorage.setItem('e2e-session-seeded', '1')
        },
        [STORAGE_KEY, JSON.stringify({ token, expiresAt: Date.now() + 30 * 60 * 1000 })],
      )
    }
    await use(page)
  },
})

export { expect }
