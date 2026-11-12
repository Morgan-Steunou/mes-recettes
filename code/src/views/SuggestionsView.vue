<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useRecipesStore } from '@/stores/recipes'
import { STAPLES, addIngredients, knownIngredients, suggestRecipes } from '@/utils/suggest'
import AppIcon from '@/components/AppIcon.vue'

const store = useRecipesStore()
const { recipes, loading, error } = storeToRefs(store)
const route = useRoute()
const router = useRouter()

// Ingrédients disponibles et option « ingrédients de base », gardés dans l'URL
// (/que-cuisiner?avec=Poulet,Riz&basiques=non) : on peut recharger ou revenir d'une fiche
const fromRoute = () =>
  typeof route.query.avec === 'string' ? addIngredients([], route.query.avec) : []
const available = ref(fromRoute())
const staples = computed({
  get: () => route.query.basiques !== 'non',
  set: (value) => updateQuery({ basiques: value ? undefined : 'non' }),
})

function updateQuery(changes) {
  const query = { ...route.query, ...changes }
  for (const key of Object.keys(query)) if (query[key] === undefined) delete query[key]
  router.replace({ query })
}
watch(available, (list) => updateQuery({ avec: list.length ? list.join(',') : undefined }))
// Retour arrière ou lien vers la page : la liste suit l'URL
watch(
  () => route.query.avec,
  () => {
    const list = fromRoute()
    if (list.join(',') !== available.value.join(',')) available.value = list
  },
)

const input = ref(null)
const draft = ref('')

function add(text = draft.value) {
  const next = addIngredients(available.value, text)
  if (next.length !== available.value.length) available.value = next
  draft.value = ''
}

function remove(name) {
  available.value = available.value.filter((n) => n !== name)
  input.value?.focus()
}

function clearAll() {
  available.value = []
  input.value?.focus()
}

// Choix d'une proposition de la liste : ajouté tout de suite
function onInput(event) {
  if (event.inputType === 'insertReplacementText' || event.inputType === undefined) {
    if (known.value.includes(draft.value)) add()
  }
}

// Retour arrière dans un champ vide : retire le dernier ingrédient
function onBackspace() {
  if (!draft.value && available.value.length) remove(available.value.at(-1))
}

// Propositions : ingrédients des recettes, sauf ceux déjà ajoutés
const known = computed(() =>
  knownIngredients(recipes.value).filter(
    (name) => addIngredients(available.value, name).length > available.value.length,
  ),
)

const results = computed(() =>
  suggestRecipes(recipes.value, available.value, { staples: staples.value }),
)
// Deux groupes : rien ne manque / il manque quelque chose (groupes vides non affichés)
const groups = computed(() =>
  [
    {
      key: 'ready',
      title: 'Prêtes à cuisiner',
      items: results.value.filter((r) => !r.missing.length),
    },
    {
      key: 'almost',
      title: 'Il manque quelques ingrédients',
      items: results.value.filter((r) => r.missing.length),
    },
  ].filter((g) => g.items.length),
)
const withoutIngredients = computed(
  () => recipes.value.filter((r) => !r.ingredients?.length).length,
)

function plural(count, word) {
  return `${count} ${word}${count > 1 ? 's' : ''}`
}

function total(result) {
  return result.have.length + result.missing.length
}

function detailLink(recipe) {
  return { name: 'recipe-detail', params: { id: recipe.id } }
}

onMounted(store.fetchRecipes)
</script>

