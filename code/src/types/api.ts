// Données échangées avec l'API (voir app/schemas/ côté Python)
// Dates de jour (date) : « AAAA-MM-JJ » ; horodatages (datetime) : ISO 8601

export interface Ingredient {
  name: string
  quantity: number | null
  unit: string | null
}

// Ingrédient envoyé à l'API (quantité et unité facultatives)
export interface IngredientInput {
  name: string
  quantity?: number | null
  unit?: string | null
}

// Catégorie telle qu'affichée avec une recette
export interface CategoryRef {
  id: number
  name: string
}

export interface Recipe {
  id: number
  title: string
  description: string | null
  servings: number | null
  prep_time_minutes: number | null
  cook_time_minutes: number | null
  steps: string | null
  ingredients: Ingredient[]
  category_id: number | null
  category: CategoryRef | null
  created_at: string
  updated_at: string
  // Résumé de l'historique des repas
  cooked_count: number
  last_cooked_on: string | null
}

// Champs envoyés à la création (POST) ou au remplacement (PUT) d'une recette
export interface RecipeInput {
  title: string
  description?: string | null
  servings?: number | null
  prep_time_minutes?: number | null
  cook_time_minutes?: number | null
  steps?: string | null
  ingredients?: IngredientInput[]
  category_id?: number | null
}

export interface Category {
  id: number
  name: string
  recipe_count: number
}

// Repas : une recette cuisinée un jour donné
export interface Cooking {
  id: number
  recipe_id: number
  cooked_on: string
  rating: number | null
  comment: string | null
  created_at: string
}

export interface CookingInput {
  cooked_on?: string | null
  rating?: number | null
  comment?: string | null
}

// Repas de l'historique global, avec le titre de sa recette
export interface HistoryEntry extends Cooking {
  recipe_title: string
}

// Une page de l'historique et les totaux de toute la période demandée
export interface HistoryPage {
  items: HistoryEntry[]
  total: number
  recipe_count: number
}

export interface User {
  id: number
  username: string
  is_active: boolean
}

// Réponse de /auth/token et /auth/refresh
export interface Token {
  access_token: string
  token_type: 'bearer'
  expires_in: number
}
