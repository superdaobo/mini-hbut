import { defineConfig, searchForWorkspaceRoot } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { TAURI_DEV_VITE_PORT } from './scripts/tauri_dev_port.mjs'

// 读取 package.json 中的版本号
import { readFileSync, realpathSync } from 'fs'
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

/**
 * #976：`VITE_APP_VERSION` 的口径 —— 版本名单（canary `allow_versions` / `deny_versions`
 * 与服务端 `GAME_PLATFORM_WRITE_DENY_CLIENT_VERSIONS`）匹配的唯一串，必须能区分构建来源。
 *
 * - **CI 构建**（GitHub Actions 会设置 `GITHUB_ACTIONS=true`）：保持原值不变 ——
 *   dev/beta 档位构建前由 `scripts/ci/stamp_app_version.mjs` 把 package.json stamp 成
 *   `X.Y.Z-beta.N`（与模块版本标签同串）；release 档位上报冻结的正式版号。
 * - **本地 / dev worktree 等未 stamp 构建**：package.json 停留在上一个正式版号，若原样上报
 *   会与线上正式版**同串**（版本名单层面无法区分、排障也无法分辨来源），故注入 `+local`
 *   后缀（如 `1.4.11+local`）。该串仍满足 `module_context.ts` 的版本字符集校验
 *   （`[0-9A-Za-z._+-]`），会被正常注入 iframe `app_version`，但**不会误中**按正式版
 *   或 beta 标签形态配置的名单（前缀通配 `1.4.11*` 除外 —— 见
 *   `docs/game-platform/canary-release-control.md` §9/§10）。
 *
 * 口径详情与发布前核对清单：`docs/game-platform/canary-release-control.md` §9。
 */
const isCiBuild = process.env.GITHUB_ACTIONS === 'true'
const appVersion = isCiBuild ? pkg.version : `${pkg.version}+local`

/**
 * 取「解析软链接后的真实路径」，不存在则返回 ''。
 *
 * 为什么需要：worktree 开发时 `node_modules` 常被做成 junction/软链接（指向主仓），
 * Vite 的 `server.fs` 白名单按 **realpath** 判定 → 其真实路径在 workspace root 之外 →
 * 字体等资源被拒（**403**），表现为「图标全部丢失」（Font Awesome `fa-solid-900.woff2`）。
 */
const resolveRealPathIfExists = (relative: string): string => {
  try {
    return realpathSync(path.resolve(process.cwd(), relative)).replace(/\\/g, '/')
  } catch {
    return ''
  }
}

const buildProfile = process.env.MINI_HBUT_BUILD_PROFILE || 'standard'
const isReleaseProfile = buildProfile === 'release'
const isDevFastProfile = buildProfile === 'dev-fast'
// 仅当环境变量显式为 1 时开启（ios-testflight.yml）。默认 release/dev/本地 build 保持全功能。
const appStoreBuildFlag = process.env.VITE_APP_STORE_BUILD === '1' ? '1' : ''
// 移动端发布构建排除产品隐藏视图（#591）：显式为 1 时启用（Android release / iOS TestFlight 注入），默认全功能
const excludeHiddenViewsFlag = process.env.VITE_EXCLUDE_HIDDEN_VIEWS === '1' ? '1' : ''
// App Store 数字 ID（App Store Connect → Apple ID）；合规包打开商店页；也可由 Lookup trackId 回填
const appleAppId = String(process.env.VITE_APPLE_APP_ID || '6787857278').trim().replace(/^id/i, '')

const toPosix = (value: string) => value.replace(/\\/g, '/')

const manualChunks = (id: string) => {
  const normalized = toPosix(id)
  if (normalized.includes('/node_modules/vue/') || normalized.includes('/node_modules/@vue/') || normalized.includes('/node_modules/pinia/') || normalized.includes('/node_modules/vue-router/')) {
    return 'vue-core'
  }
  if (
    normalized.includes('/node_modules/marked/') ||
    normalized.includes('/node_modules/dompurify/') ||
    normalized.includes('/node_modules/katex/') ||
    normalized.includes('/node_modules/marked-katex-extension/') ||
    normalized.includes('/src/utils/markdown.js')
  ) {
    return 'markdown'
  }
  if (
    // #993：html2canvas 刻意**不**并入 capture chunk。它与 capture_service 同属一个
    // manualChunk 时，capture_service 内的 `import('html2canvas')` 会解析到同一 chunk，
    // 无法真正切分，204 KB 仍随启动路径解析。独立成 chunk 后它只在真正截图时拉取。
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
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    'import.meta.env.VITE_BUILD_PROFILE': JSON.stringify(buildProfile),
    'import.meta.env.VITE_APP_STORE_BUILD': JSON.stringify(appStoreBuildFlag),
    'import.meta.env.VITE_APPLE_APP_ID': JSON.stringify(appleAppId),
    'import.meta.env.VITE_EXCLUDE_HIDDEN_VIEWS': JSON.stringify(excludeHiddenViewsFlag)
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'axios': path.resolve(__dirname, 'src/utils/axios_adapter.js')
    }
  },
  esbuild: {
    legalComments: 'none',
    drop: isReleaseProfile ? ['console', 'debugger'] : []
  },
  // 禁止 esbuild 自动全盘 discovery（monorepo 下 website/android 等可吃掉数 GB～20GB）
  optimizeDeps: {
    noDiscovery: true,
    entries: ['index.html', 'src/main.ts'],
    include: [
      'vue',
      'vue-router',
      'pinia',
      'axios',
      'marked',
      'dompurify',
      // CJS browser 入口含 require；必须预构建，否则 WebView 报 require is not defined 并白屏
      'qrcode'
    ]
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
    // 不要在首屏预热全站模块（会触发 esbuild 大批量编译）
    preTransformRequests: false,
    watch: {
      // 与历史配置一致：主工程热更新；额外忽略 monorepo 巨目录，避免 chokidar/esbuild 扫爆内存
      ignored: [
        '**/src-tauri/**',
        '**/website/**',
        '**/android/**',
        '**/ios/**',
        '**/dist/**',
        '**/dist-dev-packages/**',
        '**/forum-backend/**',
        '**/terminals/**',
        '**/mcps/**',
        '**/agent-tools/**',
        '**/node_modules/**',
        '**/.git/**'
      ]
    },
    fs: {
      strict: true,
      /**
       * 显式放行 **node_modules 的真实路径**：worktree 开发时 `node_modules` 常被做成 junction/软链接
       * （指向主仓），Vite 的 `server.fs` 按 realpath 判定 → 真实路径在 workspace root 之外 →
       * 字体等资源被拒（**403**），表现为「图标全部丢失」（Font Awesome `fa-solid-900.woff2`）。
       * 此处只追加**解析后的真实 node_modules 目录**，不放宽 `strict`、不整目录放开仓库外路径。
       */
      allow: [searchForWorkspaceRoot(process.cwd()), resolveRealPathIfExists('node_modules')].filter(Boolean),
      deny: ['**/website/**', '**/android/**', '**/ios/**', '**/src-tauri/target/**']
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
