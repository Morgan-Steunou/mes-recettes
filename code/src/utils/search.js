// Recherche de recettes, faite dans le navigateur sur la liste déjà chargée.

// Texte comparable : minuscules, sans accents ni ligatures, apostrophes et espaces unifiés.
// « Crème brûlée », « CREME BRULEE » et « creme  brulee » donnent tous « creme brulee ».
export function normalize(text) {
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

// Mots de la recherche (vide : aucun filtre)
export function searchTerms(query) {
  return normalize(query).split(' ').filter(Boolean)
}

// La recette correspond si son titre contient chacun des mots, dans n'importe quel ordre :
// « pommes tarte » trouve « Tarte aux pommes », « tar » aussi (début de mot ou milieu)
export function matchesTitle(recipe, terms) {
  if (!terms.length) return true
  const title = normalize(recipe.title)
  return terms.every((term) => title.includes(term))
}
