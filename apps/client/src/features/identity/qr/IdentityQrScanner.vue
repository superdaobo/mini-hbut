<script setup lang="ts">
// IdentityQrScanner.vue —— #627 扫一扫登录扫描器（全屏 Modal）。
//
// 流程：拍摄/相册/粘贴 -> 本地解码（Rust rqrr，图片不出本机）-> parseIdentityQr
// （复用 #621 parseMiniHbutDeepLink 合同）-> submitIntent（与同设备 Deep Link
// 共用同一个 AuthRequest / intent store / #623 Overlay / 设备签名审批）。
//
// 安全与隐私（issue #627）：
//   - 审批面完全由 #623 IdentityApprovalOverlay 接管：扫到码绝不等于登录，
//     必须由用户在 Overlay 中确认 + Device Key 签名；
//   - 相机图片/解码文本只在本机处理，绝不上传；
//   - request raw / handoff secret 绝不显示给用户（错误一律通用文案）；
//   - 关闭/卸载即 RESET，不残留扫描状态（background/resume 安全）。

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { isMobileLike } from '../../../platform/runtime'
import { decodeIdentityQrImage } from './decodeIdentityQrImage'
import { parseIdentityQr } from './parseIdentityQr'
import {
  identityQrScanReducer,
  INITIAL_QR_SCAN_STATE,
  type IdentityQrScanEvent,
  type IdentityQrScanPhase
} from './identityQrScanState'
import { identityUiState } from '../identityStore'

const props = defineProps<{
  visible: boolean
  /** 提交授权意图（与深链同一入口；内部处理去重/队列提示） */
  submitIntent: (requestId: string, handoff: string) => void
}>()

const emit = defineEmits<{ close: [] }>()

const state = ref(INITIAL_QR_SCAN_STATE)
const dispatch = (event: IdentityQrScanEvent): void => {
  state.value = identityQrScanReducer(state.value, event)
}

const phase = computed<IdentityQrScanPhase>(() => state.value.phase)
const isMobile = isMobileLike()

// ── 扫描输入 ────────────────────────────────────────────────────────────────

const pasteText = ref('')
const parsing = computed(() => phase.value === 'parsing')

const handleFileChange = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 允许再次选择同一文件
  if (!file) {
    // 用户取消了系统相机/选择器：回到扫描态
    dispatch({ type: 'SUBMIT_REJECTED' })
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    dispatch({ type: 'PARSE_INVALID' })
    return
  }
  dispatch({ type: 'PICK_STARTED' })
  await runScanFlow(async () => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const decoded = await decodeIdentityQrImage(bytes, file.type || 'image/png')
    return decoded?.url ?? null
  })
}

const handlePasteSubmit = async (): Promise<void> => {
  const raw = pasteText.value.trim()
  if (!raw || parsing.value) return
  dispatch({ type: 'PICK_STARTED' })
  await runScanFlow(async () => raw)
}

/** 统一扫描流程：取得文本 -> 本地解析 -> 提交 coordinator */
const runScanFlow = async (obtain: () => Promise<string | null>): Promise<void> => {
  let raw: string | null = null
  try {
    raw = await obtain()
  } catch {
    raw = null
  }
  if (!raw) {
    // 解码失败/环境不支持：通用文案（不回显底层错误）
    dispatch({ type: 'PARSE_INVALID' })
    return
  }
  const result = parseIdentityQr(raw)
  pasteText.value = '' // 清空粘贴框（secret 载体不留存）
  if (!result.ok) {
    dispatch({ type: 'PARSE_INVALID' })
    return
  }
  // 与深链同一入口：requestId/handoff 只进入 intent store 内存
  props.submitIntent(result.link.requestId, result.link.handoff)
  dispatch({ type: 'SUBMITTED' })
}

// ── 与 #623 Overlay 联动（只读展示状态） ────────────────────────────────────

