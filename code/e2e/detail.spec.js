import { test, expect } from './fixtures.js'

const FULL = {
  title: 'Crêpes de la Chandeleur',
  description: 'Pour 4 gourmands.\nSe conserve un jour.',
  servings: 4,
  prep_time_minutes: 20,
  cook_time_minutes: 40,
  // Numérotation déjà tapée et lignes vides : nettoyées à l'affichage
  steps: '1. Mélanger la farine et les œufs\n\n2) Ajouter le lait\n- Laisser reposer\nCuire',
  ingredients: [
    { name: 'Farine', quantity: 250, unit: 'g' },
    { name: 'Œufs', quantity: 3, unit: null },
    { name: 'Lait', quantity: 0.5, unit: 'l' },
    { name: 'Sel', quantity: null, unit: null },
  ],
}

// Crée la recette par l'API et ouvre sa fiche
async function openRecipe(page, request, token, data) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await request.post('/api/recipes', { headers, data })
  expect(res.ok()).toBeTruthy()
  const recipe = await res.json()
  await page.goto(`/recettes/${recipe.id}`)
  await expect(page.getByRole('heading', { name: data.title, level: 1 })).toBeVisible()
  return recipe
}

const ingredients = (page) =>
  page.getByRole('region', { name: 'Ingrédients' }).getByRole('listitem')
const steps = (page) => page.getByRole('region', { name: 'Préparation' }).getByRole('listitem')
const servings = (page) => page.getByLabel('Nombre de portions')
// Bloc portions et temps (« Préparation » est aussi le titre de la section des étapes)
const fact = (page, label) => page.locator('.fact').filter({ hasText: label })

test('affiche toute la recette', async ({ page, request, token }) => {
  await openRecipe(page, request, token, FULL)

  await expect(page.getByText('Pour 4 gourmands.')).toBeVisible()
  await expect(servings(page)).toHaveText('4')
  await expect(fact(page, 'Préparation')).toContainText('20 min')
  await expect(fact(page, 'Cuisson')).toContainText('40 min')
  await expect(fact(page, 'Total')).toContainText('1 h')

  await expect(ingredients(page)).toHaveText(['250 g Farine', '3 Œufs', '0,5 l Lait', 'Sel'])
  await expect(steps(page)).toHaveText([
    '1Mélanger la farine et les œufs',
    '2Ajouter le lait',
    '3Laisser reposer',
    '4Cuire',
  ])
})

test('le formulaire ouvre la fiche après l’enregistrement', async ({ page }) => {
  await page.goto('/recettes/nouvelle')
  await page.getByRole('textbox', { name: 'Titre', exact: true }).fill('Soupe')
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  await expect(page).toHaveURL(/\/recettes\/\d+$/)
  await expect(page.getByRole('heading', { name: 'Soupe', level: 1 })).toBeVisible()
})

test('la liste ouvre la fiche', async ({ page, request, token }) => {
  await openRecipe(page, request, token, { title: 'Gratin' })
  await page.getByRole('link', { name: 'Mes recettes', exact: true }).click()
  await page.locator('.list > li').getByRole('link', { name: 'Gratin' }).click()
  await expect(page.getByRole('heading', { name: 'Gratin', level: 1 })).toBeVisible()
})

test('adapte les quantités au nombre de portions', async ({ page, request, token }) => {
  await openRecipe(page, request, token, FULL)

  await page.getByRole('button', { name: 'Une portion de plus' }).click()
  await page.getByRole('button', { name: 'Une portion de plus' }).click()
  await expect(servings(page)).toHaveText('6')
  await expect(ingredients(page)).toHaveText(['375 g Farine', '4,5 Œufs', '0,75 l Lait', 'Sel'])
  await expect(page.getByText('Quantités adaptées pour 6 portions')).toBeVisible()

  await page.getByRole('button', { name: 'Revenir à 4' }).click()
  await expect(ingredients(page).first()).toHaveText('250 g Farine')
  await expect(page.getByText('Quantités adaptées')).toHaveCount(0)

  // Pas moins d'une portion
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Une portion de moins' }).click()
  await expect(servings(page)).toHaveText('1')
  await expect(page.getByRole('button', { name: 'Une portion de moins' })).toBeDisabled()
  await expect(ingredients(page).first()).toHaveText('62,5 g Farine')
})

