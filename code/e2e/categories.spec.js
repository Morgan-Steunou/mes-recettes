import { test, expect } from './fixtures.js'

const tab = (page, name) => page.getByRole('radio', { name: new RegExp(`^${name} \\d+$`) })
const titles = (page) => page.locator('.list > li .title')
const subtitle = (page) => page.locator('.subtitle')
const categoryRows = (page) =>
  page.getByRole('list', { name: 'Mes catégories' }).getByRole('listitem')

function headersFor(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Crée des catégories et des recettes par l'API : { Desserts: ['Tarte', 'Mousse'], '': ['Omelette'] }
// (clé vide : recettes sans catégorie). Renvoie les ids des catégories par nom.
async function seed(request, token, plan) {
  const headers = headersFor(token)
  const ids = {}
  for (const [name, recipes] of Object.entries(plan)) {
    if (name) {
      const res = await request.post('/api/categories', { headers, data: { name } })
      expect(res.ok()).toBeTruthy()
      ids[name] = (await res.json()).id
    }
    for (const title of recipes) {
      const data = { title, category_id: name ? ids[name] : null }
      expect((await request.post('/api/recipes', { headers, data })).ok()).toBeTruthy()
    }
  }
  return ids
}

test('créer, renommer et refuser un doublon depuis la page Catégories', async ({
  page,
  request,
  token,
}) => {
  await seed(request, token, { '': ['Omelette'] })
  await page.goto('/')
  // Sans catégorie : pas d'onglets, un lien vers la page de gestion
  await expect(page.getByRole('radiogroup', { name: 'Catégorie' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Classer mes recettes en catégories' }).click()
  await expect(page).toHaveURL(/\/categories$/)
  await expect(page.getByText('Aucune catégorie pour le moment.', { exact: false })).toBeVisible()

  const input = page.getByRole('textbox', { name: 'Nom de la nouvelle catégorie' })
  await input.fill('Plats')
  await input.press('Enter')
  await expect(categoryRows(page).locator('.name')).toHaveText(['Plats'])
  await expect(input).toHaveValue('')
  await input.fill('Desert')
  await page.getByRole('button', { name: 'Ajouter' }).click()
  await expect(categoryRows(page).locator('.name')).toHaveText(['Desert', 'Plats'])
  await expect(input).toBeFocused()

  // Même nom, autres majuscules : refusé
  await input.fill('PLATS')
  await input.press('Enter')
  await expect(page.getByRole('alert')).toHaveText('Une catégorie porte déjà ce nom')

  await page.getByRole('button', { name: 'Renommer Desert' }).click()
  const rename = page.getByRole('textbox', { name: 'Nouveau nom de la catégorie Desert' })
  await rename.fill('Desserts')
  await rename.press('Enter')
  await expect(categoryRows(page).locator('.name')).toHaveText(['Desserts', 'Plats'])
  await expect(categoryRows(page).first()).toContainText('0 recette')
})

test('choisir ou créer la catégorie dans le formulaire ; la fiche l’affiche', async ({
  page,
  request,
  token,
}) => {
  await seed(request, token, { Plats: [] })
  await page.goto('/recettes/nouvelle')
  await page.getByRole('textbox', { name: 'Titre', exact: true }).fill('Tarte aux pommes')
  const select = page.getByRole('combobox', { name: 'Catégorie' })
  await expect(select.locator('option')).toHaveText(['Sans catégorie', 'Plats'])

  // Nouvelle catégorie créée sans quitter le formulaire, puis choisie
  await page.getByRole('button', { name: 'Nouvelle catégorie' }).click()
  const name = page.getByRole('textbox', { name: 'Nom de la nouvelle catégorie' })
  await expect(name).toBeFocused()
  await name.fill('Desserts')
  await name.press('Enter')
  await expect(select.locator('option:checked')).toHaveText('Desserts')
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  // Fiche : la catégorie, qui mène à son onglet
  await expect(page).toHaveURL(/\/recettes\/\d+$/)
  await page.getByRole('link', { name: 'Desserts', exact: true }).click()
  await expect(page).toHaveURL(/\/\?categorie=\d+$/)
  await expect(tab(page, 'Desserts')).toHaveAttribute('aria-checked', 'true')
  await expect(titles(page)).toHaveText(['Tarte aux pommes'])

  // Modification : retirer la catégorie
  await titles(page).first().click()
  await page.getByRole('link', { name: 'Modifier' }).click()
  await expect(select.locator('option:checked')).toHaveText('Desserts')
  await select.selectOption({ label: 'Sans catégorie' })
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page).toHaveURL(/\/recettes\/\d+$/)
  await expect(page.locator('.eyebrow')).toHaveText('Recette')
})

test('onglets de catégorie sur l’accueil, avec recherche et compteurs', async ({
  page,
  request,
  token,
}) => {
  await seed(request, token, {
    Desserts: ['Tarte aux pommes', 'Mousse au chocolat'],
    Plats: ['Poulet rôti'],
    Entrées: [],
    '': ['Omelette'],
  })
  await page.goto('/')
  await expect(page.getByRole('radio')).toHaveText([
    'Toutes 4',
    'Desserts 2',
    'Entrées 0',
    'Plats 1',
    'Sans catégorie 1',
  ])
  await expect(tab(page, 'Toutes')).toHaveAttribute('aria-checked', 'true')
  // Sur « Toutes », la catégorie est indiquée sur chaque carte
  await expect(page.locator('.list > li').filter({ hasText: 'Poulet rôti' })).toContainText('Plats')

  await tab(page, 'Desserts').click()
  await expect(page).toHaveURL(/\?categorie=\d+$/)
  await expect(titles(page)).toHaveText(['Tarte aux pommes', 'Mousse au chocolat'])
  await expect(subtitle(page)).toHaveText('2 recettes sur 4.')

  // La recherche se combine avec l'onglet ; les compteurs suivent la recherche
  await page.getByRole('searchbox').fill('tarte')
  await expect(titles(page)).toHaveText(['Tarte aux pommes'])
  await expect(tab(page, 'Desserts')).toHaveText('Desserts 1')
  await expect(tab(page, 'Plats')).toHaveText('Plats 0')
  // « Tout effacer » garde l'onglet
  await page.getByRole('button', { name: 'Tout effacer' }).click()
  await expect(tab(page, 'Desserts')).toHaveAttribute('aria-checked', 'true')
  await expect(titles(page)).toHaveCount(2)

  await tab(page, 'Sans catégorie').click()
  await expect(titles(page)).toHaveText(['Omelette'])

  // Flèches du clavier entre les onglets
  await tab(page, 'Sans catégorie').press('ArrowRight')
  await expect(tab(page, 'Toutes')).toHaveAttribute('aria-checked', 'true')
  await expect(tab(page, 'Toutes')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(tab(page, 'Sans catégorie')).toBeFocused()

  // Onglet vide : message, et « Nouvelle recette » crée la recette dans la catégorie
  await tab(page, 'Entrées').click()
  await expect(page.getByText('Aucune recette dans « Entrées » pour le moment.')).toBeVisible()
  await page.getByRole('link', { name: 'Nouvelle recette' }).click()
  await expect(
    page.getByRole('combobox', { name: 'Catégorie' }).locator('option:checked'),
  ).toHaveText('Entrées')
})

test('supprimer une catégorie garde ses recettes', async ({ page, request, token }) => {
  const ids = await seed(request, token, { Desserts: ['Tarte aux pommes'], Plats: ['Poulet'] })

  // Lien périmé vers une catégorie supprimée : retour à « Toutes »
  await page.goto('/categories')
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Supprimer la catégorie « Desserts » ?')
    expect(dialog.message()).toContain('Sa recette ne sera pas supprimée')
    await dialog.accept()
  })
  await page.getByRole('button', { name: 'Supprimer Desserts' }).click()
  await expect(categoryRows(page).locator('.name')).toHaveText(['Plats'])

  await page.goto(`/?categorie=${ids.Desserts}`)
  await expect(tab(page, 'Toutes')).toHaveAttribute('aria-checked', 'true')
  await expect(titles(page)).toHaveCount(2)
  await expect(page.getByRole('radio')).toHaveText(['Toutes 2', 'Plats 1', 'Sans catégorie 1'])
})
