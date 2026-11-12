<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useRecipesStore } from '@/stores/recipes'
import { matchesTitle, searchTerms } from '@/utils/search'
import AppIcon from '@/components/AppIcon.vue'
import RecipeList from '@/components/RecipeList.vue'

const store = useRecipesStore()
const { recipes, loading, error, actionError } = storeToRefs(store)
const route = useRoute()
const router = useRouter()

// Recherche par titre, gardée dans l'URL (/?q=tarte) : elle survit au rechargement
// et au retour depuis une fiche recette
const searchInput = ref(null)
const queryFromRoute = () => (typeof route.query.q === 'string' ? route.query.q : '')
// Saisie locale, recopiée dans l'URL (et relue si l'URL change : retour arrière, lien d'en-tête)
const query = ref(queryFromRoute())
watch(query, (value) => {
  if (value === queryFromRoute()) return
  const { q, ...rest } = route.query // eslint-disable-line no-unused-vars
  router.replace({ query: value.trim() ? { ...rest, q: value } : rest })
})
watch(queryFromRoute, (value) => {
  if (value !== query.value) query.value = value
})
const terms = computed(() => searchTerms(query.value))
const searching = computed(() => terms.value.length > 0)
const filtered = computed(() => recipes.value.filter((r) => matchesTitle(r, terms.value)))

function plural(count, word) {
  return `${count} ${word}${count > 1 ? 's' : ''}`
}

function clearSearch() {
  query.value = ''
  searchInput.value?.focus()
}

// Raccourci « / » pour aller dans la recherche (sauf pendant une saisie ailleurs)
function onKeydown(event) {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target
  if (target.closest?.('input, textarea, select, [contenteditable="true"]')) return
  if (!searchInput.value) return
  event.preventDefault()
  searchInput.value.focus()
}

onMounted(() => {
  store.fetchRecipes()
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
        <template v-if="!loading && !error && searching">
          {{ plural(filtered.length, 'recette') }} sur {{ recipes.length }}.
        </template>
        <template v-else-if="!loading && !error">
          {{ plural(recipes.length, 'recette') }} enregistrée{{ recipes.length > 1 ? 's' : '' }}.
        </template>
        <template v-else>Toutes vos recettes, au même endroit.</template>
      </p>
    </div>
    <RouterLink :to="{ name: 'recipe-new' }" class="btn">
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
    <!-- Barre de recherche, dès qu'il y a au moins une recette (ou une recherche dans l'URL) -->
    <div v-if="recipes.length || searching" class="search" role="search">
      <label for="recipe-search" class="sr-only">Rechercher une recette par son titre</label>
      <span class="search-icon" aria-hidden="true"><AppIcon name="search" /></span>
      <input
        id="recipe-search"
        ref="searchInput"
        v-model="query"
        type="search"
        placeholder="Rechercher par titre…"
        autocomplete="off"
        spellcheck="false"
        aria-keyshortcuts="/"
        aria-controls="recipe-results"
        @keydown.esc="query ? clearSearch() : searchInput.blur()"
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

    <!-- Résultat annoncé aux lecteurs d'écran à chaque frappe -->
    <p class="sr-only" role="status">
      <template v-if="searching"
        >{{ plural(filtered.length, 'recette') }} trouvée{{
          filtered.length > 1 ? 's' : ''
        }}</template
      >
    </p>

    <div id="recipe-results">
      <div v-if="searching && !filtered.length" class="no-results card">
        <p class="no-results-title">Aucune recette ne correspond à « {{ query.trim() }} ».</p>
        <p class="no-results-hint">Vérifiez l'orthographe ou essayez un autre mot du titre.</p>
        <button type="button" class="btn-ghost" @click="clearSearch">
          <AppIcon name="x" /> Effacer la recherche
        </button>
      </div>
      <RecipeList v-else :recipes="filtered" @remove="store.removeRecipe" />
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
}
</style>
