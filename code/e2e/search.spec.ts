import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect, authHeaders } from './fixtures'

const search = (page: Page) =>
  page.getByRole('searchbox', { name: 'Rechercher une recette par titre ou ingrédient' })
const titles = (page: Page) => page.locator('.list > li .title')
const subtitle = (page: Page) => page.locator('.subtitle')

const RECIPES = ['Tarte aux pommes', 'Crème brûlée', 'Œufs cocotte', 'Tarte au citron']

// Crée les recettes par l'API, puis ouvre l'accueil (avec une éventuelle URL de départ)
async function seed(page: Page, request: APIRequestContext, token: string | null, url = '/') {
  const headers = authHeaders(token)
  for (const title of RECIPES) {
    expect((await request.post('/api/recipes', { headers, data: { title } })).ok()).toBeTruthy()
  }
  await page.goto(url)
  // Barre de recherche affichée une fois la liste chargée (le sous-titre l'est dès le départ)
  await expect(search(page)).toBeVisible()
}

test('pas de barre de recherche sur une liste vide', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Aucune recette pour le moment.')).toBeVisible()
  await expect(search(page)).toHaveCount(0)
})

test('filtre la liste par titre, sans tenir compte des accents ni des majuscules', async ({
  page,
  request,
  token,
}) => {
  await seed(page, request, token)
  await expect(titles(page)).toHaveCount(4)

  await search(page).fill('TARTE')
  await expect(titles(page)).toHaveText(['Tarte aux pommes', 'Tarte au citron'])
  await expect(subtitle(page)).toHaveText('2 recettes sur 4.')
  await expect(page).toHaveURL(/\?q=TARTE$/)

  // Accents et ligatures ignorés
  await search(page).fill('creme brulee')
  await expect(titles(page)).toHaveText(['Crème brûlée'])
  await expect(subtitle(page)).toHaveText('1 recette sur 4.')
  await search(page).fill('oeufs')
  await expect(titles(page)).toHaveText(['Œufs cocotte'])

  // Plusieurs mots, dans n'importe quel ordre, même partiels
  await search(page).fill('pom tar')
  await expect(titles(page)).toHaveText(['Tarte aux pommes'])
})

test('aucun résultat : message et bouton pour effacer la recherche', async ({
  page,
  request,
  token,
}) => {
  await seed(page, request, token)
  await search(page).fill('lasagnes')
  await expect(page.getByText('Aucune recette ne correspond à « lasagnes ».')).toBeVisible()
  await expect(titles(page)).toHaveCount(0)

  await page.locator('.no-results').getByRole('button', { name: 'Effacer la recherche' }).click()
  await expect(search(page)).toHaveValue('')
  await expect(search(page)).toBeFocused()
  await expect(titles(page)).toHaveCount(4)
  await expect(page).toHaveURL(/\/$/)
})

test('la recherche est gardée dans l’URL, au rechargement et au retour d’une fiche', async ({
  page,
  request,
  token,
}) => {
  await seed(page, request, token, '/?q=citron')
  await expect(search(page)).toHaveValue('citron')
  await expect(titles(page)).toHaveText(['Tarte au citron'])

  await titles(page).first().click()
  await expect(page).toHaveURL(/\/recettes\/\d+$/)
  await page.goBack()
  await expect(search(page)).toHaveValue('citron')
  await expect(titles(page)).toHaveText(['Tarte au citron'])

  // Le lien « Accueil » de l'en-tête repart de la liste complète
  await page.getByRole('navigation').getByRole('link', { name: 'Accueil' }).click()
  await expect(search(page)).toHaveValue('')
  await expect(titles(page)).toHaveCount(4)
})

test('raccourcis clavier : « / » pour chercher, Échap pour effacer', async ({
  page,
  request,
  token,
}) => {
  await seed(page, request, token)
  await page.keyboard.press('/')
  await expect(search(page)).toBeFocused()
  await page.keyboard.type('pommes')
  await expect(titles(page)).toHaveText(['Tarte aux pommes'])

  await page.keyboard.press('Escape')
  await expect(search(page)).toHaveValue('')
  await expect(titles(page)).toHaveCount(4)

  // Le bouton croix efface aussi
  await search(page).fill('citron')
  await page.locator('.search').getByRole('button', { name: 'Effacer la recherche' }).click()
  await expect(search(page)).toHaveValue('')
})
