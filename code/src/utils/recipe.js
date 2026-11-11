// Affichage commun des recettes (liste, formulaire, et plus tard la page détail)

// Durée lisible : 45 → « 45 min », 90 → « 1 h 30 », 120 → « 2 h »
export function formatDuration(minutes) {
  if (minutes == null) return null
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`
}

// Temps total, si au moins un des deux temps est renseigné
export function totalTime(recipe) {
  if (recipe.prep_time_minutes == null && recipe.cook_time_minutes == null) return null
  return (recipe.prep_time_minutes ?? 0) + (recipe.cook_time_minutes ?? 0)
}

// Quantité affichée à la française, sans séparateur de milliers : 0.5 → « 0,5 », 1250 → « 1250 »
const quantityFormat = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 3,
  useGrouping: false,
})

export function formatQuantity(quantity) {
  return quantity == null ? '' : quantityFormat.format(quantity)
}

// Ingrédient lisible : « 250 g Farine », « 3 Œufs », « Sel »
export function formatIngredient({ quantity, unit, name }) {
  return [formatQuantity(quantity), unit, name].filter(Boolean).join(' ')
}

// Quantité saisie → nombre. Accepte « 0,5 », « 0.5 » et les fractions « 1/2 ».
// Renvoie null si le champ est vide, NaN si la saisie n'est pas un nombre.
export function parseQuantity(text) {
  const value = String(text ?? '')
    .trim()
    .replace(',', '.')
  if (value === '') return null
  const fraction = value.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/)
  if (fraction) return Number(fraction[2]) === 0 ? NaN : Number(fraction[1]) / Number(fraction[2])
  return /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN
}

// Ligne du formulaire (texte uniquement) ; key sert de clé stable à v-for
let nextKey = 0
export function ingredientRow({ name = '', quantity = null, unit = '' } = {}) {
  nextKey += 1
  return { key: nextKey, name, quantity: formatQuantity(quantity), unit: unit ?? '' }
}

// Lignes du formulaire → liste envoyée à l'API.
// Les lignes entièrement vides sont ignorées ; renvoie { error } si une ligne est incomplète.
export function ingredientsPayload(rows) {
  const ingredients = []
  for (const [index, row] of rows.entries()) {
    const name = row.name.trim()
    const unit = row.unit.trim()
    const quantity = parseQuantity(row.quantity)
    if (!name && !unit && quantity === null) continue
    const label = `l'ingrédient n° ${index + 1}`
    if (!name) return { error: `Indiquez le nom de ${label}.` }
    if (Number.isNaN(quantity)) {
      return { error: `La quantité de ${label} doit être un nombre (ex. : 250, 0,5 ou 1/2).` }
    }
    ingredients.push({ name, quantity, unit: unit || null })
  }
  return { ingredients }
}
