import { test, expect } from './fixtures.js'

// Jour au format « 2026-11-02 », décalé de offsetDays, dans le fuseau local
function dayISO(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const meals = (page) => page.locator('.meals > li')
const period = (page, name) => page.getByRole('radio', { name })

// Crée des recettes et leurs repas par l'API : { 'Crêpes': [{ cooked_on, rating, comment }] }
async function seed(request, token, plan) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const ids = {}
  for (const [title, cookings] of Object.entries(plan)) {
    const recipe = await (await request.post('/api/recipes', { headers, data: { title } })).json()
    ids[title] = recipe.id
    for (const cooking of cookings) {
      const res = await request.post(`/api/recipes/${recipe.id}/cookings`, {
        headers,
        data: cooking,
      })
      expect(res.ok()).toBeTruthy()
    }
  }
  return ids
}

test('historique vide : invite à cuisiner une recette', async ({ page }) => {
  await page.goto('/historique')
  await expect(page.getByRole('heading', { name: 'Historique', level: 1 })).toBeVisible()
  await expect(page.getByText('Aucun repas enregistré pour le moment.')).toBeVisible()
  await page.locator('.empty').getByRole('link', { name: 'Mes recettes' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('le lien Historique de l’en-tête ouvre la page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Historique' }).click()
  await expect(page).toHaveURL(/\/historique$/)
  await expect(page.getByRole('heading', { name: 'Historique', level: 1 })).toBeVisible()
})

test('liste tous les repas, du plus récent au plus ancien', async ({ page, request, token }) => {
  await seed(request, token, {
    Crêpes: [
      { cooked_on: dayISO(-1), rating: 5, comment: 'Les enfants ont adoré' },
      { cooked_on: dayISO(-20) },
    ],
    Risotto: [{ cooked_on: dayISO(-3), rating: 3 }],
  })
  await page.goto('/historique')

  await expect(page.getByText('3 repas, 2 recettes différentes.')).toBeVisible()
  await expect(meals(page)).toHaveCount(3)
  await expect(meals(page).nth(0)).toContainText('Crêpes')
  await expect(meals(page).nth(0)).toContainText('hier')
  await expect(meals(page).nth(0)).toContainText('Les enfants ont adoré')
  await expect(meals(page).nth(0).getByRole('img', { name: 'Note : 5 sur 5' })).toBeVisible()
  await expect(meals(page).nth(1)).toContainText('Risotto')
  await expect(meals(page).nth(1)).toContainText('il y a 3 jours')
  await expect(meals(page).nth(2)).toContainText('Crêpes')
  // Regroupés par mois (au moins un titre de mois)
  await expect(page.locator('.month').first()).toBeVisible()
})

test('filtre par période et garde le choix dans l’adresse', async ({ page, request, token }) => {
  await seed(request, token, {
    Récent: [{ cooked_on: dayISO(-5) }],
    'Il y a deux mois': [{ cooked_on: dayISO(-60) }],
    Ancien: [{ cooked_on: dayISO(-400) }],
  })
  await page.goto('/historique')
  await expect(period(page, 'Tout')).toHaveAttribute('aria-checked', 'true')
  await expect(meals(page)).toHaveCount(3)

  await period(page, '30 derniers jours').click()
  await expect(page).toHaveURL(/periode=30j/)
  await expect(meals(page)).toHaveCount(1)
  await expect(meals(page).first()).toContainText('Récent')
  await expect(page.getByText('1 repas, 1 recette différente.')).toBeVisible()

  // Conservé au rechargement
  await page.reload()
  await expect(period(page, '30 derniers jours')).toHaveAttribute('aria-checked', 'true')
  await expect(meals(page)).toHaveCount(1)

  await period(page, '3 derniers mois').click()
  await expect(meals(page)).toHaveCount(2)

  await period(page, 'Tout').click()
  await expect(page).toHaveURL(/\/historique$/)
  await expect(meals(page)).toHaveCount(3)
})

test('période sans repas : propose de tout voir', async ({ page, request, token }) => {
  await seed(request, token, { Ancien: [{ cooked_on: dayISO(-400) }] })
  await page.goto('/historique?periode=30j')
  await expect(page.getByText('Aucun repas sur cette période.')).toBeVisible()
  await page.getByRole('button', { name: "Voir tout l'historique" }).click()
  await expect(meals(page)).toHaveCount(1)
})

test('« Refaire » ouvre la fiche de la recette', async ({ page, request, token }) => {
  await seed(request, token, { 'Tarte aux pommes': [{ cooked_on: dayISO(-2) }] })
  await page.goto('/historique')
  await page.getByRole('link', { name: 'Refaire : Tarte aux pommes' }).click()
  await expect(page).toHaveURL(/\/recettes\/\d+$/)
  await expect(page.getByRole('heading', { name: 'Tarte aux pommes', level: 1 })).toBeVisible()
  await expect(page.getByText('Cuisinée une fois, la dernière il y a 2 jours')).toBeVisible()
})

test('un repas ajouté depuis la fiche apparaît dans l’historique', async ({
  page,
  request,
  token,
}) => {
  const ids = await seed(request, token, { Gratin: [] })
  await page.goto(`/recettes/${ids.Gratin}`)
  await page.getByRole('button', { name: "Je l'ai cuisinée" }).first().click()
  await page.getByRole('button', { name: 'Enregistrer le repas' }).click()
  await expect(page.getByText("Cuisinée une fois, la dernière aujourd'hui")).toBeVisible()

  await page.getByRole('link', { name: 'Historique' }).click()
  await expect(meals(page)).toHaveCount(1)
  await expect(meals(page).first()).toContainText('Gratin')
  await expect(meals(page).first()).toContainText("aujourd'hui")
})

test('charge les repas plus anciens par paquets de 50', async ({ page, request, token }) => {
  const cookings = Array.from({ length: 53 }, (_, i) => ({ cooked_on: dayISO(-i) }))
  await seed(request, token, { Soupe: cookings })
  await page.goto('/historique')

  await expect(meals(page)).toHaveCount(50)
  await page.getByRole('button', { name: 'Voir les repas plus anciens (3)' }).click()
  await expect(meals(page)).toHaveCount(53)
  await expect(page.getByRole('button', { name: /Voir les repas plus anciens/ })).toHaveCount(0)
})

test('affiche le HTML saisi comme du texte (pas de XSS)', async ({ page, request, token }) => {
  const payload = '<img src=x onerror="window.xss=1">'
  await seed(request, token, { [payload]: [{ cooked_on: dayISO(), comment: payload }] })
  await page.goto('/historique')
  await expect(page.getByText(payload)).toHaveCount(2)
  await expect(page.locator('.timeline img')).toHaveCount(0)
  expect(await page.evaluate(() => window.xss)).toBeUndefined()
})

test('aucun débordement horizontal sur mobile', async ({ page, request, token }) => {
  await page.setViewportSize({ width: 375, height: 760 })
  await seed(request, token, {
    'Un titre de recette particulièrement long pour un petit écran': [
      { cooked_on: dayISO(-1), rating: 4, comment: 'Un commentaire assez long '.repeat(6) },
    ],
  })
  await page.goto('/historique')
  await expect(meals(page)).toHaveCount(1)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
})
