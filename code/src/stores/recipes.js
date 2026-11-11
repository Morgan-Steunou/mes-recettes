import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/services/api'

// Champs envoyés à l'API lors d'une modification (id et dates sont gérés par le serveur)
const EDITABLE_FIELDS = [
  'title',
  'description',
  'servings',
  'prep_time_minutes',
  'cook_time_minutes',
  'steps',
]

function pick(object, keys) {
  return Object.fromEntries(keys.map((key) => [key, object[key] ?? null]))
}

export const useRecipesStore = defineStore('recipes', () => {
  const recipes = ref([])
  const loading = ref(false)
  // Erreur de chargement de la liste
  const error = ref(null)
  // Erreur de la dernière action (ajout, modification, suppression)
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

  // Exécute une action et renvoie true si elle a réussi, sinon mémorise l'erreur
  async function runAction(label, action) {
    actionError.value = null
    try {
      await action()
      return true
    } catch (e) {
      actionError.value = `${label} : ${e.message}`
      return false
    }
  }

  function addRecipe(title) {
    return runAction("Impossible d'ajouter la recette", async () => {
      const recipe = await api.post('/recipes', { title })
      recipes.value.push(recipe)
    })
  }

  function updateRecipe(id, changes) {
    return runAction('Impossible de modifier la recette', async () => {
      const current = recipes.value.find((r) => r.id === id)
      // PUT remplace la recette : on renvoie les champs non modifiés
      const updated = await api.put(`/recipes/${id}`, {
        ...pick(current, EDITABLE_FIELDS),
        ...changes,
      })
      recipes.value = recipes.value.map((r) => (r.id === id ? updated : r))
    })
  }

  function removeRecipe(id) {
    return runAction('Impossible de supprimer la recette', async () => {
      await api.delete(`/recipes/${id}`)
      recipes.value = recipes.value.filter((r) => r.id !== id)
    })
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
    addRecipe,
    updateRecipe,
    removeRecipe,
    clearActionError,
    reset,
  }
})
