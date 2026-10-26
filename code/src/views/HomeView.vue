<script setup>
import { onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useItemsStore } from '@/stores/items'
import AppIcon from '@/components/AppIcon.vue'
import ItemList from '@/components/ItemList.vue'

const store = useItemsStore()
const { items, loading, error, actionError } = storeToRefs(store)
const newName = ref('')

async function submit() {
  if (!newName.value.trim()) return
  // Le texte saisi est conservé si l'ajout échoue
  if (await store.addItem(newName.value.trim())) newName.value = ''
}

onMounted(store.fetchItems)
</script>

<template>
  <section class="hero">
    <div>
      <p class="eyebrow">Tableau de bord</p>
      <h1>Accueil</h1>
      <p class="subtitle">Ajoutez, renommez et organisez vos items.</p>
    </div>
    <span v-if="!loading && !error" class="count" aria-live="polite">
      <strong>{{ items.length }}</strong> item{{ items.length > 1 ? 's' : '' }}
    </span>
  </section>

  <form class="add card" @submit.prevent="submit">
    <span class="add-icon" aria-hidden="true"><AppIcon name="plus" /></span>
    <input
      v-model="newName"
      class="add-input"
      maxlength="100"
      placeholder="Nom de l'item"
      aria-label="Nom du nouvel item"
    />
    <button type="submit" class="btn"><AppIcon name="plus" /> Ajouter</button>
  </form>

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
  <ItemList v-else :items="items" @remove="store.removeItem" @update="store.updateItem" />
</template>

<style scoped>
.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.75rem;
}
.eyebrow {
  margin-bottom: 0.35rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent-2);
}
h1 {
  font-size: clamp(2rem, 5vw, 2.6rem);
  font-weight: 800;
  background: var(--heading-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.subtitle {
  margin-top: 0.4rem;
  color: var(--text-muted);
}
.count {
  flex-shrink: 0;
  padding: 0.35rem 0.8rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
}
.count strong {
  color: var(--text);
}

/* Formulaire d'ajout */
.add {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  margin-bottom: 1.25rem;
  transition:
    border-color var(--transition),
    box-shadow var(--transition);
}
.add:focus-within {
  border-color: rgba(139, 92, 246, 0.6);
  box-shadow:
    var(--shadow),
    0 0 0 4px rgba(139, 92, 246, 0.15);
}
.add-icon {
  display: grid;
  place-items: center;
  padding-left: 0.6rem;
  color: var(--text-faint);
}
.add-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  padding-left: 0.25rem;
}
.add-input:focus {
  box-shadow: none;
}

/* Messages d'erreur */
.alert {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 1.25rem;
  padding: 0.75rem 0.9rem;
  color: var(--danger-text);
  background: var(--danger-soft);
  border: 1px solid var(--danger-border);
  border-radius: var(--radius);
}
.alert > .icon {
  color: var(--danger);
}
.alert-text {
  flex: 1;
  font-size: 0.925rem;
}
.alert-close {
  display: grid;
  place-items: center;
  padding: 0.3rem;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  opacity: 0.7;
}
.alert-close:hover {
  opacity: 1;
  background: var(--danger-soft);
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
