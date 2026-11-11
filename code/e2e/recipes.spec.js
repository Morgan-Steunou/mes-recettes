import { test, expect } from './fixtures.js'

// Raccourcis vers les éléments de la page d'accueil
const newRecipeInput = (page) => page.getByPlaceholder('Titre de la recette')
const addButton = (page) => page.getByRole('button', { name: 'Ajouter' })
const recipeRow = (page, title) => page.locator('.list li').filter({ hasText: title })

async function addRecipe(page, title) {
  await newRecipeInput(page).fill(title)
  await addButton(page).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('affiche un message quand la liste est vide', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible()
  await expect(page.getByText('Aucune recette pour le moment.')).toBeVisible()
})

test('ajoute une recette', async ({ page }) => {
  await addRecipe(page, 'Première recette')

  await expect(recipeRow(page, 'Première recette')).toBeVisible()
  await expect(newRecipeInput(page)).toHaveValue('')
})

test('conserve les recettes après rechargement de la page', async ({ page }) => {
  await addRecipe(page, 'Recette persistante')
  await expect(recipeRow(page, 'Recette persistante')).toBeVisible()

  await page.reload()
  await expect(recipeRow(page, 'Recette persistante')).toBeVisible()
})

test('modifie une recette', async ({ page }) => {
  await addRecipe(page, 'Avant')
  await recipeRow(page, 'Avant').getByRole('button', { name: 'Modifier' }).click()

  const editInput = page.getByLabel('Nouveau titre')
  await expect(editInput).toBeFocused()
  await editInput.fill('Après')
  await editInput.press('Enter')

  await expect(recipeRow(page, 'Après')).toBeVisible()
  await expect(recipeRow(page, 'Avant')).toHaveCount(0)
  await page.reload()
  await expect(recipeRow(page, 'Après')).toBeVisible()
})

test('renommer une recette conserve ses autres champs', async ({ page, request, token }) => {
  // PUT remplace toute la recette : l'interface doit renvoyer les champs non modifiés
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const full = {
    title: 'Tarte complète',
    description: 'Avec tous les champs',
    servings: 6,
    prep_time_minutes: 20,
    cook_time_minutes: 35,
    steps: 'Étaler\nCuire',
  }
  const created = await (await request.post('/api/recipes', { headers, data: full })).json()
  await page.reload()

  await recipeRow(page, full.title).getByRole('button', { name: 'Modifier' }).click()
  await page.getByLabel('Nouveau titre').fill('Tarte renommée')
  await page.getByLabel('Nouveau titre').press('Enter')
  await expect(recipeRow(page, 'Tarte renommée')).toBeVisible()

  const saved = await (await request.get(`/api/recipes/${created.id}`, { headers })).json()
  expect(saved).toMatchObject({ ...full, title: 'Tarte renommée' })
})

test('annule une modification avec Échap', async ({ page }) => {
  await addRecipe(page, 'Inchangé')
  await recipeRow(page, 'Inchangé').getByRole('button', { name: 'Modifier' }).click()
  await page.getByLabel('Nouveau titre').fill('Autre titre')
  await page.getByLabel('Nouveau titre').press('Escape')

  await expect(page.getByLabel('Nouveau titre')).toHaveCount(0)
  await expect(recipeRow(page, 'Inchangé')).toBeVisible()
})

test('supprime une recette', async ({ page }) => {
  await addRecipe(page, 'À supprimer')
  await recipeRow(page, 'À supprimer').getByRole('button', { name: 'Supprimer' }).click()

  await expect(recipeRow(page, 'À supprimer')).toHaveCount(0)
  await expect(page.getByText('Aucune recette pour le moment.')).toBeVisible()
})

test('affiche une erreur si le titre est refusé par l’API, sans perdre la saisie', async ({
  page,
}) => {
  // Caractère d'inversion du sens d'écriture (U+202E), refusé par l'API
  const invalidTitle = 'facture\u202eFDP.exe'
  await addRecipe(page, invalidTitle)

  await expect(page.getByRole('alert')).toContainText('caractères de direction interdits')
  await expect(newRecipeInput(page)).toHaveValue(invalidTitle)

  await page.getByRole('button', { name: 'Fermer le message' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('affiche une erreur si le serveur ne répond pas', async ({ page }) => {
  // Simule une panne de l'API pour la création de recette
  await page.route('**/api/recipes', (route) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 500 }) : route.continue(),
  )
  await addRecipe(page, 'Pendant la panne')

  await expect(page.getByRole('alert')).toContainText('Erreur du serveur')
  await expect(newRecipeInput(page)).toHaveValue('Pendant la panne')
})

test('affiche le HTML saisi comme du texte (pas de XSS)', async ({ page }) => {
  const payload = '<img src=x onerror="window.xss=1">'
  await addRecipe(page, payload)

  await expect(recipeRow(page, payload)).toBeVisible()
  await expect(page.locator('.list img')).toHaveCount(0)
  expect(await page.evaluate(() => window.xss)).toBeUndefined()
})
