<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useRecipesStore } from '@/stores/recipes'
import AppIcon from '@/components/AppIcon.vue'
import IngredientsEditor from '@/components/IngredientsEditor.vue'
import { formatDuration, ingredientRow, ingredientsPayload, totalTime } from '@/utils/recipe'
import { errorText } from '@/services/api'
import type { Ingredient, RecipeInput } from '@/types/api'

// id : présent en modification (/recettes/:id/modifier), absent en création
const props = withDefaults(defineProps<{ id?: string | null }>(), { id: null })

const store = useRecipesStore()
const { categories } = storeToRefs(store)
const router = useRouter()
const route = useRoute()

// Catégorie choisie ('' = sans catégorie). En création, celle de l'onglet d'où l'on vient
// (lien « Nouvelle recette » de l'accueil : /recettes/nouvelle?categorie=3)
const fromTab = route.query.categorie
const categoryId = ref(typeof fromTab === 'string' && /^\d+$/.test(fromTab) ? fromTab : '')
// Création d'une catégorie depuis le formulaire
const newCategory = ref<string | null>(null) // null : champ masqué
const newCategoryInput = ref<HTMLInputElement | null>(null)
const categoryError = ref<string | null>(null)
const creatingCategory = ref(false)

async function openNewCategory() {
  newCategory.value = ''
  categoryError.value = null
  await nextTick()
  newCategoryInput.value?.focus()
}

function closeNewCategory() {
  newCategory.value = null
  categoryError.value = null
}

async function createCategory() {
  const name = newCategory.value?.trim()
  if (!name) return
  creatingCategory.value = true
  categoryError.value = null
  try {
    const category = await store.createCategory(name)
    categoryId.value = String(category.id)
    newCategory.value = null
  } catch (e) {
    categoryError.value = errorText(e)
  } finally {
    creatingCategory.value = false
  }
}

const isEdit = computed(() => props.id !== null)
// Annuler : retour à la fiche en modification, à la liste en création
const cancelTarget = computed(() =>
  isEdit.value ? { name: 'recipe-detail', params: { id: props.id } } : { name: 'home' },
)
const recipeId = computed(() => Number(props.id))

// Champs du formulaire : texte pour tout (les nombres sont convertis à l'envoi)
const form = reactive({
  title: '',
  description: '',
  servings: '',
  prep_time_minutes: '',
  cook_time_minutes: '',
  steps: '',
})
// Lignes d'ingrédients (une ligne vide pour commencer)
const ingredientRows = ref([ingredientRow()])

const loading = ref(false)
// Recette à modifier introuvable ou illisible : le formulaire n'est pas affiché
const loadError = ref<string | null>(null)
// Refus de l'API à l'enregistrement : la saisie est conservée
const saveError = ref<string | null>(null)
const saving = ref(false)

const total = computed(() =>
  formatDuration(
    totalTime({
      prep_time_minutes: toNumber(form.prep_time_minutes),
      cook_time_minutes: toNumber(form.cook_time_minutes),
    }),
  ),
)

function toNumber(value: string | number | null | undefined): number | null {
  if (value === '' || value == null) return null
  return Number(value)
}

function toText(value: string): string | null {
  const text = value.trim()
  return text === '' ? null : text
}

// Données envoyées à l'API : champs vides → null
function payload(ingredients: Ingredient[]): RecipeInput {
  return {
    title: form.title.trim(),
    description: toText(form.description),
    servings: toNumber(form.servings),
    prep_time_minutes: toNumber(form.prep_time_minutes),
    cook_time_minutes: toNumber(form.cook_time_minutes),
    steps: toText(form.steps),
    ingredients,
    category_id: categoryId.value ? Number(categoryId.value) : null,
  }
}

async function load() {
  loading.value = true
  try {
    const recipe = await store.fetchRecipe(recipeId.value)
    for (const key of Object.keys(form) as (keyof typeof form)[])
      form[key] = String(recipe[key] ?? '')
    categoryId.value = recipe.category_id ? String(recipe.category_id) : ''
    ingredientRows.value = recipe.ingredients.length
      ? recipe.ingredients.map(ingredientRow)
      : [ingredientRow()]
  } catch (e) {
    loadError.value = errorText(e)
  } finally {
    loading.value = false
  }
}

async function submit() {
  saveError.value = null
  // Ligne incomplète (ex. quantité sans nom) : signalée avant tout envoi
  const rows = ingredientsPayload(ingredientRows.value)
  if (rows.error !== undefined) {
    saveError.value = rows.error
    return
  }
  const { ingredients } = rows
  saving.value = true
  try {
    const data = payload(ingredients)
    const saved = isEdit.value
      ? await store.updateRecipe(recipeId.value, data)
      : await store.createRecipe(data)
    // Retour sur la fiche de la recette enregistrée
    router.push({ name: 'recipe-detail', params: { id: saved.id } })
  } catch (e) {
    saveError.value = errorText(e)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  if (isEdit.value) load()
  // Liste des catégories pour le menu ; une erreur ici n'empêche pas d'enregistrer
  store.fetchCategories().catch(() => {})
})
</script>

