<script setup>
/**
 * 图书馆预约 · 官方页面内嵌（2026-10-19 桌面 / #1081 iOS 三分支）
 *
 * 用途：座位的「快速预约」提交必须带 **cxCaptcha 行为验证 token**（需人工点击），
 * 纯接口方案不可行。本组件把官方页嵌进 App，由官方页自己完成验证与提交。
 *
 * 三条分支（判定见 `utils/library_reserve_embed.ts`）：
 * - `native-webview`（桌面）：Rust 子 WebView
 *   `library_reserve_embed_open` → 创建子 WebView + 注入超星会话 cookie + 导航；
 *   `library_reserve_embed_resize` → 跟随 DOM 容器位置/尺寸；
 *   `library_reserve_embed_close`  → 关闭子 WebView；
 * - `proxy-iframe`（iOS）：`Window::add_child` 在移动端不存在，改走 Bridge 反向代理
 *   （`/reserve-embed/…`）+ `<iframe>`；地址由 `library_reserve_embed_proxy_url` 现取
 *   （含短时效凭证，不缓存）；
 * - `external-open`：桥不可达 / Android / 纯浏览器 → 用系统浏览器打开官方入口。
 *
 * ⚠️ 桌面分支的子 WebView 是**原生浮层**（不是 iframe），会盖住容器范围内的所有 DOM。
 * 因此：
 * - 只在「已打开」时挂载容器（避免白占位），打开前先 `nextTick` + 双 rAF 等布局；
 * - 关闭按钮放在容器**外面**，保证始终可点；
 * - 页面滚动 / 窗口缩放时用 ResizeObserver + 定时器同步 bounds，否则浮层会错位。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { invokeNative } from '../../platform/native'
import { openExternal } from '../../utils/external_link'
import { useLocale } from '../../utils/app_i18n'
import { TCollapse } from '../templates'
import {
  fetchLibraryReserveEmbedProxyInfo,
  resolveLibraryReserveEmbedMode,
  retryLibraryReserveEmbedMode
} from '../../utils/library_reserve_embed'

const props = defineProps({
  /** 应用标识：seat / quiet_room / seminar_room */
  app: { type: String, required: true },
  /** 页面形态：live（座位快速预约页）/ index（入口落地页） */
  kind: { type: String, default: 'live' }
})

const { t } = useLocale()

/** 内嵌模式：native-webview（桌面子 WebView）/ proxy-iframe（桥代理）/ external-open（降级） */
const mode = ref('native-webview')
/** 桌面分支：原生浮层要覆盖的容器 */
const host = ref(null)
const opened = ref(false)
const busy = ref(false)
const error = ref('')
/** 桥代理分支的 iframe 地址（每次打开现取，含短时效凭证） */
const iframeSrc = ref('')
/** 官方入口地址（含短时效凭证）：降级「用系统浏览器打开」时用 */
const entryUrl = ref('')
/** 是否展示「用系统浏览器打开」降级区（桥不可达 / iframe 加载失败） */
const fallbackVisible = ref(false)
/** iframe 是否仍在加载（首屏提示） */
const frameLoading = ref(false)

const useNativeEmbed = computed(() => mode.value === 'native-webview')
const useIframe = computed(() => mode.value === 'proxy-iframe' && !!iframeSrc.value)

let resizeObserver = null
let syncTimer = null

/** 容器当前视口矩形（CSS px；与主窗口坐标系一致，浮层用逻辑像素定位） */
const boundsOf = () => {
  const el = host.value
  if (!el || !el.isConnected) return null
  const rect = el.getBoundingClientRect()
  const x = Math.max(0, Math.round(rect.left))
  const y = Math.max(0, Math.round(rect.top))
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  // 过小视为容器尚未布局（返回/卸载过渡期），不下发避免把浮层放大遮挡
  if (width < 8 || height < 8) return null
  return { x, y, width, height }
}

/** 同步浮层位置（失败静默：下一次同步会纠正） */
const sync = async () => {
  if (!opened.value || !useNativeEmbed.value) return
  const bounds = boundsOf()
  if (!bounds) return
  try {
    await invokeNative('library_reserve_embed_resize', { bounds })
  } catch {
    // ignore — 浮层可能已关闭
  }
}

const onViewportChange = () => {
  void sync()
}

const stopSync = () => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (syncTimer !== null) {
    window.clearInterval(syncTimer)
    syncTimer = null
  }
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
}

