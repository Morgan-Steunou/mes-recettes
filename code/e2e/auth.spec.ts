import type { Page } from '@playwright/test'
import {
  test,
  expect,
  TEST_USER,
  REFRESH_COOKIE,
  getToken,
  expectHeaderFits,
  type TestUser,
} from './fixtures'

const usernameInput = (page: Page) => page.getByLabel('Identifiant')
const passwordInput = (page: Page) => page.getByLabel('Mot de passe')
const loginButton = (page: Page) => page.getByRole('button', { name: 'Se connecter' })

// Liste des recettes chargée par l'accueil (avec ou sans filtres)
const RECIPES_LIST = /\/api\/recipes(\?.*)?$/

// Ces tests ne concernent que le mode avec comptes : AUTH_ENABLED=true npx playwright test
test.beforeEach(({ authEnabled }) => {
  test.skip(!authEnabled, 'Comptes désactivés (AUTH_ENABLED=false)')
})

async function login(page: Page, { username, password }: TestUser) {
  await usernameInput(page).fill(username)
  await passwordInput(page).fill(password)
  await loginButton(page).click()
}

test.describe('déconnecté', () => {
  test.use({ loggedIn: false })

  test("redirige vers la connexion quand on n'est pas connecté", async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login\?redirect=\/$/)
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
  })

  test('refuse un mauvais mot de passe', async ({ page }) => {
    await page.goto('/login')
    await login(page, { username: TEST_USER.main.username, password: 'mauvais-mot-de-passe' })

    await expect(page.getByRole('alert')).toContainText('Identifiant ou mot de passe incorrect')
    await expect(page).toHaveURL(/\/login/)
    await expect(passwordInput(page)).toHaveValue('')
  })

  test('se connecte puis revient à la page demandée', async ({ page }) => {
    await page.goto('/')
    await login(page, TEST_USER.main)

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Mes recettes' })).toBeVisible()
    await expect(page.getByText(TEST_USER.main.username)).toBeVisible()

    // Session reprise après un rechargement, grâce au cookie posé à la connexion
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Mes recettes' })).toBeVisible()
    await expect(page.getByText(TEST_USER.main.username)).toBeVisible()
  })

  test('n’envoie aucune donnée à une adresse externe après connexion', async ({ page }) => {
    // Un paramètre « redirect » malveillant ne doit pas faire quitter l'application
    await page.goto('/login?redirect=//exemple-malveillant.test')
    await login(page, TEST_USER.main)
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/)
  })
})

test('se déconnecte et ne peut plus accéder à ses recettes', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Mes recettes' })).toBeVisible()

  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page).toHaveURL(/\/login/)
  // Cookie de session effacé par l'API
  const cookies = await page.context().cookies()
  expect(cookies.find((c) => c.name === REFRESH_COOKIE)).toBeUndefined()

  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})

test('aucun token n’est lisible par le JavaScript de la page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Mes recettes' })).toBeVisible()

  const exposed = await page.evaluate(() => ({
    storage: JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
    cookies: document.cookie,
  }))
  // Ni token d'accès (JWT, commence par « eyJ ») dans le stockage, ni cookie de session visible
  expect(exposed.storage).not.toContain('eyJ')
  expect(exposed.cookies).not.toContain(REFRESH_COOKIE)
})

test('renouvelle le token d’accès refusé et rejoue la requête', async ({ page }) => {
  // Le premier chargement de la liste est refusé comme avec un token expiré
  let refused = false
  await page.route(RECIPES_LIST, async (route) => {
    if (refused || route.request().method() !== 'GET') return route.fallback()
    refused = true
    await route.fulfill({ status: 401, json: { detail: 'Authentification requise' } })
  })
  const refreshed = page.waitForResponse((r) => r.url().endsWith('/api/auth/refresh') && r.ok())

  await page.goto('/')

  await refreshed
  await expect(page.getByText('Aucune recette pour le moment.')).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  expect(refused).toBe(true)
})

test('renvoie vers la connexion quand la session est terminée', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Mes recettes' })).toBeVisible()

  // Session terminée côté navigateur (cookie expiré ou révoqué) et token d'accès refusé
  await page.context().clearCookies()
  await page.route(RECIPES_LIST, (route) =>
    route.fulfill({ status: 401, json: { detail: 'Authentification requise' } }),
  )
  await page.getByRole('link', { name: 'À propos' }).click()
  await page.getByRole('link', { name: 'Accueil' }).click()

  await expect(page).toHaveURL(/\/login\?.*expired=1/)
  await expect(page.getByText('Votre session a expiré')).toBeVisible()
})

test('chaque utilisateur ne voit que ses propres recettes', async ({ page, request }) => {
  // Bob crée une recette par l'API
  const bobToken = await getToken(request, TEST_USER.other)
  const headers = { Authorization: `Bearer ${bobToken}` }
  const created = await request.post('/api/recipes', {
    headers,
    data: { title: 'Secret de Bob' },
  })
  expect(created.ok()).toBeTruthy()
  const bobRecipe: { id: number } = await created.json()

  try {
    // Alice (connectée dans la page) ne le voit pas
    await page.goto('/')
    await expect(page.getByText('Aucune recette pour le moment.')).toBeVisible()
    await expect(page.getByText('Secret de Bob')).toHaveCount(0)
  } finally {
    await request.delete(`/api/recipes/${bobRecipe.id}`, { headers })
  }
})

test('l’en-tête tient sur une ligne avec le compte et la déconnexion', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible()
  await expectHeaderFits(page)
})

test('l’API refuse les requêtes sans token', async ({ request }) => {
  const res = await request.get('/api/recipes')
  expect(res.status()).toBe(401)
})
