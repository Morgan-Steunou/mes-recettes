// Préparation des tests E2E, lancée après le démarrage des serveurs (migrations déjà appliquées) :
// crée les comptes de test dans la base mes_recettes_test, s'ils n'existent pas déjà.
import { spawnSync } from 'node:child_process'
import { TEST_USER } from './fixtures.js'

const python = process.platform === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python'

export default function globalSetup() {
  for (const user of [TEST_USER.main, TEST_USER.other]) {
    const result = spawnSync(
      python,
      ['-m', 'app.cli', 'create-user', user.username, '--password-stdin', '--if-not-exists'],
      {
        input: `${user.password}\n`,
        encoding: 'utf-8',
        env: {
          ...process.env,
          POSTGRES_DB: 'mes_recettes_test',
          POSTGRES_HOST: 'localhost',
          PYTHONIOENCODING: 'utf-8',
        },
      },
    )
    if (result.status !== 0) {
      throw new Error(
        `Création du compte de test « ${user.username} » impossible :\n${result.stdout}${result.stderr}`,
      )
    }
  }
}