const startSync = () => {
  stopSync()
  resizeObserver = new ResizeObserver(onViewportChange)
  if (host.value) resizeObserver.observe(host.value)
  if (host.value?.parentElement) resizeObserver.observe(host.value.parentElement)
  window.addEventListener('resize', onViewportChange)
  // 捕获阶段：滚动发生在 .app-shell 上，冒泡监听收不到
  window.addEventListener('scroll', onViewportChange, true)
  // 定时兜底：布局变化不一定触发 RO（如字体加载完成后的换行）
  syncTimer = window.setInterval(onViewportChange, 400)
}

const waitForLayout = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })

/** 桌面分支：挂容器 → 滚入视野 → 量 bounds → 建原生浮层 */
const openNativeEmbed = async () => {
  opened.value = true
  await nextTick()
  // 原生浮层按**当前视口矩形**定位，容器若在屏幕外，用户会看不到浮层
  // （实测：容器在 y≈987、视口仅 801 时浮层完全不可见）。故先滚入视野再量。
  host.value?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  await waitForLayout()
  const bounds = boundsOf()
  if (!bounds) {
    opened.value = false
    error.value = t('library.reserve.embed.error')
    return
  }
  await invokeNative('library_reserve_embed_open', {
    req: { app: props.app, kind: props.kind, bounds }
  })
  startSync()
}

/** 打开官方页（按平台选分支） */
const open = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  fallbackVisible.value = false
  try {
    let resolved = await resolveLibraryReserveEmbedMode()
    if (resolved === 'external-open') {
      // 桥可能只是休眠：先让原生 ensure_http_bridge 拉起，再判一次
      resolved = await retryLibraryReserveEmbedMode()
    }
    mode.value = resolved

    if (resolved === 'native-webview') {
      await openNativeEmbed()
      return
    }

    if (resolved === 'proxy-iframe') {
      // 桥内地址现取（含短时效凭证）；失败即降级，不留白屏
      const info = await fetchLibraryReserveEmbedProxyInfo({
        app: props.app,
        kind: props.kind
      })
      entryUrl.value = info.entryUrl
      iframeSrc.value = info.url
      frameLoading.value = true
      opened.value = true
      return
    }

    // 桥不可达：不自动跳浏览器（避免抢走用户操作），只给说明 + 降级按钮
    opened.value = false
    fallbackVisible.value = true
  } catch (e) {
    opened.value = false
    iframeSrc.value = ''
    // 移动端分支的失败原因（如 SSO 未登录）由 Rust 给出中文原文，不适合直接展示，
    // 统一落到 i18n 文案；原始信息进调试日志，便于真机排障。
    const detail = String(e?.message ?? e ?? '')
    if (detail) {
      try {
        const { pushDebugLog } = await import('../../utils/debug_logger')
        pushDebugLog('LibraryReserve', `embed open failed: ${detail}`, 'warn')
      } catch {
        // ignore
      }
    }
    error.value = t('library.reserve.embed.error')
  } finally {
    busy.value = false
  }
}

/** 关闭官方页（卸载前 / 用户点关闭 / 切换应用） */
const close = async () => {
  stopSync()
  opened.value = false
  iframeSrc.value = ''
  frameLoading.value = false
  fallbackVisible.value = false
  try {
    // 桌面分支真正关闭原生浮层；移动端桩函数返回 Ok（no-op）
    await invokeNative('library_reserve_embed_close')
  } catch {
    // 移动端命令可能不存在 / 已关闭
  }
}

const onIframeLoad = () => {
  frameLoading.value = false
}

/** iframe 加载失败（网络级；HTTP 404 也会触发 load，靠 probe 分支兜住） */
const onIframeError = () => {
  frameLoading.value = false
  if (useNativeEmbed.value) return
  error.value = t('library.reserve.embed.error')
  fallbackVisible.value = true
}

/** 降级：用系统浏览器打开官方入口（凭证现取，不缓存） */
const openInBrowser = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    let target = entryUrl.value
    if (!target) {
      const info = await fetchLibraryReserveEmbedProxyInfo({
        app: props.app,
        kind: props.kind
      })
      entryUrl.value = info.entryUrl
      target = info.entryUrl
    }
    const ok = await openExternal(target)
    if (!ok) error.value = t('library.reserve.embed.error')
  } catch (e) {
    const detail = String(e?.message ?? e ?? '')
    if (detail) {
      try {
        const { pushDebugLog } = await import('../../utils/debug_logger')
        pushDebugLog('LibraryReserve', `embed external open failed: ${detail}`, 'warn')
      } catch {
        // ignore
      }
    }
    error.value = t('library.reserve.embed.error')
  } finally {
    busy.value = false
  }
}

