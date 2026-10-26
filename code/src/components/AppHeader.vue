<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppIcon from '@/components/AppIcon.vue'
import ThemeSwitch from '@/components/ThemeSwitch.vue'

const auth = useAuthStore()
const router = useRouter()

function logout() {
  auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <header class="header">
    <nav class="container nav" aria-label="Navigation principale">
      <RouterLink to="/" class="brand">
        <span class="logo" aria-hidden="true"><AppIcon name="sparkles" /></span>
        <span class="brand-name">Mes Recettes</span>
      </RouterLink>
      <div class="right">
        <div class="links">
          <RouterLink to="/" class="link">
            <AppIcon name="home" /><span class="link-label">Accueil</span>
          </RouterLink>
          <RouterLink to="/about" class="link">
            <AppIcon name="info" /><span class="link-label">À propos</span>
          </RouterLink>
        </div>
        <ThemeSwitch />
        <template v-if="auth.isAuthenticated">
          <span v-if="auth.user" class="user" :title="`Connecté en tant que ${auth.user.username}`">
            <AppIcon name="user" /><span class="username">{{ auth.user.username }}</span>
          </span>
          <button type="button" class="btn-ghost logout" @click="logout">
            <AppIcon name="logout" /><span class="label">Se déconnecter</span>
          </button>
        </template>
      </div>
    </nav>
  </header>
</template>

<style scoped>
.header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(14px) saturate(140%);
}
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  height: 64px;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--text);
  font-weight: 700;
  letter-spacing: -0.01em;
}
.brand:hover {
  text-decoration: none;
}
.logo {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  color: #fff;
  background: var(--accent-gradient);
  border-radius: 10px;
  box-shadow: 0 4px 16px -4px rgba(139, 92, 246, 0.8);
}
.right {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.links {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
}
.link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.9rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-muted);
  border-radius: 999px;
  transition:
    color var(--transition),
    background var(--transition);
}
.link:hover {
  color: var(--text);
  text-decoration: none;
}
.link.router-link-exact-active {
  color: var(--text);
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px rgba(139, 92, 246, 0.35);
}
.user {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 10rem;
  font-size: 0.875rem;
  color: var(--text-muted);
}
.username {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.logout {
  border-radius: 999px;
}

@media (max-width: 720px) {
  .user,
  .logout .label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}
@media (max-width: 480px) {
  .brand-name {
    display: none;
  }
  .right {
    gap: 0.4rem;
  }
  .link {
    padding: 0.45rem 0.6rem;
  }
  /* Liens réduits à leur icône ; le libellé reste lu par les lecteurs d'écran */
  .link-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}
</style>
