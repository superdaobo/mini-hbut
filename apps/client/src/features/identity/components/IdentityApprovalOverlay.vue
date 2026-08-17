<script setup lang="ts">
// IdentityApprovalOverlay.vue —— #623 授权确认顶层 Overlay。
//
// App.vue 只负责挂载本组件；状态机/网络/Rust 签名全部在 IdentityCoordinator 内完成，
// 本组件只做展示与用户动作转发（不实现 fetch/crypto/state machine）。
//
// 优先级（issue #623「Overlay 优先级」）：
//   force update / blocking announcement 可见时本 Overlay 隐藏（意图仍在内存排队），
//   强制遮罩关闭后自动恢复展示。
//
// 安全交互：
//   - 关闭按钮 / Escape = 取消此次授权（cancelActive），绝不静默隐藏后请求悬空；
//   - approving/denying 期间所有操作按钮禁用（防重复点击）；
//   - focus trap + aria-modal + safe-area；敏感 scope 有图标/文字双重标识。

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { IdentityCoordinator } from '../../../app/contracts/runtime'
import {
  getCachedStudentName,
  getRemainingSeconds,
  identityUiState,
  maskStudentId,
  overlayVisible
} from '../identityStore'
import { trapTabFocus, focusCard } from '../identityAccessibility'
import IdentityClientCard from './IdentityClientCard.vue'
import IdentityScopeList from './IdentityScopeList.vue'
import IdentityResultState from './IdentityResultState.vue'

const props = defineProps<{
  /** #621+#623 调度/审批 coordinator（由 useAppRuntime 装配） */
  identity: IdentityCoordinator
  /** 当前登录学号（展示“当前身份”用） */
  studentId: string
  /** 是否已登录（本地登录态） */
  isLoggedIn: boolean
  /** force update 遮罩可见（优先级高于本 Overlay） */
  forceUpdateVisible: boolean
  /** blocking announcement 遮罩可见（优先级高于本 Overlay） */
  blockingAnnouncementVisible: boolean
}>()

const ui = identityUiState
const cardRef = ref<HTMLElement | null>(null)

/** 12 相位（便捷引用） */
const phase = computed(() => ui.approvalPhase)

/** 是否展示 Overlay：有活跃请求 + 未被强制遮罩/登录页压制 */
const shouldShow = computed(
  () =>
    overlayVisible.value &&
    !props.forceUpdateVisible &&
    !props.blockingAnnouncementVisible
)

// 测试诊断：轮询上报 Overlay 状态（定位 phase 变化后 computed 不重算的问题）
let ovDiagTimer: ReturnType<typeof setInterval> | null = null
const ovDiagReport = (): void => {
  try {
    void fetch('http://127.0.0.1:4399/debug/logs/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scope: 'identity-overlay',
        level: 'info',
        message: `shouldShow=${String(shouldShow.value)} visible=${overlayVisible.value} force=${props.forceUpdateVisible} block=${props.blockingAnnouncementVisible} phase=${ui.approvalPhase} active=${ui.activeRequestId}`
      })
    }).catch(() => undefined)
  } catch {
    /* 静默 */
  }
}
ovDiagReport()
ovDiagTimer = setInterval(ovDiagReport, 3000)
onBeforeUnmount(() => {
  if (ovDiagTimer) clearInterval(ovDiagTimer)
})

/** 动作进行中（approving/denying）：禁用全部操作按钮 */
const busy = computed(() => phase.value === 'approving' || phase.value === 'denying')

/** 关闭按钮是否可用：动作进行中不可关闭（防悬空） */
const closeEnabled = computed(() => !busy.value)

/** 当前身份展示（本地缓存姓名有则显示，无则只显示脱敏学号） */
const cachedName = computed(() => getCachedStudentName(props.studentId || ''))

const verifiedAtText = computed(() => {
  if (!ui.verifiedAt) return '—'
  try {
    return new Date(ui.verifiedAt).toLocaleString()
  } catch {
    return '—'
  }
})

/** 剩余可批准时间（本地倒计时，不向服务器轮询） */
const remainingSeconds = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

const syncCountdown = (): void => {
  remainingSeconds.value = getRemainingSeconds(ui.requestDetail)
}

const startCountdown = (): void => {
  stopCountdown()
  syncCountdown()
  countdownTimer = setInterval(syncCountdown, 1000)
}

const stopCountdown = (): void => {
  if (countdownTimer !== null) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

const remainingText = computed(() => {
  const sec = remainingSeconds.value
  if (sec <= 0) return '即将过期'
  return `${sec} 秒`
})

const expiryUrgent = computed(() => remainingSeconds.value > 0 && remainingSeconds.value <= 30)

// ── 键盘可达性 ──────────────────────────────────────────────────────────────
const handleKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    event.preventDefault()
    if (ui.lastResult) {
      // 结果页确认：等价点击「完成」（先展示结果，再推进队列）
      props.identity.confirmResult()
    } else {
      void props.identity.cancelActive()
    }
    return
  }
  trapTabFocus(cardRef.value, event, document.activeElement)
}

