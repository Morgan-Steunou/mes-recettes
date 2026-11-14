import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

// Fichier en TypeScript : lu par ESLint grâce au paquet jiti
export default defineConfigWithVueTs(
  // Le code Vue est dans src/ ; le code Python et les templates sont ignorés
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.venv/**',
      'app/**',
      'tests/**',
      'htmlcov/**',
      'templates/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
    ],
  },
  // Règles JavaScript de base (variables inutilisées ou non définies, etc.)
  js.configs.recommended,
  // Règles Vue, puis TypeScript (y compris dans les blocs <script lang="ts"> des .vue)
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  // Motifs en « **/ » : valables que l'on lance ESLint depuis code/ ou depuis la racine (hook pre-commit)
  // Code exécuté dans le navigateur
  {
    files: ['**/src/**', '**/e2e/**', '**/public/**'],
    languageOptions: { globals: globals.browser },
  },
  // Fichiers de configuration et tests E2E exécutés par Node
  { files: ['**/*.config.ts', '**/e2e/**'], languageOptions: { globals: globals.node } },
  // En dernier : désactive les règles de mise en forme d'ESLint, laissées à Prettier
  skipFormatting,
)
