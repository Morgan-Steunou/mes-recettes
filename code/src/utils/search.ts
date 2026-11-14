// Recherche, filtres et tri des recettes, faits dans le navigateur sur la liste déjà chargée.
import { toDayISO } from '@/utils/dates'
import { totalTime } from '@/utils/recipe'
import type { Recipe } from '@/types/api'

// Champs de recette utilisés par la recherche (une recette complète convient)
type Searchable = Pick<Recipe, 'title'> & { ingredients?: { name: string }[] | null }

// Texte comparable : minuscules, sans accents ni ligatures, apostrophes et espaces unifiés.
// « Crème brûlée », « CREME BRULEE » et « creme  brulee » donnent tous « creme brulee ».
export function normalize(text: string | null | undefined): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// Petits mots ignorés, pour qu'on puisse écrire « avec du poulet » ou « tarte aux pommes »
const STOP_WORDS = new Set([
  'a',
  'au',
  'aux',
  'avec',
  'd',
  'de',
  'des',
  'du',
  'en',
  'et',
  'l',
  'la',
  'le',
  'les',
  'un',
  'une',
])

// Mot ramené au singulier, grossièrement : « pommes » → « pomme », « gâteaux » → « gateau ».
// La comparaison se faisant par inclusion, « pomme » trouve aussi « pommes ».
function singular(word: string): string {
  return word.length > 3 && /[sx]$/.test(word) ? word.slice(0, -1) : word
}

