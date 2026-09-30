<script setup>
/**
 * 游乐场「漂流瓶」Tab（#910 真实现，替换 #905 占位）。
 *
 * 覆盖完整闭环：捞瓶 / 投文本瓶 / 投红包瓶 / 领取红包 / 举报 / 隐藏 / 结果状态。
 *
 * 关键决策：
 * 1. **UGC 策略前置闸门**：复用 `config/app_store_policy` 的 `userGeneratedContent`；
 *    策略不允许（审核演示 / 受限会话）时整块只显示说明，不渲染任何操作按钮 ——
 *    不是「点了再报错」。（外层 GameCenterView 还有 flag+capability 双层闸门。）
 * 2. **身份状态前置**：挂载时探测 Identity AT；未登录只显示登录提示 + 重试，
 *    不发任何必然 401 的请求。请求期间 AT 失效（401 → LOCAL_AUTH_MISSING）会回到未登录态。
 * 3. **UI 没有也不接受任何用户 ID 输入**：瓶子只按服务端返回的 `bottle_id` 操作，
 *    身份完全由请求头 AT 表达。
 * 4. 空池（`DRIFT_POOL_EMPTY`）按**正常状态**渲染（中文说明 +「再捞一次」），
 *    与真正的错误（网络 / 限频 / 已领取…）用不同 tone 区分，且都可重试，无白屏、无未捕获异常。
 * 5. 前端校验（文本 1..500、红包 1..10000 整数）只做体验拦截，服务端仍是唯一约束。
 * 6. 投瓶幂等：同一份内容重试复用同一个 `client_request_id`；内容一改即换新键。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { tf, useI18n } from '../../utils/app_i18n'
import { getFeaturePolicy } from '../../config/app_store_policy'
import { getIdentityAccessToken } from '../../utils/identity_access_token'
import { GamePlatformError, LOCAL_ERROR_CODES, createIdempotencyKey } from '../../utils/game_center/api'
import {
  DRIFT_ERROR_CODES,
  DRIFT_REPORT_DETAIL_MAX_LENGTH,
  DRIFT_REPORT_REASONS,
  DRIFT_TEXT_MAX_LENGTH,
  claimDriftBottle,
  drawRandomDriftBottle,
  hideDriftBottle,
  publishDriftBottle,
  reportDriftBottle,
  validateDriftCoinAmount,
  validateDriftText
} from '../../utils/game_center/drift'
import GameCenterNotice from './GameCenterNotice.vue'

const props = defineProps({
  /**
   * 可选：`GameCenterView` 下发的远程 API base（`flags.api_base`）。
   * 缺省（''）时 `drift.ts` 走环境派生默认源，与其它 Tab 的缺省行为一致。
   */
  apiBase: { type: String, default: '' }
})

const { t, locale } = useI18n()

/** 每次请求的公共参数（apiBase 未下发时不传，交给环境默认源） */
const requestOptions = computed(() => (props.apiBase ? { apiBase: props.apiBase } : {}))

/** UGC 策略（编译期 / 会话态，运行中不变，组件加载时判定一次） */
const ugcAllowed = getFeaturePolicy().userGeneratedContent

/** 身份状态机：checking → ready | signedOut */
const sessionState = ref(ugcAllowed ? 'checking' : 'blocked')

/** 捞瓶 */
const drawBusy = ref(false)
const drawState = ref('idle')
const currentBottle = ref(null)
const drawError = ref('')

/** 领取 */
const claimBusy = ref(false)
const claimState = ref('idle')
const claimResult = ref(null)
const claimError = ref('')

/** 举报 / 隐藏 */
const moderateBusy = ref(false)
const reportOpen = ref(false)
const reportReason = ref(DRIFT_REPORT_REASONS[0])
const reportDetail = ref('')
const reportDone = ref(false)
const reportError = ref('')
const actionMessage = ref('')

