<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRecipesStore } from '@/stores/recipes'
import AppIcon from '@/components/AppIcon.vue'
import CookingLog from '@/components/CookingLog.vue'
import { relativeDay } from '@/utils/dates'
import {
  formatDuration,
  formatQuantity,
  scaleQuantity,
  splitSteps,
  totalTime,
} from '@/utils/recipe'

const props = defineProps({
  id: { type: String, required: true },
})

const store = useRecipesStore()
const router = useRouter()

const recipe = ref(null)
const loading = ref(true)
const loadError = ref(null)
const deleteError = ref(null)
// Historique des repas (bas de page), ouvert aussi par le bouton du haut
const log = ref(null)

// « Cuisinée 3 fois, la dernière il y a 5 jours »
const cookedSummary = computed(() => {
  const count = recipe.value?.cooked_count ?? 0
  if (!count) return 'Pas encore cuisinée'
  const times = count === 1 ? 'une fois' : `${count} fois`
  return `Cuisinée ${times}, la dernière ${relativeDay(recipe.value.last_cooked_on)}`
})

function onCookingsChanged(updated) {
  recipe.value = {
    ...recipe.value,
    cooked_count: updated.cooked_count,
    last_cooked_on: updated.last_cooked_on,
  }
}

// Portions choisies pour adapter les quantités (si la recette indique ses portions)
const servings = ref(null)
// Cases cochées pendant la préparation (non enregistrées)
const doneIngredients = ref(new Set())
const doneSteps = ref(new Set())

const steps = computed(() => splitSteps(recipe.value?.steps))
const times = computed(() => {
  if (!recipe.value) return []
  const list = [
    ['Préparation', recipe.value.prep_time_minutes],
    ['Cuisson', recipe.value.cook_time_minutes],
  ].filter(([, minutes]) => minutes != null)
  // Le total n'apporte rien si un seul temps est renseigné
  if (list.length === 2) list.push(['Total', totalTime(recipe.value)])
  return list.map(([label, minutes]) => ({ label, value: formatDuration(minutes) }))
})
const scaled = computed(() => servings.value !== recipe.value?.servings)

function quantityOf(ingredient) {
  return formatQuantity(scaleQuantity(ingredient.quantity, recipe.value.servings, servings.value))
}

// Coche ou décoche l'élément index (le Set est remplacé pour que Vue voie le changement)
function toggled(set, index) {
  const next = new Set(set)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  return next
}

function toggleIngredient(index) {
  doneIngredients.value = toggled(doneIngredients.value, index)
}

function toggleStep(index) {
  doneSteps.value = toggled(doneSteps.value, index)
}

function changeServings(delta) {
  servings.value = Math.min(100, Math.max(1, servings.value + delta))
}

async function load() {
  try {
    recipe.value = await store.fetchRecipe(Number(props.id))
    servings.value = recipe.value.servings
  } catch (e) {
    loadError.value = e.message
  } finally {
    loading.value = false
  }
}

async function remove() {
  if (
    !window.confirm(`Supprimer la recette « ${recipe.value.title} » ? Cette action est définitive.`)
  )
    return
  deleteError.value = null
  if (await store.removeRecipe(recipe.value.id)) router.push({ name: 'home' })
  else deleteError.value = store.actionError
}

onMounted(load)
</script>

