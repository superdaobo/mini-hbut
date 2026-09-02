import axios from './axios_adapter.js'
import {
  APP_BOOT_ID,
  NotifySettingsFull,
  POWER_ALERT_THRESHOLD,
  getDormSelection,
  getRequestTimeoutMs,
  nowIso,
  powerStateKeyFor,
  readJSON,
  toApiUrl,
  toSafeNumber,
  toSafeText,
  writeJSON
} from './notify_center_util.js'

interface NoticeItem {
  title?: unknown
  body?: unknown
  targetView?: unknown
  eventKey?: unknown
  domain?: unknown
}

export interface ElectricityCheckResult extends Record<string, unknown> {
  success: boolean
  configured: boolean
  selectedPath: string[]
  quantity?: number | null
  balance?: number | null
  acQuantity?: number | null
  acBalance?: number | null
  isDual?: boolean
  status?: string
  isLow?: boolean
  sync_time?: string
  error?: string
}

export const checkElectricity = async (
  studentId: string,
  settings: NotifySettingsFull,
  queue: NoticeItem[],
  launchCheck = false
): Promise<ElectricityCheckResult> => {
  const timeoutMs = getRequestTimeoutMs()
  const selectedPath = getDormSelection()
  if (selectedPath.length !== 4) {
    return {
      success: false,
      configured: false,
      selectedPath: [],
      error: '未设置宿舍房间，请先在电费模块选择房间。'
    }
  }

  const [area_id, building_id, layer_id, room_id] = selectedPath
  const roomKey = selectedPath.join('-')
  const powerStateKey = powerStateKeyFor(studentId, roomKey)

  // 判断是否为双计费模式（照明+空调分开）
  const layerStr = String(layer_id)
  const isDual = layerStr.startsWith('merged_')
  let lightLayerId = layer_id
  let acLayerId: string | null = null
  if (isDual) {
    const parts = layerStr.split('_')
    lightLayerId = parts[2]
    acLayerId = parts[3]
  }

  // 空调房间值从 localStorage 读取（ElectricityView 选择时已存储）
  let acRoomValue = isDual ? toSafeText(readJSON<string>('last_dorm_ac_room', '')) : null
  // 回退：如果未存储空调房间值，从 room_id 推导（替换 layer_id + 房间号前缀1）
  if (isDual && !acRoomValue && acLayerId) {
    const m = String(room_id).match(/^(.+?)--(\d+)-(\d+)$/)
    if (m) {
      acRoomValue = `${m[1]}--${acLayerId}-1${m[3]}`
    }
  }

  try {
    // 照明查询（非双计费时直接用原值）
    const lightRes = await axios.post(
      toApiUrl('/v2/electricity/balance'),
      {
        area_id,
        building_id,
        layer_id: isDual ? lightLayerId : layer_id,
        room_id,
        student_id: studentId
      },
      { timeout: timeoutMs }
    )
    const lightData = lightRes?.data as {
      success?: boolean
      error?: unknown
      quantity?: unknown
      balance?: unknown
      status?: unknown
      sync_time?: unknown
    } | null
    if (!lightData?.success) {
      return {
        success: false,
        configured: true,
        selectedPath,
        error: toSafeText(lightData?.error || '电费检查失败（照明）')
      }
    }

    const quantity = toSafeNumber(lightData.quantity)
    const balance = toSafeNumber(lightData.balance)

    // 空调查询（仅双计费时）
    let acQuantity: number | null = null
    let acBalance: number | null = null
    if (isDual && acLayerId && acRoomValue) {
      try {
        const acRes = await axios.post(
          toApiUrl('/v2/electricity/balance'),
          {
            area_id,
            building_id,
            layer_id: acLayerId,
            room_id: acRoomValue,
            student_id: studentId
          },
          { timeout: timeoutMs }
        )
        const acData = acRes?.data as { success?: boolean; quantity?: unknown; balance?: unknown } | null
        if (acData?.success) {
          acQuantity = toSafeNumber(acData.quantity)
          acBalance = toSafeNumber(acData.balance)
        }
      } catch {
        // 空调查询失败不阻塞主流程
      }
    }

    const isLightLow = Number.isFinite(quantity) && quantity < POWER_ALERT_THRESHOLD
    const isAcLow = acQuantity !== null && Number.isFinite(acQuantity) && acQuantity < POWER_ALERT_THRESHOLD
    const isLow = isLightLow || isAcLow
    const state = readJSON<Record<string, unknown>>(powerStateKey, {})

    // 低电提醒去重策略
    let shouldNotify = false
    if (settings.enablePowerNotice && isLow) {
      if (launchCheck) {
        shouldNotify = toSafeText(state?.last_launch_boot) !== APP_BOOT_ID
      } else {
        shouldNotify = !state?.was_low
      }
    }

    if (shouldNotify) {
      let bodyText
      if (isDual) {
        const parts: string[] = []
        if (isLightLow) parts.push(`照明 ${Number.isFinite(quantity) ? quantity.toFixed(2) : lightData.quantity} 度`)
        if (isAcLow) parts.push(`空调 ${acQuantity !== null && Number.isFinite(acQuantity) ? acQuantity.toFixed(2) : '?'} 度`)
        bodyText = `当前宿舍 ${parts.join('、')} 不足 ${POWER_ALERT_THRESHOLD} 度，请及时充值。`
      } else {
        bodyText = `当前宿舍剩余电量 ${Number.isFinite(quantity) ? quantity.toFixed(2) : lightData.quantity} 度，已低于 ${POWER_ALERT_THRESHOLD} 度，请及时充值。`
      }
      queue.push({
        title: '电费不足提醒',
        body: bodyText,
        targetView: 'electricity'
      })
    }

    writeJSON(powerStateKey, {
      was_low: isLow,
      last_quantity: Number.isFinite(quantity) ? quantity : null,
      last_balance: Number.isFinite(balance) ? balance : null,
      ac_quantity: Number.isFinite(acQuantity) ? acQuantity : null,
      ac_balance: Number.isFinite(acBalance) ? acBalance : null,
      is_dual: isDual,
      last_launch_boot:
        launchCheck && isLow && settings.enablePowerNotice ? APP_BOOT_ID : toSafeText(state?.last_launch_boot),
      last_notified_at:
        shouldNotify ? nowIso() : toSafeText(state?.last_notified_at),
      updated_at: nowIso()
    })

    return {
      success: true,
      configured: true,
      selectedPath,
      quantity: Number.isFinite(quantity) ? quantity : null,
      balance: Number.isFinite(balance) ? balance : null,
      acQuantity: Number.isFinite(acQuantity) ? acQuantity : null,
      acBalance: Number.isFinite(acBalance) ? acBalance : null,
      isDual,
      status: toSafeText(lightData.status),
      isLow,
      sync_time: toSafeText(lightData.sync_time)
    }
  } catch (error) {
    return {
      success: false,
      configured: true,
      selectedPath,
      error: toSafeText((error as Error | undefined)?.message || error || '电费检查失败')
    }
  }
}
