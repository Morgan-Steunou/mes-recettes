import { computed, ref } from 'vue'

// Thème de l'interface : 'dark' ou 'light'.
// Appliqué via l'attribut data-theme de <html> (les couleurs sont dans assets/main.css).
// Le choix de l'utilisateur est mémorisé ; sans choix, on suit la préférence du système.
const STORAGE_KEY = 'mes-recettes.theme'

export type Theme = 'dark' | 'light'

const THEME_COLORS: Record<Theme, string> = { dark: '#08130e', light: '#173f31' }

const root = document.documentElement
const systemLight = window.matchMedia('(prefers-color-scheme: light)')

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

// Valeur initiale : déjà posée par public/theme-init.js
const theme = ref<Theme>(root.dataset.theme === 'dark' ? 'dark' : 'light')

function apply(value: Theme) {
  theme.value = value
  root.dataset.theme = value
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[value])
}
apply(theme.value)

// Tant que l'utilisateur n'a rien choisi, l'interface suit les changements du système
systemLight.addEventListener('change', (event) => {
  if (!savedTheme()) apply(event.matches ? 'light' : 'dark')
})

export function useTheme() {
  const isDark = computed(() => theme.value === 'dark')

  function setTheme(value: Theme) {
    apply(value)
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Stockage indisponible : le choix ne durera que le temps de la page
    }
  }

  function toggleTheme() {
    setTheme(isDark.value ? 'light' : 'dark')
  }

  return { theme, isDark, setTheme, toggleTheme }
}
