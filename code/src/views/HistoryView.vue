<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRecipesStore } from '@/stores/recipes'
import AppIcon from '@/components/AppIcon.vue'
import { PERIODS, formatMonth, parseDay, periodRange, relativeDay } from '@/utils/dates'
import { errorText } from '@/services/api'
import type { HistoryEntry } from '@/types/api'

const PAGE_SIZE = 50
const STARS = [1, 2, 3, 4, 5]

const store = useRecipesStore()
const route = useRoute()
const router = useRouter()

// Période choisie, gardée dans l'adresse (?periode=30j) : conservée au rechargement
const period = computed(() => {
  const value = route.query.periode
  return PERIODS.find((p) => p.key === value)?.key ?? 'tout'
})

const items = ref<HistoryEntry[]>([])
const total = ref(0)
const recipeCount = ref(0)
const loading = ref(true)
const loadingMore = ref(false)
const error = ref<string | null>(null)

const hasMore = computed(() => items.value.length < total.value)

// Repas regroupés par mois : [{ month: 'novembre 2026', items: [...] }]
const months = computed(() => {
  const groups: { month: string; items: HistoryEntry[] }[] = []
  for (const item of items.value) {
    const month = formatMonth(item.cooked_on)
    const last = groups.at(-1)
    if (last?.month === month) last.items.push(item)
    else groups.push({ month, items: [item] })
  }
  return groups
})

const summary = computed(() => {
  const meals = `${total.value} repas`
  const recipes = `${recipeCount.value} recette${recipeCount.value > 1 ? 's' : ''} différente${recipeCount.value > 1 ? 's' : ''}`
  return `${meals}, ${recipes}`
})

const dayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' })
function dayLabel(iso: string) {
  return dayFormat.format(parseDay(iso))
}

