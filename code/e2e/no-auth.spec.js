import { test, expect } from './fixtures.js'

// Mode sans comptes (AUTH_ENABLED=false, réglage par défaut)
test.beforeEach(({ authEnabled }) => {
  test.skip(authEnabled, 'Comptes activés (AUTH_ENABLED=true)')
})

test('ouvre l’accueil directement, sans connexion', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible()
  await expect(page.getByText('Aucun item pour le moment.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toHaveCount(0)
})

test('la page de connexion renvoie vers l’accueil', async ({ page }) => {
  await page.goto('/login')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Connexion' })).toHaveCount(0)
})

test('l’API accepte les requêtes sans token', async ({ request }) => {
  const res = await request.get('/api/items')
  expect(res.status()).toBe(200)
})
