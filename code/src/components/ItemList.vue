<script setup>
import { nextTick, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  items: { type: Array, required: true },
  // Reçu via @update="..." : déclaré en prop pour pouvoir attendre son résultat
  onUpdate: { type: Function, default: null },
})
const emit = defineEmits(['remove'])

const editingId = ref(null)
const editName = ref('')
const editInput = ref(null)

async function startEdit(item) {
  editingId.value = item.id
  editName.value = item.name
  await nextTick()
  editInput.value?.[0]?.focus()
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit(item) {
  const name = editName.value.trim()
  if (!name) return
  // En cas d'échec, le champ reste ouvert avec le texte saisi
  if (name === item.name || (await props.onUpdate?.(item.id, { name }))) cancelEdit()
}

// Pastille colorée propre à chaque item (teinte dérivée de son id)
function avatarStyle(item) {
  const hue = (item.id * 47 + 260) % 360
  return {
    background: `linear-gradient(135deg, hsl(${hue} 80% 62%), hsl(${(hue + 50) % 360} 85% 55%))`,
  }
}

function initial(name) {
  return [...name.trim()][0]?.toUpperCase() ?? '?'
}
</script>

<template>
  <div v-if="!items.length" class="empty card">
    <span class="empty-icon" aria-hidden="true"><AppIcon name="inbox" /></span>
    <p class="empty-title">Aucun item pour le moment.</p>
    <p class="empty-hint">Ajoutez votre premier item avec le champ ci-dessus.</p>
  </div>

  <TransitionGroup v-else tag="ul" name="item" class="list">
    <li
      v-for="item in items"
      :key="item.id"
      class="item"
      :class="{ editing: editingId === item.id }"
    >
      <span class="avatar" :style="avatarStyle(item)" aria-hidden="true">{{
        initial(item.name)
      }}</span>

      <form
        v-if="editingId === item.id"
        class="row"
        @submit.prevent="saveEdit(item)"
        @keydown.esc="cancelEdit"
      >
        <input
          ref="editInput"
          v-model="editName"
          class="edit-input"
          maxlength="100"
          aria-label="Nouveau nom"
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
        <span class="name">{{ item.name }}</span>
        <div class="actions">
          <button class="btn-ghost" @click="startEdit(item)">
            <AppIcon name="pencil" /><span class="label">Modifier</span>
          </button>
          <button class="btn-danger" @click="emit('remove', item.id)">
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
     (sinon un nom long sur une ligne fait déborder la carte sur mobile) */
  grid-template-columns: minmax(0, 1fr);
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.item {
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
.item:hover {
  background: var(--surface-hover);
  border-color: var(--border-strong);
}
.item.editing {
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
  .item:not(.editing) .actions {
    opacity: 0.55;
    transition: opacity var(--transition);
  }
  .item:hover .actions,
  .item:focus-within .actions {
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

/* Animations d'apparition / disparition des items */
.item-enter-active,
.item-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}
.item-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
.item-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
.item-leave-active {
  position: absolute;
  width: 100%;
}
.item-move {
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
