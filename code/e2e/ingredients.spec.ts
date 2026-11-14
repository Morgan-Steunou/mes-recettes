import type { Recipe } from '../src/types/api'
import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect, backToList, authHeaders } from './fixtures'

// Champs d'une ligne d'ingrédient (n commence à 1)
const quantity = (page: Page, n: number) =>
  page.getByRole('textbox', { name: `Quantité de l'ingrédient ${n}`, exact: true })
const unit = (page: Page, n: number) =>
  page.getByRole('combobox', { name: `Unité de l'ingrédient ${n}`, exact: true })
const ingredientName = (page: Page, n: number) =>
  page.getByRole('textbox', { name: `Nom de l'ingrédient ${n}`, exact: true })
const removeButton = (page: Page, n: number) =>
  page.getByRole('button', { name: `Retirer l'ingrédient ${n}` })
const titleField = (page: Page) => page.getByRole('textbox', { name: 'Titre', exact: true })
const saveButton = (page: Page) => page.getByRole('button', { name: 'Enregistrer' })
const recipeRow = (page: Page, title: string) =>
  page.locator('.list > li').filter({ hasText: title })

async function fillRow(page: Page, n: number, { q = '', u = '', name = '' }) {
  await quantity(page, n).fill(q)
  await unit(page, n).fill(u)
  await ingredientName(page, n).fill(name)
}

// Recette lue directement dans l'API
async function apiRecipe(
  request: APIRequestContext,
  token: string | null,
  title: string,
): Promise<Recipe> {
  const headers = authHeaders(token)
  const recipes: Recipe[] = await (await request.get('/api/recipes', { headers })).json()
  const recipe = recipes.find((r) => r.title === title)
  if (!recipe) throw new Error(`recette « ${title} » absente de l'API`)
  return recipe
}

test.beforeEach(async ({ page }) => {
  await page.goto('/recettes/nouvelle')
  await titleField(page).fill('Crêpes')
})

test('saisit des ingrédients ligne par ligne avec Entrée', async ({ page, request, token }) => {
  await expect(quantity(page, 1)).toBeVisible()
  await fillRow(page, 1, { q: '250', u: 'g', name: 'Farine' })
  // Entrée dans une ligne ajoute une ligne en dessous et y place le curseur
  await ingredientName(page, 1).press('Enter')
  await expect(quantity(page, 2)).toBeFocused()
  await fillRow(page, 2, { q: '3', name: 'Œufs' })
  await ingredientName(page, 2).press('Enter')
  await fillRow(page, 3, { q: '0,5', u: 'l', name: 'Lait' })
  await saveButton(page).click()

  await backToList(page)
  await expect(recipeRow(page, 'Crêpes')).toContainText('3 ingrédients')
  const saved = await apiRecipe(request, token, 'Crêpes')
  expect(saved.ingredients).toEqual([
    { name: 'Farine', quantity: 250, unit: 'g' },
    { name: 'Œufs', quantity: 3, unit: null },
    { name: 'Lait', quantity: 0.5, unit: 'l' },
  ])

  // Rechargées dans le formulaire, dans le même ordre, avec la virgule décimale
  await recipeRow(page, 'Crêpes').getByRole('link', { name: 'Modifier' }).click()
  await expect(ingredientName(page, 1)).toHaveValue('Farine')
  await expect(ingredientName(page, 2)).toHaveValue('Œufs')
  await expect(quantity(page, 3)).toHaveValue('0,5')
  await expect(unit(page, 3)).toHaveValue('l')
})

test('ajoute une ligne avec le bouton et en retire une', async ({ page, request, token }) => {
  await fillRow(page, 1, { name: 'Farine' })
  await page.getByRole('button', { name: 'Ajouter un ingrédient' }).click()
  await fillRow(page, 2, { name: 'À retirer' })
  await page.getByRole('button', { name: 'Ajouter un ingrédient' }).click()
  await fillRow(page, 3, { name: 'Sucre' })

  await removeButton(page, 2).click()
  await expect(ingredientName(page, 2)).toHaveValue('Sucre')
  await expect(ingredientName(page, 3)).toHaveCount(0)
  await saveButton(page).click()

  await backToList(page)
  const saved = await apiRecipe(request, token, 'Crêpes')
  expect(saved.ingredients.map((i) => i.name)).toEqual(['Farine', 'Sucre'])
})

