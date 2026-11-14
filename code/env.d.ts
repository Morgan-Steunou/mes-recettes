/// <reference types="vite/client" />

// Variables d'environnement lues par l'interface (préfixe VITE_, fichier .env à la racine)
interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
