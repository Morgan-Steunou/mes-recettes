import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/services/api'

export const useItemsStore = defineStore('items', () => {
  const items = ref([])
  const loading = ref(false)
  // Erreur de chargement de la liste
  const error = ref(null)
  // Erreur de la dernière action (ajout, modification, suppression)
  const actionError = ref(null)

  async function fetchItems() {
    loading.value = true
    error.value = null
    try {
      items.value = await api.get('/items')
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

  function addItem(name) {
    return runAction("Impossible d'ajouter l'item", async () => {
      const item = await api.post('/items', { name })
      items.value.push(item)
    })
  }

  function updateItem(id, changes) {
    return runAction("Impossible de modifier l'item", async () => {
      const current = items.value.find((i) => i.id === id)
      // PUT remplace l'item : on renvoie les champs non modifiés
      const updated = await api.put(`/items/${id}`, {
        name: current.name,
        description: current.description,
        ...changes,
      })
      items.value = items.value.map((i) => (i.id === id ? updated : i))
    })
  }

  function removeItem(id) {
    return runAction("Impossible de supprimer l'item", async () => {
      await api.delete(`/items/${id}`)
      items.value = items.value.filter((i) => i.id !== id)
    })
  }

  function clearActionError() {
    actionError.value = null
  }

  // À la déconnexion : rien de l'utilisateur précédent ne reste en mémoire
  function reset() {
    items.value = []
    error.value = null
    actionError.value = null
  }

  return {
    items,
    loading,
    error,
    actionError,
    fetchItems,
    addItem,
    updateItem,
    removeItem,
    clearActionError,
    reset,
  }
})