test('coche les ingrédients et les étapes pendant la préparation', async ({
  page,
  request,
  token,
}) => {
  await openRecipe(page, request, token, FULL)

  const farine = page.getByRole('checkbox', { name: '250 g Farine' })
  await farine.check()
  await expect(farine).toBeChecked()
  // Ingrédient barré une fois coché
  await expect(ingredients(page).first().locator('label')).toHaveClass(/done/)
  await farine.uncheck()
  await expect(ingredients(page).first().locator('label')).not.toHaveClass(/done/)

  const step = page.getByRole('button', { name: /Ajouter le lait/ })
  await expect(step).toHaveAttribute('aria-pressed', 'false')
  await step.click()
  await expect(step).toHaveAttribute('aria-pressed', 'true')
  await step.click()
  await expect(step).toHaveAttribute('aria-pressed', 'false')
})

test('recette minimale : pas de portions ni de temps, messages vides', async ({
  page,
  request,
  token,
}) => {
  await openRecipe(page, request, token, { title: 'Brouillon' })

  await expect(servings(page)).toHaveCount(0)
  await expect(page.getByText('Aucun ingrédient renseigné.')).toBeVisible()
  await expect(page.getByText('Aucune étape renseignée.')).toBeVisible()
})

test('un seul temps renseigné : pas de total', async ({ page, request, token }) => {
  await openRecipe(page, request, token, { title: 'Salade', prep_time_minutes: 10 })
  await expect(fact(page, 'Préparation')).toContainText('10 min')
  await expect(page.locator('.fact')).toHaveCount(1)
})

test('modifie depuis la fiche et y revient', async ({ page, request, token }) => {
  await openRecipe(page, request, token, { title: 'Avant' })

  await page.getByRole('link', { name: 'Modifier' }).click()
  await page.getByRole('link', { name: 'Annuler' }).click()
  await expect(page.getByRole('heading', { name: 'Avant', level: 1 })).toBeVisible()

  await page.getByRole('link', { name: 'Modifier' }).click()
  await page.getByRole('textbox', { name: 'Titre', exact: true }).fill('Après')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('heading', { name: 'Après', level: 1 })).toBeVisible()
})

test('supprime depuis la fiche après confirmation', async ({ page, request, token }) => {
  await openRecipe(page, request, token, { title: 'À jeter' })

  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Supprimer' }).click()
  await expect(page.getByRole('heading', { name: 'À jeter', level: 1 })).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Supprimer' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Aucune recette pour le moment.')).toBeVisible()
})

test('affiche une erreur pour une recette inexistante', async ({ page }) => {
  await page.goto('/recettes/999999')
  await expect(page.getByRole('alert')).toContainText('Recette introuvable')
})

test('affiche le HTML saisi comme du texte (pas de XSS)', async ({ page, request, token }) => {
  const payload = '<img src=x onerror="window.xss=1">'
  await openRecipe(page, request, token, {
    title: 'XSS',
    description: payload,
    steps: payload,
    ingredients: [{ name: payload }],
  })
  await expect(page.getByText(payload)).toHaveCount(3)
  await expect(page.locator('article img')).toHaveCount(0)
  expect(await page.evaluate(() => window.xss)).toBeUndefined()
})

test('aucun débordement horizontal sur mobile', async ({ page, request, token }) => {
  await page.setViewportSize({ width: 375, height: 760 })
  await openRecipe(page, request, token, {
    ...FULL,
    title: 'Un titre de recette particulièrement long pour un petit écran',
  })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
})
