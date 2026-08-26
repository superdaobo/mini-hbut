import type { AppRuntime, NotificationCoordinator } from '../contracts/runtime'
import { platformBridge } from '../../platform'
import {
  installMiniHbutDeepLinkListeners,
  type DeepLinkDelivery,
  type MiniHbutDeepLink
} from '../../platform/deep_link'
import { resolveNotificationActionTarget } from '../../platform/notification_actions'
import { tryWriteSnapshotFromCache } from '../../utils/widget_bridge'
import { isTestAccountSession } from '../../utils/test_account.js'
import { normalizeViewName } from '../../navigation/app_navigation'

const msUntilNextDayCrossover = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(new Date())
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0)
  return (86400 - (get('hour') * 3600 + get('minute') * 60 + get('second')) + 60) * 1000
}

export const createNotificationCoordinator = (runtime: AppRuntime): NotificationCoordinator => {
  const { state } = runtime

  const stopWidgetCrossDayTimer = () => {
    if (!state.mutable.widgetCrossDayTimer) return
    window.clearTimeout(state.mutable.widgetCrossDayTimer)
    state.mutable.widgetCrossDayTimer = null
  }

  const scheduleWidgetCrossDayTimer = () => {
    stopWidgetCrossDayTimer()
    if (!state.studentId.value) return
    state.mutable.widgetCrossDayTimer = window.setTimeout(() => {
      state.mutable.widgetCrossDayTimer = null
      if (state.studentId.value && !isTestAccountSession()) {
        void tryWriteSnapshotFromCache(state.studentId.value)
        scheduleWidgetCrossDayTimer()
      }
    }, msUntilNextDayCrossover())
  }

  const handleWidgetDeeplinkPayload = (payload: Record<string, unknown>) => {
    if (!payload) return
    const date = String(payload.date || '').trim()
    const source = String(payload.source || '').trim()
    const period = Number(payload.period) || 0
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (source && source !== 'widget')) return
    state.widgetDeeplinkDate.value = date
    state.widgetDeeplinkPeriod.value = period
    if (state.currentView.value !== 'schedule') runtime.navigation.goToView('schedule', { push: true })
  }

  const handleNavigatePayload = (payload: Record<string, unknown>) => {
    const view = normalizeViewName(String(payload?.view || '').trim())
    const source = String(payload?.source || 'widget').trim()
    if (!['electricity', 'exams'].includes(view) || (source && source !== 'widget')) return
    runtime.navigation.goToView(view, { push: true })
  }

  const runAfterBoot = (callback: () => void) => {
    if (state.mutable.appBootstrapped) return callback()
    const timer = window.setInterval(() => {
      if (!state.mutable.appBootstrapped) return
      window.clearInterval(timer)
      callback()
    }, 100)
    window.setTimeout(() => window.clearInterval(timer), 5000)
  }

  // #621：统一深链分发（widget / identity 共用同一 parser 与监听入口）。
  // 深链解析已迁移到 src/platform/deep_link.ts；widget 保持原行为，identity 进入 IdentityCoordinator。
  const dispatchMiniHbutDeepLink = (link: MiniHbutDeepLink, delivery: DeepLinkDelivery) => {
    if (link.kind === 'widget-schedule') {
      runAfterBoot(() =>
        handleWidgetDeeplinkPayload({
          date: link.date,
          period: link.period,
          source: link.source
        })
      )
      return
    }
    if (link.kind === 'navigate') {
      runAfterBoot(() => handleNavigatePayload({ view: link.view, source: link.source }))
      return
    }
    // identity：交给 IdentityCoordinator（内部处理冷启动缓冲、队列调度与 #739 死信降级）
    runtime.identity.submitIntent(
      {
        requestId: link.requestId,
        handoff: link.handoff,
        arrivedAt: Date.now()
      },
      delivery
    )
  }

  const installWidgetDeeplinkListeners = () => {
    window.addEventListener('widgetDeeplink', ((event: CustomEvent) => {
      try {
        const detail = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail
        handleWidgetDeeplinkPayload(detail || {})
      } catch {
        // ignore invalid payload
      }
    }) as EventListener)
    window.addEventListener('widgetNavigate', ((event: CustomEvent) => {
      try {
        const detail = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail
        handleNavigatePayload(detail || {})
      } catch {
        // ignore invalid payload
      }
    }) as EventListener)

    // #621：统一深链监听（Tauri getCurrent/onOpenUrl + Capacitor appUrlOpen 兼容）。
    // 迁移前 NotificationCoordinator 维护独立 parseOpenUrl + Capacitor appUrlOpen 分支，
    // 现已统一收敛到 deep_link.ts，widget 与 identity 走同一 parser/dispatcher。
    void installMiniHbutDeepLinkListeners(dispatchMiniHbutDeepLink)
  }

  const installNotificationActionListener = async () => {
    try {
      const remove = await platformBridge.addNotificationActionListener((payload) => {
        const { view } = resolveNotificationActionTarget(payload)
        runAfterBoot(() => runtime.navigation.goToView(view, { push: true }))
      })
      state.mutable.removeNotificationActionListener = typeof remove === 'function' ? remove : null
    } catch {
      state.mutable.removeNotificationActionListener = null
    }
  }

  return {
    installNotificationActionListener,
    installWidgetDeeplinkListeners,
    scheduleWidgetCrossDayTimer,
    stopWidgetCrossDayTimer,
    handleWidgetDeeplinkPayload
  }
}
