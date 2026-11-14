<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useRecipesStore } from '@/stores/recipes'
import {
  COOKED_FILTERS,
  NO_CATEGORY,
  SORTS,
  TIME_FILTERS,
  filterRecipes,
  matchesCategory,
  optionKey,
  searchTerms,
} from '@/utils/search'
import AppIcon from '@/components/AppIcon.vue'
import RecipeList from '@/components/RecipeList.vue'
import type { LocationQuery } from 'vue-router'
import type { Option } from '@/utils/search'

const store = useRecipesStore()
const { recipes, loading, error, actionError, categories, categoriesLoaded } = storeToRefs(store)
const route = useRoute()
const router = useRouter()

// Recherche (titre et ingrédients), filtres et tri, gardés dans l'URL
// (/?q=poulet&temps=30&faite=1m&tri=titre) : ils survivent au rechargement
// et au retour depuis une fiche recette
const searchInput = ref<HTMLInputElement | null>(null)
const queryFromRoute = () => (typeof route.query.q === 'string' ? route.query.q : '')
// Saisie locale, recopiée dans l'URL (et relue si l'URL change : retour arrière, lien d'en-tête)
const query = ref(queryFromRoute())
watch(query, (value) => {
  if (value === queryFromRoute()) return
  const { q, ...rest } = route.query // eslint-disable-line @typescript-eslint/no-unused-vars
  router.replace({ query: value.trim() ? { ...rest, q: value } : rest })
})
watch(queryFromRoute, (value) => {
  if (value !== query.value) query.value = value
})

// Menu lié à un paramètre d'URL ; une valeur inconnue dans l'URL vaut « tous »
function queryParam(key: string, options: Option[]) {
  return computed({
    get: () => optionKey(options, route.query[key]),
    set: (value: string) => {
      const { [key]: _old, ...rest } = route.query // eslint-disable-line @typescript-eslint/no-unused-vars
      router.replace({ query: value ? { ...rest, [key]: value } : rest })
    },
  })
}
const time = queryParam('temps', TIME_FILTERS)
const cooked = queryParam('faite', COOKED_FILTERS)
const sort = queryParam('tri', SORTS)

// Onglet de catégorie (/?categorie=3, /?categorie=aucune). Une catégorie inconnue (supprimée,
// lien périmé) ramène à « Toutes » une fois les catégories chargées.
const category = computed({
  get: () => {
    const value = route.query.categorie
    if (value === NO_CATEGORY) return value
    if (typeof value !== 'string' || !/^\d+$/.test(value)) return ''
    if (categoriesLoaded.value && !categories.value.some((c) => String(c.id) === value)) return ''
    return value
  },
  set: (value: string) => {
    const { categorie: _old, ...rest } = route.query // eslint-disable-line @typescript-eslint/no-unused-vars
    router.replace({ query: value ? { ...rest, categorie: value } : rest })
  },
})
const currentCategory = computed(() =>
  categories.value.find((c) => String(c.id) === category.value),
)

const searching = computed(() => searchTerms(query.value).length > 0)
// Le tri ne retire aucune recette : seuls la recherche et les filtres réduisent la liste.
// L'onglet de catégorie est une navigation : « Tout effacer » le garde.
const filtering = computed(() => searching.value || !!time.value || !!cooked.value)
const criteria = computed(() => ({
  query: query.value,
  time: time.value,
  cooked: cooked.value,
  sort: sort.value,
}))
// Recettes de toutes les catégories qui répondent à la recherche et aux filtres :
// sert à compter les recettes de chaque onglet
const allMatching = computed(() => filterRecipes(recipes.value, criteria.value).recipes)
const result = computed(() =>
  filterRecipes(recipes.value, { ...criteria.value, category: category.value }),
)
const filtered = computed(() => result.value.recipes)

// Onglets : Toutes, chaque catégorie, puis « Sans catégorie » s'il y en a
const tabs = computed(() => {
  const count = (key: string) => allMatching.value.filter((r) => matchesCategory(r, key)).length
  const list = [{ key: '', label: 'Toutes', count: allMatching.value.length }]
  for (const c of categories.value) {
    list.push({ key: String(c.id), label: c.name, count: count(String(c.id)) })
  }
  if (recipes.value.some((r) => r.category_id == null)) {
    list.push({ key: NO_CATEGORY, label: 'Sans catégorie', count: count(NO_CATEGORY) })
  }
  return list
})
const showTabs = computed(() => categories.value.length > 0)
// Le sous-titre compte « x sur y » dès que la liste est réduite
const narrowed = computed(() => filtering.value || !!category.value)