<template>
  <RouterLink to="/" class="back"><AppIcon name="arrowLeft" /> Mes recettes</RouterLink>

  <div v-if="loading" class="skeleton" aria-label="Chargement…" />

  <div v-else-if="loadError" class="alert" role="alert">
    <AppIcon name="alert" />
    <span class="alert-text">{{ loadError }}</span>
  </div>

  <article v-else class="recipe">
    <header class="hero">
      <div class="heading">
        <p class="eyebrow">
          <RouterLink
            v-if="recipe.category"
            :to="{ name: 'home', query: { categorie: recipe.category.id } }"
            class="category-link"
            >{{ recipe.category.name }}</RouterLink
          >
          <template v-else>Recette</template>
        </p>
        <h1 class="page-title">{{ recipe.title }}</h1>
        <p v-if="recipe.description" class="description">{{ recipe.description }}</p>
        <p class="cooked" aria-live="polite"><AppIcon name="history" /> {{ cookedSummary }}</p>
      </div>
      <div class="actions">
        <button type="button" class="btn" @click="log.open()">
          <AppIcon name="check" /> Je l'ai cuisinée
        </button>
        <RouterLink :to="{ name: 'recipe-edit', params: { id: recipe.id } }" class="btn-ghost">
          <AppIcon name="pencil" /> Modifier
        </RouterLink>
        <button type="button" class="btn-danger" @click="remove">
          <AppIcon name="trash" /> Supprimer
        </button>
      </div>
    </header>

    <div v-if="deleteError" class="alert" role="alert">
      <AppIcon name="alert" />
      <span class="alert-text">{{ deleteError }}</span>
    </div>

    <dl v-if="times.length || recipe.servings" class="facts">
      <div v-if="recipe.servings" class="fact">
        <dt><AppIcon name="users" /> Portions</dt>
        <dd class="servings">
          <button
            type="button"
            class="step-btn"
            aria-label="Une portion de moins"
            :disabled="servings <= 1"
            @click="changeServings(-1)"
          >
            −
          </button>
          <output aria-live="polite" aria-label="Nombre de portions">{{ servings }}</output>
          <button
            type="button"
            class="step-btn"
            aria-label="Une portion de plus"
            :disabled="servings >= 100"
            @click="changeServings(1)"
          >
            +
          </button>
        </dd>
      </div>
      <div v-for="time in times" :key="time.label" class="fact">
        <dt><AppIcon :name="time.label === 'Cuisson' ? 'flame' : 'clock'" /> {{ time.label }}</dt>
        <dd>{{ time.value }}</dd>
      </div>
    </dl>

    <div class="columns">
      <section class="panel card" aria-labelledby="ingredients-title">
        <h2 id="ingredients-title">Ingrédients</h2>
        <p v-if="scaled" class="note">
          Quantités adaptées pour {{ servings }} portion{{ servings > 1 ? 's' : '' }} (recette
          prévue pour {{ recipe.servings }}).
          <button type="button" class="link" @click="servings = recipe.servings">
            Revenir à {{ recipe.servings }}
          </button>
        </p>
        <ul v-if="recipe.ingredients.length" class="ingredients">
          <li v-for="(ingredient, index) in recipe.ingredients" :key="index">
            <label :class="{ done: doneIngredients.has(index) }">
              <input
                type="checkbox"
                :checked="doneIngredients.has(index)"
                @change="toggleIngredient(index)"
              />
              <!-- Une seule ligne de texte, espaces explicites ({{ ' ' }}) : sans eux,
                   le texte lu serait « 250gFarine » -->
              <span class="ingredient-text"
                ><span v-if="ingredient.quantity != null || ingredient.unit" class="amount"
                  ><strong v-if="ingredient.quantity != null">{{ quantityOf(ingredient) }}</strong
                  >{{ ingredient.quantity != null && ingredient.unit ? ' ' : ''
                  }}{{ ingredient.unit }}</span
                >{{ ingredient.quantity != null || ingredient.unit ? ' ' : ''
                }}<span class="ingredient-name">{{ ingredient.name }}</span></span
              >
            </label>
          </li>
        </ul>
        <p v-else class="empty">Aucun ingrédient renseigné.</p>
      </section>

      <section class="panel card" aria-labelledby="steps-title">
        <h2 id="steps-title">Préparation</h2>
        <ol v-if="steps.length" class="steps">
          <li v-for="(step, index) in steps" :key="index">
            <button
              type="button"
              class="step"
              :class="{ done: doneSteps.has(index) }"
              :aria-pressed="doneSteps.has(index)"
              @click="toggleStep(index)"
            >
              <span class="number" aria-hidden="true">
                <AppIcon v-if="doneSteps.has(index)" name="check" />
                <template v-else>{{ index + 1 }}</template>
              </span>
              <span class="step-text">{{ step }}</span>
            </button>
          </li>
        </ol>
        <p v-else class="empty">Aucune étape renseignée.</p>
        <p v-if="steps.length" class="hint">Touchez une étape pour la marquer comme faite.</p>
      </section>
    </div>

    <CookingLog ref="log" :recipe-id="recipe.id" @changed="onCookingsChanged" />
  </article>
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
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.heading {
  min-width: 0;
}
.category-link {
  color: inherit;
}
.category-link:hover {
  text-decoration: underline;
}
.page-title {
  overflow-wrap: anywhere;
}
.description {
  margin-top: 0.6rem;
  color: var(--text-muted);
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.cooked {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.6rem;
  font-size: 0.9rem;
  color: var(--text-faint);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.4rem;
  flex-shrink: 0;
}

/* Portions et temps */
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin: 0 0 1.5rem;
}
.fact {
  display: grid;
  gap: 0.25rem;
  min-width: 7.5rem;
  padding: 0.65rem 0.9rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.fact dt {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.fact dd {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
}
.servings {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.servings output {
  min-width: 1.6rem;
  text-align: center;
}
.step-btn {
  display: grid;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  font-size: 1.1rem;
  line-height: 1;
  color: var(--text);
  background: var(--surface-hover);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.step-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

/* Ingrédients à gauche, étapes à droite (l'une sous l'autre sur mobile) */
.columns {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  gap: 1rem;
  align-items: start;
}
.panel {
  display: grid;
  gap: 0.8rem;
  padding: 1.25rem 1.4rem;
}
h2 {
  font-size: 1.15rem;
  font-weight: 700;
}
.note {
  font-size: 0.85rem;
  color: var(--info-text);
}
.link {
  padding: 0;
  color: var(--accent);
  text-decoration: underline;
  background: none;
  border: 0;
}
.ingredients,
.steps {
  display: grid;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.ingredients label {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  padding: 0.4rem 0.2rem;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}
.ingredients li:last-child label {
  border-bottom: 0;
}
.ingredients input {
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
  padding: 0;
  accent-color: var(--accent);
  transform: translateY(2px);
}
.ingredient-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
.amount {
  color: var(--text-muted);
}
.amount strong {
  color: var(--text);
}
.done .amount,
.done .amount strong,
.done .ingredient-name,
.step.done .step-text {
  color: var(--text-faint);
  text-decoration: line-through;
}
.step {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  width: 100%;
  padding: 0.6rem 0.5rem;
  font: inherit;
  line-height: 1.55;
  color: var(--text);
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
}
.step:hover {
  background: var(--surface-hover);
}
.number {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 1.75rem;
  height: 1.75rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--accent-contrast);
  background: var(--accent);
  border-radius: 999px;
}
.step.done .number {
  background: var(--success);
}
.step-text {
  min-width: 0;
  padding-top: 0.1rem;
  overflow-wrap: anywhere;
}
.empty,
.hint {
  font-size: 0.875rem;
  color: var(--text-faint);
}
.skeleton {
  height: 420px;
  border-radius: var(--radius-lg);
  background: var(--surface);
}

@media (max-width: 720px) {
  .columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 560px) {
  .hero {
    flex-direction: column;
  }
  /* Sous le titre : boutons alignés à gauche, « Je l'ai cuisinée » sur toute la largeur */
  .actions {
    justify-content: flex-start;
  }
  .actions .btn {
    flex-basis: 100%;
  }
  .panel {
    padding: 1.1rem;
  }
}
</style>
