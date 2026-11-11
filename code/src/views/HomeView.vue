<script setup>
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRecipesStore } from '@/stores/recipes'
import AppIcon from '@/components/AppIcon.vue'
import RecipeList from '@/components/RecipeList.vue'

const store = useRecipesStore()
const { recipes, loading, error, actionError } = storeToRefs(store)

onMounted(store.fetchRecipes)
</script>

<template>
  <section class="hero">
    <div>
      <p class="eyebrow">Mon carnet</p>
      <h1 class="page-title">Mes recettes</h1>
      <p class="subtitle">
        <template v-if="!loading && !error">
          {{ recipes.length }} recette{{ recipes.length > 1 ? 's' : '' }} enregistrée{{
            recipes.length > 1 ? 's' : ''
          }}.
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
  <RecipeList v-else :recipes="recipes" @remove="store.removeRecipe" />
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