<template>
  <section class="hero">
    <p class="eyebrow">Que cuisiner ?</p>
    <h1 class="page-title">Avec ce que j'ai</h1>
    <p class="subtitle">
      Indiquez les ingrédients que vous avez sous la main : vos recettes sont classées de la plus
      complète à celle où il en manque le plus.
    </p>
  </section>

  <div v-if="loading" class="skeletons" aria-label="Chargement…">
    <div v-for="n in 2" :key="n" class="skeleton" />
  </div>
  <div v-else-if="error" class="alert" role="alert">
    <AppIcon name="alert" />
    <span class="alert-text">{{ error }}</span>
  </div>

  <div v-else-if="!recipes.length" class="empty card">
    <span class="empty-icon" aria-hidden="true"><AppIcon name="basket" /></span>
    <p class="empty-title">Aucune recette pour le moment.</p>
    <p class="empty-hint">Ajoutez des recettes avec leurs ingrédients pour recevoir des idées.</p>
    <RouterLink :to="{ name: 'recipe-new' }" class="btn">
      <AppIcon name="plus" /> Nouvelle recette
    </RouterLink>
  </div>

  <template v-else>
    <!-- Saisie des ingrédients disponibles -->
    <form class="pantry card" @submit.prevent="add()">
      <label for="pantry-input" class="pantry-label">Mes ingrédients</label>
      <div class="field" @click="input?.focus()">
        <ul v-if="available.length" class="chips" aria-label="Ingrédients disponibles">
          <li v-for="name in available" :key="name" class="chip">
            {{ name }}
            <button
              type="button"
              class="chip-remove"
              :aria-label="`Retirer ${name}`"
              @click.stop="remove(name)"
            >
              <AppIcon name="x" />
            </button>
          </li>
        </ul>
        <input
          id="pantry-input"
          ref="input"
          v-model="draft"
          type="text"
          list="known-ingredients"
          :placeholder="available.length ? 'Ajouter…' : 'Ex. : poulet, riz, oignon'"
          autocomplete="off"
          spellcheck="false"
          @input="onInput"
          @keydown.backspace="onBackspace"
        />
        <datalist id="known-ingredients">
          <option v-for="name in known" :key="name" :value="name" />
        </datalist>
      </div>
      <div class="pantry-actions">
        <button type="submit" class="btn" :disabled="!draft.trim()">
          <AppIcon name="plus" /> Ajouter
        </button>
        <button v-if="available.length" type="button" class="btn-ghost" @click="clearAll">
          <AppIcon name="x" /> Tout retirer
        </button>
        <label class="staples">
          <input v-model="staples" type="checkbox" />
          <span>{{ STAPLES.join(', ').toLowerCase() }} toujours disponibles</span>
        </label>
      </div>
    </form>

    <p class="sr-only" role="status">
      <template v-if="available.length">
        {{ plural(results.length, 'recette') }} trouvée{{ results.length > 1 ? 's' : '' }}
      </template>
    </p>

    <div v-if="!available.length" class="hint">
      <AppIcon name="info" />
      <span>
        Ajoutez un ou plusieurs ingrédients (séparés par des virgules, ou avec Entrée).
        <template v-if="withoutIngredients === 1">
          1 recette sans ingrédients n'est pas prise en compte.
        </template>
        <template v-else-if="withoutIngredients > 1">
          {{ withoutIngredients }} recettes sans ingrédients ne sont pas prises en compte.
        </template>
      </span>
    </div>

    <div v-else-if="!results.length" class="empty card">
      <p class="empty-title">Aucune recette n'utilise ces ingrédients.</p>
      <p class="empty-hint">Essayez un autre nom (« tomate » plutôt que « tomates cerises »).</p>
    </div>

    <template v-else>
      <section v-for="group in groups" :key="group.key" :aria-labelledby="`group-${group.key}`">
        <h2 :id="`group-${group.key}`" class="group-title">
          {{ group.title }} <span class="count">{{ group.items.length }}</span>
        </h2>
        <ul class="results">
          <li v-for="r in group.items" :key="r.recipe.id" class="result card">
            <div class="result-head">
              <RouterLink :to="detailLink(r.recipe)" class="title">{{ r.recipe.title }}</RouterLink>
              <span class="score" :class="{ complete: !r.missing.length }">
                {{ r.have.length }}/{{ total(r) }}
              </span>
            </div>
            <div
              class="meter"
              role="img"
              :aria-label="`${r.have.length} ingrédients disponibles sur ${total(r)}`"
            >
              <span :style="{ width: `${(100 * r.have.length) / total(r)}%` }" />
            </div>
            <p class="line have">
              <AppIcon name="check" />
              <span><strong>Vous avez :</strong> {{ r.have.join(', ') }}</span>
            </p>
            <p v-if="r.missing.length" class="line missing">
              <AppIcon name="basket" />
              <span><strong>Il manque :</strong> {{ r.missing.join(', ') }}</span>
            </p>
            <p v-if="r.staples.length" class="line base">
              Ingrédients de base : {{ r.staples.join(', ') }}
            </p>
          </li>
        </ul>
      </section>
    </template>
  </template>
