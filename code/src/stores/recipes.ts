import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, errorText } from '@/services/api'
import type { Category, Cooking, CookingInput, HistoryPage, Recipe, RecipeInput } from '@/types/api'

// Filtres de l'historique global (dates « AAAA-MM-JJ », null = pas de borne)
export interface HistoryQuery {
  since?: string | null
  until?: string | null
  limit?: number
  offset?: number
}

export const useRecipesStore = defineStore('recipes', () => {
  const recipes = ref<Recipe[]>([])
  const loading = ref(false)
  // Erreur de chargement de la liste
  const error = ref<string | null>(null)
  // Erreur de la dernière action de la liste (suppression)
  const actionError = ref<string | null>(null)

  async function fetchRecipes() {
    loading.value = true
    error.value = null
    try {
      recipes.value = await api.get<Recipe[]>('/recipes')
    } catch (e) {
      error.value = errorText(e)
    } finally {
      loading.value = false
    }
  }

  // Une seule recette, toujours relue depuis l'API (la liste peut ne pas être chargée)
  function fetchRecipe(id: number) {
    return api.get<Recipe>(`/recipes/${id}`)
  }

  // Création et modification : en cas d'échec, l'erreur est levée pour que le formulaire
  // l'affiche à côté de la saisie
  async function createRecipe(data: RecipeInput) {
    const recipe = await api.post<Recipe>('/recipes', data)
    recipes.value.push(recipe)
    return recipe
  }

  // PUT remplace la recette : data doit contenir tous les champs modifiables
  async function updateRecipe(id: number, data: RecipeInput) {
    const updated = await api.put<Recipe>(`/recipes/${id}`, data)
    recipes.value = recipes.value.map((r) => (r.id === id ? updated : r))
    return updated
  }

  async function removeRecipe(id: number) {
    actionError.value = null
    try {
      await api.delete(`/recipes/${id}`)
      recipes.value = recipes.value.filter((r) => r.id !== id)
      return true
    } catch (e) {
      actionError.value = `Impossible de supprimer la recette : ${errorText(e)}`
      return false
    }
  }

  // Historique des repas d'une recette (du plus récent au plus ancien)
  function fetchCookings(recipeId: number) {
    return api.get<Cooking[]>(`/recipes/${recipeId}/cookings`)
  }

  // Historique global, toutes recettes : { items, total, recipe_count }
  function fetchHistory({ since = null, until = null, limit = 50, offset = 0 }: HistoryQuery = {}) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    if (since) params.set('since', since)
    if (until) params.set('until', until)
    return api.get<HistoryPage>(`/cookings?${params}`)
  }

  // Après un ajout ou une suppression, le résumé de la recette en mémoire est relu
  async function refreshSummary(recipeId: number) {
    const fresh = await api.get<Recipe>(`/recipes/${recipeId}`)
    recipes.value = recipes.value.map((r) => (r.id === recipeId ? fresh : r))
    return fresh
  }

  // Renvoie { cooking, recipe } : l'entrée créée et la recette avec son résumé à jour
  async function addCooking(recipeId: number, data: CookingInput) {
    const cooking = await api.post<Cooking>(`/recipes/${recipeId}/cookings`, data)
    return { cooking, recipe: await refreshSummary(recipeId) }
  }

  async function deleteCooking(recipeId: number, cookingId: number) {
    await api.delete(`/recipes/${recipeId}/cookings/${cookingId}`)
    return refreshSummary(recipeId)
  }

  // Catégories de l'utilisateur, par ordre alphabétique : [{ id, name, recipe_count }]
  const categories = ref<Category[]>([])
  const categoriesLoaded = ref(false)

  async function fetchCategories() {
    categories.value = await api.get<Category[]>('/categories')
    categoriesLoaded.value = true
    return categories.value
  }

  const byName = (a: Category, b: Category) =>
    a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })

  async function createCategory(name: string) {
    const category = await api.post<Category>('/categories', { name })
    categories.value = [...categories.value, category].sort(byName)
    return category
  }

  // Le nouveau nom est aussi reporté sur les recettes déjà en mémoire
  async function renameCategory(id: number, name: string) {
    const category = await api.put<Category>(`/categories/${id}`, { name })
    categories.value = categories.value.map((c) => (c.id === id ? category : c)).sort(byName)
    recipes.value = recipes.value.map((r) =>
      r.category_id === id ? { ...r, category: { id, name: category.name } } : r,
    )
    return category
  }

  // Les recettes de la catégorie sont gardées, sans catégorie
  async function deleteCategory(id: number) {
    await api.delete(`/categories/${id}`)
    categories.value = categories.value.filter((c) => c.id !== id)
    recipes.value = recipes.value.map((r) =>
      r.category_id === id ? { ...r, category_id: null, category: null } : r,
    )
  }

  function clearActionError() {
    actionError.value = null
  }

  // À la déconnexion : rien de l'utilisateur précédent ne reste en mémoire
  function reset() {
    recipes.value = []
    categories.value = []
    categoriesLoaded.value = false
    error.value = null
    actionError.value = null
  }

  return {
    recipes,
    loading,
    error,
    actionError,
    fetchRecipes,
    fetchRecipe,
    createRecipe,
    updateRecipe,
    removeRecipe,
    fetchCookings,
    fetchHistory,
    addCooking,
    deleteCooking,
    clearActionError,
    reset,
    categories,
    categoriesLoaded,
    fetchCategories,
    createCategory,
    renameCategory,
    deleteCategory,
  }
})
