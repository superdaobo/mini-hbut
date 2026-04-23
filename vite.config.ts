import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// 读取 package.json 中的版本号
import { readFileSync } from 'fs'
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const buildProfile = process.env.MINI_HBUT_BUILD_PROFILE || 'standard'
const isReleaseProfile = buildProfile === 'release'
const isDevFastProfile = buildProfile === 'dev-fast'
const toPosix = (value: string) => value.replace(/\\/g, '/')

const manualChunks = (id: string) => {
  const normalized = toPosix(id)
  if (normalized.includes('/node_modules/vue/') || normalized.includes('/node_modules/@vue/') || normalized.includes('/node_modules/pinia/') || normalized.includes('/node_modules/vue-router/')) {
    return 'vue-core'
  }
  if (
    normalized.includes('/node_modules/marked/') ||
    normalized.includes('/node_modules/dompurify/') ||
    normalized.includes('/src/utils/markdown.js')
  ) {
    return 'markdown'
  }
  if (
    normalized.includes('/node_modules/html2canvas/') ||
    normalized.includes('/src/utils/capture_service.ts')
  ) {
    return 'capture'
  }
  if (normalized.includes('/src/utils/debug_bridge.ts')) {
    return 'debug-tools'
  }
  if (
    normalized.includes('/node_modules/@microsoft/fetch-event-source/') ||
    normalized.includes('/node_modules/qrcode/')
  ) {
    return 'online-learning'
  }
  if (
    normalized.includes('/src/utils/more_modules.js') ||
    normalized.includes('/src/utils/hot_update') ||
    normalized.includes('/src/utils/remote_config.js')
  ) {
    return 'more-modules'
  }
  if (
    normalized.includes('/node_modules/@tauri-apps/') ||
    normalized.includes('/node_modules/@capacitor/') ||
    normalized.includes('/src/platform/')
  ) {
    return 'runtime-bridge'
  }
  return undefined
}

export default defineConfig({
  plugins: [vue()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    'import.meta.env.VITE_BUILD_PROFILE': JSON.stringify(buildProfile)
  },
  resolve: {
    alias: {
      'axios': path.resolve(__dirname, 'src/utils/axios_adapter.js')
    }
  },
  esbuild: {
    legalComments: 'none',
    drop: isReleaseProfile ? ['console', 'debugger'] : []
  },
  build: {
    minify: isDevFastProfile ? false : 'esbuild',
    cssMinify: !isDevFastProfile,
    reportCompressedSize: isReleaseProfile,
    sourcemap: false,
    target: 'es2020',
    chunkSizeWarningLimit: isDevFastProfile ? 1600 : 900,
    rollupOptions: {
      output: {
        manualChunks
      }
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
