import type { Page } from '@playwright/test'
import { test, expect, backToList } from './fixtures'

const themeSwitch = (page: Page) => page.getByRole('switch', { name: 'Thème sombre' })
const currentTheme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme)

test.describe('système en thème sombre', () => {
  test.use({ colorScheme: 'dark' })

  test('suit le thème du système par défaut', async ({ page }) => {
    await page.goto('/')
    expect(await currentTheme(page)).toBe('dark')
    await expect(themeSwitch(page)).toHaveAttribute('aria-checked', 'true')
  })

  test('bascule en thème clair et garde ce choix après rechargement', async ({ page }) => {
    await page.goto('/')
    await themeSwitch(page).click()

    expect(await currentTheme(page)).toBe('light')
    await expect(themeSwitch(page)).toHaveAttribute('aria-checked', 'false')
    // Attend la fin de la transition de couleur (200 ms)
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe('rgb(232, 235, 228)')

    await page.reload()
    expect(await currentTheme(page)).toBe('light')
  })
})

test.describe('système en thème clair', () => {
  test.use({ colorScheme: 'light' })

  test('suit le thème du système, et le switch fonctionne au clavier', async ({ page }) => {
    await page.goto('/')
    expect(await currentTheme(page)).toBe('light')

    await themeSwitch(page).focus()
    await page.keyboard.press('Enter')
    expect(await currentTheme(page)).toBe('dark')
  })
})

test('aucun débordement horizontal sur mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 })
  const noOverflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

  // Formulaire
  await page.goto('/recettes/nouvelle')
  await page
    .getByRole('textbox', { name: 'Titre', exact: true })
    .fill('Un titre de recette assez long pour remplir largement la ligne')
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('Une description longue '.repeat(8))
  await page.getByRole('spinbutton', { name: 'Portions', exact: true }).fill('4')
  expect(await noOverflow()).toBe(0)
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  // Fiche de la recette, puis liste
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Un titre de recette')
  expect(await noOverflow()).toBe(0)
  await backToList(page)
  await expect(page.locator('.list > li')).toHaveCount(1)
  expect(await noOverflow()).toBe(0)
  const row = await page.locator('.list > li').boundingBox()
  if (!row) throw new Error('recette non affichée')
  expect(row.x + row.width).toBeLessThanOrEqual(375)
})
