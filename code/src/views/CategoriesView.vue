<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRecipesStore } from '@/stores/recipes'
import AppIcon from '@/components/AppIcon.vue'
import { errorText } from '@/services/api'
import type { Category } from '@/types/api'

const store = useRecipesStore()
const { categories } = storeToRefs(store)

const loading = ref(true)
const loadError = ref<string | null>(null)
// Dernière erreur d'une action (création, renommage, suppression)
const actionError = ref<string | null>(null)

const newName = ref('')
const creating = ref(false)
const newInput = ref<HTMLInputElement | null>(null)

// Renommage en place : id de la catégorie en cours de modification
const editingId = ref<number | null>(null)
const editName = ref('')
// Champs de renommage, par id de catégorie (ref dans un v-for)
const editInputs = ref<Record<number, HTMLInputElement | null>>({})

function plural(count: number, word: string) {
  return `${count} ${word}${count > 1 ? 's' : ''}`
}

async function load() {
  loading.value = true
  loadError.value = null
  try {
    await store.fetchCategories()
  } catch (e) {
    loadError.value = errorText(e)
  } finally {
    loading.value = false
  }
}

async function create() {
  const name = newName.value.trim()
  if (!name) return
  creating.value = true
  actionError.value = null
  try {
    await store.createCategory(name)
    // Vidé seulement si l'on n'a pas déjà commencé à taper la catégorie suivante
    if (newName.value.trim() === name) newName.value = ''
    newInput.value?.focus()
  } catch (e) {
    actionError.value = errorText(e)
  } finally {
    creating.value = false
  }
}

async function startEdit(category: Category) {
  editingId.value = category.id
  editName.value = category.name
  actionError.value = null
  await nextTick()
  editInputs.value[category.id]?.select()
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit(category: Category) {
  const name = editName.value.trim()
  if (!name) return
  if (name === category.name) {
    cancelEdit()
    return
  }
  actionError.value = null
  try {
    await store.renameCategory(category.id, name)
    cancelEdit()
  } catch (e) {
    actionError.value = errorText(e)
  }
}

async function remove(category: Category) {
  const count = category.recipe_count
  let detail = ''
  if (count === 1) {
    detail = '\n\nSa recette ne sera pas supprimée : elle sera « sans catégorie ».'
  } else if (count > 1) {
    detail = `\n\nSes ${count} recettes ne seront pas supprimées : elles seront « sans catégorie ».`
  }
  if (!window.confirm(`Supprimer la catégorie « ${category.name} » ?${detail}`)) return
  actionError.value = null
  try {
    await store.deleteCategory(category.id)
  } catch (e) {
    actionError.value = errorText(e)
  }
}

onMounted(load)
</script>

<template>
  <RouterLink to="/" class="back"><AppIcon name="arrowLeft" /> Mes recettes</RouterLink>

  <section class="hero">
    <p class="eyebrow">Mon carnet</p>
    <h1 class="page-title">Catégories</h1>
    <p class="subtitle">
      Rangez vos recettes par catégorie : elles apparaissent en onglets sur la page d'accueil.
      Choisissez la catégorie d'une recette dans son formulaire.
    </p>
  </section>

  <div class="panel card">
    <form class="create" @submit.prevent="create">
      <label for="new-category" class="sr-only">Nom de la nouvelle catégorie</label>
      <input
        id="new-category"
        ref="newInput"
        v-model="newName"
        maxlength="50"
        autocomplete="off"
        placeholder="Nouvelle catégorie, ex. : Desserts"
      />
      <button type="submit" class="btn" :disabled="creating || !newName.trim()">
        <AppIcon name="plus" /> Ajouter
      </button>
    </form>

    <div v-if="actionError" class="alert" role="alert">
      <AppIcon name="alert" />
      <span class="alert-text">{{ actionError }}</span>
    </div>

    <div v-if="loading" class="skeleton" aria-label="Chargement…" />
    <div v-else-if="loadError" class="alert" role="alert">
      <AppIcon name="alert" />
      <span class="alert-text">{{ loadError }}</span>
    </div>
    <p v-else-if="!categories.length" class="empty">
      Aucune catégorie pour le moment. Par exemple : Entrées, Plats, Desserts, Apéritifs…
    </p>

    <ul v-else class="list" aria-label="Mes catégories">
      <li v-for="c in categories" :key="c.id" class="row">
        <form v-if="editingId === c.id" class="edit" @submit.prevent="saveEdit(c)">
          <input
            :ref="(el) => (editInputs[c.id] = el as HTMLInputElement | null)"
            v-model="editName"
            maxlength="50"
            autocomplete="off"
            :aria-label="`Nouveau nom de la catégorie ${c.name}`"
            @keydown.esc.prevent="cancelEdit"
          />
          <button type="submit" class="btn" :disabled="!editName.trim()">
            <AppIcon name="check" /> Enregistrer
          </button>
          <button type="button" class="btn-ghost" @click="cancelEdit">Annuler</button>
        </form>
        <template v-else>
          <RouterLink :to="{ name: 'home', query: { categorie: c.id } }" class="name">
            {{ c.name }}
          </RouterLink>
          <span class="count">{{ plural(c.recipe_count, 'recette') }}</span>
          <div class="actions">
            <button
              type="button"
              class="btn-ghost icon-btn"
              :title="`Renommer ${c.name}`"
              @click="startEdit(c)"
            >
              <AppIcon name="pencil" /><span class="sr-only">Renommer {{ c.name }}</span>
            </button>
            <button
              type="button"
              class="btn-danger icon-btn"
              :title="`Supprimer ${c.name}`"
              @click="remove(c)"
            >
              <AppIcon name="trash" /><span class="sr-only">Supprimer {{ c.name }}</span>
            </button>
          </div>
        </template>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.back {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 1rem;
  font-size: 0.9rem;
  color: var(--text-muted);
}
.back:hover {
  color: var(--text);
}
.hero {
  margin-bottom: 1.5rem;
}
.subtitle {
  max-width: 60ch;
}
.panel {
  display: grid;
  gap: 1rem;
  max-width: 640px;
  padding: 1.25rem;
}
.panel .alert {
  margin: 0;
}
.create,
.edit {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.create input,
.edit input {
  flex: 1 1 12rem;
  min-width: 0;
}
.empty {
  font-size: 0.9rem;
  color: var(--text-muted);
}
.list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.9rem;
  min-height: 3.25rem;
  padding: 0.5rem 0;
  border-top: 1px solid var(--border);
}
.row .edit {
  flex: 1;
}
.name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  color: var(--text);
  overflow-wrap: anywhere;
}
.name:hover {
  color: var(--accent);
  text-decoration: none;
}
.count {
  font-size: 0.85rem;
  color: var(--text-faint);
}
.actions {
  display: flex;
  gap: 0.4rem;
}
.icon-btn {
  padding: 0.5rem;
}
.skeleton {
  height: 120px;
  border-radius: var(--radius);
  background: var(--surface-hover);
}
</style>
