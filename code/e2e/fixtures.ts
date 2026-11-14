// Base commune des tests E2E : importer { test, expect } depuis ce fichier.
// Par défaut, chaque test démarre sur une liste vide, connecté avec le compte de test principal
// si les comptes sont activés.
// Pour un test qui doit démarrer déconnecté : test.use({ loggedIn: false })
import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'

export type TestUser = {
  username: string
  password: string
}

// Comptes créés dans la base de test uniquement (voir global-setup.ts)
export const TEST_USER = {
  main: { username: 'e2e-alice', password: 'e2e-mot-de-passe-alice' },
  other: { username: 'e2e-bob', password: 'e2e-mot-de-passe-bob' },
} satisfies Record<string, TestUser>

// Cookie de session posé par l'API (voir app/api/routes/auth.py)
export const REFRESH_COOKIE = 'mes_recettes_refresh'

export async function getToken(
  request: APIRequestContext,
  user: TestUser = TEST_USER.main,
): Promise<string> {
  const res = await request.post('/api/auth/token', { form: user })
  expect(res.ok(), `connexion de ${user.username}`).toBeTruthy()
  return (await res.json()).access_token
}

// Ouvre une session et renvoie la valeur du cookie de session (refresh token)
export async function getRefreshCookie(
  request: APIRequestContext,
  user: TestUser = TEST_USER.main,
): Promise<string> {
  const res = await request.post('/api/auth/token', { form: user })
  expect(res.ok(), `connexion de ${user.username}`).toBeTruthy()
  const header = res
    .headersArray()
    .find((h) => h.name.toLowerCase() === 'set-cookie' && h.value.startsWith(`${REFRESH_COOKIE}=`))
  if (!header) throw new Error('cookie de session absent de la réponse')
  return header.value.split(';')[0].slice(REFRESH_COOKIE.length + 1)
}

// Après un enregistrement réussi, le formulaire ouvre la fiche de la recette :
// attend cette page puis revient à la liste par le lien « Mes recettes »
export async function backToList(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/recettes\/\d+$/)
  await page.getByRole('link', { name: 'Mes recettes', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
}

// En-tête d'authentification pour les appels directs à l'API (aucun si les comptes sont désactivés)
export function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function clearRecipes(
  request: APIRequestContext,
  token: string | null,
): Promise<void> {
  const headers = authHeaders(token)
  const recipes: { id: number }[] = await (await request.get('/api/recipes', { headers })).json()
  for (const recipe of recipes) await request.delete(`/api/recipes/${recipe.id}`, { headers })
  // Catégories aussi : sinon des onglets resteraient affichés d'un test à l'autre
  const categories: { id: number }[] = await (
    await request.get('/api/categories', { headers })
  ).json()
  for (const c of categories) await request.delete(`/api/categories/${c.id}`, { headers })
}

// Options et fixtures ajoutées à celles de Playwright
interface Fixtures {
  loggedIn: boolean
  authEnabled: boolean
  token: string | null
}

export const test = base.extend<Fixtures>({
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

  // La page démarre avec le cookie de session déjà posé (comme après une connexion) :
  // l'interface reprend la session au premier chargement. Le fixture « token » passe avant,
  // pour que la liste soit vidée avant l'ouverture de la page.
  page: async ({ page, loggedIn, token, request }, use) => {
    if (loggedIn && token) {
      await page.context().addCookies([
        {
          name: REFRESH_COOKIE,
          value: await getRefreshCookie(request),
          domain: 'localhost',
          path: '/api/auth',
          httpOnly: true,
          secure: true,
          sameSite: 'Strict',
        },
      ])
    }
    await use(page)
  },
})

export { expect }

// En-tête sur une seule ligne, sans débordement, à plusieurs largeurs d'écran
// (marque et liens ne passent jamais à la ligne ; voir AppHeader.vue)
export async function expectHeaderFits(page: Page): Promise<void> {
  for (const width of [360, 481, 560, 600, 680, 760, 900, 901, 980, 981, 1024, 1280]) {
    await page.setViewportSize({ width, height: 700 })
    const result = await page.evaluate(() => {
      const box = (selector: string) => {
        const element = document.querySelector(selector)
        if (!element) throw new Error(`${selector} absent de la page`)
        return element.getBoundingClientRect()
      }
      const nav = box('.nav')
      const brand = box('.brand')
      const right = box('.right')
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
