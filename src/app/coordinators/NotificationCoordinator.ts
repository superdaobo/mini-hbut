import type { AppRuntime, NotificationCoordinator } from '../contracts/runtime'
import { isCapacitorRuntime } from '../../platform/native'
import { platformBridge } from '../../platform'
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

  const parseOpenUrl = (urlText: string) => {
    try {
      const url = new URL(urlText)
      if (url.protocol !== 'minihbut:') return null
      const source = url.searchParams.get('source') || 'widget'
      if (url.hostname === 'schedule') {
        return {
          kind: 'schedule',
          date: url.searchParams.get('date') || '',
          period: url.searchParams.get('period') || '',
          source
        }
      }
      if (url.hostname === 'electricity') return { kind: 'navigate', view: 'electricity', source }
      if (url.hostname === 'exam') return { kind: 'navigate', view: 'exams', source }
      return null
    } catch {
      return null
    }
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

    if (!isCapacitorRuntime()) return
    void import('@capacitor/app').then((mod) => {
      void mod.App.addListener('appUrlOpen', (event) => {
        const payload = event?.url ? parseOpenUrl(event.url) : null
        if (!payload) return
        runAfterBoot(() => {
          if (payload.kind === 'schedule') handleWidgetDeeplinkPayload(payload)
          else handleNavigatePayload(payload)
        })
      })
    }).catch(() => {})
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
