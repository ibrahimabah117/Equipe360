import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig(({ mode }) => ({
  // La démo est un site autonome (chemins relatifs, sans installation hors ligne)
  base: mode === 'demo' ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    // Démo : un seul fichier HTML (scripts, styles et polices inclus)
    mode === 'demo' && viteSingleFile(),
    mode !== 'demo' && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Équipe360',
        short_name: 'Équipe360',
        description: 'Planning, pointage et paie des équipes — Guinée',
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        background_color: '#F6F7FB',
        theme_color: '#0B1B3F',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
}))
