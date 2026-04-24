import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [inspectAttr(), react()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        releases: path.resolve(__dirname, 'releases/index.html'),
        docs: path.resolve(__dirname, 'docs/index.html'),
        docsGuide: path.resolve(__dirname, 'docs/guide/index.html'),
        docsConfiguration: path.resolve(__dirname, 'docs/configuration/index.html'),
        docsFaq: path.resolve(__dirname, 'docs/faq/index.html'),
        docsTechnical: path.resolve(__dirname, 'docs/technical/index.html'),
        docsMore: path.resolve(__dirname, 'docs/more/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
  },
});
