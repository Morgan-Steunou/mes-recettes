import { test, expect, expectHeaderFits } from './fixtures.js'

// Mode sans comptes (AUTH_ENABLED=false, réglage par défaut)
test.beforeEach(({ authEnabled }) => {
  test.skip(authEnabled, 'Comptes activés (AUTH_ENABLED=true)')
})

test('ouvre l’accueil directement, sans connexion', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Mes recettes' })).toBeVisible()
  await expect(page.getByText('Aucune recette pour le moment.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toHaveCount(0)
})

test('l’en-tête tient sur une ligne à toutes les largeurs', async ({ page }) => {
  await page.goto('/')
  await expectHeaderFits(page)
})

test('la page de connexion renvoie vers l’accueil', async ({ page }) => {
  await page.goto('/login')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Connexion' })).toHaveCount(0)
})

test('l’API accepte les requêtes sans token', async ({ request }) => {
  const res = await request.get('/api/recipes')
  expect(res.status()).toBe(200)
})
