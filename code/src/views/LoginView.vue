<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppIcon from '@/components/AppIcon.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const error = ref(null)
const submitting = ref(false)

async function submit() {
  error.value = null
  submitting.value = true
  try {
    await auth.login(username.value.trim(), password.value)
    // Retour à la page demandée avant la connexion (uniquement un chemin interne)
    const redirect = route.query.redirect
    const target =
      typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
        ? redirect
        : '/'
    router.replace(target)
  } catch (e) {
    error.value = e.message
    password.value = ''
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login">
    <form class="panel card" @submit.prevent="submit">
      <span class="badge" aria-hidden="true"><AppIcon name="lock" /></span>
      <h1>Connexion</h1>
      <p class="subtitle">Connectez-vous pour accéder à vos recettes.</p>

      <p v-if="route.query.expired && !error" class="notice">
        Votre session a expiré, veuillez vous reconnecter.
      </p>
      <div v-if="error" class="alert" role="alert">
        <AppIcon name="alert" />
        <span>{{ error }}</span>
      </div>

      <label class="field">
        <span>Identifiant</span>
        <input v-model="username" name="username" autocomplete="username" required autofocus />
      </label>
      <label class="field">
        <span>Mot de passe</span>
        <input
          v-model="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
        />
      </label>

      <button type="submit" class="btn submit" :disabled="submitting">
        <AppIcon name="login" />
        {{ submitting ? 'Connexion…' : 'Se connecter' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.login {
  display: grid;
  place-items: center;
  padding: 2rem 0;
}
.panel {
  display: grid;
  gap: 0.9rem;
  width: 100%;
  max-width: 400px;
  padding: 2rem;
}
.badge {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  font-size: 1.3rem;
  color: var(--accent-contrast);
  background: var(--accent);
  border-radius: 14px;
  box-shadow: 0 8px 20px -10px var(--accent-glow);
}
h1 {
  font-size: 2rem;
}
.subtitle {
  margin-top: -0.5rem;
  color: var(--text-muted);
}
.field {
  display: grid;
  gap: 0.35rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-muted);
}
.submit {
  margin-top: 0.4rem;
  width: 100%;
}
.submit:disabled {
  opacity: 0.7;
  cursor: progress;
}
.notice {
  padding: 0.65rem 0.85rem;
  font-size: 0.9rem;
  color: var(--info-text);
  background: var(--info-soft);
  border: 1px solid var(--info-border);
  border-radius: var(--radius);
}
.alert {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.65rem 0.85rem;
  font-size: 0.9rem;
  color: var(--danger-text);
  background: var(--danger-soft);
  border: 1px solid var(--danger-border);
  border-radius: var(--radius);
}
.alert > .icon {
  color: var(--danger);
}
</style>