async function load({ more = false }: { more?: boolean } = {}) {
  error.value = null
  if (more) loadingMore.value = true
  else loading.value = true
  try {
    const page = await store.fetchHistory({
      ...periodRange(period.value),
      limit: PAGE_SIZE,
      offset: more ? items.value.length : 0,
    })
    items.value = more ? [...items.value, ...page.items] : page.items
    total.value = page.total
    recipeCount.value = page.recipe_count
  } catch (e) {
    error.value = errorText(e)
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function choose(key: string) {
  router.replace({ query: key === 'tout' ? {} : { periode: key } })
}

watch(period, () => load(), { immediate: true })
</script>

<template>
  <section class="hero">
    <div>
      <p class="eyebrow">Mon carnet</p>
      <h1 class="page-title">Historique</h1>
      <p class="subtitle">
        <template v-if="loading">Les repas que vous avez cuisinés.</template>
        <template v-else-if="!error">{{ summary }}.</template>
      </p>
    </div>
  </section>

  <div class="periods" role="radiogroup" aria-label="Période">
    <button
      v-for="p in PERIODS"
      :key="p.key"
      type="button"
      role="radio"
      class="period"
      :class="{ active: period === p.key }"
      :aria-checked="period === p.key"
      @click="choose(p.key)"
    >
      {{ p.label }}
    </button>
  </div>

  <div v-if="loading" class="skeletons" aria-label="Chargement…">
    <div v-for="n in 3" :key="n" class="skeleton" />
  </div>

  <div v-else-if="error" class="alert" role="alert">
    <AppIcon name="alert" />
    <span class="alert-text">{{ error }}</span>
  </div>

  <div v-else-if="!items.length" class="empty card">
    <span class="empty-icon" aria-hidden="true"><AppIcon name="history" /></span>
    <template v-if="period === 'tout'">
      <p class="empty-title">Aucun repas enregistré pour le moment.</p>
      <p class="empty-hint">
        Ouvrez une recette et touchez « Je l'ai cuisinée » après l'avoir préparée.
      </p>
      <RouterLink to="/" class="btn"><AppIcon name="arrowLeft" /> Mes recettes</RouterLink>
    </template>
    <template v-else>
      <p class="empty-title">Aucun repas sur cette période.</p>
      <button type="button" class="btn-ghost" @click="choose('tout')">
        Voir tout l'historique
      </button>
    </template>
  </div>

  <div v-else class="timeline">
    <section v-for="group in months" :key="group.month" :aria-label="group.month">
      <h2 class="month">{{ group.month }}</h2>
      <ol class="meals">
        <li v-for="meal in group.items" :key="meal.id" class="meal card">
          <div class="day" :title="relativeDay(meal.cooked_on)">
            {{ dayLabel(meal.cooked_on) }}
          </div>
          <div class="body">
            <RouterLink
              :to="{ name: 'recipe-detail', params: { id: meal.recipe_id } }"
              class="recipe-title"
              >{{ meal.recipe_title }}</RouterLink
            >
            <span class="ago">{{ relativeDay(meal.cooked_on) }}</span>
            <span
              v-if="meal.rating"
              class="stars"
              role="img"
              :aria-label="`Note : ${meal.rating} sur 5`"
            >
              <span v-for="star in STARS" :key="star" :class="{ on: star <= meal.rating }">★</span>
            </span>
            <p v-if="meal.comment" class="comment">{{ meal.comment }}</p>
          </div>
          <RouterLink
            :to="{ name: 'recipe-detail', params: { id: meal.recipe_id } }"
            class="btn-ghost redo"
            :aria-label="`Refaire : ${meal.recipe_title}`"
          >
            <AppIcon name="chefHat" /><span class="redo-label">Refaire</span>
          </RouterLink>
        </li>
      </ol>
    </section>

    <button
      v-if="hasMore"
      type="button"
      class="btn-ghost more"
      :disabled="loadingMore"
      @click="load({ more: true })"
    >
      {{ loadingMore ? 'Chargement…' : `Voir les repas plus anciens (${total - items.length})` }}
    </button>
  </div>
</template>

<style scoped>
.hero {
  margin-bottom: 1.25rem;
}

/* Choix de la période */
.periods {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 1.75rem;
}
.period {
  padding: 0.45rem 0.95rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  transition:
    color var(--transition),
    background var(--transition),
    border-color var(--transition);
}
.period:hover {
  color: var(--text);
  border-color: var(--border-strong);
}
.period.active {
  color: var(--accent-contrast);
  background: var(--accent);
  border-color: var(--accent);
}

/* Chronologie, mois par mois */
.timeline {
  display: grid;
  gap: 1.75rem;
  max-width: 820px;
}
.month {
  margin-bottom: 0.75rem;
  font-size: 1.3rem;
}
.month::first-letter {
  text-transform: uppercase;
}
.meals {
  display: grid;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.meal {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: start;
  padding: 0.9rem 1rem;
  border-radius: var(--radius);
}
.day {
  padding-top: 0.1rem;
  white-space: nowrap;
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--accent);
}
.day::first-letter {
  text-transform: uppercase;
}
.body {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}
.recipe-title {
  font-weight: 600;
  color: var(--text);
  overflow-wrap: anywhere;
}
.recipe-title:hover {
  color: var(--accent);
  text-decoration: none;
}
.ago {
  font-size: 0.8rem;
  color: var(--text-faint);
}
.stars {
  font-size: 1rem;
  letter-spacing: 0.05em;
  color: var(--border-strong);
}
.stars .on {
  color: var(--accent);
}
.comment {
  margin-top: 0.15rem;
  color: var(--text-muted);
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.redo:hover {
  text-decoration: none;
}
.more {
  justify-self: center;
}
.more:disabled {
  opacity: 0.6;
}

/* États vide et chargement */
.empty {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  max-width: 820px;
  padding: 3rem 1.5rem;
  text-align: center;
  border-style: dashed;
}
.empty-icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin-bottom: 0.4rem;
  font-size: 1.5rem;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 16px;
}
.empty-title {
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 600;
}
.empty-hint {
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  color: var(--text-muted);
}
.empty .btn:hover {
  text-decoration: none;
}
.skeletons {
  display: grid;
  gap: 0.6rem;
  max-width: 820px;
}
.skeleton {
  height: 76px;
  border-radius: var(--radius);
  background: var(--surface);
}

@media (max-width: 560px) {
  .meal {
    grid-template-columns: 4.1rem minmax(0, 1fr) auto;
    gap: 0.75rem;
    padding: 0.8rem;
  }
  /* « Refaire » réduit à son icône (le nom reste lu par les lecteurs d'écran) */
  .redo {
    padding: 0.5rem;
  }
  .redo-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}
</style>
