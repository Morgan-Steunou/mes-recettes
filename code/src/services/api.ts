// Client HTTP minimal autour de fetch. Toutes les requêtes passent par /api.
// Le token d'accès est ajouté automatiquement (en-tête « Authorization: Bearer … ») ; s'il a
// expiré, il est renouvelé (cookie de session) et la requête est rejouée une fois.
const BASE_URL = import.meta.env.VITE_API_URL || '/api'

const FIELD_LABELS: Record<string, string> = {
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
const INGREDIENT_LABELS: Record<string, string> = {
  name: 'Le nom',
  quantity: 'La quantité',
  unit: "L'unité",
}

function fieldLabel(loc: (string | number)[] = []): string {
  const index = loc.indexOf('ingredients')
  const rank = loc[index + 1]
  if (index !== -1 && typeof rank === 'number') {
    const label = INGREDIENT_LABELS[String(loc[index + 2])] || 'Un champ'
    return `${label} de l'ingrédient n° ${rank + 1}`
  }
  return FIELD_LABELS[String(loc.at(-1))] || 'Un champ'
}

// Erreur renvoyée par l'API : message lisible et code HTTP
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Erreur de validation FastAPI (réponse 422, liste dans « detail »)
interface ValidationError {
  type: string
  loc?: (string | number)[]
  msg: string
  ctx?: { max_length?: number; gt?: number; ge?: number; le?: number }
}

// Options propres à ce client (en plus de celles de fetch) :
//   auth: false  -> pas de token d'accès (routes de connexion et de session)
//   skipAuthRedirect -> un 401 est une simple erreur (mauvais mot de passe, session terminée)
export interface RequestOptions extends RequestInit {
  auth?: boolean
  skipAuthRedirect?: boolean
}

interface AuthHandlers {
  tokenProvider: () => Promise<string | null>
  refreshHandler: () => Promise<boolean>
  unauthorizedHandler: () => void
}

// Branchés par le store d'authentification (évite une dépendance circulaire)
let getToken: AuthHandlers['tokenProvider'] = async () => null
let refreshSession: AuthHandlers['refreshHandler'] = async () => false
let onUnauthorized: AuthHandlers['unauthorizedHandler'] = () => {}

export function configureAuth({
  tokenProvider,
  refreshHandler,
  unauthorizedHandler,
}: AuthHandlers): void {
  getToken = tokenProvider
  refreshSession = refreshHandler
  onUnauthorized = unauthorizedHandler
}

// Traduit une erreur de validation FastAPI (422) en message lisible
function validationMessage(error: ValidationError): string {
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

function errorMessage(status: number, detail: unknown): string {
  if (Array.isArray(detail)) return (detail as ValidationError[]).map(validationMessage).join(' ')
  if (typeof detail === 'string') return detail
  if (status >= 500) return 'Erreur du serveur, veuillez réessayer plus tard.'
  return `Erreur HTTP ${status}`
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retirée des options transmises à fetch
async function send(path: string, { auth = true, skipAuthRedirect, ...options }: RequestOptions) {
  const token = auth ? await getToken() : null
  const headers = {
    ...(options.body instanceof URLSearchParams ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }
  try {
    // credentials : le cookie de session part aussi si l'API est sur une autre origine
    return await fetch(`${BASE_URL}${path}`, { credentials: 'include', ...options, headers })
  } catch {
    throw new Error('Impossible de joindre le serveur. Vérifiez votre connexion.')
  }
}

// Le type de la réponse (T) est celui annoncé par l'appelant : il n'est pas vérifié à l'exécution
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res = await send(path, options)
  if (res.status === 401 && !options.skipAuthRedirect) {
    // Token d'accès refusé (expiré, révoqué) : nouveau token, puis la requête est rejouée
    if (await refreshSession()) res = await send(path, options)
    // Session terminée : déconnexion et retour à la page de connexion
    if (res.status === 401) onUnauthorized()
  }
  if (!res.ok) {
    const body: { detail?: unknown } = await res.json().catch(() => ({}))
    throw new ApiError(errorMessage(res.status, body.detail), res.status)
  }
  return res.status === 204 ? (null as T) : res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), ...options }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path: string) => request<null>(path, { method: 'DELETE' }),
  // Formulaire « application/x-www-form-urlencoded » (connexion OAuth2)
  postForm: <T>(path: string, fields: Record<string, string>, options: RequestOptions = {}) =>
    request<T>(path, { method: 'POST', body: new URLSearchParams(fields), ...options }),
}

// Message d'une erreur attrapée (catch), quel que soit son type
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
