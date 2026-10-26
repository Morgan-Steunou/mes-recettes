// Base commune des tests E2E : importer { test, expect } depuis ce fichier.
// Par défaut, chaque test démarre connecté avec le compte de test principal, sur une liste vide.
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
  const headers = { Authorization: `Bearer ${token}` }
  const items = await (await request.get('/api/items', { headers })).json()
  for (const item of items) await request.delete(`/api/items/${item.id}`, { headers })
}

export const test = base.extend({
  loggedIn: [true, { option: true }],

  // Token du compte principal, avec sa liste d'items vidée avant chaque test
  token: async ({ request }, use) => {
    const token = await getToken(request)
    await clearItems(request, token)
    await use(token)
  },

  // La page démarre avec la session déjà enregistrée (comme après une connexion).
  // Le script se relance à chaque chargement de page : il n'écrit la session qu'une fois
  // par onglet, pour qu'une déconnexion ou une session altérée par un test soit conservée.
  page: async ({ page, loggedIn, token }, use) => {
    if (loggedIn) {
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
