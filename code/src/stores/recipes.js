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
    clearActionError,
    reset,
  }
})
