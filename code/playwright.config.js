// Tests de bout en bout (E2E) : npx playwright test
// Playwright démarre sa propre API et sa propre interface, sur des ports dédiés,
// branchées sur la base PostgreSQL de test (POSTGRES_DB=mes_recettes_test) : les données
// de développement ne sont jamais touchées, et Docker / le serveur de dev peuvent tourner en parallèle.
import { defineConfig, devices } from '@playwright/test'

const API_PORT = 8010
const WEB_PORT = 5180
const python = process.platform === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python'

export default defineConfig({
  testDir: './e2e',
  // Crée les comptes de test (après le démarrage des serveurs)
  globalSetup: './e2e/global-setup.js',
  // Les tests partagent une même base : on les exécute l'un après l'autre
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --port ${API_PORT}`,
      url: `http://localhost:${API_PORT}/api/health`,
      // Ces variables priment sur celles du .env
      env: { POSTGRES_DB: 'mes_recettes_test', POSTGRES_HOST: 'localhost', POSTGRES_PORT: '5432' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_PROXY_TARGET: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
