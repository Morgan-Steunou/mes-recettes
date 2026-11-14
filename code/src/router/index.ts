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
    {
      path: '/recettes/nouvelle',
      name: 'recipe-new',
      component: () => import('@/views/RecipeFormView.vue'),
      meta: { requiresAuth: true },
    },
    {
      // :id uniquement numérique (sinon page introuvable)
      path: '/recettes/:id(\\d+)',
      name: 'recipe-detail',
      component: () => import('@/views/RecipeDetailView.vue'),
      props: true,
      meta: { requiresAuth: true },
    },
    {
      path: '/recettes/:id(\\d+)/modifier',
      name: 'recipe-edit',
      component: () => import('@/views/RecipeFormView.vue'),
      props: true,
      meta: { requiresAuth: true },
    },
    {
      path: '/historique',
      name: 'history',
      component: () => import('@/views/HistoryView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/categories',
      name: 'categories',
      component: () => import('@/views/CategoriesView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/que-cuisiner',
      name: 'suggestions',
      component: () => import('@/views/SuggestionsView.vue'),
      meta: { requiresAuth: true },
    },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    { path: '/about', name: 'about', component: () => import('@/views/AboutView.vue') },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  // Première navigation : attend la reprise de la session (cookie), lancée au démarrage
  await auth.restore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.isAuthenticated) return { name: 'home' }
})

export default router

// Champs « meta » des routes, typés pour to.meta.requiresAuth
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
  }
}
