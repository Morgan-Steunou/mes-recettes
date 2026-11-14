<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import { formatDuration, totalTime } from '@/utils/recipe'
import { relativeDay } from '@/utils/dates'
import type { Recipe } from '@/types/api'

const props = withDefaults(
  defineProps<{
    recipes: Recipe[]
    // Ingrédients trouvés par la recherche, par id de recette : { 12: ['Blanc de poulet'] }
    ingredientHits?: Record<number, string[]>
    // Catégorie affichée sur la carte (inutile dans l'onglet d'une catégorie)
    showCategory?: boolean
  }>(),
  { ingredientHits: () => ({}), showCategory: false },
)

function hits(recipe: Recipe): string[] {
  return props.ingredientHits[recipe.id] ?? []
}
const emit = defineEmits<{ remove: [id: number] }>()

function confirmRemove(recipe: Recipe) {
  if (window.confirm(`Supprimer la recette « ${recipe.title} » ? Cette action est définitive.`)) {
    emit('remove', recipe.id)
  }
}

function cookedLabel(count: number) {
  return count === 1 ? 'Cuisinée une fois' : `Cuisinée ${count} fois`
}

function servingsLabel(servings: number) {
  return `${servings} portion${servings > 1 ? 's' : ''}`
}

function ingredientsLabel(count: number) {
  return `${count} ingrédient${count > 1 ? 's' : ''}`
}

function hasMeta(recipe: Recipe) {
  return (
    (props.showCategory && recipe.category) ||
    recipe.servings ||
    totalTime(recipe) !== null ||
    recipe.ingredients?.length ||
    recipe.last_cooked_on
  )
}

function detailLink(recipe: Recipe) {
  return { name: 'recipe-detail', params: { id: recipe.id } }
}
</script>

<template>
  <div v-if="!recipes.length" class="empty card">
    <span class="empty-icon" aria-hidden="true"><AppIcon name="chefHat" /></span>
    <p class="empty-title">Aucune recette pour le moment.</p>
    <p class="empty-hint">Ajoutez votre première recette avec le bouton « Nouvelle recette ».</p>
  </div>

  <TransitionGroup v-else tag="ul" name="recipe" class="list">
    <li v-for="recipe in recipes" :key="recipe.id" class="recipe plaque">
      <!-- Médaille de laiton : nombre de fois où la recette a été cuisinée -->
      <span
        v-if="recipe.cooked_count"
        class="medal"
        :title="cookedLabel(recipe.cooked_count)"
        :aria-label="cookedLabel(recipe.cooked_count)"
        role="img"
        >{{ recipe.cooked_count }}×</span
      >

      <div class="body">
        <RouterLink :to="detailLink(recipe)" class="title" :title="recipe.title">{{
          recipe.title
        }}</RouterLink>
        <p v-if="recipe.description" class="description">{{ recipe.description }}</p>
        <p v-if="hits(recipe).length" class="hits">
          Avec :
          <template v-for="(name, i) in hits(recipe)" :key="name"
            ><mark>{{ name }}</mark
            >{{ i < hits(recipe).length - 1 ? ', ' : '' }}</template
          >
        </p>
        <ul v-if="hasMeta(recipe)" class="meta" aria-label="Informations">
          <li v-if="showCategory && recipe.category" class="category">
            <AppIcon name="folder" />{{ recipe.category.name }}
          </li>
          <li v-if="recipe.servings">
            <AppIcon name="users" />{{ servingsLabel(recipe.servings) }}
          </li>
          <li v-if="totalTime(recipe) !== null">
            <AppIcon name="clock" />{{ formatDuration(totalTime(recipe)) }}
          </li>
          <li v-if="recipe.ingredients?.length">
            <AppIcon name="list" />{{ ingredientsLabel(recipe.ingredients.length) }}
          </li>
          <li v-if="recipe.last_cooked_on" class="cooked">
            <AppIcon name="history" />Faite {{ relativeDay(recipe.last_cooked_on) }}
          </li>
        </ul>
      </div>

      <!-- Boutons réduits à leur icône ; le libellé reste lu par les lecteurs d'écran -->
      <div class="actions">
        <RouterLink
          :to="{ name: 'recipe-edit', params: { id: recipe.id } }"
          class="btn-ghost icon-btn"
          title="Modifier"
        >
          <AppIcon name="pencil" /><span class="sr-only">Modifier</span>
        </RouterLink>
        <button class="btn-danger icon-btn" title="Supprimer" @click="confirmRemove(recipe)">
          <AppIcon name="trash" /><span class="sr-only">Supprimer</span>
        </button>
      </div>
    </li>
  </TransitionGroup>
</template>

<style scoped>
/* Grille de cartes : autant de colonnes de 240 px minimum que la largeur le permet */
.list {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr));
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
/* Chaque recette est une plaque émaillée à double filet (.plaque, dans main.css) */
.recipe {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  min-width: 0;
  padding: 1.25rem 1.2rem 0.9rem;
  background: var(--surface);
  border: 2px solid var(--plaque);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  transition: background var(--transition);
}
.recipe:hover {
  background: var(--surface-hover);
}
.medal {
  position: absolute;
  top: 0.8rem;
  right: 0.8rem;
  display: grid;
  place-items: center;
  width: 2.6rem;
  height: 2.6rem;
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 900;
  color: var(--on-brass);
  background: var(--brass-fill);
  border-radius: 50%;
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.35),
    inset 0 0 0 4px var(--brass-fill),
    inset 0 0 0 5px rgba(0, 0, 0, 0.22);
}
.body {
  display: grid;
  gap: 0.4rem;
  flex: 1;
  align-content: start;
  min-width: 0;
}
/* Titre en lettres de plaque ; place laissée à la médaille */
.title {
  padding-right: 2.8rem;
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--plaque);
  overflow-wrap: anywhere;
}
:root[data-theme='dark'] .title {
  color: var(--text);
}
.title:hover {
  color: var(--accent-hover);
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}
/* Description sur deux lignes au plus */
.description {
  display: -webkit-box;
  overflow: hidden;
  font-size: 0.875rem;
  color: var(--text-muted);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
/* Ingrédients trouvés par la recherche */
.hits {
  font-size: 0.85rem;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}
.hits mark {
  padding: 0 0.2rem;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 4px;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.9rem;
  margin: 0.2rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.meta .cooked {
  font-weight: 600;
  color: var(--brass);
}
.meta li {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
  padding: 0 0.2rem;
}
.icon-btn {
  padding: 0.5rem;
}
/* Les actions n'apparaissent pleinement qu'au survol (sur ordinateur) */
@media (hover: hover) {
  .actions {
    opacity: 0.6;
    transition: opacity var(--transition);
  }
  .recipe:hover .actions,
  .recipe:focus-within .actions {
    opacity: 1;
  }
}

/* État vide */
.empty {
  display: grid;
  justify-items: center;
  gap: 0.35rem;
  padding: 3rem 1.5rem;
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
  font-size: 1.2rem;
  font-weight: 600;
}
.empty-hint {
  font-size: 0.9rem;
  color: var(--text-muted);
}

/* Animations d'apparition / disparition des recettes */
.recipe-enter-active,
.recipe-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}
.recipe-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
.recipe-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
.recipe-leave-active {
  position: absolute;
  width: 240px;
}
.recipe-move {
  transition: transform 220ms ease;
}
</style>
