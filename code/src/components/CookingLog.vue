<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRecipesStore } from '@/stores/recipes'
import AppIcon from '@/components/AppIcon.vue'
import { formatDayLong, relativeDay, todayISO } from '@/utils/dates'
import { errorText } from '@/services/api'
import type { Cooking, Recipe } from '@/types/api'

// Historique des repas d'une recette : « je l'ai cuisinée », avec date, note et commentaire
const props = defineProps<{ recipeId: number }>()
// Émis après un ajout ou une suppression, avec la recette à jour (cooked_count, last_cooked_on)
const emit = defineEmits<{ changed: [recipe: Recipe] }>()

const store = useRecipesStore()

const cookings = ref<Cooking[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const actionError = ref<string | null>(null)

// Formulaire d'ajout
const formOpen = ref(false)
const saving = ref(false)
const cookedOn = ref(todayISO())
const rating = ref<number | null>(null)
const comment = ref('')
const dateInput = ref<HTMLInputElement | null>(null)
const section = ref<HTMLElement | null>(null)

const today = computed(() => todayISO())
const STARS = [1, 2, 3, 4, 5]

async function load() {
  try {
    cookings.value = await store.fetchCookings(props.recipeId)
  } catch (e) {
    loadError.value = errorText(e)
  } finally {
    loading.value = false
  }
}

// Ouvre le formulaire (aussi appelé par la fiche, depuis le bouton du haut)
async function open() {
  actionError.value = null
  cookedOn.value = todayISO()
  rating.value = null
  comment.value = ''
  formOpen.value = true
  await nextTick()
  section.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  dateInput.value?.focus({ preventScroll: true })
}

function close() {
  formOpen.value = false
}

// Un clic sur l'étoile déjà choisie retire la note
function chooseRating(value: number, event: Event) {
  if (rating.value === value) {
    event.preventDefault()
    rating.value = null
  }
}

async function submit() {
  actionError.value = null
  saving.value = true
  try {
    const { cooking, recipe } = await store.addCooking(props.recipeId, {
      cooked_on: cookedOn.value || null,
      rating: rating.value,
      comment: comment.value.trim() || null,
    })
    // Inséré à sa place (du plus récent au plus ancien), sans tout recharger
    cookings.value = [...cookings.value, cooking].sort(
      (a, b) => b.cooked_on.localeCompare(a.cooked_on) || b.id - a.id,
    )
    formOpen.value = false
    emit('changed', recipe)
  } catch (e) {
    actionError.value = `Impossible d'enregistrer le repas : ${errorText(e)}`
  } finally {
    saving.value = false
  }
}

async function remove(cooking: Cooking) {
  if (!window.confirm(`Retirer le repas du ${formatDayLong(cooking.cooked_on)} de l'historique ?`))
    return
  actionError.value = null
  try {
    const recipe = await store.deleteCooking(props.recipeId, cooking.id)
    cookings.value = cookings.value.filter((c) => c.id !== cooking.id)
    emit('changed', recipe)
  } catch (e) {
    actionError.value = `Impossible de retirer le repas : ${errorText(e)}`
  }
}

function ratingLabel(value: number) {
  return `Note : ${value} sur 5`
}

defineExpose({ open })
onMounted(load)
</script>

<template>
  <section ref="section" class="log card" aria-labelledby="log-title">
    <div class="head">
      <h2 id="log-title">Historique</h2>
      <button v-if="!formOpen" type="button" class="btn-ghost" @click="open">
        <AppIcon name="check" /> Je l'ai cuisinée
      </button>
    </div>

    <div v-if="actionError" class="alert" role="alert">
      <AppIcon name="alert" />
      <span class="alert-text">{{ actionError }}</span>
    </div>

    <form v-if="formOpen" class="cook-form" @submit.prevent="submit" @keydown.esc="close">
      <div class="row">
        <label class="field">
          <span class="label">Date</span>
          <input
            ref="dateInput"
            v-model="cookedOn"
            name="cooked_on"
            type="date"
            min="1900-01-01"
            :max="today"
            required
          />
        </label>

        <fieldset class="field rating-field">
          <legend class="label">Note (facultative)</legend>
          <div class="stars">
            <label
              v-for="star in STARS"
              :key="star"
              class="star"
              :class="{ on: rating !== null && star <= rating }"
              @click="chooseRating(star, $event)"
            >
              <input
                v-model="rating"
                class="sr-only"
                type="radio"
                name="rating"
                :value="star"
                :aria-label="`${star} étoile${star > 1 ? 's' : ''} sur 5`"
              />
              <span aria-hidden="true">★</span>
            </label>
          </div>
        </fieldset>
      </div>

      <label class="field">
        <span class="label">Commentaire (facultatif)</span>
        <textarea
          v-model="comment"
          name="comment"
          rows="2"
          maxlength="1000"
          placeholder="Une variante, une remarque pour la prochaine fois…"
        />
      </label>

      <div class="actions">
        <button type="button" class="btn-ghost" @click="close">Annuler</button>
        <button type="submit" class="btn" :disabled="saving || !cookedOn">
          <AppIcon name="check" />
          {{ saving ? 'Enregistrement…' : 'Enregistrer le repas' }}
        </button>
      </div>
    </form>

    <div v-if="loading" class="skeleton" aria-label="Chargement…" />
    <div v-else-if="loadError" class="alert" role="alert">
      <AppIcon name="alert" />
      <span class="alert-text">{{ loadError }}</span>
    </div>
    <p v-else-if="!cookings.length" class="empty">
      Pas encore cuisinée. Notez-la la prochaine fois que vous la préparez.
    </p>
    <ol v-else class="entries">
      <li v-for="cooking in cookings" :key="cooking.id" class="entry">
        <div class="when">
          <span class="date">{{ formatDayLong(cooking.cooked_on) }}</span>
          <span class="ago">{{ relativeDay(cooking.cooked_on) }}</span>
        </div>
        <div class="what">
          <span
            v-if="cooking.rating"
            class="stars-read"
            role="img"
            :aria-label="ratingLabel(cooking.rating)"
          >
            <span v-for="star in STARS" :key="star" :class="{ on: star <= cooking.rating }">★</span>
          </span>
          <p v-if="cooking.comment" class="comment">{{ cooking.comment }}</p>
        </div>
        <button
          type="button"
          class="btn-ghost icon-btn"
          :aria-label="`Retirer le repas du ${formatDayLong(cooking.cooked_on)}`"
          title="Retirer de l'historique"
          @click="remove(cooking)"
        >
          <AppIcon name="trash" />
        </button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.log {
  display: grid;
  gap: 0.9rem;
  margin-top: 1rem;
  padding: 1.25rem 1.4rem;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
h2 {
  font-size: 1.6rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  color: var(--plaque);
}
:root[data-theme='dark'] h2 {
  color: var(--brass);
}
.log .alert {
  margin-bottom: 0;
}

/* Formulaire */
.cook-form {
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
  background: var(--surface-sunken);
  border-radius: var(--radius);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 1.5rem;
  align-items: flex-end;
}
.field {
  display: grid;
  gap: 0.4rem;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.label {
  padding: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-muted);
}
.field textarea {
  width: 100%;
  resize: vertical;
  line-height: 1.5;
}
.stars {
  display: flex;
  gap: 0.15rem;
}
.star {
  display: grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  font-size: 1.5rem;
  line-height: 1;
  color: var(--border-strong);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition:
    color var(--transition),
    transform var(--transition);
}
.star:hover {
  transform: scale(1.12);
}
.star.on {
  color: var(--accent);
}
.star:focus-within {
  box-shadow: var(--ring);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.6rem;
}
.btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* Liste des repas */
.entries {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}
.entry {
  display: grid;
  grid-template-columns: minmax(10rem, 14rem) minmax(0, 1fr) auto;
  gap: 0.4rem 1.25rem;
  align-items: start;
  padding: 0.8rem 0;
  border-top: 1px solid var(--border);
}
.entry:first-child {
  border-top: 0;
}
.when {
  display: grid;
  gap: 0.1rem;
}
.date {
  font-weight: 600;
}
.date::first-letter {
  text-transform: uppercase;
}
.ago {
  font-size: 0.825rem;
  color: var(--text-faint);
}
.what {
  display: grid;
  gap: 0.3rem;
  min-width: 0;
}
.stars-read {
  font-size: 1.05rem;
  letter-spacing: 0.05em;
  color: var(--border-strong);
}
.stars-read .on {
  color: var(--accent);
}
.comment {
  color: var(--text-muted);
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.icon-btn {
  padding: 0.5rem;
}
.empty {
  font-size: 0.9rem;
  color: var(--text-faint);
}
.skeleton {
  height: 64px;
  border-radius: var(--radius);
  background: var(--surface-sunken);
}

@media (max-width: 560px) {
  .log {
    padding: 1.1rem;
  }
  .entry {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .what {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
