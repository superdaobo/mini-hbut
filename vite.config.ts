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
/** Tauri 低内存 dev：禁止 esbuild 全库依赖发现（website/android/target 曾拖到 20GB+） */
const isLowMemDev =
  isDevFastProfile ||
  process.env.MINI_HBUT_LOWMEM === '1' ||
  process.env.MINI_HBUT_LOWMEM === 'true'
const toPosix = (value: string) => value.replace(/\\/g, '/')

/** monorepo 巨目录：绝不能让 chokidar / optimizeDeps 去爬 */
const HEAVY_WATCH_IGNORES = [
  '**/src-tauri/**',
  '**/src-tauri/target/**',
  '**/target/**',
  '**/dist/**',
  '**/dist-dev-packages/**',
  '**/website/**',
  '**/website/node_modules/**',
  '**/website/dist/**',
  '**/website/modules-src/**',
  '**/android/**',
  '**/ios/**',
  '**/forum-backend/**',
  '**/node_modules/**',
  '**/.git/**',
  '**/terminals/**',
  '**/.ci-logs/**',
  '**/agent-tools/**',
  '**/mcps/**',
  '**/issues-draft/**',
  '**/resource-share-form/**',
  '**/packages/**/node_modules/**',
  '**/.pytest_cache/**',
  '**/cloudflare/**'
] as const

/** 低内存 dev 只预构建常用依赖，关闭自动 discovery */
const LOWMEM_OPTIMIZE_INCLUDE = [
  'vue',
  'vue-router',
  'pinia',
  'axios',
  'marked',
  'dompurify',
  '@tauri-apps/api',
  '@tauri-apps/plugin-shell',
  '@tauri-apps/plugin-dialog',
  '@tauri-apps/plugin-fs',
  '@tauri-apps/plugin-http',
  '@tauri-apps/plugin-process',
  '@tauri-apps/plugin-updater',
  '@capacitor/core',
  '@capacitor/app',
  '@capacitor/browser'
]

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
  // 低内存 dev 用独立缓存，避免脏缓存触发全量重扫
  cacheDir: isLowMemDev
    ? path.resolve(__dirname, 'node_modules/.vite-lowmem')
    : path.resolve(__dirname, 'node_modules/.vite'),
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
    target: 'es2020',
    // 限制 esbuild 并发 worker，配合 GOMAXPROCS/GOMEMLIMIT
    ...(isLowMemDev ? { logLevel: 'error' as const } : {})
  },
  optimizeDeps: {
    // 关键：关闭自动依赖发现，避免 esbuild 爬 monorepo 巨目录（实测 22GB）
    ...(isLowMemDev
      ? {
          noDiscovery: true,
          include: LOWMEM_OPTIMIZE_INCLUDE,
          entries: ['index.html', 'src/main.ts'],
          holdUntilCrawlEnd: false
        }
      : {}),
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
    // 禁止通过 URL 读出 monorepo 巨目录
    fs: {
      strict: true,
      allow: [
        path.resolve(__dirname),
        path.resolve(__dirname, 'src'),
        path.resolve(__dirname, 'public'),
        path.resolve(__dirname, 'node_modules'),
        path.resolve(__dirname, 'packages')
      ],
      deny: [
        '**/src-tauri/target/**',
        '**/website/**',
        '**/android/**',
        '**/ios/**',
        '**/dist-dev-packages/**'
      ]
    },
    watch: {
      // 绝不能监听 website/android/target（十万级文件 → esbuild/chokidar 内存爆炸）
      ignored: [...HEAVY_WATCH_IGNORES],
      awaitWriteFinish: isLowMemDev
        ? {
            stabilityThreshold: 600,
            pollInterval: 200
          }
        : {
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
