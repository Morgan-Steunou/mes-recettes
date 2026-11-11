import { test, expect, backToList } from './fixtures.js'

// Raccourcis vers les éléments des pages
const newRecipeButton = (page) => page.getByRole('link', { name: 'Nouvelle recette' })
const saveButton = (page) => page.getByRole('button', { name: 'Enregistrer' })
const recipeRow = (page, title) => page.locator('.list > li').filter({ hasText: title })
// Champ par son nom accessible (l'astérisque du titre, aria-hidden, n'en fait pas partie)
const field = (page, name) =>
  page
    .getByRole('textbox', { name, exact: true })
    .or(page.getByRole('spinbutton', { name, exact: true }))

const FIELDS = {
  title: 'Titre',
  description: 'Description',
  servings: 'Portions',
  prep: 'Préparation (min)',
  cook: 'Cuisson (min)',
  steps: 'Étapes',
}

// Ouvre le formulaire depuis l'accueil, remplit les champs donnés et enregistre
async function submitRecipe(page, values) {
  await newRecipeButton(page).click()
  await expect(page).toHaveURL(/\/recettes\/nouvelle$/)
  for (const [key, value] of Object.entries(values)) await field(page, FIELDS[key]).fill(value)
  await saveButton(page).click()
}

// Crée la recette puis revient à la liste
async function createRecipe(page, values) {
  await submitRecipe(page, values)
  await backToList(page)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('affiche un message quand la liste est vide', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Mes recettes' })).toBeVisible()
  await expect(page.getByText('Aucune recette pour le moment.')).toBeVisible()
})

test('crée une recette complète avec le formulaire', async ({ page }) => {
  await createRecipe(page, {
    title: 'Tarte aux pommes',
    description: 'La recette de grand-mère',
    servings: '6',
    prep: '20',
    cook: '45',
    steps: 'Étaler la pâte\nDisposer les pommes\nCuire',
  })

  // Retour à la liste, avec les informations principales
  await expect(page).toHaveURL(/\/$/)
  const row = recipeRow(page, 'Tarte aux pommes')
  await expect(row).toContainText('La recette de grand-mère')
  await expect(row).toContainText('6 portions')
  await expect(row).toContainText('1 h 05')
  await expect(page.getByText('1 recette enregistrée.')).toBeVisible()

  // Tout est conservé après rechargement, y compris les étapes sur plusieurs lignes
  await page.reload()
  await row.getByRole('link', { name: 'Modifier' }).click()
  await expect(field(page, 'Titre')).toHaveValue('Tarte aux pommes')
  await expect(field(page, 'Portions')).toHaveValue('6')
  await expect(field(page, 'Préparation (min)')).toHaveValue('20')
  await expect(field(page, 'Cuisson (min)')).toHaveValue('45')
  await expect(field(page, 'Étapes')).toHaveValue('Étaler la pâte\nDisposer les pommes\nCuire')
})

test('crée une recette avec le titre seul', async ({ page }) => {
  await createRecipe(page, { title: 'Omelette' })

  await expect(recipeRow(page, 'Omelette')).toBeVisible()
  await expect(recipeRow(page, 'Omelette').locator('.meta')).toHaveCount(0)
})

test('affiche le temps total pendant la saisie', async ({ page }) => {
  await newRecipeButton(page).click()
  await field(page, 'Préparation (min)').fill('15')
  await expect(page.getByText('Temps total : 15 min')).toBeVisible()
  await field(page, 'Cuisson (min)').fill('105')
  await expect(page.getByText('Temps total : 2 h')).toBeVisible()
})

test('n’enregistre pas sans titre', async ({ page }) => {
  await newRecipeButton(page).click()
  await expect(saveButton(page)).toBeDisabled()
  await field(page, 'Titre').fill('   ')
  await expect(saveButton(page)).toBeDisabled()
  await field(page, 'Titre').fill('Crêpes')
  await expect(saveButton(page)).toBeEnabled()
})

test('modifie une recette', async ({ page }) => {
  await createRecipe(page, { title: 'Avant', servings: '2' })
  await recipeRow(page, 'Avant').getByRole('link', { name: 'Modifier' }).click()

  await expect(page.getByRole('heading', { name: 'Modifier la recette' })).toBeVisible()
  await expect(field(page, 'Titre')).toHaveValue('Avant')
  await field(page, 'Titre').fill('Après')
  // Un champ vidé est bien effacé
  await field(page, 'Portions').fill('')
  await field(page, 'Description').fill('Nouvelle description')
  await saveButton(page).click()

  await backToList(page)
  await expect(recipeRow(page, 'Avant')).toHaveCount(0)
  await expect(recipeRow(page, 'Après')).toContainText('Nouvelle description')
  await expect(recipeRow(page, 'Après')).not.toContainText('portion')
  await page.reload()
  await expect(recipeRow(page, 'Après')).toContainText('Nouvelle description')
})

