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

// Après un enregistrement réussi, le formulaire ouvre la fiche de la recette :
// attend cette page puis revient à la liste par le lien « Mes recettes »
export async function backToList(page) {
  await expect(page).toHaveURL(/\/recettes\/\d+$/)
  await page.getByRole('link', { name: 'Mes recettes', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
}

export async function clearRecipes(request, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const recipes = await (await request.get('/api/recipes', { headers })).json()
  for (const recipe of recipes) await request.delete(`/api/recipes/${recipe.id}`, { headers })
  // Catégories aussi : sinon des onglets resteraient affichés d'un test à l'autre
  const categories = await (await request.get('/api/categories', { headers })).json()
  for (const c of categories) await request.delete(`/api/categories/${c.id}`, { headers })
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
  // avec sa liste de recettes vidée avant chaque test
  token: async ({ request, authEnabled }, use) => {
    const token = authEnabled ? await getToken(request) : null
    await clearRecipes(request, token)
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

// En-tête sur une seule ligne, sans débordement, à plusieurs largeurs d'écran
// (marque et liens ne passent jamais à la ligne ; voir AppHeader.vue)
export async function expectHeaderFits(page) {
  for (const width of [360, 481, 560, 600, 680, 760, 900, 901, 980, 981, 1024, 1280]) {
    await page.setViewportSize({ width, height: 700 })
    const result = await page.evaluate(() => {
      const nav = document.querySelector('.nav').getBoundingClientRect()
      const brand = document.querySelector('.brand').getBoundingClientRect()
      const right = document.querySelector('.right').getBoundingClientRect()
      return {
        navHeight: Math.round(nav.height),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        // Espace entre la marque et le bloc de droite (négatif si chevauchement)
        gap: Math.round(right.left - brand.right),
        rightEdge: Math.round(right.right),
      }
    })
    expect(result.navHeight, `hauteur à ${width} px`).toBe(64)
    expect(result.overflow, `débordement à ${width} px`).toBe(0)
    expect(result.gap, `chevauchement à ${width} px`).toBeGreaterThan(0)
    expect(result.rightEdge, `bord droit à ${width} px`).toBeLessThanOrEqual(width)
  }
}