/** 投瓶 */
const publishMode = ref('text')
const publishText = ref('')
const coinInput = ref('')
const publishBusy = ref(false)
const publishError = ref('')
const publishSubmitError = ref('')
const publishedBottle = ref(null)
/** 幂等键：内容未改时的重试复用同一个 id，服务端据此不重复扣款 */
const publishKey = ref('')

const textLength = computed(() => validateDriftText(publishText.value).length)
const textValidation = computed(() => validateDriftText(publishText.value))
const coinValidation = computed(() => validateDriftCoinAmount(coinInput.value))

/** 实时字段提示（只在「已经明确输入错」时出现；空内容留给提交时提示） */
const fieldErrorKey = computed(() => {
  if (textValidation.value.reason === 'tooLong') return 'gameCenter.drift.validate.textTooLong'
  if (publishMode.value === 'coin' && coinValidation.value.reason) {
    switch (coinValidation.value.reason) {
      case 'notInteger':
        return 'gameCenter.drift.validate.coinNotInteger'
      case 'tooLarge':
        return 'gameCenter.drift.validate.coinTooLarge'
      default:
        return 'gameCenter.drift.validate.coinNotPositive'
    }
  }
  return ''
})

const canPublish = computed(() => {
  if (!textValidation.value.ok) return false
  if (publishMode.value !== 'coin') return true
  return coinValidation.value.ok && coinValidation.value.value >= 1
})

/** 展示文案（显式读 locale 建立响应依赖：切换语言时重算） */
const senderLabel = computed(() => {
  void locale.value
  const bottle = currentBottle.value
  if (!bottle) return ''
  return tf('gameCenter.drift.bottle.from', {
    name: bottle.senderLabel || t('gameCenter.drift.bottle.anonymous')
  })
})

const coinBadgeLabel = computed(() => {
  void locale.value
  const bottle = currentBottle.value
  if (!bottle || bottle.coinAmount <= 0) return ''
  return tf('gameCenter.drift.bottle.coinBadge', { n: bottle.coinAmount })
})

const expiresLabel = computed(() => {
  void locale.value
  const bottle = currentBottle.value
  const raw = String(bottle?.expiresAt || '')
  if (!raw) return ''
  const parsed = new Date(raw)
  const display = Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString()
  return tf('gameCenter.drift.bottle.expiresAt', { time: display })
})

const claimSummary = computed(() => {
  void locale.value
  const result = claimResult.value
  if (!result) return ''
  if (result.coinAmount > 0) {
    return tf('gameCenter.drift.claim.credited', { n: result.coinAmount })
  }
  return t('gameCenter.drift.claim.success')
})

const counterLabel = computed(() => {
  void locale.value
  return tf('gameCenter.drift.publish.counter', { n: textLength.value, max: DRIFT_TEXT_MAX_LENGTH })
})

const isInsufficientBalanceCode = (code) => /INSUFFICIENT|BALANCE/i.test(String(code || ''))

/**
 * 错误归一化 → 可读中文文案 + 是否需要回到未登录态。
 * 已知契约码用本地三语文案（稳定可读）；未知码回落服务端 message（已是简体中文）。
 */
