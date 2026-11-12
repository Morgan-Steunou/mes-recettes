import { test, expect } from './fixtures.js'

const search = (page) =>
  page.getByRole('searchbox', { name: 'Rechercher une recette par titre ou ingrédient' })
const menu = (page, name) => page.getByRole('combobox', { name })
const titles = (page) => page.locator('.list > li .title')
const subtitle = (page) => page.locator('.subtitle')
const card = (page, title) => page.locator('.list > li').filter({ hasText: title })

// Jour au format « 2026-11-02 », décalé de offsetDays, dans le fuseau local
function dayISO(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Recettes créées dans cet ordre (l'ordre d'ajout)
const RECIPES = [
  {
    title: 'Poulet basquaise',
    prep_time_minutes: 20,
    cook_time_minutes: 40,
    ingredients: [{ name: 'Poulet' }, { name: 'Poivrons' }],
    cookings: [dayISO(-2), dayISO(-40), dayISO(-90)],
  },
  {
    title: 'Salade César',
    prep_time_minutes: 15,
    ingredients: [{ name: 'Blanc de poulet' }, { name: 'Salade romaine' }],
    cookings: [dayISO(-60)],
  },
  {
    title: 'Œufs brouillés',
    prep_time_minutes: 5,
    cook_time_minutes: 5,
    ingredients: [{ name: 'Œufs' }, { name: 'Beurre' }],
    cookings: [dayISO(-10)],
  },
  {
    title: 'Tarte aux pommes',
    ingredients: [{ name: 'Pommes' }, { name: 'Beurre' }],
    cookings: [],
  },
]

async function seed(page, request, token, url = '/') {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  for (const { cookings, ...data } of RECIPES) {
    const res = await request.post('/api/recipes', { headers, data })
    expect(res.ok()).toBeTruthy()
    const recipe = await res.json()
    for (const cooked_on of cookings) {
      const r = await request.post(`/api/recipes/${recipe.id}/cookings`, {
        headers,
        data: { cooked_on },
      })
      expect(r.ok()).toBeTruthy()
    }
  }
  await page.goto(url)
  await expect(subtitle(page)).toBeVisible()
}

test('recherche par ingrédient, avec les ingrédients trouvés sur la carte', async ({
  page,
  request,
  token,
}) => {
  await seed(page, request, token)

  // Les petits mots sont ignorés : « avec du poulet » = « poulet »
  await search(page).fill('avec du poulet')
  await expect(titles(page)).toHaveText(['Poulet basquaise', 'Salade César'])
  // Trouvé par le titre : rien à signaler ; trouvé par un ingrédient : affiché
  await expect(card(page, 'Poulet basquaise').locator('.hits')).toHaveCount(0)
  await expect(card(page, 'Salade César').locator('.hits')).toHaveText('Avec : Blanc de poulet')

  // Pluriel et accents ignorés ; plusieurs mots : titre et ingrédients mélangés
  await search(page).fill('oeuf')
  await expect(titles(page)).toHaveText(['Œufs brouillés'])
  await search(page).fill('beurres tarte')
  await expect(titles(page)).toHaveText(['Tarte aux pommes'])
  await expect(card(page, 'Tarte aux pommes').locator('.hits')).toHaveText('Avec : Beurre')
})

test('filtre par temps total et par dernière fois', async ({ page, request, token }) => {
  await seed(page, request, token)

  await menu(page, 'Temps total').selectOption({ label: '30 min ou moins' })
  await expect(page).toHaveURL(/\?temps=30$/)
  // La tarte, sans temps renseigné, est exclue
  await expect(titles(page)).toHaveText(['Salade César', 'Œufs brouillés'])
  await expect(subtitle(page)).toHaveText('2 recettes sur 4.')

  await menu(page, 'Temps total').selectOption({ label: 'Tous les temps' })
  await menu(page, 'Dernière fois').selectOption({ label: 'Jamais faites' })
  await expect(titles(page)).toHaveText(['Tarte aux pommes'])

  // « Pas faites depuis 1 mois » inclut les recettes jamais faites
  await menu(page, 'Dernière fois').selectOption({ label: 'Pas faites depuis 1 mois' })
  await expect(titles(page)).toHaveText(['Salade César', 'Tarte aux pommes'])

  await menu(page, 'Dernière fois').selectOption({ label: 'Déjà faites' })
  await expect(titles(page)).toHaveText(['Poulet basquaise', 'Salade César', 'Œufs brouillés'])

  // Recherche et filtres se combinent
  await search(page).fill('poulet')
  await menu(page, 'Temps total').selectOption({ label: '30 min ou moins' })
  await expect(titles(page)).toHaveText(['Salade César'])
})

test('trie la liste', async ({ page, request, token }) => {
  await seed(page, request, token)
  const sortBy = (label) => menu(page, 'Trier par').selectOption({ label })

  await expect(titles(page)).toHaveText([
    'Poulet basquaise',
    'Salade César',
    'Œufs brouillés',
    'Tarte aux pommes',
  ])
  await sortBy('Titre (A → Z)')
  await expect(page).toHaveURL(/\?tri=titre$/)
  await expect(titles(page)).toHaveText([
    'Œufs brouillés',
    'Poulet basquaise',
    'Salade César',
    'Tarte aux pommes',
  ])
  // Sans temps : à la fin
  await sortBy('Les plus rapides')
  await expect(titles(page)).toHaveText([
    'Œufs brouillés',
    'Salade César',
    'Poulet basquaise',
    'Tarte aux pommes',
  ])
  await sortBy('Faites récemment')
  await expect(titles(page)).toHaveText([
    'Poulet basquaise',
    'Œufs brouillés',
    'Salade César',
    'Tarte aux pommes',
  ])
  // Jamais faites d'abord
  await sortBy('Pas faites depuis longtemps')
  await expect(titles(page)).toHaveText([
    'Tarte aux pommes',
    'Salade César',
    'Œufs brouillés',
    'Poulet basquaise',
  ])
  await sortBy('Les plus souvent faites')
  await expect(titles(page).first()).toHaveText('Poulet basquaise')
  await sortBy('Ajoutées récemment')
  await expect(titles(page)).toHaveText([
    'Tarte aux pommes',
    'Œufs brouillés',
    'Salade César',
    'Poulet basquaise',
  ])
})

test('critères gardés dans l’URL ; « Tout effacer » garde le tri', async ({
  page,
  request,
  token,
}) => {
  await seed(page, request, token, '/?q=poulet&temps=30&tri=titre')
  await expect(search(page)).toHaveValue('poulet')
  await expect(menu(page, 'Temps total')).toHaveValue('30')
  await expect(titles(page)).toHaveText(['Salade César'])

  await page.reload()
  await expect(titles(page)).toHaveText(['Salade César'])

  await page.getByRole('button', { name: 'Tout effacer' }).click()
  await expect(page).toHaveURL(/\?tri=titre$/)
  await expect(search(page)).toHaveValue('')
  await expect(menu(page, 'Temps total')).toHaveValue('')
  await expect(titles(page)).toHaveCount(4)
  await expect(titles(page).first()).toHaveText('Œufs brouillés')
  await expect(page.getByRole('button', { name: 'Tout effacer' })).toHaveCount(0)

  // Valeur inconnue dans l'URL : ignorée
  await page.goto('/?temps=n-importe-quoi')
  await expect(menu(page, 'Temps total')).toHaveValue('')
  await expect(titles(page)).toHaveCount(4)
})

test('aucun résultat avec des filtres : message et bouton « Tout effacer »', async ({
  page,
  request,
  token,
}) => {
  await seed(page, request, token, '/?temps=15&faite=jamais')
  await expect(page.getByText('Aucune recette ne correspond à ces critères.')).toBeVisible()
  await page.locator('.no-results').getByRole('button', { name: 'Tout effacer' }).click()
  await expect(titles(page)).toHaveCount(4)
  await expect(page).toHaveURL(/\/$/)
})