// Mots de la recherche (vide : aucun filtre). Si la recherche ne contient que des petits mots
// (« la »), on les garde.
export function searchTerms(query: string | null | undefined): string[] {
  const words = normalize(query)
    .split(/[\s'-]+/)
    .filter(Boolean)
  const useful = words.filter((word) => !STOP_WORDS.has(word))
  return (useful.length ? useful : words).map(singular)
}

// Correspondance d'une recette avec les mots : chacun doit se trouver dans le titre ou dans
// le nom d'un ingrédient, dans n'importe quel ordre. Renvoie null si elle ne correspond pas,
// sinon { ingredients } : les ingrédients trouvés pour les mots absents du titre (à afficher).
export function matchRecipe(recipe: Searchable, terms: string[]): { ingredients: string[] } | null {
  if (!terms.length) return { ingredients: [] }
  const title = normalize(recipe.title)
  const names = (recipe.ingredients ?? []).map((i) => ({ name: i.name, text: normalize(i.name) }))
  const found = new Set<string>()
  for (const term of terms) {
    if (title.includes(term)) continue
    const hits = names.filter((n) => n.text.includes(term))
    if (!hits.length) return null
    hits.forEach((n) => found.add(n.name))
  }
  return { ingredients: [...found] }
}

// Option d'un filtre ou d'un tri : clé gardée dans l'URL et libellé
export interface Option {
  key: string
  label: string
}

// Filtre « temps total » : clé d'URL → durée maximale en minutes
export const TIME_FILTERS: (Option & { max?: number })[] = [
  { key: '', label: 'Tous les temps' },
  { key: '15', label: '15 min ou moins', max: 15 },
  { key: '30', label: '30 min ou moins', max: 30 },
  { key: '60', label: '1 h ou moins', max: 60 },
]

// Filtre « dernière fois »
export const COOKED_FILTERS: (Option & { months?: number })[] = [
  { key: '', label: 'Toutes les recettes' },
  { key: 'jamais', label: 'Jamais faites' },
  { key: 'deja', label: 'Déjà faites' },
  { key: '1m', label: 'Pas faites depuis 1 mois', months: 1 },
  { key: '3m', label: 'Pas faites depuis 3 mois', months: 3 },
]

type Compare = (a: Recipe, b: Recipe) => number

const byTitle: Compare = (a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' })
// Valeurs absentes (null) toujours à la fin, quel que soit le sens du tri
const nullsLast =
  <V extends number | string>(get: (r: Recipe) => V | null, direction: number): Compare =>
  (a, b) => {
    const x = get(a)
    const y = get(b)
    if (x == null || y == null) return Number(x == null) - Number(y == null)
    return x < y ? -direction : x > y ? direction : 0
  }

export const SORTS: (Option & { compare: Compare })[] = [
  { key: '', label: "Ordre d'ajout", compare: (a, b) => a.id - b.id },
  { key: 'recentes', label: 'Ajoutées récemment', compare: (a, b) => b.id - a.id },
  { key: 'titre', label: 'Titre (A → Z)', compare: byTitle },
  { key: 'rapides', label: 'Les plus rapides', compare: nullsLast(totalTime, 1) },
  { key: 'faites', label: 'Faites récemment', compare: nullsLast((r) => r.last_cooked_on, -1) },
  {
    key: 'oubliees',
    label: 'Pas faites depuis longtemps',
    // Jamais faites d'abord, puis de la plus ancienne à la plus récente
    compare: (a, b) => (a.last_cooked_on ?? '').localeCompare(b.last_cooked_on ?? ''),
  },
  {
    key: 'souvent',
    label: 'Les plus souvent faites',
    compare: (a, b) => b.cooked_count - a.cooked_count,
  },
]

// Valeur d'URL reconnue, sinon la valeur par défaut ('')
export function optionKey(options: Option[], value: unknown): string {
  return typeof value === 'string' && options.some((o) => o.key === value) ? value : ''
}

// Jour iso « il y a n mois » (le 31 mars moins 1 mois donne le 3 mars : sans importance ici)
function monthsAgoISO(months: number, today: Date): string {
  const date = new Date(today.getFullYear(), today.getMonth() - months, today.getDate())
  return toDayISO(date)
}

function matchesTime(recipe: Recipe, key: string): boolean {
  const filter = TIME_FILTERS.find((f) => f.key === key)
  if (!filter?.max) return true
  const time = totalTime(recipe)
  return time !== null && time <= filter.max
}

function matchesCooked(recipe: Recipe, key: string, today: Date): boolean {
  const last = recipe.last_cooked_on
  if (key === 'jamais') return !last
  if (key === 'deja') return !!last
  const filter = COOKED_FILTERS.find((f) => f.key === key)
  // « Pas faite depuis » : les recettes jamais faites en font partie
  if (filter?.months) return !last || last < monthsAgoISO(filter.months, today)
  return true
}

// Onglet de catégorie : '' = toutes, 'aucune' = sans catégorie, sinon l'id (en texte)
export const NO_CATEGORY = 'aucune'

export function matchesCategory(recipe: Pick<Recipe, 'category_id'>, key: string): boolean {
  if (!key) return true
  if (key === NO_CATEGORY) return recipe.category_id == null
  return String(recipe.category_id) === key
}

// Applique catégorie, recherche, filtres et tri. Renvoie { recipes, ingredientHits } où
// ingredientHits associe à l'id d'une recette les ingrédients qui ont répondu à la recherche.
export interface RecipeFilters {
  query?: string
  time?: string
  cooked?: string
  sort?: string
  category?: string
}

export function filterRecipes(
  recipes: Recipe[],
  { query = '', time = '', cooked = '', sort = '', category = '' }: RecipeFilters = {},
  today = new Date(),
): { recipes: Recipe[]; ingredientHits: Record<number, string[]> } {
  const terms = searchTerms(query)
  const ingredientHits: Record<number, string[]> = {}
  const kept: Recipe[] = []
  for (const recipe of recipes) {
    if (!matchesCategory(recipe, category)) continue
    if (!matchesTime(recipe, time) || !matchesCooked(recipe, cooked, today)) continue
    const match = matchRecipe(recipe, terms)
    if (!match) continue
    if (match.ingredients.length) ingredientHits[recipe.id] = match.ingredients
    kept.push(recipe)
  }
  const compare = (SORTS.find((s) => s.key === sort) ?? SORTS[0]!).compare
  // Tri stable, départagé par le titre puis par l'id
  kept.sort((a, b) => compare(a, b) || byTitle(a, b) || a.id - b.id)
  return { recipes: kept, ingredientHits }
}