// « Nouvelle recette » depuis un onglet : la recette est créée dans cette catégorie
const newRecipeLink = computed(() =>
  currentCategory.value
    ? { name: 'recipe-new', query: { categorie: currentCategory.value.id } }
    : { name: 'recipe-new' },
)

// Flèches gauche / droite entre les onglets (comme un groupe de boutons radio)
const tabButtons = ref<HTMLButtonElement[]>([])
const ARROW_STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
}
function onTabKeydown(event: KeyboardEvent, index: number) {
  const step = ARROW_STEPS[event.key]
  if (!step) return
  event.preventDefault()
  const next = (index + step + tabs.value.length) % tabs.value.length
  category.value = tabs.value[next]?.key ?? ''
  tabButtons.value[next]?.focus()
}

function plural(count: number, word: string) {
  return `${count} ${word}${count > 1 ? 's' : ''}`
}

function clearSearch() {
  query.value = ''
  searchInput.value?.focus()
}

// Efface recherche et filtres (le tri et l'onglet choisis sont gardés). La saisie est vidée par
// la synchronisation avec l'URL : la vider ici relancerait une navigation avec l'ancienne URL.
function clearAll() {
  const kept: LocationQuery = {}
  if (sort.value) kept.tri = sort.value
  if (category.value) kept.categorie = category.value
  router.replace({ query: kept })
  searchInput.value?.focus()
}

// Raccourci « / » pour aller dans la recherche (sauf pendant une saisie ailleurs)
function onKeydown(event: KeyboardEvent) {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target
  if (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable="true"]')
  )
    return
  if (!searchInput.value) return
  event.preventDefault()
  searchInput.value.focus()
}

