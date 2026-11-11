<script setup>
import AppIcon from '@/components/AppIcon.vue'
import { formatDuration, totalTime } from '@/utils/recipe'

defineProps({
  recipes: { type: Array, required: true },
})
const emit = defineEmits(['remove'])

function confirmRemove(recipe) {
  if (window.confirm(`Supprimer la recette « ${recipe.title} » ? Cette action est définitive.`)) {
    emit('remove', recipe.id)
  }
}

// Pastille colorée propre à chaque recette (teinte dérivée de son id)
function avatarStyle(recipe) {
  const hue = (recipe.id * 47 + 260) % 360
  return {
    background: `linear-gradient(135deg, hsl(${hue} 80% 62%), hsl(${(hue + 50) % 360} 85% 55%))`,
  }
}

function initial(title) {
  return [...title.trim()][0]?.toUpperCase() ?? '?'
}

function servingsLabel(servings) {
  return `${servings} portion${servings > 1 ? 's' : ''}`
}

function ingredientsLabel(count) {
  return `${count} ingrédient${count > 1 ? 's' : ''}`
}

function hasMeta(recipe) {
  return recipe.servings || totalTime(recipe) !== null || recipe.ingredients?.length
}
</script>

<template>
  <div v-if="!recipes.length" class="empty card">
    <span class="empty-icon" aria-hidden="true"><AppIcon name="inbox" /></span>
    <p class="empty-title">Aucune recette pour le moment.</p>
    <p class="empty-hint">Ajoutez votre première recette avec le bouton « Nouvelle recette ».</p>
  </div>

  <TransitionGroup v-else tag="ul" name="recipe" class="list">
    <li v-for="recipe in recipes" :key="recipe.id" class="recipe">
      <span class="avatar" :style="avatarStyle(recipe)" aria-hidden="true">{{
        initial(recipe.title)
      }}</span>

      <div class="body">
        <RouterLink
          :to="{ name: 'recipe-edit', params: { id: recipe.id } }"
          class="title"
          :title="recipe.title"
          >{{ recipe.title }}</RouterLink
        >
        <p v-if="recipe.description" class="description">{{ recipe.description }}</p>
        <ul v-if="hasMeta(recipe)" class="meta" aria-label="Informations">
          <li v-if="recipe.servings">
            <AppIcon name="users" />{{ servingsLabel(recipe.servings) }}
          </li>
          <li v-if="totalTime(recipe) !== null">
            <AppIcon name="clock" />{{ formatDuration(totalTime(recipe)) }}
          </li>
          <li v-if="recipe.ingredients?.length">
            <AppIcon name="list" />{{ ingredientsLabel(recipe.ingredients.length) }}
          </li>
        </ul>
      </div>

      <div class="actions">
        <RouterLink :to="{ name: 'recipe-edit', params: { id: recipe.id } }" class="btn-ghost">
          <AppIcon name="pencil" /><span class="label">Modifier</span>
        </RouterLink>
        <button class="btn-danger" @click="confirmRemove(recipe)">
          <AppIcon name="trash" /><span class="label">Supprimer</span>
        </button>
      </div>
    </li>
  </TransitionGroup>
</template>

<style scoped>
.list {
  position: relative;
  display: grid;
  /* minmax(0, 1fr) : la colonne peut rétrécir sous la largeur du contenu
     (sinon un titre long sur une ligne fait déborder la carte sur mobile) */
  grid-template-columns: minmax(0, 1fr);
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.recipe {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-height: 64px;
  padding: 0.8rem 0.9rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  transition:
    background var(--transition),
    border-color var(--transition),
    transform var(--transition);
}
.recipe:hover {
  background: var(--surface-hover);
  border-color: var(--border-strong);
}
.avatar {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  font-weight: 700;
  color: #fff;
  border-radius: 12px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}
.body {
  display: grid;
  gap: 0.2rem;
  flex: 1;
  min-width: 0;
}
.title,
.description {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.title {
  font-weight: 600;
  color: var(--text);
}
.title:hover {
  color: var(--accent-2);
}
.description {
  font-size: 0.875rem;
  color: var(--text-muted);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.9rem;
  margin: 0.15rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.8rem;
  color: var(--text-faint);
}
.meta li {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.actions {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
}
/* Les actions n'apparaissent pleinement qu'au survol (sur ordinateur) */
@media (hover: hover) {
  .actions {
    opacity: 0.55;
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
  color: var(--accent-2);
  background: var(--accent-soft);
  border-radius: 16px;
}
.empty-title {
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
  transform: translateX(16px);
}
.recipe-leave-active {
  position: absolute;
  width: 100%;
}
.recipe-move {
  transition: transform 220ms ease;
}

/* Sur petit écran : boutons réduits à leur icône (le libellé reste lu par les lecteurs d'écran) */
@media (max-width: 560px) {
  .label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .btn-ghost,
  .btn-danger {
    padding: 0.5rem;
  }
}
</style>
