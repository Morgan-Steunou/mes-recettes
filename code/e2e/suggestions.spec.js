import { test, expect } from './fixtures.js'

const field = (page) => page.getByRole('combobox', { name: 'Mes ingrédients' })
const chips = (page) =>
  page.getByRole('list', { name: 'Ingrédients disponibles' }).getByRole('listitem')
const group = (page, name) => page.getByRole('region', { name })
const resultTitles = (page) => page.locator('.result .title')
const result = (page, title) => page.locator('.result').filter({ hasText: title })
const staplesBox = (page) => page.getByRole('checkbox', { name: /toujours disponibles/ })

const RECIPES = [
  {
    title: 'Omelette',
    ingredients: [{ name: 'Œufs' }, { name: 'Sel' }, { name: 'Poivre' }],
  },
  {
    title: 'Poulet basquaise',
    ingredients: [
      { name: 'Poulet' },
      { name: 'Tomates' },
      { name: 'Poivrons' },
      { name: "Huile d'olive" },
    ],
  },
  {
    title: 'Riz cantonais',
    ingredients: [{ name: 'Riz' }, { name: 'Œufs' }, { name: 'Petits pois' }, { name: 'Jambon' }],
  },
  { title: 'Tarte aux pommes', ingredients: [{ name: 'Pommes' }, { name: 'Pâte brisée' }] },
  { title: 'Recette sans ingrédients' },
]

async function seed(page, request, token, url = '/que-cuisiner') {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  for (const data of RECIPES) {
    expect((await request.post('/api/recipes', { headers, data })).ok()).toBeTruthy()
  }
  await page.goto(url)
  await expect(page.getByRole('heading', { name: "Avec ce que j'ai", level: 1 })).toBeVisible()
}

test('le lien « Que cuisiner ? » de l’en-tête ouvre la page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('navigation').getByRole('link', { name: 'Que cuisiner ?' }).click()
  await expect(page).toHaveURL(/\/que-cuisiner$/)
  // Carnet vide : invitation à créer une recette
  await expect(page.getByText('Aucune recette pour le moment.')).toBeVisible()
})

test('classe les recettes selon les ingrédients disponibles', async ({ page, request, token }) => {
  await seed(page, request, token)
  await expect(
    page.getByText("1 recette sans ingrédients n'est pas prise en compte."),
  ).toBeVisible()

  // Entrée ajoute un ingrédient ; accents et pluriels ignorés
  await field(page).fill('oeuf')
  await field(page).press('Enter')
  await expect(chips(page)).toHaveText(['oeuf'])
  await expect(page).toHaveURL(/\?avec=oeuf$/)

  // Sel et poivre sont des ingrédients de base : l'omelette est prête
  await expect(group(page, /Prêtes à cuisiner/).locator('.title')).toHaveText(['Omelette'])
  await expect(result(page, 'Omelette')).toContainText('1/1')
  await expect(result(page, 'Omelette')).toContainText('Ingrédients de base : Sel, Poivre')
  await expect(group(page, /Il manque/).locator('.title')).toHaveText(['Riz cantonais'])
  await expect(result(page, 'Riz cantonais')).toContainText('Il manque : Riz, Petits pois, Jambon')

  // Plusieurs ingrédients d'un coup, séparés par des virgules
  await field(page).fill('riz, jambon, tomate')
  await page.getByRole('button', { name: 'Ajouter' }).click()
  await expect(chips(page)).toHaveText(['oeuf', 'riz', 'jambon', 'tomate'])
  // Le moins d'ingrédients manquants d'abord
  await expect(resultTitles(page)).toHaveText(['Omelette', 'Riz cantonais', 'Poulet basquaise'])
  await expect(result(page, 'Riz cantonais')).toContainText('Il manque : Petits pois')
  await expect(result(page, 'Riz cantonais')).toContainText('3/4')
  await expect(result(page, 'Poulet basquaise')).toContainText('Vous avez : Tomates')

  // Sans les ingrédients de base, l'omelette n'est plus complète
  await staplesBox(page).uncheck()
  await expect(page).toHaveURL(/basiques=non/)
  await expect(result(page, 'Omelette')).toContainText('Il manque : Sel, Poivre')
  await expect(group(page, /Prêtes à cuisiner/)).toHaveCount(0)
})

test('retirer des ingrédients, doublons ignorés', async ({ page, request, token }) => {
  await seed(page, request, token, '/que-cuisiner?avec=Pommes,riz')
  await expect(chips(page)).toHaveText(['Pommes', 'riz'])
  // La tarte (il manque 1 ingrédient) avant le riz cantonais (il en manque 3)
  await expect(resultTitles(page)).toHaveText(['Tarte aux pommes', 'Riz cantonais'])

  // « pomme » est déjà là (sous la forme « Pommes ») : pas de doublon
  await field(page).fill('pomme')
  await field(page).press('Enter')
  await expect(chips(page)).toHaveCount(2)

  await page.getByRole('button', { name: 'Retirer riz' }).click()
  await expect(chips(page)).toHaveText(['Pommes'])
  await expect(resultTitles(page)).toHaveText(['Tarte aux pommes'])

  // Retour arrière dans le champ vide : retire le dernier
  await field(page).press('Backspace')
  await expect(chips(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\/que-cuisiner$/)
  await expect(page.getByText(/Ajoutez un ou plusieurs ingrédients/)).toBeVisible()
})

test('aucune recette avec ces ingrédients ; la page est gardée au retour d’une fiche', async ({
  page,
  request,
  token,
}) => {
  await seed(page, request, token, '/que-cuisiner?avec=lasagnes')
  await expect(page.getByText("Aucune recette n'utilise ces ingrédients.")).toBeVisible()

  await page.getByRole('button', { name: 'Tout retirer' }).click()
  await field(page).fill('poulet')
  await field(page).press('Enter')
  await result(page, 'Poulet basquaise').getByRole('link').click()
  await expect(page).toHaveURL(/\/recettes\/\d+$/)
  await page.goBack()
  await expect(chips(page)).toHaveText(['poulet'])
  await expect(resultTitles(page)).toHaveText(['Poulet basquaise'])
})
