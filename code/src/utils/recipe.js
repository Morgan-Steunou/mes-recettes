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
