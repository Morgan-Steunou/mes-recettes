<script setup>
import AppHeader from '@/components/AppHeader.vue'
</script>

<template>
  <AppHeader />
  <main class="container main">
    <RouterView />
  </main>
  <footer class="container footer">Vue 3 · FastAPI · PostgreSQL</footer>
</template>

<style scoped>
.main {
  padding-top: 2.5rem;
  padding-bottom: 3rem;
  min-height: calc(100vh - 64px - 4rem);
}
.footer {
  padding-bottom: 1.5rem;
  font-size: 0.8rem;
  color: var(--text-faint);
  text-align: center;
}
</style>