onMounted(() => {
  store.fetchRecipes()
  // Sans catégories (ou en cas d'erreur), la liste s'affiche simplement sans onglets
  store.fetchCategories().catch(() => {})
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <section class="hero">
    <div>
      <p class="eyebrow">Mon carnet</p>
      <h1 class="page-title">Mes recettes</h1>
      <p class="subtitle">
        <template v-if="!loading && !error && narrowed">
          {{ plural(filtered.length, 'recette') }} sur {{ recipes.length }}.
        </template>
        <template v-else-if="!loading && !error">
          {{ plural(recipes.length, 'recette') }} enregistrée{{ recipes.length > 1 ? 's' : '' }}.
        </template>
        <template v-else>Toutes vos recettes, au même endroit.</template>
      </p>
    </div>
    <RouterLink :to="newRecipeLink" class="btn">
      <AppIcon name="plus" /> Nouvelle recette
    </RouterLink>
  </section>

  <Transition name="fade">
    <div v-if="actionError" class="alert" role="alert">
      <AppIcon name="alert" />
      <span class="alert-text">{{ actionError }}</span>
      <button
        type="button"
        class="alert-close"
        aria-label="Fermer le message"
        @click="store.clearActionError"
      >
        <AppIcon name="x" />
      </button>
    </div>
  </Transition>

  <div v-if="loading" class="skeletons" aria-label="Chargement…">
    <div v-for="n in 3" :key="n" class="skeleton" />
  </div>
  <div v-else-if="error" class="alert" role="alert">
    <AppIcon name="alert" />
    <span class="alert-text">{{ error }}</span>
  </div>
  <template v-else>
    <!-- Onglets de catégorie, dès qu'il existe au moins une catégorie -->
    <div v-if="showTabs" class="categories">
      <div class="tabs" role="radiogroup" aria-label="Catégorie">
        <button
          v-for="(tab, index) in tabs"
          :key="tab.key"
          ref="tabButtons"
          type="button"
          role="radio"
          class="tab"
          :class="{ active: category === tab.key }"
          :aria-checked="category === tab.key"
          :tabindex="category === tab.key ? 0 : -1"
          @click="category = tab.key"
          @keydown="onTabKeydown($event, index)"
        >
          {{ tab.label }} <span class="tab-count">{{ tab.count }}</span>
        </button>
      </div>
      <RouterLink :to="{ name: 'categories' }" class="manage" title="Gérer les catégories">
        <AppIcon name="pencil" /><span class="manage-label">Gérer</span>
      </RouterLink>
    </div>
    <p v-else-if="recipes.length" class="organize">
      <RouterLink :to="{ name: 'categories' }">
        <AppIcon name="folder" /> Classer mes recettes en catégories
      </RouterLink>
    </p>

    <!-- Recherche et filtres, dès qu'il y a au moins une recette (ou des critères dans l'URL) -->
    <div v-if="recipes.length || filtering" class="search" role="search">
      <label for="recipe-search" class="sr-only"
        >Rechercher une recette par titre ou ingrédient</label
      >
      <span class="search-icon" aria-hidden="true"><AppIcon name="search" /></span>
      <input
        id="recipe-search"
        ref="searchInput"
        v-model="query"
        type="search"
        placeholder="Recette ou ingrédient…"
        autocomplete="off"
        spellcheck="false"
        aria-keyshortcuts="/"
        aria-controls="recipe-results"
        @keydown.esc="query ? clearSearch() : searchInput?.blur()"
      />
      <kbd v-if="!query" class="search-key" aria-hidden="true">/</kbd>
      <button
        v-else
        type="button"
        class="search-clear"
        aria-label="Effacer la recherche"
        @click="clearSearch"
      >
        <AppIcon name="x" />
      </button>
    </div>

    <div v-if="recipes.length || filtering" class="filters">
      <label class="filter" :class="{ active: time }">
        <span class="filter-label">Temps total</span>
        <span class="select">
          <select v-model="time">
            <option v-for="o in TIME_FILTERS" :key="o.key" :value="o.key">{{ o.label }}</option>
          </select>
          <AppIcon name="chevronDown" />
        </span>
      </label>
      <label class="filter" :class="{ active: cooked }">
        <span class="filter-label">Dernière fois</span>
        <span class="select">
          <select v-model="cooked">
            <option v-for="o in COOKED_FILTERS" :key="o.key" :value="o.key">{{ o.label }}</option>
          </select>
          <AppIcon name="chevronDown" />
        </span>
      </label>
      <label class="filter" :class="{ active: sort }">
        <span class="filter-label">Trier par</span>
        <span class="select">
          <select v-model="sort">
            <option v-for="o in SORTS" :key="o.key" :value="o.key">{{ o.label }}</option>
          </select>
          <AppIcon name="chevronDown" />
        </span>
      </label>
      <button v-if="filtering" type="button" class="btn-ghost clear-all" @click="clearAll">
        <AppIcon name="x" /> Tout effacer
      </button>
    </div>

    <!-- Résultat annoncé aux lecteurs d'écran à chaque changement -->
    <p class="sr-only" role="status">
      <template v-if="filtering"
        >{{ plural(filtered.length, 'recette') }} trouvée{{
          filtered.length > 1 ? 's' : ''
        }}</template
      >
    </p>

    <div id="recipe-results">
      <div v-if="filtering && !filtered.length" class="no-results card">
        <p v-if="searching && !time && !cooked" class="no-results-title">
          Aucune recette ne correspond à « {{ query.trim() }} ».
        </p>
        <p v-else class="no-results-title">Aucune recette ne correspond à ces critères.</p>
        <p class="no-results-hint">
          Vérifiez l'orthographe, essayez un autre mot ou élargissez les filtres.
        </p>
        <button type="button" class="btn-ghost" @click="clearAll">
          <AppIcon name="x" /> {{ time || cooked ? 'Tout effacer' : 'Effacer la recherche' }}
        </button>
      </div>
      <!-- Onglet vide, sans recherche ni filtre -->
      <div v-else-if="category && !filtered.length" class="no-results card">
        <p class="no-results-title">
          <template v-if="currentCategory"
            >Aucune recette dans « {{ currentCategory.name }} » pour le moment.</template
          >
          <template v-else>Toutes vos recettes ont une catégorie.</template>
        </p>
        <RouterLink v-if="currentCategory" :to="newRecipeLink" class="btn-ghost">
          <AppIcon name="plus" /> Ajouter une recette dans cette catégorie
        </RouterLink>
      </div>
      <RecipeList
        v-else
        :recipes="filtered"
        :ingredient-hits="result.ingredientHits"
        :show-category="!category"
        @remove="store.removeRecipe"
      />
    </div>
  </template>
</template>

<style scoped>
.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.75rem;
}
.hero .btn {
  flex-shrink: 0;
}

