import { test, expect } from './fixtures.js'

const themeSwitch = (page) => page.getByRole('switch', { name: 'Thème sombre' })
const currentTheme = (page) => page.evaluate(() => document.documentElement.dataset.theme)

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
      .toBe('rgb(245, 246, 251)')

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
  await page.goto('/')
  await page
    .getByPlaceholder('Titre de la recette')
    .fill('Un titre de recette assez long pour remplir la ligne')
  await page.getByRole('button', { name: 'Ajouter' }).click()
  await expect(page.locator('.list li')).toHaveCount(1)

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
  const row = await page.locator('.list li').boundingBox()
  expect(row.x + row.width).toBeLessThanOrEqual(375)
})
