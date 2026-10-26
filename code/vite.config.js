import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Le fichier .env est à la racine du projet, commun avec l'API
  envDir: '..',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    host: true,
    watch: {
      // Le code Python ne concerne pas Vite
      ignored: ['**/.venv/**', '**/app/**', '**/tests/**'],
      // Dans Docker sous Windows, les modifications des fichiers montés ne sont pas
      // signalées au conteneur : on les détecte par sondage (activé par docker-compose)
      usePolling: process.env.VITE_USE_POLLING === 'true',
      interval: 300,
    },
    // Les appels /api sont redirigés vers l'API FastAPI en développement
    proxy: {
      '/api': process.env.VITE_PROXY_TARGET || 'http://localhost:8000',
    },
  },
  // Construction (npm run build) : tout le code regroupé dans un seul fichier JS et un seul
  // fichier CSS dans dist/assets/ (pas de fichier séparé par page, même pour les routes
  // chargées en différé). Les noms contiennent une empreinte pour éviter les problèmes de cache.
  build: {
    cssCodeSplit: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
})