// 切换静音仓 ⇄ 研讨室等：必须关掉旧浮层 / 旧 iframe，否则会盖在新面板上
watch(
  () => [props.app, props.kind],
  () => {
    if (opened.value || fallbackVisible.value) void close()
  }
)

onBeforeUnmount(() => {
  void close()
})

defineExpose({ open, close })
</script>

<template>
  <section class="card embed">
    <div class="embed__head">
      <div class="embed__title">
        <strong>{{ t('library.reserve.embed.title') }}</strong>
        <span class="embed__badge">{{ t('library.reserve.embed.badge') }}</span>
      </div>
      <button v-if="!opened" type="button" class="primary embed__btn" :disabled="busy" @click="open">
        {{ busy ? t('library.reserve.embed.opening') : t('library.reserve.embed.open') }}
      </button>
      <button v-else type="button" class="ghost embed__btn" @click="close">
        {{ t('library.reserve.embed.close') }}
      </button>
    </div>
    <!-- 常驻只留一句结论（13 字）；完整说明（#1082 全项目最长的一条）默认收起 -->
    <p class="hint">{{ t('library.reserve.embed.hintShort') }}</p>
    <TCollapse :title="t('library.reserve.collapse.hint')">
      <p class="hint">{{ t('library.reserve.embed.hint') }}</p>
    </TCollapse>
    <p v-if="error" class="err">{{ error }}</p>

    <!-- 桌面：原生浮层覆盖区（仅打开时挂载；子 WebView 是原生层，不占 DOM 流） -->
    <div v-if="opened && useNativeEmbed" ref="host" class="embed__host"></div>

    <!-- iOS 等无 add_child 的平台：Bridge 反向代理 + iframe（同源，会话由 Rust jar 提供） -->
    <div v-if="opened && useIframe" class="embed__host embed__host--frame">
      <p v-if="frameLoading" class="hint embed__loading">{{ t('library.reserve.embed.opening') }}</p>
      <iframe
        class="embed__frame"
        :src="iframeSrc"
        :title="t('library.reserve.embed.iframeTitle')"
        referrerpolicy="no-referrer-when-downgrade"
        loading="eager"
        @load="onIframeLoad"
        @error="onIframeError"
      ></iframe>
    </div>

    <!-- 桥不可达 / iframe 加载失败：降级为系统浏览器（说明 + 按钮） -->
    <div v-if="fallbackVisible" class="fallback">
      <p class="hint">{{ t('library.reserve.embed.externalHint') }}</p>
      <button type="button" class="ghost embed__btn" :disabled="busy" @click="openInBrowser">
        {{ t('library.reserve.embed.externalOpen') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.embed {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.embed__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.embed__title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.embed__title strong {
  font-size: calc(14px * var(--ui-font-scale));
  color: var(--ui-text);
}
.embed__badge {
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
  font-size: calc(11px * var(--ui-font-scale));
  font-weight: 700;
}
.embed__btn {
  flex: 0 0 auto;
}
.embed__host {
  width: 100%;
  height: min(68vh, 620px);
  border-radius: calc(12px * var(--ui-radius-scale));
  background: var(--ui-surface-border);
}
.embed__host--frame {
  position: relative;
  overflow: hidden;
  background: #fff;
}
.embed__frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}
.embed__loading {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  background: color-mix(in srgb, #fff 88%, transparent);
}
.fallback {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.hint {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-muted);
  line-height: 1.6;
}
.err {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-danger);
  line-height: 1.6;
  word-break: break-word;
}
.primary {
  min-height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: calc(12px * var(--ui-radius-scale));
  background: var(--ui-primary);
  color: #fff;
  font-size: calc(13px * var(--ui-font-scale));
  font-weight: 700;
  cursor: pointer;
}
.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.ghost {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--ui-surface-border);
  border-radius: calc(12px * var(--ui-radius-scale));
  background: transparent;
  color: var(--ui-text);
  font-size: calc(13px * var(--ui-font-scale));
  font-weight: 700;
  cursor: pointer;
}
</style>
