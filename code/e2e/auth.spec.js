import { test, expect, TEST_USER, STORAGE_KEY, getToken } from './fixtures.js'

const usernameInput = (page) => page.getByLabel('Identifiant')
const passwordInput = (page) => page.getByLabel('Mot de passe')
const loginButton = (page) => page.getByRole('button', { name: 'Se connecter' })

// Ces tests ne concernent que le mode avec comptes : AUTH_ENABLED=true npx playwright test
test.beforeEach(({ authEnabled }) => {
  test.skip(!authEnabled, 'Comptes désactivés (AUTH_ENABLED=false)')
})

async function login(page, { username, password }) {
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
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()

  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})

test('renvoie vers la connexion quand le token n’est plus valide', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Mes recettes' })).toBeVisible()

  // Token altéré (simule une session expirée ou révoquée côté serveur)
  await page.evaluate((key) => {
    const session = JSON.parse(localStorage.getItem(key))
    localStorage.setItem(key, JSON.stringify({ ...session, token: `${session.token}x` }))
  }, STORAGE_KEY)
  await page.reload()

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
  const bobRecipe = await created.json()

  try {
    // Alice (connectée dans la page) ne le voit pas
    await page.goto('/')
    await expect(page.getByText('Aucune recette pour le moment.')).toBeVisible()
    await expect(page.getByText('Secret de Bob')).toHaveCount(0)
  } finally {
    await request.delete(`/api/recipes/${bobRecipe.id}`, { headers })
  }
})

test('l’API refuse les requêtes sans token', async ({ request }) => {
  const res = await request.get('/api/recipes')
  expect(res.status()).toBe(401)
})
