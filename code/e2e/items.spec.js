import { test, expect } from './fixtures.js'

// Raccourcis vers les éléments de la page d'accueil
const newItemInput = (page) => page.getByPlaceholder("Nom de l'item")
const addButton = (page) => page.getByRole('button', { name: 'Ajouter' })
const itemRow = (page, name) => page.locator('.list li').filter({ hasText: name })

async function addItem(page, name) {
  await newItemInput(page).fill(name)
  await addButton(page).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('affiche un message quand la liste est vide', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible()
  await expect(page.getByText('Aucun item pour le moment.')).toBeVisible()
})

test('ajoute un item', async ({ page }) => {
  await addItem(page, 'Premier item')

  await expect(itemRow(page, 'Premier item')).toBeVisible()
  await expect(newItemInput(page)).toHaveValue('')
})

test('conserve les items après rechargement de la page', async ({ page }) => {
  await addItem(page, 'Item persistant')
  await expect(itemRow(page, 'Item persistant')).toBeVisible()

  await page.reload()
  await expect(itemRow(page, 'Item persistant')).toBeVisible()
})

test('modifie un item', async ({ page }) => {
  await addItem(page, 'Avant')
  await itemRow(page, 'Avant').getByRole('button', { name: 'Modifier' }).click()

  const editInput = page.getByLabel('Nouveau nom')
  await expect(editInput).toBeFocused()
  await editInput.fill('Après')
  await editInput.press('Enter')

  await expect(itemRow(page, 'Après')).toBeVisible()
  await expect(itemRow(page, 'Avant')).toHaveCount(0)
  await page.reload()
  await expect(itemRow(page, 'Après')).toBeVisible()
})

test('annule une modification avec Échap', async ({ page }) => {
  await addItem(page, 'Inchangé')
  await itemRow(page, 'Inchangé').getByRole('button', { name: 'Modifier' }).click()
  await page.getByLabel('Nouveau nom').fill('Autre nom')
  await page.getByLabel('Nouveau nom').press('Escape')

  await expect(page.getByLabel('Nouveau nom')).toHaveCount(0)
  await expect(itemRow(page, 'Inchangé')).toBeVisible()
})

test('supprime un item', async ({ page }) => {
  await addItem(page, 'À supprimer')
  await itemRow(page, 'À supprimer').getByRole('button', { name: 'Supprimer' }).click()

  await expect(itemRow(page, 'À supprimer')).toHaveCount(0)
  await expect(page.getByText('Aucun item pour le moment.')).toBeVisible()
})

test('affiche une erreur si le nom est refusé par l’API, sans perdre la saisie', async ({
  page,
}) => {
  // Caractère d'inversion du sens d'écriture (U+202E), refusé par l'API
  const invalidName = 'facture\u202eFDP.exe'
  await addItem(page, invalidName)

  await expect(page.getByRole('alert')).toContainText('caractères de direction interdits')
  await expect(newItemInput(page)).toHaveValue(invalidName)

  await page.getByRole('button', { name: 'Fermer le message' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('affiche une erreur si le serveur ne répond pas', async ({ page }) => {
  // Simule une panne de l'API pour la création d'item
  await page.route('**/api/items', (route) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 500 }) : route.continue(),
  )
  await addItem(page, 'Pendant la panne')

  await expect(page.getByRole('alert')).toContainText('Erreur du serveur')
  await expect(newItemInput(page)).toHaveValue('Pendant la panne')
})

test('affiche le HTML saisi comme du texte (pas de XSS)', async ({ page }) => {
  const payload = '<img src=x onerror="window.xss=1">'
  await addItem(page, payload)

  await expect(itemRow(page, payload)).toBeVisible()
  await expect(page.locator('.list img')).toHaveCount(0)
  expect(await page.evaluate(() => window.xss)).toBeUndefined()
})
