import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default [
  // Le code Vue est dans src/ ; le code Python et les templates sont ignorés
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.venv/**',
      'app/**',
      'tests/**',
      'templates/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
    ],
  },
  // Règles JavaScript de base (variables inutilisées ou non définies, etc.)
  js.configs.recommended,
  // Règles Vue
  ...pluginVue.configs['flat/recommended'],
  // Motifs en « **/ » : valables que l'on lance ESLint depuis code/ ou depuis la racine (hook pre-commit)
  // Code exécuté dans le navigateur
  { files: ['**/src/**', '**/e2e/**'], languageOptions: { globals: globals.browser } },
  // Fichiers de configuration et tests E2E exécutés par Node
  { files: ['**/*.config.js', '**/e2e/**'], languageOptions: { globals: globals.node } },
  // En dernier : désactive les règles de mise en forme d'ESLint, laissées à Prettier
  skipFormatting,
]