const presentError = (error) => {
  const code = error instanceof GamePlatformError ? error.code : ''
  const serverMessage = String(error?.message || '').trim()
  let key = ''
  switch (code) {
    case DRIFT_ERROR_CODES.poolEmpty:
      key = 'gameCenter.drift.error.poolEmpty'
      break
    case DRIFT_ERROR_CODES.selfClaim:
      key = 'gameCenter.drift.error.selfClaim'
      break
    case DRIFT_ERROR_CODES.alreadyClaimed:
      key = 'gameCenter.drift.error.alreadyClaimed'
      break
    case DRIFT_ERROR_CODES.expired:
      key = 'gameCenter.drift.error.expired'
      break
    case DRIFT_ERROR_CODES.notFound:
      key = 'gameCenter.drift.error.notFound'
      break
    case DRIFT_ERROR_CODES.rateLimited:
      key = 'gameCenter.drift.error.rateLimited'
      break
    case DRIFT_ERROR_CODES.dailyLimitExceeded:
      key = 'gameCenter.drift.error.dailyLimit'
      break
    case DRIFT_ERROR_CODES.textInvalid:
      key = 'gameCenter.drift.error.textInvalid'
      break
    case LOCAL_ERROR_CODES.authMissing:
      key = 'gameCenter.drift.error.unauthenticated'
      break
    case LOCAL_ERROR_CODES.configMissing:
    case LOCAL_ERROR_CODES.transportInsecure:
      key = 'gameCenter.drift.error.serviceUnavailable'
      break
    default:
      key = isInsufficientBalanceCode(code) ? 'gameCenter.drift.error.insufficientBalance' : ''
  }
  return {
    code,
    signedOut: code === LOCAL_ERROR_CODES.authMissing,
    message: key ? t(key) : serverMessage || t('gameCenter.drift.error.unknown')
  }
}

const refreshSession = async () => {
  sessionState.value = 'checking'
  try {
    const token = await getIdentityAccessToken()
    sessionState.value = token ? 'ready' : 'signedOut'
  } catch {
    sessionState.value = 'signedOut'
  }
}

const resetBottleArea = () => {
  claimState.value = 'idle'
  claimResult.value = null
  claimError.value = ''
  reportOpen.value = false
  reportDone.value = false
  reportDetail.value = ''
  reportError.value = ''
  actionMessage.value = ''
}

const handleDraw = async () => {
  if (drawBusy.value || sessionState.value !== 'ready') return
  drawBusy.value = true
  drawError.value = ''
  resetBottleArea()
  try {
    currentBottle.value = await drawRandomDriftBottle({ ...requestOptions.value })
    drawState.value = 'ready'
  } catch (error) {
    currentBottle.value = null
    const present = presentError(error)
    if (present.code === DRIFT_ERROR_CODES.poolEmpty) {
      // 空池不是故障：按「海里暂时没瓶子」的正常状态展示
      drawState.value = 'empty'
    } else {
      if (present.signedOut) sessionState.value = 'signedOut'
      drawState.value = 'error'
      drawError.value = present.message
    }
  } finally {
    drawBusy.value = false
  }
}

const handleClaim = async () => {
  const bottle = currentBottle.value
  if (!bottle || claimBusy.value || claimState.value === 'claimed') return
  claimBusy.value = true
  claimError.value = ''
  try {
    claimResult.value = await claimDriftBottle(bottle.bottleId, { ...requestOptions.value })
    claimState.value = 'claimed'
  } catch (error) {
    const present = presentError(error)
    if (present.signedOut) sessionState.value = 'signedOut'
    claimError.value = present.message
  } finally {
    claimBusy.value = false
  }
}

const toggleReport = () => {
  reportOpen.value = !reportOpen.value
  reportError.value = ''
}

const handleReport = async () => {
  const bottle = currentBottle.value
  if (!bottle || moderateBusy.value || reportDone.value) return
  moderateBusy.value = true
  reportError.value = ''
  try {
    await reportDriftBottle(bottle.bottleId, {
      reason: reportReason.value,
      detail: reportDetail.value,
      ...requestOptions.value
    })
    reportDone.value = true
    reportOpen.value = false
    actionMessage.value = t('gameCenter.drift.report.success')
  } catch (error) {
    const present = presentError(error)
    if (present.signedOut) sessionState.value = 'signedOut'
    reportError.value = present.message
  } finally {
    moderateBusy.value = false
  }
}