<template>
  <RouterLink to="/" class="back"><AppIcon name="arrowLeft" /> Mes recettes</RouterLink>

  <section class="hero">
    <p class="eyebrow">{{ isEdit ? 'Modification' : 'Nouvelle recette' }}</p>
    <h1 class="page-title">{{ isEdit ? 'Modifier la recette' : 'Ajouter une recette' }}</h1>
  </section>

  <div v-if="loading" class="skeleton" aria-label="Chargement…" />

  <div v-else-if="loadError" class="alert" role="alert">
    <AppIcon name="alert" />
    <span class="alert-text">{{ loadError }}</span>
  </div>

  <form v-else class="recipe-form card" novalidate @submit.prevent="submit">
    <div v-if="saveError" class="alert" role="alert">
      <AppIcon name="alert" />
      <span class="alert-text">{{ saveError }}</span>
    </div>

    <label class="field">
      <span class="label">Titre <span class="required" aria-hidden="true">*</span></span>
      <input
        v-model="form.title"
        name="title"
        maxlength="150"
        required
        autocomplete="off"
        placeholder="Ex. : Tarte aux pommes"
      />
    </label>

    <div class="field">
      <label class="label" for="recipe-category"><AppIcon name="folder" /> Catégorie</label>
      <div class="category-row">
        <select id="recipe-category" v-model="categoryId" name="category">
          <option value="">Sans catégorie</option>
          <option v-for="c in categories" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
        </select>
        <button
          v-if="newCategory === null"
          type="button"
          class="btn-ghost"
          @click="openNewCategory"
        >
          <AppIcon name="plus" /> Nouvelle catégorie
        </button>
      </div>
      <div v-if="newCategory !== null" class="category-row">
        <input
          ref="newCategoryInput"
          v-model="newCategory"
          aria-label="Nom de la nouvelle catégorie"
          maxlength="50"
          autocomplete="off"
          placeholder="Ex. : Desserts"
          @keydown.enter.prevent="createCategory"
          @keydown.esc.prevent="closeNewCategory"
        />
        <button
          type="button"
          class="btn"
          :disabled="creatingCategory || !newCategory?.trim()"
          @click="createCategory"
        >
          <AppIcon name="check" /> Créer
        </button>
        <button type="button" class="btn-ghost" @click="closeNewCategory">Annuler</button>
      </div>
      <p v-if="categoryError" class="category-error" role="alert">{{ categoryError }}</p>
    </div>

    <label class="field">
      <span class="label">Description</span>
      <textarea
        v-model="form.description"
        name="description"
        rows="3"
        maxlength="2000"
        placeholder="Quelques mots sur la recette, son origine, ses variantes…"
      />
    </label>

    <div class="numbers">
      <label class="field">
        <span class="label"><AppIcon name="users" /> Portions</span>
        <input
          v-model="form.servings"
          name="servings"
          type="number"
          inputmode="numeric"
          min="1"
          max="100"
          step="1"
        />
      </label>
      <label class="field">
        <span class="label"><AppIcon name="clock" /> Préparation (min)</span>
        <input
          v-model="form.prep_time_minutes"
          name="prep_time_minutes"
          type="number"
          inputmode="numeric"
          min="0"
          max="1440"
          step="1"
        />
      </label>
      <label class="field">
        <span class="label"><AppIcon name="flame" /> Cuisson (min)</span>
        <input
          v-model="form.cook_time_minutes"
          name="cook_time_minutes"
          type="number"
          inputmode="numeric"
          min="0"
          max="1440"
          step="1"
        />
      </label>
    </div>
    <p v-if="total" class="hint" aria-live="polite">Temps total : {{ total }}</p>

    <IngredientsEditor v-model="ingredientRows" />

    <div class="field">
      <label class="field">
        <span class="label">Étapes</span>
        <textarea
          v-model="form.steps"
          name="steps"
          rows="8"
          maxlength="10000"
          placeholder="Une étape par ligne"
          aria-describedby="steps-hint"
        />
      </label>
      <span id="steps-hint" class="hint">Une étape par ligne.</span>
    </div>

    <div class="actions">
      <RouterLink :to="cancelTarget" class="btn-ghost">Annuler</RouterLink>
      <button type="submit" class="btn" :disabled="saving || !form.title.trim()">
        <AppIcon name="check" />
        {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
      </button>
    </div>
  </form>
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
.recipe-form {
  /* Largeur de lecture confortable, même sur grand écran */
  max-width: 760px;
  display: grid;
  gap: 1.1rem;
  padding: 1.5rem;
}
.recipe-form .alert {
  margin-bottom: 0;
}
.field {
  display: grid;
  gap: 0.4rem;
  min-width: 0;
}
.label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-muted);
}
.required {
  color: var(--accent);
}
.field input,
.field textarea {
  width: 100%;
  min-width: 0;
}
.category-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.category-row select,
.category-row input {
  flex: 1 1 14rem;
  min-width: 0;
}
.category-error {
  font-size: 0.85rem;
  color: var(--danger);
}
textarea {
  resize: vertical;
  line-height: 1.5;
}
.numbers {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.9rem;
}
.hint {
  margin-top: -0.4rem;
  font-size: 0.825rem;
  color: var(--text-faint);
}
.field .hint {
  margin-top: 0;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  padding-top: 0.25rem;
}
.actions .btn-ghost {
  padding: 0.65rem 1.1rem;
  font-size: 0.95rem;
}
.btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  filter: none;
}
.skeleton {
  height: 420px;
  border-radius: var(--radius-lg);
  background: var(--surface);
}

@media (max-width: 560px) {
  .recipe-form {
    padding: 1.1rem;
  }
  .numbers {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
