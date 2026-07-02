import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const stripCrossOrigin = () => ({
  name: 'strip-crossorigin',
  enforce: 'post',
  transformIndexHtml(html) {
    return html.replace(/ crossorigin/g, '')
  }
})

export default defineConfig({
  base: './',
  plugins: [vue(), stripCrossOrigin()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'three'
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    testTimeout: 60000
  }
})
