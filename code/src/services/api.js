// Client HTTP minimal autour de fetch. Toutes les requêtes passent par /api.
// Le token d'accès est ajouté automatiquement (en-tête « Authorization: Bearer … »).
const BASE_URL = import.meta.env.VITE_API_URL || '/api'

const FIELD_LABELS = {
  title: 'Le titre',
  description: 'La description',
  servings: 'Le nombre de portions',
  prep_time_minutes: 'Le temps de préparation',
  cook_time_minutes: 'Le temps de cuisson',
  steps: 'Les étapes',
  ingredients: 'La liste des ingrédients',
  cooked_on: 'La date',
  rating: 'La note',
  comment: 'Le commentaire',
  name: 'Le nom',
  category_id: 'La catégorie',
}

// Champs d'un ingrédient (erreur située en ['body', 'ingredients', <rang>, <champ>])
const INGREDIENT_LABELS = { name: 'Le nom', quantity: 'La quantité', unit: "L'unité" }

function fieldLabel(loc = []) {
  const index = loc.indexOf('ingredients')
  if (index !== -1 && typeof loc[index + 1] === 'number') {
    const label = INGREDIENT_LABELS[loc[index + 2]] || 'Un champ'
    return `${label} de l'ingrédient n° ${loc[index + 1] + 1}`
  }
  return FIELD_LABELS[loc.at(-1)] || 'Un champ'
}

// Branchés par le store d'authentification (évite une dépendance circulaire)
let getToken = () => null
let onUnauthorized = () => {}

export function configureAuth({ tokenProvider, unauthorizedHandler }) {
  getToken = tokenProvider
  onUnauthorized = unauthorizedHandler
}

// Traduit une erreur de validation FastAPI (422) en message lisible
function validationMessage(error) {
  const field = fieldLabel(error.loc)
  switch (error.type) {
    case 'missing':
    case 'string_too_short':
      return `${field} ne peut pas être vide.`
    case 'string_too_long':
      return `${field} ne doit pas dépasser ${error.ctx?.max_length} caractères.`
    case 'too_long':
      return `${field} ne doit pas dépasser ${error.ctx?.max_length} éléments.`
    case 'greater_than':
      return `${field} doit être supérieure à ${error.ctx?.gt}.`
    case 'greater_than_equal':
      return `${field} doit être au moins ${error.ctx?.ge}.`
    case 'less_than_equal':
      return `${field} ne doit pas dépasser ${error.ctx?.le}.`
    case 'int_parsing':
    case 'int_from_float':
      return `${field} doit être un nombre entier.`
    case 'float_parsing':
    case 'finite_number':
      return `${field} doit être un nombre.`
    case 'value_error':
      return `${field} est invalide : ${error.msg.replace(/^Value error, /, '').toLowerCase()}.`
    default:
      return `${field} est invalide.`
  }
}

function errorMessage(status, detail) {
  if (Array.isArray(detail)) return detail.map(validationMessage).join(' ')
  if (typeof detail === 'string') return detail
  if (status >= 500) return 'Erreur du serveur, veuillez réessayer plus tard.'
  return `Erreur HTTP ${status}`
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = {
    ...(options.body instanceof URLSearchParams ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }
  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  } catch {
    throw new Error('Impossible de joindre le serveur. Vérifiez votre connexion.')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    // Token absent, invalide ou expiré : on déconnecte (sauf pendant la connexion elle-même)
    if (res.status === 401 && !options.skipAuthRedirect) onUnauthorized()
    throw new Error(errorMessage(res.status, body.detail))
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  // Formulaire « application/x-www-form-urlencoded » (connexion OAuth2)
  postForm: (path, fields, options = {}) =>
    request(path, { method: 'POST', body: new URLSearchParams(fields), ...options }),
}
