<script setup>
/**
 * 图书馆预约 · 官方页面内嵌（2026-10-19）
 *
 * 用途：座位的「快速预约」提交必须带 **cxCaptcha 行为验证 token**（需人工点击），
 * 纯接口方案不可行。本组件把官方页嵌进 App，由官方页自己完成验证与提交。
 *
 * 后端命令（`modules/library_reserve_embed.rs`）：
 * - `library_reserve_embed_open`   → 创建子 WebView + **注入超星会话 cookie** + 导航
 * - `library_reserve_embed_resize` → 跟随 DOM 容器位置/尺寸
 * - `library_reserve_embed_close`  → 关闭子 WebView
 *
 * ⚠️ 子 WebView 是**原生浮层**（不是 iframe），会盖住容器范围内的所有 DOM。
 * 因此：
 * - 只在「已打开」时挂载容器（避免白占位），打开前先 `nextTick` + 双 rAF 等布局；
 * - 关闭按钮放在容器**外面**，保证始终可点；
 * - 页面滚动 / 窗口缩放时用 ResizeObserver + 定时器同步 bounds，否则浮层会错位。
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { invokeNative } from '../../platform/native'
import { useLocale } from '../../utils/app_i18n'
import { TCollapse } from '../templates'

const props = defineProps({
  /** 应用标识：seat / quiet_room / seminar_room */
  app: { type: String, required: true },
  /** 页面形态：live（座位快速预约页）/ index（入口落地页） */
  kind: { type: String, default: 'live' }
})

const { t } = useLocale()

/** 原生浮层要覆盖的容器 */
const host = ref(null)
const opened = ref(false)
const busy = ref(false)
const error = ref('')

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
  if (!opened.value) return
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

/** 打开官方页（先挂容器 → 滚入视野 → 量 bounds → 建浮层） */
const open = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  opened.value = true
  try {
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
  } catch (e) {
    opened.value = false
    error.value = String(e?.message ?? e ?? t('library.reserve.embed.error'))
  } finally {
    busy.value = false
  }
}

/** 关闭官方页（卸载前 / 用户点关闭 / 切换应用） */
const close = async () => {
  stopSync()
  opened.value = false
  try {
    await invokeNative('library_reserve_embed_close')
  } catch {
    // 移动端命令可能不存在 / 已关闭
  }
}

// 切换静音仓 ⇄ 研讨室等：必须关掉旧浮层，否则会盖在新面板上
watch(
  () => [props.app, props.kind],
  () => {
    if (opened.value) void close()
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
    <!-- 原生浮层覆盖区：仅打开时挂载 -->
    <div v-if="opened" ref="host" class="embed__host"></div>
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
