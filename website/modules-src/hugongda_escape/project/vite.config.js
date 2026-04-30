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
  server: {
    host: true,
    port: 3000
  }
})
