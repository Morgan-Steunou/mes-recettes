// Applique le thème avant l'affichage (évite un flash de la mauvaise couleur) :
// choix enregistré, sinon préférence du système. Voir src/composables/useTheme.ts
// Fichier séparé (et non script dans index.html) : la Content-Security-Policy de production
// n'autorise que les scripts servis par l'application.
try {
  var saved = localStorage.getItem('mes-recettes.theme')
  var theme =
    saved === 'light' || saved === 'dark'
      ? saved
      : matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
  document.documentElement.dataset.theme = theme
} catch {
  // Stockage indisponible : thème clair par défaut
}
