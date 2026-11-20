<script setup>
/**
 * 学习通官方页内嵌（P4-B，#1343）。
 *
 * 桌面端走 Rust 子 WebView（`chaoxing_embed_open`）：屏外建页 → 注入 `.chaoxing.com`
 * 会话 cookie → 带 cookie 重载 → 搬到本组件容器位置，因此打开就是**已登录态**，
 * 不会弹登录页（PR-A 实测：注入 39 条 cookie，落地 URL 不跳 passport2）。
 *
 * 其它平台（iOS / Android / 纯浏览器）拿不到 Rust 侧的 cookie jar，内嵌必然跳登录页，
 * 因此直接降级为系统浏览器打开 —— 不假装「已登录」。
 *
 * ⚠️ 原生浮层会盖住容器范围内的所有 DOM，所以：
 * - 返回/关闭按钮放在容器**外面**（顶栏），始终可点；
 * - 页面滚动 / 窗口缩放时同步 bounds，否则浮层会错位。
 */
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { invokeNative, isTauriDesktopRuntime } from '../../../platform/native'
import { useLocale } from '../../../utils/app_i18n'
import { openExternal } from '../../../utils/external_link'

/**
 * 手机 UA。
 *
 * 实测：超星按 UA 下发不同版式 —— 桌面版在 400~600px 宽度下需要横向滚动、字号极小；
 * 手机版是单列布局，正好适配 App 的窄窗口。因此内嵌页统一用手机 UA。
 */
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

const props = defineProps({
  /** 要打开的学习通地址（只允许 *.chaoxing.com，后端会再校验一次） */
  url: { type: String, default: '' },
  /** 顶栏标题（课程名 / 作业名） */
  title: { type: String, default: '' }
})

const emit = defineEmits(['close'])

const { t } = useLocale()

const host = ref(null)
const opened = ref(false)
/**
 * 缩放：超星桌面版页面是**固定宽度**（约 1000px），窄窗口下必须整体缩小，
 * 否则右侧内容被裁掉只能横向滚动。默认「适应宽度」，可一键切 1:1。
 */
const zoom = ref(1)
const busy = ref(false)
const error = ref('')

let syncTimer = null

/** 容器当前视口矩形（CSS px；与主窗口坐标系一致，原生浮层用逻辑像素定位） */
const boundsOf = () => {
  const el = host.value
  if (!el || !el.isConnected) return null
  const rect = el.getBoundingClientRect()
  const x = Math.max(0, Math.round(rect.left))
  const y = Math.max(0, Math.round(rect.top))
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  if (width < 8 || height < 8) return null
  return { x, y, width, height }
}

const stopSync = () => {
  if (syncTimer !== null) {
    window.clearInterval(syncTimer)
    syncTimer = null
  }
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
}

const startSync = () => {
  stopSync()
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
  // 原生浮层不会跟随 DOM 变化，定时兜底纠正（返回键/输入法弹起等）
  syncTimer = window.setInterval(onViewportChange, 500)
}

function onViewportChange() {
  void sync()
}

/** 同步浮层位置（失败静默：下一次同步会纠正） */
const sync = async () => {
  if (!opened.value || busy.value) return
  const bounds = boundsOf()
  if (!bounds) return
  try {
    await invokeNative('chaoxing_embed_resize', { bounds })
  } catch {
    // 浮层可能已被用户关闭
  }
}

/** 适应宽度：按 1000px 版面宽估算（实测超星桌面版容器约 1000px） */
const fitZoom = () => {
  const width = window.innerWidth || 420
  const ratio = Math.round((width / 1000) * 100) / 100
  return Math.max(0.45, Math.min(1, ratio))
}

/** 在「适应宽度」与「1:1」之间切换 */
const toggleZoom = async () => {
  const next = zoom.value < 0.999 ? 1 : fitZoom()
  zoom.value = next
  try {
    await invokeNative('chaoxing_embed_zoom', { zoom: next })
  } catch {
    // 浮层可能已关闭
  }
}

