<script setup lang="ts">
import { useTheme } from '@/composables/useTheme'
import AppIcon from '@/components/AppIcon.vue'

const { isDark, toggleTheme } = useTheme()
</script>

<template>
  <!-- Interrupteur accessible : rôle « switch », état lu par les lecteurs d'écran -->
  <button
    type="button"
    class="switch"
    role="switch"
    :aria-checked="isDark"
    aria-label="Thème sombre"
    :title="isDark ? 'Passer au thème clair' : 'Passer au thème sombre'"
    @click="toggleTheme"
  >
    <span class="icon-slot sun" aria-hidden="true"><AppIcon name="sun" /></span>
    <span class="icon-slot moon" aria-hidden="true"><AppIcon name="moon" /></span>
    <span class="knob" :class="{ on: isDark }" aria-hidden="true" />
  </button>
</template>

<style scoped>
.switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  width: 64px;
  height: 34px;
  padding: 0 8px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  transition:
    border-color var(--transition),
    background var(--transition);
}
.switch:hover {
  border-color: var(--border-strong);
}
.icon-slot {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  font-size: 0.9rem;
  color: var(--header-muted);
  transition: color var(--transition);
}
/* Icône du thème actif mise en valeur (au-dessus du curseur) */
.switch[aria-checked='false'] .sun,
.switch[aria-checked='true'] .moon {
  color: var(--on-brass);
}
.knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 26px;
  height: 26px;
  background: var(--brass-fill);
  border-radius: 50%;
  box-shadow: 0 2px 8px -2px var(--accent-glow);
  transition: transform 220ms cubic-bezier(0.3, 1.4, 0.6, 1);
}
.knob.on {
  transform: translateX(30px);
}
</style>
