import { pushDebugLog } from './debug_logger'

const GLOBAL_KEY = '__HBU_BOOT_METRICS__'

const nowMs = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

const ensureState = () => {
  if (typeof window === 'undefined') {
    return {
      boot_id: 'server',
      started_at: Date.now(),
      started_perf: nowMs(),
      marks: {}
    }
  }
  if (!window[GLOBAL_KEY]) {
    window[GLOBAL_KEY] = {
      boot_id: `boot-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      started_at: Date.now(),
      started_perf: nowMs(),
      marks: {}
    }
  }
  return window[GLOBAL_KEY]
}

export const resetBootMetrics = (context = {}) => {
  if (typeof window !== 'undefined') {
    window[GLOBAL_KEY] = {
      boot_id: `boot-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      started_at: Date.now(),
      started_perf: nowMs(),
      marks: {}
    }
  }
  const state = ensureState()
  markBootMetric('app_boot_start', context, { overwrite: true, level: 'info' })
  return state
}

export const hasBootMetric = (name) => {
  const state = ensureState()
  return !!state.marks?.[String(name || '').trim()]
}

export const getBootMetricsSnapshot = () => {
  const state = ensureState()
  return {
    boot_id: state.boot_id,
    started_at: state.started_at,
    marks: { ...(state.marks || {}) }
  }
}

export const markBootMetric = (name, detail = {}, options = {}) => {
  const metricName = String(name || '').trim()
  if (!metricName) return null

  const state = ensureState()
  if (state.marks[metricName] && options?.overwrite !== true) {
    return state.marks[metricName]
  }

  const mark = {
    name: metricName,
    at: Date.now(),
    elapsed_ms: Math.max(0, Number((nowMs() - state.started_perf).toFixed(1)) || 0),
    detail: detail && typeof detail === 'object' ? detail : {}
  }
  state.marks[metricName] = mark

  pushDebugLog(
    'Boot',
    `${metricName} +${mark.elapsed_ms}ms`,
    options?.level || 'info',
    {
      boot_id: state.boot_id,
      ...mark.detail
    }
  )
  return mark
}