const waitForLayout = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))
  })

/** 打开官方页（桌面内嵌 / 其它平台系统浏览器） */
const open = async (url) => {
  const target = String(url || props.url || '').trim()
  if (!target) {
    error.value = '缺少目标地址'
    return
  }
  error.value = ''

  if (!isTauriDesktopRuntime()) {
    await openExternal(target)
    emit('close')
    return
  }

  busy.value = true
  opened.value = true
  try {
    await nextTick()
    await waitForLayout()
    const bounds = boundsOf()
    if (!bounds) throw new Error('内嵌容器尺寸无效')
    zoom.value = fitZoom()
    await invokeNative('chaoxing_embed_open', {
      url: target,
      bounds,
      userAgent: MOBILE_UA,
      zoom: zoom.value
    })
    startSync()
  } catch (e) {
    opened.value = false
    error.value = String(e?.message || e || '打开失败')
  } finally {
    busy.value = false
  }
}

/** 关闭：先收浮层再通知父组件 */
const close = async () => {
  stopSync()
  if (opened.value) {
    try {
      await invokeNative('chaoxing_embed_close')
    } catch {
      // 忽略：可能已被系统回收
    }
  }
  opened.value = false
  emit('close')
}

onBeforeUnmount(() => {
  stopSync()
  if (opened.value) {
    void invokeNative('chaoxing_embed_close').catch(() => {})
  }
})

defineExpose({ open, close })
</script>

<template>
  <Teleport to="body">
    <div v-if="opened" class="cx-embed">
      <header class="cx-embed__bar">
        <button type="button" class="cx-embed__back" :aria-label="t('chaoxing.embed.back')" @click="close">
          <span class="material-symbols-outlined">arrow_back</span>
        </button>
        <div class="cx-embed__title">
          <strong>{{ title || t('chaoxing.embed.title') }}</strong>
          <span>{{ t('chaoxing.embed.loggedIn') }}</span>
        </div>
        <button type="button" class="cx-embed__zoom" @click="toggleZoom">
          {{ zoom < 0.999 ? t('chaoxing.embed.actual') : t('chaoxing.embed.fit') }}
        </button>
        <button type="button" class="cx-embed__close" @click="close">{{ t('chaoxing.embed.close') }}</button>
      </header>
      <div ref="host" class="cx-embed__host">
        <p v-if="busy" class="cx-embed__tip">{{ t('chaoxing.embed.opening') }}</p>
        <p v-else-if="error" class="cx-embed__tip is-error">{{ error }}</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cx-embed {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  flex-direction: column;
  background: #ffffff;
}

.cx-embed__bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 3.5rem;
  padding: 0 0.75rem;
  border-bottom: 1px solid var(--md-sys-color-surface-variant, #dfe3e7);
  background: #ffffff;
  flex: 0 0 auto;
}

.cx-embed__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: none;
  border-radius: 9999px;
  background: transparent;
  cursor: pointer;
}

.cx-embed__title {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cx-embed__title strong {
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cx-embed__title span {
  font-size: 11px;
  color: var(--md-sys-color-on-surface-variant, #424754);
}

.cx-embed__zoom {
  flex-shrink: 0;
  border: 1px solid var(--md-sys-color-surface-variant, #dfe3e7);
  background: transparent;
  color: var(--md-sys-color-on-surface-variant, #424754);
  font-size: 12px;
  font-weight: 600;
  padding: 0.35rem 0.6rem;
  border-radius: 9999px;
  cursor: pointer;
}

.cx-embed__close {
  border: none;
  background: rgba(0, 88, 190, 0.1);
  color: #0058be;
  font-size: 13px;
  font-weight: 600;
  padding: 0.4rem 0.85rem;
  border-radius: 9999px;
  cursor: pointer;
}

.cx-embed__host {
  flex: 1;
  position: relative;
  min-height: 1px;
}

.cx-embed__tip {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--md-sys-color-on-surface-variant, #424754);
}

.cx-embed__tip.is-error {
  color: #ef4444;
}
</style>
