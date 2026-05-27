import { defineConfig } from 'vite'

const stripCrossOrigin = () => ({
  name: 'strip-crossorigin',
  enforce: 'post',
  transformIndexHtml(html) {
    return html.replace(/ crossorigin/g, '')
  }
})

export default defineConfig({
  base: './',
  plugins: [stripCrossOrigin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 4096
  }
})
