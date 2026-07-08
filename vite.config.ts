import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this repo as a project page at
// https://shubin123.github.io/-mega-visualizer/, not the domain root, so
// asset URLs can't be root-absolute (an absolute '/assets/...' 404s there,
// and also breaks opening dist/index.html locally via Live Server/file://,
// which don't serve from that subpath either). A relative base makes
// index.html reference "./assets/..." so it resolves correctly regardless
// of where the built dist/ folder is served from.
// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
})