const handleHide = async () => {
  const bottle = currentBottle.value
  if (!bottle || moderateBusy.value) return
  moderateBusy.value = true
  reportError.value = ''
  try {
    await hideDriftBottle(bottle.bottleId, { ...requestOptions.value })
    currentBottle.value = null
    drawState.value = 'idle'
    resetBottleArea()
    actionMessage.value = t('gameCenter.drift.hide.success')
  } catch (error) {
    const present = presentError(error)
    if (present.signedOut) sessionState.value = 'signedOut'
    reportError.value = present.message
  } finally {
    moderateBusy.value = false
  }
}

const handlePublish = async () => {
  if (publishBusy.value) return
  publishError.value = ''
  publishSubmitError.value = ''
  const textCheck = validateDriftText(publishText.value)
  if (!textCheck.ok) {
    publishSubmitError.value = t(
      textCheck.reason === 'empty'
        ? 'gameCenter.drift.validate.textEmpty'
        : 'gameCenter.drift.validate.textTooLong'
    )
    return
  }
  let coinAmount = 0
  if (publishMode.value === 'coin') {
    const coinCheck = validateDriftCoinAmount(coinInput.value)
    if (!coinCheck.ok || coinCheck.value < 1) {
      const reason = coinCheck.reason || 'notPositive'
      publishSubmitError.value = t(
        reason === 'notInteger'
          ? 'gameCenter.drift.validate.coinNotInteger'
          : reason === 'tooLarge'
            ? 'gameCenter.drift.validate.coinTooLarge'
            : 'gameCenter.drift.validate.coinNotPositive'
      )
      return
    }
    coinAmount = coinCheck.value
  }
  if (!publishKey.value) publishKey.value = createIdempotencyKey()
  publishBusy.value = true
  try {
    publishedBottle.value = await publishDriftBottle({
      text: publishText.value,
      coinAmount,
      clientRequestId: publishKey.value
    })
    publishText.value = ''
    coinInput.value = ''
    publishKey.value = ''
  } catch (error) {
    const present = presentError(error)
    if (present.signedOut) sessionState.value = 'signedOut'
    publishError.value = present.message
  } finally {
    publishBusy.value = false
  }
}

const resetPublished = () => {
  publishedBottle.value = null
}

/** 内容变更即换幂等键：只有「同一份内容重试」才复用，避免误用旧键提交新内容 */
watch([publishText, coinInput, publishMode], () => {
  publishKey.value = ''
})

onMounted(() => {
  if (ugcAllowed) void refreshSession()
})
</script>

