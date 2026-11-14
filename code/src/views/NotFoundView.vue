<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
</script>

<template>
  <div class="not-found">
    <p class="code" aria-hidden="true">404</p>
    <h1>Page introuvable</h1>
    <p class="subtitle">Cette page n'existe pas ou a été déplacée.</p>
    <RouterLink to="/" class="btn"><AppIcon name="arrowLeft" /> Retour à l'accueil</RouterLink>
  </div>
</template>

<style scoped>
.not-found {
  display: grid;
  justify-items: center;
  gap: 0.6rem;
  padding: 3rem 0;
  text-align: center;
}
.code {
  font-size: clamp(5rem, 18vw, 8rem);
  font-family: var(--font-display);
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--accent);
}
.subtitle {
  margin-bottom: 1rem;
  color: var(--text-muted);
}
.btn:hover {
  text-decoration: none;
}
</style>
