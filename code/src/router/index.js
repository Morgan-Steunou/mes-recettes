import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // meta.requiresAuth : page réservée aux utilisateurs connectés (ouverte à tous si les
    // comptes sont désactivés ; /login renvoie alors vers l'accueil)
    { path: '/', name: 'home', component: HomeView, meta: { requiresAuth: true } },
    // Chargement différé (lazy loading) des autres pages
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    { path: '/about', name: 'about', component: () => import('@/views/AboutView.vue') },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.isAuthenticated) return { name: 'home' }
})

export default router