const handleClose = (): void => {
  if (!closeEnabled.value) return
  if (ui.lastResult) {
    props.identity.confirmResult()
  } else {
    void props.identity.cancelActive()
  }
}

const handleGoLogin = (): void => {
  props.identity.goLogin()
}

watch(
  shouldShow,
  (visible) => {
    if (visible) {
      void nextTick(() => focusCard(cardRef.value))
      startCountdown()
    } else {
      stopCountdown()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  stopCountdown()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-pop">
      <div
        v-if="shouldShow"
        class="identity-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Mini-HBUT 登录授权"
        @keydown="handleKeydown"
      >
        <div ref="cardRef" class="identity-overlay-card modal-pop-card" tabindex="-1">
          <header class="identity-overlay-header">
            <div class="identity-overlay-title">
              <span class="material-symbols-outlined identity-overlay-title-icon" aria-hidden="true">verified_user</span>
              <h2>Mini-HBUT 登录授权</h2>
            </div>
            <button
              class="identity-overlay-close"
              type="button"
              aria-label="取消此次授权"
              :disabled="!closeEnabled"
              @click="handleClose"
            >
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </header>

          <!-- 加载中：获取授权信息 / 验证学校登录 -->
          <div
            v-if="phase === 'loading_request' || phase === 'received'"
            class="identity-loading"
            role="status"
          >
            <span class="material-symbols-outlined identity-loading-icon identity-spin" aria-hidden="true">sync</span>
            <h3>正在获取授权信息…</h3>
          </div>

          <div v-else-if="phase === 'validating_session'" class="identity-loading" role="status">
            <span class="material-symbols-outlined identity-loading-icon identity-spin" aria-hidden="true">manage_accounts</span>
            <h3>正在验证学校登录状态…</h3>
            <p class="identity-loading-hint">验证通过后即可继续授权</p>
            <button class="btn-secondary btn-ripple identity-loading-cancel" type="button" @click="identity.cancelActive()">
              取消
            </button>
          </div>

          <!-- 需要登录：复用现有登录流程 -->
          <div v-else-if="phase === 'needs_login'" class="identity-needs-login">
            <span class="material-symbols-outlined identity-needs-login-icon" aria-hidden="true">login</span>
            <h3>需要先登录 Mini-HBUT</h3>
            <p>完成学校登录后，授权请求会自动继续，无需重新点击网页按钮。</p>
            <div class="identity-actions">
              <button class="btn-secondary btn-ripple" type="button" @click="identity.denyActive()">取消</button>
              <button class="btn-primary btn-ripple" type="button" @click="handleGoLogin">去登录</button>
            </div>
          </div>

          <!-- 提交中：允许/拒绝 -->
          <div v-else-if="busy" class="identity-loading" role="status">
            <span class="material-symbols-outlined identity-loading-icon identity-spin" aria-hidden="true">lock</span>
            <h3>{{ phase === 'approving' ? '正在提交授权…' : '正在处理…' }}</h3>
            <p class="identity-loading-hint">请稍候，不要重复点击</p>
          </div>

          <!-- 就绪：展示应用/权限/当前身份 + 允许/拒绝 -->
          <div v-else-if="phase === 'ready' && ui.requestDetail" class="identity-approval-body">
            <!-- 测试应用横幅：仅授权链路测试，不获取真实数据 -->
            <div v-if="ui.requestDetail.client.is_test" class="identity-test-banner" role="note">
              🧪 <strong>测试应用</strong>：本授权仅用于链路测试，
              不会获取、保存或使用你的任何真实数据。
            </div>
            <IdentityClientCard :client="ui.requestDetail.client" />
            <IdentityScopeList :scopes="ui.requestDetail.scopes" />

            <section class="identity-current" aria-label="当前 Mini-HBUT 身份">
              <h4>当前 Mini-HBUT 身份</h4>
              <p class="identity-current-line">
                <strong>{{ cachedName || maskStudentId(studentId) }}</strong>
                <span v-if="cachedName" class="identity-current-sid">{{ maskStudentId(studentId) }}</span>
              </p>
              <p class="identity-current-meta">学校身份验证方式：Mini-HBUT 本地验证</p>
              <p class="identity-current-meta">最近验证：{{ verifiedAtText }}</p>
            </section>

            <p class="identity-expiry" :class="{ urgent: expiryUrgent }">
              <span class="material-symbols-outlined identity-expiry-icon" aria-hidden="true">schedule</span>
              请求剩余时间：{{ remainingText }}
            </p>

            <div class="identity-actions">
              <button
                class="btn-secondary btn-ripple identity-deny-btn"
                type="button"
                :disabled="busy"
                @click="identity.denyActive()"
              >
                拒绝
              </button>
              <button
                class="btn-primary btn-ripple identity-allow-btn"
                type="button"
                :disabled="busy"
                @click="identity.approveActive()"
              >
                允许
              </button>
            </div>
          </div>

          <!-- 终态结果（approved/denied/expired/error） -->
          <IdentityResultState v-else-if="ui.lastResult" :result="ui.lastResult" @close="handleClose" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style src="./IdentityApprovalOverlay.scoped.css" scoped></style>
