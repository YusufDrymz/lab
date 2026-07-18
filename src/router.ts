import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import HomePage from './pages/HomePage.vue'
import KafkaPage from './pages/KafkaPage.vue'
import NotFoundPage from './pages/NotFoundPage.vue'

/**
 * English lives at the root and Turkish under /tr, mirroring the personal site.
 * The locale is part of the URL rather than a stored preference: a link someone
 * shares opens in the language it was written in, and search engines get two
 * distinct, indexable pages instead of one that changes underneath them.
 */
const routes: RouteRecordRaw[] = [
  { path: '/', component: HomePage, name: 'home' },
  { path: '/kafka', component: KafkaPage, name: 'kafka' },
  { path: '/tr', component: HomePage, name: 'home-tr' },
  { path: '/tr/kafka', component: KafkaPage, name: 'kafka-tr' },
  { path: '/:pathMatch(.*)*', component: NotFoundPage, name: 'not-found' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, _from, saved) {
    if (saved) return saved
    // Anchors are how readers jump between sections; honour them, and start
    // every other navigation at the top rather than mid-page.
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  },
})
