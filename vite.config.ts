import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this repo as a project page at
// https://shubin123.github.io/-mega-visualizer/, not the domain root, so
// asset URLs can't be root-absolute (an absolute '/assets/...' 404s there,
// and also breaks opening docs/index.html locally via Live Server/file://,
// which don't serve from that subpath either). A relative base makes
// index.html reference "./assets/..." so it resolves correctly regardless
// of where the built docs/ folder is served from.
// https://vite.dev/config/
export default defineConfig({
  base: './',
  // GitHub Pages is configured to serve this repo from the /docs folder on
  // main, so the build has to land there instead of Vite's default dist/.
  build: {
    outDir: 'docs',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  // react-draggable (a react-grid-layout dependency) reads process.env.* for
  // a debug flag, assuming a Node-style global that Vite doesn't shim in the
  // browser; every drag threw "process is not defined". Replacing the whole
  // expression with {} makes that read resolve to `undefined` instead.
  define: {
    'process.env': '{}',
  },
  plugins: [react()],
})
