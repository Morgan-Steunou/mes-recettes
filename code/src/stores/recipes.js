import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/services/api'

export const useRecipesStore = defineStore('recipes', () => {
  const recipes = ref([])
  const loading = ref(false)
  // Erreur de chargement de la liste
  const error = ref(null)
  // Erreur de la dernière action de la liste (suppression)
  const actionError = ref(null)

  async function fetchRecipes() {
    loading.value = true
    error.value = null
    try {
      recipes.value = await api.get('/recipes')
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  // Une seule recette, toujours relue depuis l'API (la liste peut ne pas être chargée)
  function fetchRecipe(id) {
    return api.get(`/recipes/${id}`)
  }

  // Création et modification : en cas d'échec, l'erreur est levée pour que le formulaire
  // l'affiche à côté de la saisie
  async function createRecipe(data) {
    const recipe = await api.post('/recipes', data)
    recipes.value.push(recipe)
    return recipe
  }

  // PUT remplace la recette : data doit contenir tous les champs modifiables
  async function updateRecipe(id, data) {
    const updated = await api.put(`/recipes/${id}`, data)
    recipes.value = recipes.value.map((r) => (r.id === id ? updated : r))
    return updated
  }

  async function removeRecipe(id) {
    actionError.value = null
    try {
      await api.delete(`/recipes/${id}`)
      recipes.value = recipes.value.filter((r) => r.id !== id)
      return true
    } catch (e) {
      actionError.value = `Impossible de supprimer la recette : ${e.message}`
      return false
    }
  }

  // Historique des repas d'une recette (du plus récent au plus ancien)
  function fetchCookings(recipeId) {
    return api.get(`/recipes/${recipeId}/cookings`)
  }

  // Après un ajout ou une suppression, le résumé de la recette en mémoire est relu
  async function refreshSummary(recipeId) {
    const fresh = await api.get(`/recipes/${recipeId}`)
    recipes.value = recipes.value.map((r) => (r.id === recipeId ? fresh : r))
    return fresh
  }

  // Renvoie { cooking, recipe } : l'entrée créée et la recette avec son résumé à jour
  async function addCooking(recipeId, data) {
    const cooking = await api.post(`/recipes/${recipeId}/cookings`, data)
    return { cooking, recipe: await refreshSummary(recipeId) }
  }

  async function deleteCooking(recipeId, cookingId) {
    await api.delete(`/recipes/${recipeId}/cookings/${cookingId}`)
    return refreshSummary(recipeId)
  }

  function clearActionError() {
    actionError.value = null
  }

  // À la déconnexion : rien de l'utilisateur précédent ne reste en mémoire
  function reset() {
    recipes.value = []
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
    addCooking,
    deleteCooking,
    clearActionError,
    reset,
  }
})