test('retirer la dernière ligne laisse une ligne vide', async ({ page }) => {
  await fillRow(page, 1, { name: 'Farine' })
  await removeButton(page, 1).click()
  await expect(ingredientName(page, 1)).toHaveValue('')
})

test('ignore les lignes vides', async ({ page, request, token }) => {
  await page.getByRole('button', { name: 'Ajouter un ingrédient' }).click()
  await fillRow(page, 2, { name: 'Beurre' })
  await saveButton(page).click()

  await backToList(page)
  const saved = await apiRecipe(request, token, 'Crêpes')
  expect(saved.ingredients).toEqual([{ name: 'Beurre', quantity: null, unit: null }])
  // Seule la ligne remplie compte dans la liste
  await expect(recipeRow(page, 'Crêpes')).toContainText('1 ingrédient')
})

test('accepte une fraction comme quantité', async ({ page, request, token }) => {
  await fillRow(page, 1, { q: '1/2', u: 'c. à café', name: 'Sel' })
  await saveButton(page).click()

  await backToList(page)
  const saved = await apiRecipe(request, token, 'Crêpes')
  expect(saved.ingredients[0]).toEqual({ name: 'Sel', quantity: 0.5, unit: 'c. à café' })
})

test('refuse une ligne sans nom, sans rien envoyer', async ({ page }) => {
  let posted = false
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/api/recipes')) posted = true
  })
  await fillRow(page, 1, { name: 'Farine' })
  await page.getByRole('button', { name: 'Ajouter un ingrédient' }).click()
  await fillRow(page, 2, { q: '200', u: 'g' })
  await saveButton(page).click()

  await expect(page.getByRole('alert')).toHaveText("Indiquez le nom de l'ingrédient n° 2.")
  await expect(page).toHaveURL(/\/recettes\/nouvelle$/)
  await expect(quantity(page, 2)).toHaveValue('200')
  expect(posted).toBe(false)
})

test('refuse une quantité qui n’est pas un nombre', async ({ page }) => {
  await fillRow(page, 1, { q: 'beaucoup', name: 'Sucre' })
  await saveButton(page).click()

  await expect(page.getByRole('alert')).toContainText(
    "La quantité de l'ingrédient n° 1 doit être un nombre",
  )
  await expect(page).toHaveURL(/\/recettes\/nouvelle$/)
})

test('affiche l’erreur de l’API pour un ingrédient précis', async ({ page }) => {
  // Quantité nulle : acceptée par le formulaire, refusée par l'API
  await fillRow(page, 1, { name: 'Farine' })
  await page.getByRole('button', { name: 'Ajouter un ingrédient' }).click()
  await fillRow(page, 2, { q: '0', name: 'Rien' })
  await saveButton(page).click()

  await expect(page.getByRole('alert')).toHaveText(
    "La quantité de l'ingrédient n° 2 doit être supérieure à 0.",
  )
  await expect(ingredientName(page, 2)).toHaveValue('Rien')
})

test('modifier les ingrédients remplace l’ancienne liste', async ({ page, request, token }) => {
  await fillRow(page, 1, { q: '2', name: 'Pommes' })
  await saveButton(page).click()
  // Depuis la fiche ouverte après l'enregistrement
  await page.getByRole('link', { name: 'Modifier' }).click()

  await expect(ingredientName(page, 1)).toHaveValue('Pommes')
  await fillRow(page, 1, { q: '4', name: 'Poires' })
  await saveButton(page).click()

  await backToList(page)
  const saved = await apiRecipe(request, token, 'Crêpes')
  expect(saved.ingredients).toEqual([{ name: 'Poires', quantity: 4, unit: null }])
})

test('aucun débordement horizontal sur mobile avec des ingrédients', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 })
  await fillRow(page, 1, { q: '250', u: 'c. à soupe', name: 'Un ingrédient au nom assez long' })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
})
