// Suggestions de recettes à partir des ingrédients disponibles, calculées dans le navigateur.
import { normalize, searchTerms } from '@/utils/search'

// Ingrédients de base considérés comme toujours disponibles (option de la page)
export const STAPLES = ['Sel', 'Poivre', 'Huile', 'Eau']

// Chaque mot de `wanted` commence un mot de `words` : « poulet » ↔ « Blanc de poulet »,
// « tomate » ↔ « Tomates cerises ». Par mot entier et non par fragment, pour que « eau »
// ne trouve pas « veau » ni « gâteau ».
function covers(words, wanted) {
  return wanted.length > 0 && wanted.every((w) => words.some((word) => word.startsWith(w)))
}

// Un ingrédient disponible correspond à un ingrédient de recette si l'un des deux noms
// contient tous les mots de l'autre : « poulet » ↔ « Blanc de poulet », mais aussi
// « blanc de poulet » ↔ « Poulet »
export function sameIngredient(available, ingredient) {
  const a = searchTerms(available)
  const b = searchTerms(ingredient)
  return covers(b, a) || covers(a, b)
}

// Liste des ingrédients disponibles, sans doublon (« Tomates » et « tomate » ne comptent qu'une
// fois), dans l'ordre de saisie
export function addIngredients(list, text) {
  const result = [...list]
  for (const part of String(text).split(/[,;\n]+/)) {
    const name = part.trim().replace(/\s+/g, ' ')
    if (!name) continue
    const key = searchTerms(name).join(' ')
    if (!key || result.some((n) => searchTerms(n).join(' ') === key)) continue
    result.push(name)
  }
  return result
}

// Noms d'ingrédients connus (toutes recettes), pour les propositions de saisie
export function knownIngredients(recipes) {
  const byKey = new Map()
  for (const recipe of recipes) {
    for (const { name } of recipe.ingredients ?? []) {
      const key = normalize(name)
      if (key && !byKey.has(key)) byKey.set(key, name)
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
}

// Recettes classées selon les ingrédients disponibles. Chaque résultat :
// { recipe, have, missing, staples } (noms des ingrédients de la recette), avec
// have = ingrédients disponibles, staples = ingrédients de base (non comptés), missing = le reste.
// Une recette n'apparaît que si au moins un de ses ingrédients (hors base) est disponible.
// Ordre : le moins d'ingrédients manquants, puis le plus d'ingrédients disponibles, puis le titre.
export function suggestRecipes(recipes, available, { staples = true } = {}) {
  if (!available.length) return []
  const results = []
  for (const recipe of recipes) {
    const have = []
    const missing = []
    const base = []
    for (const { name } of recipe.ingredients ?? []) {
      if (available.some((a) => sameIngredient(a, name))) have.push(name)
      else if (staples && STAPLES.some((s) => sameIngredient(s, name))) base.push(name)
      else missing.push(name)
    }
    if (have.length) results.push({ recipe, have, missing, staples: base })
  }
  return results.sort(
    (a, b) =>
      a.missing.length - b.missing.length ||
      b.have.length - a.have.length ||
      a.recipe.title.localeCompare(b.recipe.title, 'fr', { sensitivity: 'base' }),
  )
}
