<script setup lang="ts">
const stack = [
  { name: 'Vue 3', role: 'Interface', detail: 'Vite, Vue Router, Pinia' },
  { name: 'FastAPI', role: 'API', detail: 'Pydantic, SQLAlchemy' },
  { name: 'PostgreSQL', role: 'Base de données', detail: 'pilote psycopg 3' },
  { name: 'Playwright', role: 'Tests de bout en bout', detail: '+ pytest pour l’API' },
]
</script>

<template>
  <p class="eyebrow">Le projet</p>
  <h1>À propos</h1>
  <p class="subtitle">Vos recettes, avec Vue 3 + FastAPI.</p>

  <ul class="stack">
    <li v-for="tech in stack" :key="tech.name" class="tech card">
      <span class="role">{{ tech.role }}</span>
      <strong class="tech-name">{{ tech.name }}</strong>
      <span class="detail">{{ tech.detail }}</span>
    </li>
  </ul>
</template>

<style scoped>
.eyebrow {
  margin-bottom: 0.35rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
}
h1 {
  font-size: clamp(2.2rem, 5vw, 3rem);
}
.subtitle {
  margin-top: 0.4rem;
  color: var(--text-muted);
}
.stack {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.75rem;
  margin: 2rem 0 0;
  padding: 0;
  list-style: none;
}
.tech {
  display: grid;
  gap: 0.2rem;
  padding: 1.1rem;
  transition:
    transform var(--transition),
    border-color var(--transition);
}
.tech:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
}
.role {
  font-size: 0.75rem;
  color: var(--text-faint);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.tech-name {
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--accent);
}
.detail {
  font-size: 0.875rem;
  color: var(--text-muted);
}
</style>
