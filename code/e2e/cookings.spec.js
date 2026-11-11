import { test, expect } from './fixtures.js'

// Jour au format « 2026-11-02 », dans le fuseau local (comme le navigateur)
function dayISO(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const log = (page) => page.getByRole('region', { name: 'Historique' })
const entries = (page) => log(page).getByRole('listitem')
const topButton = (page) => page.getByRole('button', { name: "Je l'ai cuisinée" }).first()
const saveButton = (page) => page.getByRole('button', { name: 'Enregistrer le repas' })
const dateField = (page) => log(page).getByLabel('Date')
const star = (page, n) => page.getByRole('radio', { name: `${n} étoile${n > 1 ? 's' : ''} sur 5` })
const summary = (page) => page.locator('.cooked').first()

async function openRecipe(page, request, token, title = 'Crêpes') {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const recipe = await (await request.post('/api/recipes', { headers, data: { title } })).json()
  await page.goto(`/recettes/${recipe.id}`)
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
  return { recipe, headers }
}

test('une nouvelle recette n’a pas encore été cuisinée', async ({ page, request, token }) => {
  await openRecipe(page, request, token)
  await expect(summary(page)).toHaveText('Pas encore cuisinée')
  await expect(log(page)).toContainText('Pas encore cuisinée.')
})

test('« Je l’ai cuisinée » enregistre le repas du jour', async ({ page, request, token }) => {
  await openRecipe(page, request, token)

  await topButton(page).click()
  await expect(dateField(page)).toBeFocused()
  await expect(dateField(page)).toHaveValue(dayISO())
  await saveButton(page).click()

  await expect(saveButton(page)).toHaveCount(0)
  await expect(entries(page)).toHaveCount(1)
  await expect(entries(page).first()).toContainText("aujourd'hui")
  await expect(summary(page)).toHaveText("Cuisinée une fois, la dernière aujourd'hui")

  // Conservé après rechargement
  await page.reload()
  await expect(entries(page)).toHaveCount(1)
  await expect(summary(page)).toHaveText("Cuisinée une fois, la dernière aujourd'hui")
})

test('enregistre une date passée, une note et un commentaire', async ({ page, request, token }) => {
  const { recipe, headers } = await openRecipe(page, request, token)

  await topButton(page).click()
  await dateField(page).fill(dayISO(-3))
  await star(page, 4).check({ force: true })
  await log(page).getByLabel('Commentaire (facultatif)').fill('Un peu trop salé')
  await saveButton(page).click()

  const entry = entries(page).first()
  await expect(entry).toContainText('il y a 3 jours')
  await expect(entry.getByRole('img', { name: 'Note : 4 sur 5' })).toBeVisible()
  await expect(entry).toContainText('Un peu trop salé')
  await expect(summary(page)).toHaveText('Cuisinée une fois, la dernière il y a 3 jours')

  // Un repas plus récent passe en tête de liste
  await topButton(page).click()
  await saveButton(page).click()
  await expect(entries(page)).toHaveCount(2)
  await expect(entries(page).first()).toContainText("aujourd'hui")
  await expect(summary(page)).toHaveText("Cuisinée 2 fois, la dernière aujourd'hui")

  const saved = await (await request.get(`/api/recipes/${recipe.id}/cookings`, { headers })).json()
  expect(saved.map((c) => [c.cooked_on, c.rating, c.comment])).toEqual([
    [dayISO(), null, null],
    [dayISO(-3), 4, 'Un peu trop salé'],
  ])
})

test('un second clic sur l’étoile choisie retire la note', async ({ page, request, token }) => {
  const { recipe, headers } = await openRecipe(page, request, token)
  await topButton(page).click()

  await log(page).locator('.star').nth(2).click()
  await expect(star(page, 3)).toBeChecked()
  await expect(log(page).locator('.star.on')).toHaveCount(3)
  await log(page).locator('.star').nth(2).click()
  await expect(star(page, 3)).not.toBeChecked()
  await expect(log(page).locator('.star.on')).toHaveCount(0)
  await saveButton(page).click()
  await expect(entries(page)).toHaveCount(1)

  const saved = await (await request.get(`/api/recipes/${recipe.id}/cookings`, { headers })).json()
  expect(saved[0].rating).toBeNull()
})

test('annuler n’enregistre rien', async ({ page, request, token }) => {
  await openRecipe(page, request, token)
  await topButton(page).click()
  await log(page).getByRole('button', { name: 'Annuler' }).click()
  await expect(saveButton(page)).toHaveCount(0)
  await expect(log(page)).toContainText('Pas encore cuisinée.')
})

test('retire un repas après confirmation', async ({ page, request, token }) => {
  const { recipe, headers } = await openRecipe(page, request, token)
  await request.post(`/api/recipes/${recipe.id}/cookings`, {
    headers,
    data: { cooked_on: dayISO(-10) },
  })
  await request.post(`/api/recipes/${recipe.id}/cookings`, { headers, data: {} })
  await page.reload()
  await expect(entries(page)).toHaveCount(2)

  page.once('dialog', (dialog) => dialog.dismiss())
  await entries(page)
    .first()
    .getByRole('button', { name: /Retirer le repas/ })
    .click()
  await expect(entries(page)).toHaveCount(2)

  page.once('dialog', (dialog) => dialog.accept())
  await entries(page)
    .first()
    .getByRole('button', { name: /Retirer le repas/ })
    .click()
  await expect(entries(page)).toHaveCount(1)
  // Le résumé revient au repas précédent
  await expect(summary(page)).toHaveText('Cuisinée une fois, la dernière il y a 10 jours')
})

test('affiche l’erreur de l’API sans perdre la saisie', async ({ page, request, token }) => {
  await openRecipe(page, request, token)
  await topButton(page).click()
  // Caractère d'inversion du sens d'écriture (U+202E), refusé par l'API
  const comment = 'Parfait' + String.fromCharCode(0x202e)
  await log(page).getByLabel('Commentaire (facultatif)').fill(comment)
  await saveButton(page).click()

  await expect(log(page).getByRole('alert')).toContainText('Le commentaire est invalide')
  await expect(log(page).getByLabel('Commentaire (facultatif)')).toHaveValue(comment)
})

test('refuse une date dans le futur', async ({ page, request, token }) => {
  await openRecipe(page, request, token)
  await topButton(page).click()
  await dateField(page).fill(dayISO(5))
  await saveButton(page).click()

  // Bloqué par le navigateur (limite max du champ), sans rien envoyer ;
  // l'API refuse aussi une date future (voir tests/test_cookings.py)
  expect(await dateField(page).evaluate((input) => input.validity.rangeOverflow)).toBe(true)
  await expect(saveButton(page)).toBeVisible()
  await expect(entries(page)).toHaveCount(0)
})

test('la liste indique quand la recette a été faite', async ({ page, request, token }) => {
  const { recipe, headers } = await openRecipe(page, request, token, 'Gratin')
  await request.post(`/api/recipes/${recipe.id}/cookings`, {
    headers,
    data: { cooked_on: dayISO(-1) },
  })
  await page.goto('/')
  await expect(page.locator('.list > li').filter({ hasText: 'Gratin' })).toContainText('Faite hier')
})

test('le formulaire de repas tient sur mobile', async ({ page, request, token }) => {
  await page.setViewportSize({ width: 375, height: 760 })
  await openRecipe(page, request, token)
  await topButton(page).click()
  await star(page, 5).check({ force: true })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
})
