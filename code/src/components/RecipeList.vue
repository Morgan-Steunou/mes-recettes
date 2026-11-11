<script setup>
import { nextTick, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  recipes: { type: Array, required: true },
  // Reçu via @update="..." : déclaré en prop pour pouvoir attendre son résultat
  onUpdate: { type: Function, default: null },
})
const emit = defineEmits(['remove'])

const editingId = ref(null)
const editTitle = ref('')
const editInput = ref(null)

async function startEdit(recipe) {
  editingId.value = recipe.id
  editTitle.value = recipe.title
  await nextTick()
  editInput.value?.[0]?.focus()
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit(recipe) {
  const title = editTitle.value.trim()
  if (!title) return
  // En cas d'échec, le champ reste ouvert avec le texte saisi
  if (title === recipe.title || (await props.onUpdate?.(recipe.id, { title }))) cancelEdit()
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
</script>

<template>
  <div v-if="!recipes.length" class="empty card">
    <span class="empty-icon" aria-hidden="true"><AppIcon name="inbox" /></span>
    <p class="empty-title">Aucune recette pour le moment.</p>
    <p class="empty-hint">Ajoutez votre première recette avec le champ ci-dessus.</p>
  </div>

  <TransitionGroup v-else tag="ul" name="recipe" class="list">
    <li
      v-for="recipe in recipes"
      :key="recipe.id"
      class="recipe"
      :class="{ editing: editingId === recipe.id }"
    >
      <span class="avatar" :style="avatarStyle(recipe)" aria-hidden="true">{{
        initial(recipe.title)
      }}</span>

      <form
        v-if="editingId === recipe.id"
        class="row"
        @submit.prevent="saveEdit(recipe)"
        @keydown.esc="cancelEdit"
      >
        <input
          ref="editInput"
          v-model="editTitle"
          class="edit-input"
          maxlength="150"
          aria-label="Nouveau titre"
        />
        <div class="actions">
          <button type="submit" class="btn btn-sm">
            <AppIcon name="check" /><span class="label">Enregistrer</span>
          </button>
          <button type="button" class="btn-ghost" @click="cancelEdit">
            <AppIcon name="x" /><span class="label">Annuler</span>
          </button>
        </div>
      </form>

      <div v-else class="row">
        <span class="name">{{ recipe.title }}</span>
        <div class="actions">
          <button class="btn-ghost" @click="startEdit(recipe)">
            <AppIcon name="pencil" /><span class="label">Modifier</span>
          </button>
          <button class="btn-danger" @click="emit('remove', recipe.id)">
            <AppIcon name="trash" /><span class="label">Supprimer</span>
          </button>
        </div>
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
  padding: 0.7rem 0.8rem;
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
.recipe.editing {
  border-color: rgba(139, 92, 246, 0.55);
  box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.12);
}
.avatar {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  font-weight: 700;
  color: #fff;
  border-radius: 11px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}
.row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.edit-input {
  flex: 1;
  min-width: 0;
  padding: 0.5rem 0.75rem;
}
.actions {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
}
/* Les actions n'apparaissent pleinement qu'au survol (sur ordinateur) */
@media (hover: hover) {
  .recipe:not(.editing) .actions {
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
  .btn-sm,
  .btn-ghost,
  .btn-danger {
    padding: 0.5rem;
  }
}
</style>
