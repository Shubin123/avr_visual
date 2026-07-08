import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this repo as a project page at
// https://shubin123.github.io/-mega-visualizer/, not the domain root, so
// Vite's asset URLs need that base path baked in (otherwise index.html
// references /assets/... which 404s against the real /-mega-visualizer/assets/... path).
// https://vite.dev/config/
export default defineConfig({
  base: '/-mega-visualizer/',
  plugins: [react()],
})
