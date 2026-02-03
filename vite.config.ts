import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// 读取 package.json 中的版本号
import { readFileSync } from 'fs'
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  plugins: [vue()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version)
  },
  resolve: {
    alias: {
      'axios': path.resolve(__dirname, 'src/utils/axios_adapter.js')
    }
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      '/bridge': {
        target: 'http://127.0.0.1:4399',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bridge/, '')
      },
      '/font/deyihei.ttf': {
        target: 'https://raw.gitcode.com',
        changeOrigin: true,
        rewrite: () => '/superdaobo/mini-hbut-config/blobs/c297dc6928402fc0c73cec17ea7518d3731f7022/SmileySans-Oblique.ttf'
      }
    }
  },
})