</template>

<style scoped>
.hero {
  margin-bottom: 1.5rem;
}
.subtitle {
  max-width: 60ch;
}

/* Saisie */
.pantry {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  margin-bottom: 1.5rem;
}
.pantry-label {
  font-weight: 600;
}
.field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.5rem;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: text;
  transition:
    border-color var(--transition),
    box-shadow var(--transition);
}
.field:focus-within {
  border-color: var(--accent);
  box-shadow: var(--ring);
}
.field input {
  flex: 1;
  min-width: 8rem;
  padding: 0.3rem 0.4rem;
  background: none;
  border: none;
  box-shadow: none;
}
.chips {
  display: contents;
  margin: 0;
  padding: 0;
  list-style: none;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.25rem 0.25rem 0.25rem 0.7rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 999px;
}
.chip-remove {
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  color: inherit;
  background: none;
  border: none;
  border-radius: 999px;
}
.chip-remove:hover {
  background: var(--surface-hover);
}
.chip-remove:focus-visible {
  outline: none;
  box-shadow: var(--ring);
}
.pantry-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}
.staples {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  margin-left: auto;
  font-size: 0.875rem;
  color: var(--text-muted);
  cursor: pointer;
}
.staples input {
  width: 1rem;
  height: 1rem;
  accent-color: var(--accent);
}

.hint {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: var(--text-muted);
}

/* Résultats */
.group-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.75rem;
  font-size: 1.2rem;
}
.count {
  padding: 0.05rem 0.55rem;
  font-family: var(--font-body, inherit);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--surface-hover);
  border-radius: 999px;
}
.results {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
  gap: 0.9rem;
  margin: 0 0 1.75rem;
  padding: 0;
  list-style: none;
}
.result {
  display: grid;
  gap: 0.55rem;
  align-content: start;
  padding: 1rem;
}
.result-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}
.title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text);
  overflow-wrap: anywhere;
}
.title:hover {
  color: var(--accent);
  text-decoration: none;
}
.score {
  flex-shrink: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
}
.score.complete {
  color: var(--accent);
}
.meter {
  height: 6px;
  overflow: hidden;
  background: var(--surface-hover);
  border-radius: 999px;
}
.meter span {
  display: block;
  height: 100%;
  background: var(--accent);
  border-radius: inherit;
}
.line {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  font-size: 0.875rem;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}
.line strong {
  font-weight: 600;
  color: var(--text);
}
.line :deep(svg) {
  flex-shrink: 0;
  margin-top: 0.15rem;
}
.have :deep(svg) {
  color: var(--accent);
}
.base {
  font-size: 0.8rem;
  color: var(--text-faint);
}

/* États vides et chargement (comme l'historique) */
.empty {
  display: grid;
  justify-items: center;
  gap: 0.35rem;
  padding: 2.5rem 1.5rem;
  text-align: center;
  border-style: dashed;
}
.empty-icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin-bottom: 0.6rem;
  font-size: 1.5rem;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 16px;
}
.empty-title {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 600;
}
.empty-hint {
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  color: var(--text-muted);
}
.skeletons {
  display: grid;
  gap: 0.6rem;
}
.skeleton {
  height: 96px;
  border-radius: var(--radius-lg);
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

@media (max-width: 560px) {
  .staples {
    margin-left: 0;
    flex-basis: 100%;
  }
}
</style>