watch(
  () => [identityUiState.approvalPhase, identityUiState.lastResult?.outcome] as const,
  ([approvalPhase, outcome]) => {
    if (phase.value !== 'loading_request' && phase.value !== 'approval_opened') return
    if (approvalPhase !== 'idle') {
      dispatch({ type: 'APPROVAL_OPENED' })
    }
    // 过期由 Core 判定（result 页 outcome=expired）：扫描器给出明确文案
    if (outcome === 'expired') {
      dispatch({ type: 'REQUEST_EXPIRED' })
    }
  }
)

// ── 生命周期：关闭/卸载即重置（background/resume 不残留） ───────────────────

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      dispatch({ type: 'OPEN' })
    } else {
      dispatch({ type: 'RESET' })
      pasteText.value = ''
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  dispatch({ type: 'RESET' })
})

const handleClose = (): void => {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="identity-qr-scanner" role="dialog" aria-modal="true" aria-label="扫一扫登录">
      <div class="identity-qr-scanner-card">
        <header class="identity-qr-scanner-head">
          <span class="material-symbols-outlined identity-qr-scanner-head-icon" aria-hidden="true">qr_code_scanner</span>
          <h2>扫一扫登录</h2>
          <button class="identity-qr-scanner-close" type="button" aria-label="关闭扫一扫" @click="handleClose">
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </header>

        <!-- 扫描/降级入口 -->
        <div
          v-if="phase === 'scanning' || phase === 'permission_needed'"
          class="identity-qr-scanner-body"
        >
          <p v-if="phase === 'permission_needed'" class="identity-qr-scanner-notice">
            相机不可用，可以使用相册图片或手动粘贴链接继续。
          </p>
          <div class="identity-qr-scanner-entries">
            <label class="identity-qr-scanner-entry identity-qr-scanner-entry--primary">
              <span class="material-symbols-outlined" aria-hidden="true">{{ isMobile ? 'photo_camera' : 'image' }}</span>
              <span>{{ isMobile ? '拍摄二维码' : '选择二维码图片' }}</span>
              <input
                class="identity-qr-scanner-file"
                type="file"
                accept="image/*"
                :capture="isMobile ? 'environment' : undefined"
                @change="handleFileChange"
              />
            </label>
          </div>
          <div class="identity-qr-scanner-paste">
            <textarea
              v-model="pasteText"
              class="identity-qr-scanner-paste-input"
              rows="3"
              placeholder="粘贴电脑网页上复制的扫码链接…"
              :disabled="parsing"
              spellcheck="false"
            ></textarea>
            <button
              class="identity-qr-scanner-action"
              type="button"
              :disabled="parsing || !pasteText.trim()"
              @click="handlePasteSubmit"
            >
              解析链接
            </button>
          </div>
          <p class="identity-qr-scanner-hint">
            图片与链接只在本地识别，不会上传服务器；扫码后仍需在弹窗中确认授权。
          </p>
        </div>

        <!-- 解析中 -->
        <div v-else-if="phase === 'parsing'" class="identity-qr-scanner-body identity-qr-scanner-status" role="status">
          <span class="material-symbols-outlined identity-qr-scanner-spin" aria-hidden="true">sync</span>
          <h3>正在识别二维码…</h3>
        </div>

        <!-- 无效码 -->
        <div v-else-if="phase === 'invalid_code'" class="identity-qr-scanner-body identity-qr-scanner-status">
          <span class="material-symbols-outlined identity-qr-scanner-status-error" aria-hidden="true">error</span>
          <h3>这不是有效的 Mini-HBUT 登录二维码</h3>
          <button class="identity-qr-scanner-action" type="button" @click="dispatch({ type: 'OPEN' })">
            重新扫描
          </button>
        </div>

        <!-- 已过期 -->
        <div v-else-if="phase === 'expired_request'" class="identity-qr-scanner-body identity-qr-scanner-status">
          <span class="material-symbols-outlined identity-qr-scanner-status-error" aria-hidden="true">timer_off</span>
          <h3>二维码已过期，请在电脑网页重新发起登录</h3>
          <button class="identity-qr-scanner-action" type="button" @click="handleClose">关闭</button>
        </div>

        <!-- 已提交，等待详情 -->
        <div v-else-if="phase === 'loading_request'" class="identity-qr-scanner-body identity-qr-scanner-status" role="status">
          <span class="material-symbols-outlined identity-qr-scanner-spin" aria-hidden="true">sync</span>
          <h3>已提交授权请求，正在获取信息…</h3>
        </div>

        <!-- 审批 Overlay 接管 -->
        <div v-else-if="phase === 'approval_opened'" class="identity-qr-scanner-body identity-qr-scanner-status">
          <span class="material-symbols-outlined identity-qr-scanner-status-ok" aria-hidden="true">verified_user</span>
          <h3>已转交授权确认</h3>
          <p class="identity-qr-scanner-status-desc">
            请在授权弹窗中核对应用与权限后确认；你无需在电脑上做任何操作。
          </p>
          <button class="identity-qr-scanner-action" type="button" @click="handleClose">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.identity-qr-scanner {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  background: color-mix(in oklab, #0b1220 62%, transparent);
  backdrop-filter: blur(4px);
}

.identity-qr-scanner-card {
  width: min(420px, 100%);
  max-height: 82vh;
  overflow-y: auto;
  border-radius: calc(18px * var(--ui-radius-scale, 1));
  background: var(--ui-surface, #ffffff);
  color: var(--ui-text, #0f172a);
  box-shadow: 0 24px 64px rgba(2, 6, 23, 0.45);
  padding: 20px;
}

.identity-qr-scanner-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.identity-qr-scanner-head h2 {
  margin: 0;
  font-size: calc(17px * var(--ui-font-scale, 1));
  flex: 1;
}

.identity-qr-scanner-head-icon {
  color: var(--ui-primary, #2563eb);
}

.identity-qr-scanner-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.16);
  color: var(--ui-muted, #64748b);
  cursor: pointer;
}

.identity-qr-scanner-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.identity-qr-scanner-notice {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
  font-size: calc(12.5px * var(--ui-font-scale, 1));
}

.identity-qr-scanner-entries {
  display: flex;
  gap: 10px;
}

.identity-qr-scanner-entry {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 22px 12px;
  border: 2px dashed rgba(148, 163, 184, 0.4);
  border-radius: calc(14px * var(--ui-radius-scale, 1));
  background: color-mix(in oklab, var(--ui-surface, #fff) 70%, transparent);
  color: var(--ui-muted, #64748b);
  font-size: calc(13px * var(--ui-font-scale, 1));
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.identity-qr-scanner-entry:hover {
  border-color: var(--ui-primary, #2563eb);
  color: var(--ui-primary, #2563eb);
}

.identity-qr-scanner-file {
  display: none;
}

.identity-qr-scanner-paste {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.identity-qr-scanner-paste-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: calc(10px * var(--ui-radius-scale, 1));
  background: color-mix(in oklab, var(--ui-surface, #fff) 80%, transparent);
  color: var(--ui-text, #0f172a);
  font-size: calc(13px * var(--ui-font-scale, 1));
  font-family: inherit;
  resize: vertical;
  outline: none;
}

.identity-qr-scanner-action {
  padding: 10px 16px;
  border: none;
  border-radius: calc(10px * var(--ui-radius-scale, 1));
  background: var(--ui-primary, #2563eb);
  color: #fff;
  font-size: calc(13px * var(--ui-font-scale, 1));
  font-weight: 700;
  cursor: pointer;
}

.identity-qr-scanner-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.identity-qr-scanner-hint {
  margin: 0;
  font-size: calc(11.5px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
  text-align: center;
}

.identity-qr-scanner-status {
  align-items: center;
  text-align: center;
  padding: 18px 0;
}

.identity-qr-scanner-status h3 {
  margin: 0;
  font-size: calc(15px * var(--ui-font-scale, 1));
}

.identity-qr-scanner-status-desc {
  margin: 0;
  font-size: calc(12.5px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
}

.identity-qr-scanner-spin {
  font-size: 40px;
  color: var(--ui-primary, #2563eb);
  animation: identity-qr-scanner-rotate 1s linear infinite;
}

.identity-qr-scanner-status-error {
  font-size: 40px;
  color: var(--ui-danger, #dc2626);
}

.identity-qr-scanner-status-ok {
  font-size: 40px;
  color: #16a34a;
}

@keyframes identity-qr-scanner-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