<template>
  <div class="gc-drift" data-section="drift-bottle">
    <p class="gc-drift__intro">{{ t('gameCenter.drift.subtitle') }}</p>

    <!-- UGC 策略不允许（审核演示 / 受限会话）：只说明，不给任何操作入口 -->
    <GameCenterNotice
      v-if="!ugcAllowed"
      tone="warning"
      :title="t('gameCenter.drift.policyDisabledTitle')"
      :message="t('gameCenter.drift.policyDisabledBody')"
    />

    <template v-else>
      <GameCenterNotice
        v-if="sessionState === 'checking'"
        tone="info"
        :message="t('gameCenter.drift.session.checking')"
      />
      <GameCenterNotice
        v-else-if="sessionState === 'signedOut'"
        tone="warning"
        :title="t('gameCenter.drift.guestTitle')"
        :message="t('gameCenter.drift.guestBody')"
        :action-text="t('gameCenter.drift.retry')"
        @action="refreshSession"
      />

      <template v-else>
        <!-- 捞瓶 -->
        <section class="gc-drift__card">
          <header class="gc-drift__card-header">
            <h3 class="gc-drift__card-title">{{ t('gameCenter.drift.draw.title') }}</h3>
          </header>
          <button
            class="gc-drift__primary"
            type="button"
            data-action="draw"
            :disabled="drawBusy"
            @click="handleDraw"
          >
            {{ drawBusy ? t('gameCenter.drift.draw.busy') : t('gameCenter.drift.draw.action') }}
          </button>

          <GameCenterNotice
            v-if="drawState === 'empty'"
            tone="info"
            :title="t('gameCenter.drift.draw.emptyTitle')"
            :message="t('gameCenter.drift.draw.emptyBody')"
            :action-text="t('gameCenter.drift.draw.again')"
            :busy="drawBusy"
            @action="handleDraw"
          />
          <GameCenterNotice
            v-else-if="drawState === 'error' && drawError"
            tone="danger"
            :title="t('gameCenter.drift.error.title')"
            :message="drawError"
            :action-text="t('gameCenter.drift.retry')"
            :busy="drawBusy"
            @action="handleDraw"
          />

          <!-- 瓶子卡片 -->
          <article v-if="currentBottle" class="gc-drift__bottle" data-section="bottle-card">
            <header class="gc-drift__bottle-meta">
              <span class="gc-drift__from">{{ senderLabel }}</span>
              <span v-if="currentBottle.isMine" class="gc-drift__badge">
                {{ t('gameCenter.drift.bottle.mineBadge') }}
              </span>
              <span v-if="currentBottle.coinAmount > 0" class="gc-drift__badge gc-drift__badge--coin">
                {{ coinBadgeLabel }}
              </span>
              <span v-else class="gc-drift__badge">
                {{ t('gameCenter.drift.bottle.textOnlyBadge') }}
              </span>
            </header>
            <p class="gc-drift__text">{{ currentBottle.text }}</p>
            <p v-if="expiresLabel" class="gc-drift__meta">{{ expiresLabel }}</p>

            <!-- 领取结果 -->
            <template v-if="claimState === 'claimed'">
              <GameCenterNotice tone="info" :message="claimSummary" />
              <button class="gc-drift__primary" type="button" data-action="draw-again" @click="handleDraw">
                {{ t('gameCenter.drift.claim.again') }}
              </button>
            </template>
            <template v-else>
              <p v-if="currentBottle.isMine" class="gc-drift__hint">
                {{ t('gameCenter.drift.bottle.mineClaimNote') }}
              </p>
              <button
                v-else
                class="gc-drift__primary"
                type="button"
                data-action="claim"
                :disabled="claimBusy"
                @click="handleClaim"
              >
                {{
                  claimBusy
                    ? t('gameCenter.drift.claim.busy')
                    : currentBottle.coinAmount > 0
                      ? t('gameCenter.drift.claim.redeem')
                      : t('gameCenter.drift.claim.action')
                }}
              </button>
              <GameCenterNotice
                v-if="claimError"
                tone="danger"
                :message="claimError"
                :action-text="t('gameCenter.drift.draw.again')"
                @action="handleDraw"
              />
            </template>

            <!-- 举报 / 隐藏 -->
            <div class="gc-drift__actions">
              <button
                class="gc-drift__ghost"
                type="button"
                data-action="report-toggle"
                :disabled="moderateBusy || reportDone"
                @click="toggleReport"
              >
                {{ reportOpen ? t('gameCenter.drift.report.cancel') : t('gameCenter.drift.report.action') }}
              </button>
              <button
                class="gc-drift__ghost"
                type="button"
                data-action="hide"
                :disabled="moderateBusy"
                @click="handleHide"
              >
                {{ t('gameCenter.drift.hide.action') }}
              </button>
            </div>

            <div v-if="reportOpen" class="gc-drift__report">
              <span class="gc-drift__report-label">{{ t('gameCenter.drift.report.reasonLabel') }}</span>
              <div class="gc-drift__reasons">
                <label v-for="reason in DRIFT_REPORT_REASONS" :key="reason" class="gc-drift__reason">
                  <input v-model="reportReason" type="radio" name="drift-report-reason" :value="reason" />
                  <span>{{ t(`gameCenter.drift.report.reason.${reason}`) }}</span>
                </label>
              </div>
              <textarea
                v-model="reportDetail"
                class="gc-drift__detail"
                :maxlength="DRIFT_REPORT_DETAIL_MAX_LENGTH"
                :placeholder="t('gameCenter.drift.report.detailPlaceholder')"
              ></textarea>
              <button
                class="gc-drift__primary"
                type="button"
                data-action="report-submit"
                :disabled="moderateBusy"
                @click="handleReport"
              >
                {{ moderateBusy ? t('gameCenter.drift.report.busy') : t('gameCenter.drift.report.submit') }}
              </button>
              <p v-if="reportError" class="gc-drift__error">{{ reportError }}</p>
            </div>
            <p v-if="actionMessage" class="gc-drift__success" role="status">{{ actionMessage }}</p>
          </article>
        </section>

        <!-- 投瓶 -->
        <section class="gc-drift__card">
          <header class="gc-drift__card-header">
            <h3 class="gc-drift__card-title">{{ t('gameCenter.drift.publish.title') }}</h3>
          </header>

          <div class="gc-drift__modes" role="tablist">
            <button
              v-for="mode in ['text', 'coin']"
              :key="mode"
              class="gc-drift__mode"
              :class="{ 'gc-drift__mode--active': publishMode === mode }"
              type="button"
              role="tab"
              :aria-selected="publishMode === mode ? 'true' : 'false'"
              :data-mode="mode"
              @click="publishMode = mode"
            >
              {{ mode === 'text' ? t('gameCenter.drift.publish.textMode') : t('gameCenter.drift.publish.coinMode') }}
            </button>
          </div>

          <textarea
            v-model="publishText"
            class="gc-drift__input"
            :maxlength="DRIFT_TEXT_MAX_LENGTH"
            :placeholder="t('gameCenter.drift.publish.placeholder')"
            data-field="drift-text"
          ></textarea>
          <span class="gc-drift__counter">{{ counterLabel }}</span>

          <template v-if="publishMode === 'coin'">
            <label class="gc-drift__field-label" for="drift-coin-amount">
              {{ t('gameCenter.drift.publish.coinLabel') }}
            </label>
            <input
              id="drift-coin-amount"
              v-model="coinInput"
              class="gc-drift__input gc-drift__input--single"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              :placeholder="t('gameCenter.drift.publish.coinPlaceholder')"
              data-field="drift-coin"
            />
            <p class="gc-drift__note">{{ t('gameCenter.drift.publish.coinNote') }}</p>
          </template>
          <p v-else class="gc-drift__note">{{ t('gameCenter.drift.publish.textNote') }}</p>

          <p v-if="fieldErrorKey" class="gc-drift__error">{{ t(fieldErrorKey) }}</p>
          <p v-if="publishSubmitError" class="gc-drift__error">{{ publishSubmitError }}</p>
          <p v-if="publishError" class="gc-drift__error">{{ publishError }}</p>

          <button
            class="gc-drift__primary"
            type="button"
            data-action="publish"
            :disabled="publishBusy || !canPublish"
            @click="handlePublish"
          >
            {{ publishBusy ? t('gameCenter.drift.publish.busy') : t('gameCenter.drift.publish.action') }}
          </button>

          <GameCenterNotice
            v-if="publishedBottle"
            tone="info"
            :title="t('gameCenter.drift.publish.successTitle')"
            :message="
              publishedBottle.coinAmount > 0
                ? tf('gameCenter.drift.publish.successCoinBody', { n: publishedBottle.coinAmount })
                : t('gameCenter.drift.publish.successBody')
            "
            :action-text="t('gameCenter.drift.publish.another')"
            @action="resetPublished"
          />
        </section>

        <p class="gc-drift__policy">{{ t('gameCenter.drift.policyNote') }}</p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.gc-drift {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gc-drift__intro {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
  line-height: 1.6;
}

.gc-drift__card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: calc(16px * var(--ui-radius-scale, 1));
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: color-mix(in oklab, var(--ui-surface, #fff) 94%, #fff 6%);
}

.gc-drift__card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.gc-drift__card-title {
  margin: 0;
  font-size: calc(14px * var(--ui-font-scale, 1));
  color: var(--ui-text, #1f2937);
}

.gc-drift__primary {
  align-self: stretch;
  padding: 10px 14px;
  border: 0;
  border-radius: 999px;
  background: var(--ui-primary, #3b82f6);
  color: #fff;
  font-size: calc(13px * var(--ui-font-scale, 1));
  font-weight: 600;
  cursor: pointer;
}

.gc-drift__primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.gc-drift__ghost {
  flex: 1 1 0;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: transparent;
  color: var(--ui-muted, #64748b);
  font-size: calc(12px * var(--ui-font-scale, 1));
  font-weight: 600;
  cursor: pointer;
}

.gc-drift__ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.gc-drift__bottle {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: calc(14px * var(--ui-radius-scale, 1));
  border: 1px solid rgba(59, 130, 246, 0.3);
  background: rgba(59, 130, 246, 0.08);
}

.gc-drift__bottle-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.gc-drift__from {
  font-size: calc(12px * var(--ui-font-scale, 1));
  font-weight: 700;
  color: var(--ui-text, #1f2937);
}

.gc-drift__badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
  background: rgba(148, 163, 184, 0.18);
}

.gc-drift__badge--coin {
  color: #b45309;
  background: rgba(245, 158, 11, 0.18);
}

.gc-drift__text {
  margin: 0;
  font-size: calc(13px * var(--ui-font-scale, 1));
  color: var(--ui-text, #1f2937);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.gc-drift__meta {
  margin: 0;
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
}

.gc-drift__hint {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
}

.gc-drift__actions {
  display: flex;
  gap: 8px;
}

.gc-drift__report {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(148, 163, 184, 0.24);
}

.gc-drift__report-label {
  font-size: calc(12px * var(--ui-font-scale, 1));
  font-weight: 600;
  color: var(--ui-text, #1f2937);
}

.gc-drift__reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.gc-drift__reason {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: calc(12px * var(--ui-font-scale, 1));
  color: var(--ui-text, #1f2937);
}

.gc-drift__detail,
.gc-drift__input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px;
  border-radius: calc(12px * var(--ui-radius-scale, 1));
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: transparent;
  color: var(--ui-text, #1f2937);
  font-size: calc(12px * var(--ui-font-scale, 1));
  line-height: 1.6;
  resize: vertical;
}

.gc-drift__detail {
  min-height: 56px;
}

.gc-drift__input {
  min-height: 88px;
  font-family: inherit;
}

.gc-drift__input--single {
  min-height: 0;
  height: 38px;
}

.gc-drift__counter {
  align-self: flex-end;
  margin-top: -6px;
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #94a3b8);
}

.gc-drift__modes {
  display: flex;
  gap: 6px;
  padding: 3px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: color-mix(in oklab, var(--ui-surface, #fff) 90%, #fff 10%);
}

.gc-drift__mode {
  flex: 1 1 0;
  padding: 7px 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ui-muted, #64748b);
  font-size: calc(12px * var(--ui-font-scale, 1));
  font-weight: 600;
  cursor: pointer;
}

.gc-drift__mode--active {
  background: var(--ui-primary, #3b82f6);
  color: #fff;
}

.gc-drift__field-label {
  font-size: calc(12px * var(--ui-font-scale, 1));
  font-weight: 600;
  color: var(--ui-text, #1f2937);
}

.gc-drift__note {
  margin: 0;
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
  line-height: 1.6;
}

.gc-drift__error {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale, 1));
  color: var(--ui-danger, #ef4444);
}

.gc-drift__success {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale, 1));
  color: var(--ui-success, #10b981);
}

.gc-drift__policy {
  margin: 0;
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #94a3b8);
  line-height: 1.6;
}
</style>