test('renommer une recette conserve ses autres champs', async ({ page, request, token }) => {
  // PUT remplace toute la recette : le formulaire doit renvoyer les champs non modifiés
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

  await recipeRow(page, full.title).getByRole('link', { name: 'Modifier' }).click()
  await expect(field(page, 'Titre')).toHaveValue(full.title)
  await field(page, 'Titre').fill('Tarte renommée')
  await saveButton(page).click()
  await backToList(page)
  await expect(recipeRow(page, 'Tarte renommée')).toBeVisible()

  const saved = await (await request.get(`/api/recipes/${created.id}`, { headers })).json()
  expect(saved).toMatchObject({ ...full, title: 'Tarte renommée' })
})

test('ouvre la fiche en cliquant sur le titre', async ({ page }) => {
  await createRecipe(page, { title: 'Gratin' })
  await recipeRow(page, 'Gratin').getByRole('link', { name: 'Gratin' }).click()
  await expect(page).toHaveURL(/\/recettes\/\d+$/)
  await expect(page.getByRole('heading', { name: 'Gratin', level: 1 })).toBeVisible()
})

test('annule une modification', async ({ page }) => {
  await createRecipe(page, { title: 'Inchangée' })
  await recipeRow(page, 'Inchangée').getByRole('link', { name: 'Modifier' }).click()
  await field(page, 'Titre').fill('Autre titre')
  await page.getByRole('link', { name: 'Annuler' }).click()

  // Retour à la fiche, sans modification
  await expect(page.getByRole('heading', { name: 'Inchangée', level: 1 })).toBeVisible()
  await backToList(page)
  await expect(recipeRow(page, 'Inchangée')).toBeVisible()
  await expect(recipeRow(page, 'Autre titre')).toHaveCount(0)
})

test('supprime une recette après confirmation', async ({ page }) => {
  await createRecipe(page, { title: 'À supprimer' })

  // Refus de la confirmation : la recette reste
  page.once('dialog', (dialog) => dialog.dismiss())
  await recipeRow(page, 'À supprimer').getByRole('button', { name: 'Supprimer' }).click()
  await expect(recipeRow(page, 'À supprimer')).toBeVisible()

  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('« À supprimer »')
    dialog.accept()
  })
  await recipeRow(page, 'À supprimer').getByRole('button', { name: 'Supprimer' }).click()
  await expect(recipeRow(page, 'À supprimer')).toHaveCount(0)
  await expect(page.getByText('Aucune recette pour le moment.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Aucune recette pour le moment.')).toBeVisible()
})

test('affiche une erreur si l’API refuse la saisie, sans la perdre', async ({ page }) => {
  // Caractère d'inversion du sens d'écriture (U+202E), refusé par l'API
  const invalidTitle = 'facture\u202eFDP.exe'
  await submitRecipe(page, { title: invalidTitle, description: 'Description conservée' })

  await expect(page.getByRole('alert')).toContainText('Le titre est invalide')
  await expect(page.getByRole('alert')).toContainText('caractères de direction interdits')
  await expect(page).toHaveURL(/\/recettes\/nouvelle$/)
  await expect(field(page, 'Titre')).toHaveValue(invalidTitle)
  await expect(field(page, 'Description')).toHaveValue('Description conservée')
})

test('affiche une erreur lisible pour un nombre hors limites', async ({ page }) => {
  await submitRecipe(page, { title: 'Banquet', servings: '500' })
  await expect(page.getByRole('alert')).toContainText(
    'Le nombre de portions ne doit pas dépasser 100.',
  )
})

test('affiche une erreur si le serveur ne répond pas', async ({ page }) => {
  // Simule une panne de l'API pour la création de recette
  await page.route('**/api/recipes', (route) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 500 }) : route.continue(),
  )
  await submitRecipe(page, { title: 'Pendant la panne' })

  await expect(page.getByRole('alert')).toContainText('Erreur du serveur')
  await expect(field(page, 'Titre')).toHaveValue('Pendant la panne')
})

test('affiche une erreur pour une recette inexistante', async ({ page }) => {
  await page.goto('/recettes/999999/modifier')
  await expect(page.getByRole('alert')).toContainText('Recette introuvable')
  await expect(field(page, 'Titre')).toHaveCount(0)
})

test('affiche le HTML saisi comme du texte (pas de XSS)', async ({ page }) => {
  const payload = '<img src=x onerror="window.xss=1">'
  await createRecipe(page, { title: payload, description: payload })

  await expect(recipeRow(page, payload)).toBeVisible()
  await expect(page.locator('.list img')).toHaveCount(0)
  expect(await page.evaluate(() => window.xss)).toBeUndefined()
})
