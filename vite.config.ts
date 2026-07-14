import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { TAURI_DEV_VITE_PORT } from './scripts/tauri_dev_port.mjs'

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
      '@': path.resolve(__dirname, 'src'),
      'axios': path.resolve(__dirname, 'src/utils/axios_adapter.js')
    }
  },
  esbuild: {
    legalComments: 'none',
    // 非 release 一律关闭 minify（含标识符重命名 NumberRenamer，曾导致 errno=1455 OOM）
    minify: false,
    minifyIdentifiers: false,
    minifySyntax: false,
    minifyWhitespace: false,
    drop: isReleaseProfile ? ['console', 'debugger'] : [],
    logLimit: 10,
    // 降低目标语法变换压力
    target: 'es2020'
  },
  optimizeDeps: {
    // 首次打开页面时也禁止 esbuild minify
    esbuildOptions: {
      minify: false,
      minifyIdentifiers: false,
      minifySyntax: false,
      minifyWhitespace: false,
      legalComments: 'none',
      target: 'es2020',
      logLimit: 10
    }
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
    port: TAURI_DEV_VITE_PORT,
    strictPort: true,
    host: '127.0.0.1',
    // Tauri 窗口加载 127.0.0.1:5173 时，HMR WebSocket 必须同 host，否则改代码不刷新
    hmr: {
      protocol: 'ws',
      host: '127.0.0.1',
      port: TAURI_DEV_VITE_PORT,
      clientPort: TAURI_DEV_VITE_PORT
    },
    // 降低并发预转换，避免 esbuild 一次开太多 goroutine
    preTransformRequests: false,
    watch: {
      // 避免把 target / 安装包 / 会话垃圾扫进 esbuild HMR，降低 Windows 上 OOM(errno=1455) 概率
      ignored: [
        '**/src-tauri/**',
        '**/dist-dev-packages/**',
        '**/target/**',
        '**/.git/**',
        '**/terminals/**',
        '**/.ci-logs/**',
        '**/agent-tools/**',
        '**/mcps/**',
        '**/website/.serve-root/**',
        '**/website/modules/**',
        '**/node_modules/**'
      ],
      awaitWriteFinish: {
        stabilityThreshold: 400,
        pollInterval: 100
      }
    },
    proxy: {
      '/bridge': {
        target: 'http://127.0.0.1:4399',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bridge/, '')
      },
      '/towergo': {
        target: 'http://127.0.0.1:4399',
        changeOrigin: true
      },
      '/campus-map': {
        target: 'http://127.0.0.1:4399',
        changeOrigin: true
      },
      '/campus-guide': {
        target: 'http://127.0.0.1:4399',
        changeOrigin: true
      },
      '/campus-guide-debug': {
        target: 'http://127.0.0.1:4399',
        changeOrigin: true
      },
      '/school-website': {
        target: 'http://127.0.0.1:4399',
        changeOrigin: true
      },
      '/font/deyihei.ttf': {
        target: 'https://raw.gitcode.com',
        changeOrigin: true,
        rewrite: () => '/superdaobo/mini-hbut-config/blobs/c297dc6928402fc0c73cec17ea7518d3731f7022/SmileySans-Oblique.ttf'
      }
    }
  },
})