/* Onglets de catégorie : passent à la ligne s'ils sont nombreux (aucun n'est caché) */
.categories {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 1.1rem;
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  flex: 1;
  min-width: 0;
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  max-width: 100%;
  padding: 0.45rem 0.95rem;
  font-size: 0.9rem;
  font-weight: 500;
  overflow-wrap: anywhere;
  color: var(--text-muted);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  transition:
    color var(--transition),
    background var(--transition),
    border-color var(--transition);
}
.tab:hover {
  color: var(--text);
  border-color: var(--border-strong);
}
.tab:focus-visible {
  outline: none;
  box-shadow: var(--ring);
}
.tab.active {
  color: var(--accent-contrast);
  background: var(--accent);
  border-color: var(--accent);
}
.tab-count {
  font-size: 0.75rem;
  font-weight: 600;
  opacity: 0.75;
}
.manage {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  padding: 0.45rem 0.7rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  border-radius: 999px;
}
.manage:hover {
  color: var(--text);
  text-decoration: none;
  background: var(--surface-hover);
}
.organize {
  margin: -0.75rem 0 1rem;
  font-size: 0.875rem;
}
.organize a {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--text-muted);
}
.organize a:hover {
  color: var(--accent);
}

/* Recherche */
.search {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 1.25rem;
}
.search input {
  width: 100%;
  padding-left: 2.6rem;
  padding-right: 2.75rem;
}
/* Croix native du champ « search » remplacée par notre bouton */
.search input::-webkit-search-cancel-button {
  appearance: none;
}
.search-icon {
  position: absolute;
  left: 0.9rem;
  display: flex;
  color: var(--text-faint);
  pointer-events: none;
}
.search-key {
  position: absolute;
  right: 0.75rem;
  padding: 0.05rem 0.45rem;
  font-family: inherit;
  font-size: 0.75rem;
  color: var(--text-faint);
  border: 1px solid var(--border);
  border-radius: 6px;
  pointer-events: none;
}
.search-clear {
  position: absolute;
  right: 0.4rem;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  color: var(--text-muted);
  background: none;
  border: none;
  border-radius: var(--radius-sm);
}
.search-clear:hover {
  color: var(--text);
  background: var(--surface-hover);
}
.search-clear:focus-visible {
  outline: none;
  box-shadow: var(--ring);
}
/* Le raccourci « / » n'a pas de sens sans clavier physique */
@media (hover: none) {
  .search-key {
    display: none;
  }
}

/* Filtres et tri */
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
  margin: -0.4rem 0 1.5rem;
}
.filter {
  display: grid;
  gap: 0.3rem;
  min-width: 0;
}
.filter-label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-faint);
}
.select {
  position: relative;
  display: flex;
  align-items: center;
}
.select select {
  width: 100%;
  min-width: 0;
  padding: 0.5rem 2.1rem 0.5rem 0.85rem;
  font: inherit;
  font-size: 0.9rem;
  color: var(--text);
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 999px;
  appearance: none;
  cursor: pointer;
  transition:
    border-color var(--transition),
    box-shadow var(--transition);
}
.select select:hover {
  border-color: var(--border-strong);
}
.select select:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--ring);
}
.select :deep(svg) {
  position: absolute;
  right: 0.75rem;
  color: var(--text-faint);
  pointer-events: none;
}
/* Filtre actif : mis en évidence, comme les périodes de l'historique */
.filter.active .select select {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent);
}
.filter.active .select :deep(svg) {
  color: var(--accent);
}
.clear-all {
  padding: 0.5rem 0.85rem;
  font-size: 0.9rem;
}

.no-results {
  display: grid;
  justify-items: center;
  gap: 0.35rem;
  padding: 2.5rem 1.5rem;
  text-align: center;
  border-style: dashed;
}
.no-results-title {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.no-results-hint {
  margin-bottom: 0.6rem;
  font-size: 0.9rem;
  color: var(--text-muted);
}

/* Chargement */
.skeletons {
  display: grid;
  gap: 0.6rem;
}
.skeleton {
  height: 64px;
  border-radius: var(--radius);
  background: linear-gradient(
    90deg,
    var(--surface) 25%,
    var(--surface-hover) 50%,
    var(--surface) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite linear;
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 560px) {
  .hero {
    flex-direction: column;
    align-items: flex-start;
  }
  /* Un menu par ligne, sur toute la largeur : les libellés longs
     (« Pas faites depuis 1 mois », « Pas faites depuis longtemps ») restent lisibles */
  .filters {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.6rem;
  }
  .clear-all {
    justify-self: start;
  }
  /* « Gérer » réduit à son icône */
  .manage-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}
</style>
