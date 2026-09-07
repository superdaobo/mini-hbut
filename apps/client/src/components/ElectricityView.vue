<script setup>
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import axios from 'axios'
import { setCachedData, fetchWithCache } from '../utils/api.js'
import { qrToDataURL } from '../utils/qrcode.js'
import { useAppSettings } from '../utils/app_settings'
import { formatRelativeTime } from '../utils/time.js'
import { fetchDormitoryDataset } from '../utils/static_resource_cache.js'
import { writeElectricityToWidget } from '../utils/widget_bridge'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { openExternal } from '../utils/external_link'
import { prepareOneCodeAppOpen } from '../utils/one_code_open.js'
import { showToast } from '../utils/toast'
// #791：t 为 JS 逻辑内取词 / tf 整句插值（模板响应式取词用下方 useI18n 的 t）
import { t, tf } from '../utils/app_i18n'
import {
  containsMisleadingRoomHint,
  isUsageSnapshotOnly,
  matchAcLevelLabel,
  matchLightLevelLabel,
  resolveUsageEmptyText,
  stripRoomSuffix
} from '../utils/electricity_usage_ui'
import { TPageHeader, TEmptyState } from './templates'
import { useI18n } from '../utils/app_i18n'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'logout'])

// 状态
const loading = ref(false)
const dormData = ref([])
const selectedPath = ref([]) // [area_id, building_id, level_id, room_id]
const balanceData = ref(null) // 照明 or 唯一结果
const acBalanceData = ref(null) // 空调结果（双计费时）
const errorMsg = ref('')
const offline = ref(false)
const syncTime = ref('')
const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const appSettings = useAppSettings()
const maxRetry = computed(() => appSettings.retry.electricity)
const retryDelayMs = computed(() => appSettings.retryDelayMs)

// #791：响应式 t —— 语言切换后模板即时生效
const { t: tLocale } = useI18n()

// 离线横幅「最后更新」整句插值（computed 保证语言切换 / syncTime 变化即时生效）
const tfOfflineLastUpdate = computed(() =>
  tf('electricity.offlineBanner.lastUpdate', { time: formatRelativeTime(syncTime.value) })
)

// 缴费演示提示：专名「i 湖工」经字典两侧同值保留中文（tf 在 computed 内随语言刷新）
const tfPayDemoHint = computed(() =>
  tf('electricity.pay.demoHint', { app: t('electricity.iHubut.name') })
)

// 是否为双计费楼层（同时有照明和空调）
const isDualBilling = ref(false)
// 保存当前选中楼层的照明和空调 layer_id 映射
const currentLevelMapping = ref(null)

const normalizePathValue = (value) => {
  if (value && typeof value === 'object') {
    return String(value.value ?? value.id ?? value.label ?? value.name ?? '').trim()
  }
  return String(value ?? '').trim()
}

const normalizeSelectionPath = (value) => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => normalizePathValue(item))
    .filter((item) => item !== '')
}

const findByValue = (list, value) =>
  (Array.isArray(list) ? list : []).find((item) => String(item?.value) === String(value))

const getStaleCache = (cacheKey) => {
  try {
    const raw = localStorage.getItem(`cache:${cacheKey}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.data) return null
    return { data: parsed.data, timestamp: parsed.timestamp }
  } catch (e) {
    return null
  }
}

/**
 * 合并宿舍楼层数据：将同栋楼的"照明N层"和"空调N层"合并为"N层"
 * 返回处理后的 dormData（不修改原始数据）
 */
const mergeLevels = (rawData) => {
  if (!Array.isArray(rawData)) return []
  return rawData.map(area => ({
    ...area,
    children: (area.children || []).map(building => {
      const levels = building.children || []
      // 检查是否存在照明/空调分离的楼层
      const lightLevels = {}
      const acLevels = {}
      const plainLevels = []

      levels.forEach(level => {
        const label = level.label || ''
        // 「照明/空调/房间」为后端数据集固定词汇表，正则外移至 electricity_usage_ui（#791）
        const lightFloor = matchLightLevelLabel(label)
        const acFloor = matchAcLevelLabel(label)
        if (lightFloor) {
          lightLevels[lightFloor] = level
        } else if (acFloor) {
          acLevels[acFloor] = level
        } else {
          plainLevels.push(level)
        }
      })

      const lightFloors = Object.keys(lightLevels)
      const acFloors = Object.keys(acLevels)
      const hasDual = lightFloors.length > 0 && acFloors.length > 0

      if (!hasDual && lightFloors.length === 0 && acFloors.length === 0) {
        // 纯普通楼层，不做处理
        return building
      }

      // 合并楼层
      const mergedLevels = []
      const allFloorNums = new Set([...lightFloors, ...acFloors])
      const sortedFloors = [...allFloorNums].sort((a, b) => Number(a) - Number(b))

      sortedFloors.forEach(floorNum => {
        const lightLevel = lightLevels[floorNum]
        const acLevel = acLevels[floorNum]
        // 使用照明层的房间列表作为基础
        const baseLevel = lightLevel || acLevel
        const mergedValue = `merged_${floorNum}_${lightLevel?.value || ''}_${acLevel?.value || ''}`

        // 建立空调房间映射：照明房间号 -> 空调房间完整 value
        let acRoomMap = null
        if (lightLevel && acLevel) {
          acRoomMap = {}
          const acByNum = {}
          ;(acLevel.children || []).forEach(r => {
            const num = stripRoomSuffix(r.label)
            acByNum[num] = r.value
          })
          ;(lightLevel.children || []).forEach(r => {
            const lightNum = stripRoomSuffix(r.label)
            // 尝试常见前缀映射：1+num, 6+num, 直接匹配
            const candidates = ['1' + lightNum, '6' + lightNum, lightNum]
            for (const c of candidates) {
              if (acByNum[c]) {
                acRoomMap[r.value] = acByNum[c]
                break
              }
            }
          })
        }

        // 为每个房间附加空调端 value
        const mergedChildren = (baseLevel.children || []).map(room => {
          const acVal = acRoomMap?.[room.value] || null
          return acVal ? { ...room, _acRoomValue: acVal } : room
        })

        mergedLevels.push({
          value: mergedValue,
          // 楼层标签按当前语言拼装（t 非响应式，但 mergeLevels 每次加载宿舍数据时重跑）
          label: tf('electricity.unit.floorN', { n: floorNum }),
          children: mergedChildren,
          _lightLayerId: lightLevel?.value || null,
          _acLayerId: acLevel?.value || null,
          _isDual: !!(lightLevel && acLevel),
          _floorNum: floorNum
        })
      })

      // 加上非照明/空调的普通楼层
      plainLevels.forEach(p => mergedLevels.push(p))

      return {
        ...building,
        children: mergedLevels
      }
    })
  }))
}

// 加载宿舍数据
onMounted(async () => {
  try {
    const { data } = await fetchDormitoryDataset()
    dormData.value = mergeLevels(data?.data || [])
    
    // 尝试加载上次选择
    const saved = localStorage.getItem('last_dorm_selection')
    if (saved) {
      selectedPath.value = normalizeSelectionPath(JSON.parse(saved))
      if (selectedPath.value.length === 4) {
        // 恢复选择后同步更新空调房间映射
        const levelNode = currentLevel.value
        if (levelNode?._isDual) {
          isDualBilling.value = true
          currentLevelMapping.value = {
            lightLayerId: levelNode._lightLayerId,
            acLayerId: levelNode._acLayerId
          }
          const roomNode = levelNode.children?.find(r => r.value === selectedPath.value[3])
          if (roomNode?._acRoomValue) {
            localStorage.setItem('last_dorm_ac_room', JSON.stringify(roomNode._acRoomValue))
          }
        }
        fetchBalance()
      }
    }
  } catch (e) {
    // 诊断日志：console 面向开发者；为满足零 CJK 契约（字符串字面量不豁免）统一英文
    console.error('[Electricity] failed to load dormitory dataset:', e)
    errorMsg.value = t('electricity.error.loadDorm')
  }
})

// 级联选择器的当前选项
const currentArea = computed(() => findByValue(dormData.value, selectedPath.value[0]))

const currentBuilding = computed(() => {
  if (!currentArea.value || !selectedPath.value[1]) return null
  return findByValue(currentArea.value.children, selectedPath.value[1])
})

const currentLevel = computed(() => {
  if (!currentBuilding.value || !selectedPath.value[2]) return null
  return findByValue(currentBuilding.value.children, selectedPath.value[2])
})

const selectedAreaValue = computed({
  get: () => selectedPath.value[0] ?? '',
  set: (value) => handleSelect(0, value)
})

const selectedBuildingValue = computed({
  get: () => selectedPath.value[1] ?? '',
  set: (value) => handleSelect(1, value)
})

const selectedLevelValue = computed({
  get: () => selectedPath.value[2] ?? '',
  set: (value) => handleSelect(2, value)
})

const selectedRoomValue = computed({
  get: () => selectedPath.value[3] ?? '',
  set: (value) => handleSelect(3, value)
})

// 处理选择变化
const handleSelect = (level, value) => {
  const normalizedValue = normalizePathValue(value)
  // 截断后续选择
  const nextPath = normalizeSelectionPath(selectedPath.value.slice(0, level))
  if (normalizedValue) {
    nextPath[level] = normalizedValue
  }
  selectedPath.value = [...nextPath]
  
  // 检测当前楼层是否为双计费
  if (level >= 2) {
    const levelNode = findByValue(currentBuilding.value?.children, selectedPath.value[2])
    if (levelNode && levelNode._isDual) {
      isDualBilling.value = true
      currentLevelMapping.value = {
        lightLayerId: levelNode._lightLayerId,
        acLayerId: levelNode._acLayerId
      }
    } else {
      isDualBilling.value = false
      currentLevelMapping.value = null
    }
  } else {
    isDualBilling.value = false
    currentLevelMapping.value = null
  }
  
  // 自动查询
  if (level === 3 && selectedPath.value.length === 4) {
    // 保存选择
    localStorage.setItem('last_dorm_selection', JSON.stringify(selectedPath.value))
    // 保存房间标签文本（供小组件显示）
    const labels = [
      currentArea.value?.label || '',
      currentBuilding.value?.label || '',
      currentLevel.value?.label || '',
      currentLevel.value?.children?.find(r => r.value === selectedPath.value[3])?.label || ''
    ].filter(Boolean)
    localStorage.setItem('last_dorm_selection_label', labels.join(' '))
    // 保存空调房间映射（供通知中心后台查询用）
    const roomNode = currentLevel.value?.children?.find(r => r.value === selectedPath.value[3])
    if (roomNode?._acRoomValue) {
      localStorage.setItem('last_dorm_ac_room', JSON.stringify(roomNode._acRoomValue))
    } else {
      localStorage.removeItem('last_dorm_ac_room')
    }
    fetchBalance()
  } else {
    balanceData.value = null
    acBalanceData.value = null
  }
}

// 单次余额请求
const requestBalanceOnline = async (payload, cacheKey) => {
  const res = await axios.post(`${API_BASE}/v2/electricity/balance`, payload)
  const data = res?.data
  if (data?.success && data?.offline !== true) {
    setCachedData(cacheKey, data)
  }
  return { data, timestamp: Date.now() }
}

/**
 * 解析合并楼层 value 得到真实 layer_id
 * 合并 value 格式: merged_{floorNum}_{lightLayerId}_{acLayerId}
 */
const parseLayerIds = (levelValue) => {
  // 先从当前选中节点获取映射
  if (currentLevelMapping.value) {
    return currentLevelMapping.value
  }
  // 从 merged value 解析
  if (typeof levelValue === 'string' && levelValue.startsWith('merged_')) {
    const parts = levelValue.split('_')
    return {
      lightLayerId: parts[2] || null,
      acLayerId: parts[3] || null
    }
  }
  return { lightLayerId: levelValue, acLayerId: null }
}

const fetchBalance = async ({ retryCount = 0, forceNetwork = false } = {}) => {
  if (selectedPath.value.length !== 4) return
  
  loading.value = true
  if (retryCount === 0) errorMsg.value = ''

  const [area_id, building_id, layer_id, room_id] = selectedPath.value
  const { lightLayerId, acLayerId } = parseLayerIds(layer_id)
  const hasDual = !!(lightLayerId && acLayerId)

  try {
    // 照明查询（或唯一查询）
    const realLightLayerId = lightLayerId || layer_id
    // 照明房间 value 已包含正确 layer_id（合并时保留了照明层的 children）
    const lightCacheKey = `electricity:${props.studentId}:${area_id}-${building_id}-${realLightLayerId}-${room_id}`
    
    const lightPayload = {
      area_id,
      building_id,
      layer_id: realLightLayerId,
      room_id,
      student_id: props.studentId
    }
    
    const lightResult = forceNetwork
      ? await requestBalanceOnline(lightPayload, lightCacheKey)
      : await fetchWithCache(lightCacheKey, async () => {
          const res = await axios.post(`${API_BASE}/v2/electricity/balance`, lightPayload)
          return res.data
        })

    if (lightResult.data?.success) {
      balanceData.value = lightResult.data
      offline.value = lightResult.data?.offline === true
      syncTime.value = lightResult.data?.sync_time || ''
      // 写入小组件
      writeElectricityToWidget({
        quantity: Number(lightResult.data?.quantity) || 0,
        room: selectedPath.value.join(' / ') || '',
        isLow: Number(lightResult.data?.quantity) < 10
      }).catch(() => {})
    } else {
      const cached = getStaleCache(lightCacheKey)
      if (cached?.data) {
        balanceData.value = cached.data
        offline.value = true
        syncTime.value = cached.data?.sync_time || new Date(cached.timestamp).toLocaleString()
      } else {
        errorMsg.value = lightResult.data?.error || t('electricity.error.queryFailed')
        balanceData.value = null
      }
    }

    // 空调查询（仅双计费）
    if (hasDual) {
      isDualBilling.value = true
      // 从合并后的房间节点获取空调端的完整 room value
      const roomNode = currentLevel.value?.children?.find(r => r.value === room_id)
      const acRoomValue = roomNode?._acRoomValue
      if (!acRoomValue) {
        // 该房间没有空调计费
        acBalanceData.value = null
      } else {
        const acCacheKey = `electricity:${props.studentId}:${area_id}-${building_id}-${acLayerId}-${acRoomValue}`
      
        const acPayload = {
          area_id,
          building_id,
          layer_id: acLayerId,
          room_id: acRoomValue,
          student_id: props.studentId
        }
      
        try {
          const acResult = forceNetwork
            ? await requestBalanceOnline(acPayload, acCacheKey)
            : await fetchWithCache(acCacheKey, async () => {
                const res = await axios.post(`${API_BASE}/v2/electricity/balance`, acPayload)
                return res.data
              })

          if (acResult.data?.success) {
            acBalanceData.value = acResult.data
          } else {
            const cached = getStaleCache(acCacheKey)
            if (cached?.data) {
              acBalanceData.value = cached.data
            } else {
              acBalanceData.value = null
            }
          }
        } catch {
          acBalanceData.value = null
        }
      }
    } else {
      isDualBilling.value = false
      acBalanceData.value = null
    }
  } catch (e) {
    // 诊断日志：console 面向开发者；为满足零 CJK 契约（字符串字面量不豁免）统一英文
    console.error('[Electricity] balance query failed:', e)

    if ((e.response && (e.response.status === 502 || e.response.status === 504)) || e.message.includes('Network Error')) {
      if (retryCount < maxRetry.value) {
        errorMsg.value = tf('electricity.error.retrying', { n: retryCount + 1, max: maxRetry.value })
        setTimeout(() => {
          fetchBalance({ retryCount: retryCount + 1, forceNetwork })
        }, retryDelayMs.value)
        return
      } else {
        errorMsg.value = t('electricity.error.serverTimeout')
      }
    } else {
      const cacheKey = `electricity:${props.studentId}:${selectedPath.value.join('-')}`
      const cached = getStaleCache(cacheKey)
      if (cached?.data) {
        balanceData.value = cached.data
        offline.value = true
        syncTime.value = cached.data?.sync_time || new Date(cached.timestamp).toLocaleString()
        errorMsg.value = ''
      } else {
        errorMsg.value = e.message || t('electricity.error.network')
        balanceData.value = null
      }
    }
  } finally {
    // 重试等待期间保持 loading：按当前语言的「正在重试」整句判断
    if (!String(errorMsg.value || '').includes(t('electricity.error.retrying').split('{')[0])) {
      loading.value = false
    }
  }
}

const handleBack = () => emit('back')
const handleLogout = () => emit('logout')

/** 缴电费：每次打开都重新签发未消费 tid（一次性） */
const payLoading = ref(false)
const showPayQr = ref(false)
const payQr = ref('')
const usageStats = ref(null)
const usageLoading = ref(false)
const usageError = ref('')
/** 趋势视图：week | month */
const usageTab = ref('week')
/** 交互选中的柱 */
const selectedBarIdx = ref(-1)
const chartReady = ref(false)

// #737：一码通接口的周/月列表顺序不保证（月视图含电表开户以来全部月份），
// 按标签中的数字段逐级数值比较做升序排序（如 2024-01 < 2024-10 < 2025-01），
// 解析失败的字段保持原相对顺序（Array.sort 稳定）。
const comparePointLabel = (a, b) => {
  const extract = (p) =>
    String(p?.label || p?.date || p?.fullLabel || '')
      .match(/\d+/g)
      ?.map(Number) ?? []
  const na = extract(a)
  const nb = extract(b)
  const len = Math.max(na.length, nb.length)
  for (let i = 0; i < len; i += 1) {
    const va = na[i] ?? -1
    const vb = nb[i] ?? -1
    if (va !== vb) return va - vb
  }
  return 0
}

const mapPoints = (pts, short = true) => {
  if (!Array.isArray(pts)) return []
  return [...pts].sort(comparePointLabel).map((p) => {
    const full = String(p?.label || p?.date || p?.fullLabel || '—')
    const label = short
      ? full.replace(/^\d{4}-?/, '').slice(0, 5) || full
      : full
    return {
      label,
      fullLabel: full,
      value: Number(p?.value ?? p?.dayuse ?? 0) || 0,
      // 缺省单位按当前语言兜底（后端有 unit 时用后端值）
      unit: p?.unit || t('electricity.usage.kwh')
    }
  })
}

const weekPoints = computed(() => mapPoints(usageStats.value?.points))
const monthPoints = computed(() =>
  mapPoints(usageStats.value?.month_points || usageStats.value?.monthPoints, false)
)

const activePoints = computed(() =>
  usageTab.value === 'month' ? monthPoints.value : weekPoints.value
)

// #737：月视图数据多时图表横向滚动，加载/切换后默认停在最右（最新月份）
const ibarRef = ref(null)
watch([activePoints, chartReady], () => {
  nextTick(() => {
    const el = ibarRef.value
    if (el) el.scrollLeft = el.scrollWidth
  })
})

const chartMax = computed(() => {
  const vals = activePoints.value.map((p) => p.value)
  const m = Math.max(0, ...vals)
  return m > 0 ? m : 1
})

const selectedPoint = computed(() => {
  const pts = activePoints.value
  if (!pts.length) return null
  const i =
    selectedBarIdx.value >= 0 && selectedBarIdx.value < pts.length
      ? selectedBarIdx.value
      : pts.length - 1
  return { ...pts[i], index: i }
})

const periodSum = computed(() =>
  activePoints.value.reduce((s, p) => s + (Number(p.value) || 0), 0)
)

const todayUse = computed(
  () => usageStats.value?.today_use ?? usageStats.value?.todayUse ?? null
)

const selectedRoomLabel = computed(() => {
  if (selectedPath.value.length === 4 && currentLevel.value) {
    const room = currentLevel.value.children?.find(
      (r) => r.value === selectedPath.value[3]
    )
    const parts = [
      currentArea.value?.label,
      currentBuilding.value?.label,
      currentLevel.value?.label,
      room?.label
    ].filter(Boolean)
    return parts.join(' ')
  }
  return ''
})

const displayRoomName = computed(() => {
  // 优先展示「当前选择器」房间，避免仍显示绑定 101 造成误解
  if (selectedRoomLabel.value) return selectedRoomLabel.value
  return usageStats.value?.room_name || usageStats.value?.roomName || ''
})

const usageSourceHint = computed(() => {
  const src = usageStats.value?.source || ''
  const hint = usageStats.value?.hint || ''
  if (hint) return hint
  if (src === 'selected') return tLocale('electricity.usage.sourceSelected')
  if (src === 'bound') return tLocale('electricity.usage.sourceBound')
  return ''
})

/** 四级宿舍已齐（换房后趋势以所选房为准） */
const hasSelectedRoom = computed(() => selectedPath.value.length === 4)

/**
 * 换房后智能水电常只回快照（余额/余量、无分日曲线）。
 * 必须与「未选房」空态区分，避免误导文案「请先选择宿舍」。
 */
const usageSnapshotOnly = computed(() => isUsageSnapshotOnly(usageStats.value))

const usageEmptyText = computed(() =>
  resolveUsageEmptyText({
    hasSelectedRoom: hasSelectedRoom.value,
    stats: usageStats.value
  })
)

const usageSnapshotQuantity = computed(() => {
  const q = usageStats.value?.quantity
  if (q == null || String(q).trim() === '') return ''
  return String(q)
})

const usageSnapshotBalance = computed(() => {
  const b = usageStats.value?.balance
  if (b == null || String(b).trim() === '') return ''
  return String(b)
})

/** 换房竞态：只应用最后一次 electricity_usage_stats 结果 */
let usageRequestSeq = 0

const selectBar = (i) => {
  selectedBarIdx.value = i
}

const switchUsageTab = (tab) => {
  usageTab.value = tab
  selectedBarIdx.value = -1
  chartReady.value = false
  requestAnimationFrame(() => {
    chartReady.value = true
  })
}

const openElectricityPay = async () => {
  payLoading.value = true
  try {
    // 每次重新签发：浏览器 tid 用一次即失效。
    // appName 为一码通系统专名（官方 navbarTitle 固定中文），字典两侧同值
    const res = await prepareOneCodeAppOpen({ appCode: 'electric', appName: t('electricity.oneCode.appName') })
    if (res.openUrl) {
      await openExternal(res.openUrl)
      // 可选扫码：同样是新鲜链接
      try {
        payQr.value = await qrToDataURL(res.openUrl, { width: 180 })
      } catch {
        payQr.value = ''
      }
    }
  } catch (e) {
    showToast(String(e?.message || e || t('electricity.pay.openFailed')))
  } finally {
    payLoading.value = false
  }
}

const togglePayQr = async () => {
  if (showPayQr.value) {
    showPayQr.value = false
    return
  }
  payLoading.value = true
  try {
    const res = await prepareOneCodeAppOpen({ appCode: 'electric', appName: t('electricity.oneCode.appName') })
    payQr.value = await qrToDataURL(res.openUrl, { width: 180 })
    showPayQr.value = true
  } catch (e) {
    showToast(String(e?.message || e || t('electricity.pay.qrFailed')))
  } finally {
    payLoading.value = false
  }
}

const roomLabelText = () => {
  if (selectedPath.value.length < 4) return ''
  const room = currentLevel.value?.children?.find(
    (r) => r.value === selectedPath.value[3]
  )
  return [
    currentArea.value?.label,
    currentBuilding.value?.label,
    currentLevel.value?.label,
    room?.label
  ]
    .filter(Boolean)
    .join(' ')
}

const loadUsageStats = async () => {
  if (!isTauriRuntime()) return
  const reqId = ++usageRequestSeq
  usageLoading.value = true
  usageError.value = ''
  selectedBarIdx.value = -1
  chartReady.value = false
  try {
    const roomId =
      selectedPath.value.length === 4
        ? String(selectedPath.value[3] || '').trim()
        : ''
    // 双计费：同时带上空调表 roomverify，后端主表失败会试空调表
    let acRoomId = ''
    if (selectedPath.value.length === 4 && currentLevel.value) {
      const roomNode = currentLevel.value.children?.find(
        (r) => r.value === selectedPath.value[3]
      )
      acRoomId = String(roomNode?._acRoomValue || '').trim()
    }
    // 换房：始终把所选 roomverify 交给后端；后端会 setbindroom + 按候选拉趋势
    const res = await invokeNative('electricity_usage_stats', {
      roomPath: selectedPath.value.length ? [...selectedPath.value] : null,
      roomVerify: roomId || null,
      roomVerifyAlt: acRoomId || null,
      roomLabel: roomLabelText() || null
    })
    // 过期响应丢弃（快速连切房间）
    if (reqId !== usageRequestSeq) return
    usageStats.value = res || null
    const pts = res?.points
    const monthPts = res?.month_points || res?.monthPoints
    const hasPts = Array.isArray(pts) && pts.length
    const hasMonth = Array.isArray(monthPts) && monthPts.length
    if (res?.success === false && !hasPts && !hasMonth) {
      // 已选房时避免后端/兜底文案回落成「请先选择宿舍」；
      // 引导语匹配逻辑（后端中文词汇表）外移至 electricity_usage_ui.containsMisleadingRoomHint
      const raw = String(res?.message || t('electricity.usage.errorNoData'))
      usageError.value =
        hasSelectedRoom.value && containsMisleadingRoomHint(raw)
          ? t('electricity.usage.errorNoTrend')
          : raw
    } else if (hasPts || hasMonth) {
      requestAnimationFrame(() => {
        if (reqId === usageRequestSeq) chartReady.value = true
      })
    }
    // 绑定已更新时轻提示（勿当成错误）
    if (res?.bound_updated || res?.boundUpdated) {
      const hint = String(res?.hint || '').trim()
      if (hint) showToast(hint, 'success')
    }
  } catch (e) {
    if (reqId !== usageRequestSeq) return
    usageError.value = String(e?.message || e || t('electricity.usage.loadFailed'))
    usageStats.value = null
  } finally {
    if (reqId === usageRequestSeq) {
      usageLoading.value = false
    }
  }
}

// 进入页加载；切换完整房间后重新拉趋势
onMounted(() => {
  if (isTauriRuntime()) void loadUsageStats()
})

watch(
  () => selectedPath.value.join('|'),
  (key, prev) => {
    if (key === prev) return
    showPayQr.value = false
    if (selectedPath.value.length === 4) {
      // 选齐四级：按新房拉趋势（后端 setbindroom + usage）
      void loadUsageStats()
    } else {
      // 改选中间级：清空旧房曲线，空态回到「请先选择宿舍…」
      usageRequestSeq += 1
      usageStats.value = null
      usageError.value = ''
      chartReady.value = false
      usageLoading.value = false
    }
  }
)

</script>

<template>
  <div class="electricity-page text-on-surface min-h-screen flex flex-col font-body-md max-w-[448px] mx-auto relative overflow-x-hidden">
    <!-- Header -->
    <TPageHeader icon="bolt" :title="tLocale('electricity.title')" @back="handleBack" />

    <main class="flex-1 px-container-padding pb-[100px] flex flex-col gap-5 mt-4">
      <!-- Offline Banner -->
      <div v-if="offline" class="bg-surface-container-high rounded-lg p-3 flex items-start gap-3">
        <span class="material-symbols-outlined text-secondary mt-0.5" style="font-variation-settings: 'FILL' 0;">cloud_off</span>
        <div>
          <p class="font-body-md text-on-surface-variant text-body-md">{{ tLocale('electricity.offlineBanner.text') }}</p>
          <p class="font-label-md text-outline text-label-md mt-1">{{ tfOfflineLastUpdate }}</p>
        </div>
      </div>

      <!-- Dormitory Selector Card -->
      <section class="glass-card rounded-2xl p-5">
        <h2 class="font-headline-sm text-headline-sm text-on-surface mb-4 flex items-center gap-2">
          <span class="material-symbols-outlined text-primary" style="font-variation-settings: 'FILL' 0;">apartment</span>
          {{ tLocale('electricity.selector.title') }}
        </h2>
        <div class="grid grid-cols-2 gap-3">
          <!-- 校区 -->
          <div class="relative">
            <label class="block font-label-sm text-label-sm text-outline mb-1 pl-1">{{ tLocale('electricity.selector.area') }}</label>
            <IOSSelect v-model="selectedAreaValue" :placeholder="tLocale('electricity.selector.placeholder.area')" class="w-full bg-surface-container-low rounded-xl text-sm">
              <option value="" disabled>{{ tLocale('electricity.selector.placeholder.area') }}</option>
              <option v-for="area in dormData" :key="area.value" :value="area.value">{{ area.label }}</option>
            </IOSSelect>
          </div>
          <!-- 楼栋 -->
          <div class="relative">
            <label class="block font-label-sm text-label-sm text-outline mb-1 pl-1">{{ tLocale('electricity.selector.building') }}</label>
            <IOSSelect v-model="selectedBuildingValue" :disabled="!selectedPath[0]" :placeholder="tLocale('electricity.selector.placeholder.building')" class="w-full bg-surface-container-low rounded-xl text-sm">
              <option value="" disabled>{{ tLocale('electricity.selector.placeholder.building') }}</option>
              <template v-if="currentArea">
                <option v-for="b in currentArea.children" :key="b.value" :value="b.value">{{ b.label }}</option>
              </template>
            </IOSSelect>
          </div>
          <!-- 楼层 -->
          <div class="relative">
            <label class="block font-label-sm text-label-sm text-outline mb-1 pl-1">{{ tLocale('electricity.selector.level') }}</label>
            <IOSSelect v-model="selectedLevelValue" :disabled="!selectedPath[1]" :placeholder="tLocale('electricity.selector.placeholder.level')" class="w-full bg-surface-container-low rounded-xl text-sm">
              <option value="" disabled>{{ tLocale('electricity.selector.placeholder.level') }}</option>
              <template v-if="currentBuilding">
                <option v-for="l in currentBuilding.children" :key="l.value" :value="l.value">{{ l.label }}</option>
              </template>
            </IOSSelect>
          </div>
          <!-- 房间 -->
          <div class="relative">
            <label class="block font-label-sm text-label-sm text-outline mb-1 pl-1">{{ tLocale('electricity.selector.room') }}</label>
            <IOSSelect v-model="selectedRoomValue" :disabled="!selectedPath[2]" :placeholder="tLocale('electricity.selector.placeholder.room')" class="w-full bg-surface-container-low rounded-xl text-sm">
              <option value="" disabled>{{ tLocale('electricity.selector.placeholder.room') }}</option>
              <template v-if="currentLevel">
                <option v-for="r in currentLevel.children" :key="r.value" :value="r.value">{{ r.label }}</option>
              </template>
            </IOSSelect>
          </div>
        </div>
      </section>

      <!-- Loading State -->
      <div v-if="loading" class="glass-card rounded-2xl p-8 flex flex-col items-center justify-center gap-3">
        <div class="animate-spin">
          <span class="material-symbols-outlined text-primary text-3xl" style="font-variation-settings: 'FILL' 0;">progress_activity</span>
        </div>
        <p class="font-body-md text-body-md text-on-surface-variant">{{ tLocale('electricity.loading') }}</p>
      </div>

      <!-- Results: Dual Billing Mode -->
      <template v-else-if="balanceData && isDualBilling">
        <!-- Lighting Billing Card (Warning style when low balance) -->
        <section
          :class="[
            'rounded-2xl p-5 relative overflow-hidden',
            parseFloat(balanceData.quantity) < 10 ? 'glass-card-warning' : 'glass-card-info'
          ]"
        >
          <div class="absolute -right-4 -top-4 opacity-[0.15]">
            <span
              class="material-symbols-outlined text-9xl"
              :class="parseFloat(balanceData.quantity) < 10 ? 'text-error' : 'text-primary'"
              style="font-variation-settings: 'FILL' 1;"
            >lightbulb</span>
          </div>
          <div class="flex justify-between items-start mb-4 relative z-10">
            <div class="flex items-center gap-2">
              <div
                :class="[
                  'rounded-full p-2 flex items-center justify-center',
                  parseFloat(balanceData.quantity) < 10 ? 'bg-error-container text-error' : 'bg-primary-container/20 text-primary'
                ]"
              >
                <span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">lightbulb</span>
              </div>
              <h3 class="font-headline-sm text-headline-sm text-on-surface">{{ tLocale('electricity.card.lighting') }}</h3>
            </div>
            <div
              :class="[
                'font-label-sm text-label-sm px-2 py-1 rounded-md flex items-center gap-1',
                parseFloat(balanceData.quantity) < 10 ? 'bg-error/10 text-error' : 'bg-success-teal/10 text-success-teal'
              ]"
            >
              <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">
                {{ parseFloat(balanceData.quantity) < 10 ? 'warning' : 'check_circle' }}
              </span>
              {{ parseFloat(balanceData.quantity) < 10 ? tLocale('electricity.status.low') : tLocale('electricity.status.normal') }}
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4 relative z-10">
            <div>
              <p class="font-label-md text-label-md text-on-surface-variant mb-1">{{ tLocale('electricity.remainingKwh') }}</p>
              <p
                class="font-headline-lg text-headline-lg"
                :class="parseFloat(balanceData.quantity) < 10 ? 'text-error' : 'text-primary'"
              >{{ balanceData.quantity }}</p>
            </div>
            <div>
              <p class="font-label-md text-label-md text-on-surface-variant mb-1">{{ tLocale('electricity.remainingYuan') }}</p>
              <p class="font-headline-md text-headline-md text-on-surface mt-1">¥ {{ balanceData.balance }}</p>
            </div>
          </div>
          <div class="mt-5 flex gap-3 relative z-10">
            <button
              type="button"
              :class="[
                'flex-1 font-body-lg text-body-lg py-3 rounded-full flex items-center justify-center gap-2 active:scale-95 transition-transform',
                parseFloat(balanceData.quantity) < 10
                  ? 'bg-primary text-on-primary shadow-md shadow-primary/20'
                  : 'bg-primary-container/10 text-primary'
              ]"
              :disabled="payLoading"
              @click="openElectricityPay"
            >
              <span class="material-symbols-outlined text-[20px]" style="font-variation-settings: 'FILL' 1;">account_balance_wallet</span>
              {{ payLoading ? tLocale('electricity.pay.preparing') : parseFloat(balanceData.quantity) < 10 ? tLocale('electricity.pay.rechargeNow') : tLocale('electricity.pay.recharge') }}
            </button>
            <button
              class="bg-surface-container-lowest text-primary border border-primary/20 rounded-full w-12 h-12 flex items-center justify-center active:scale-95 transition-transform shadow-sm"
              @click="fetchBalance({ forceNetwork: true })"
            >
              <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 0;">refresh</span>
            </button>
          </div>
        </section>

        <!-- AC Billing Card -->
        <section v-if="acBalanceData" class="glass-card-info rounded-2xl p-5 relative overflow-hidden">
          <div class="absolute -right-4 -top-4 opacity-[0.12]">
            <span class="material-symbols-outlined text-9xl text-info-sky" style="font-variation-settings: 'FILL' 1;">ac_unit</span>
          </div>
          <div class="flex justify-between items-start mb-4 relative z-10">
            <div class="flex items-center gap-2">
              <div class="bg-primary-container/20 text-primary rounded-full p-2 flex items-center justify-center">
                <span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">ac_unit</span>
              </div>
              <h3 class="font-headline-sm text-headline-sm text-on-surface">{{ tLocale('electricity.card.ac') }}</h3>
            </div>
            <div
              :class="[
                'font-label-sm text-label-sm px-2 py-1 rounded-md flex items-center gap-1',
                parseFloat(acBalanceData.quantity) < 10 ? 'bg-error/10 text-error' : 'bg-success-teal/10 text-success-teal'
              ]"
            >
              <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">
                {{ parseFloat(acBalanceData.quantity) < 10 ? 'warning' : 'check_circle' }}
              </span>
              {{ parseFloat(acBalanceData.quantity) < 10 ? tLocale('electricity.status.low') : tLocale('electricity.status.normal') }}
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4 relative z-10">
            <div>
              <p class="font-label-md text-label-md text-on-surface-variant mb-1">{{ tLocale('electricity.remainingKwh') }}</p>
              <p
                class="font-headline-lg text-headline-lg"
                :class="parseFloat(acBalanceData.quantity) < 10 ? 'text-error' : 'text-primary'"
              >{{ acBalanceData.quantity }}</p>
            </div>
            <div>
              <p class="font-label-md text-label-md text-on-surface-variant mb-1">{{ tLocale('electricity.remainingYuan') }}</p>
              <p class="font-headline-md text-headline-md text-on-surface mt-1">¥ {{ acBalanceData.balance }}</p>
            </div>
          </div>
          <div class="mt-5 flex gap-3 relative z-10">
            <button
              type="button"
              class="flex-1 bg-primary-container/10 text-primary font-body-lg text-body-lg py-3 rounded-full flex items-center justify-center gap-2 active:scale-95 transition-transform"
              :disabled="payLoading"
              @click="openElectricityPay"
            >
              <span class="material-symbols-outlined text-[20px]" style="font-variation-settings: 'FILL' 1;">account_balance_wallet</span>
              {{ payLoading ? tLocale('electricity.pay.preparing') : tLocale('electricity.pay.recharge') }}
            </button>
            <button
              class="bg-surface-container-lowest text-primary border border-primary/20 rounded-full w-12 h-12 flex items-center justify-center active:scale-95 transition-transform shadow-sm"
              @click="fetchBalance({ forceNetwork: true })"
            >
              <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 0;">refresh</span>
            </button>
          </div>
        </section>

        <!-- AC query failed fallback -->
        <section v-else class="glass-card rounded-2xl p-5 flex items-center gap-3">
          <span class="material-symbols-outlined text-outline" style="font-variation-settings: 'FILL' 0;">ac_unit</span>
          <p class="font-body-md text-body-md text-on-surface-variant">{{ tLocale('electricity.acQueryFailed') }}</p>
        </section>
      </template>

      <!-- Results: Single Billing Mode -->
      <template v-else-if="balanceData && !isDualBilling">
        <section
          :class="[
            'rounded-2xl p-5 relative overflow-hidden',
            parseFloat(balanceData.quantity) < 10 ? 'glass-card-warning' : 'glass-card-info'
          ]"
        >
          <div class="absolute -right-4 -top-4 opacity-[0.15]">
            <span
              class="material-symbols-outlined text-9xl"
              :class="parseFloat(balanceData.quantity) < 10 ? 'text-error' : 'text-primary'"
              style="font-variation-settings: 'FILL' 1;"
            >lightbulb</span>
          </div>
          <div class="flex justify-between items-start mb-4 relative z-10">
            <div class="flex items-center gap-2">
              <div
                :class="[
                  'rounded-full p-2 flex items-center justify-center',
                  parseFloat(balanceData.quantity) < 10 ? 'bg-error-container text-error' : 'bg-primary-container/20 text-primary'
                ]"
              >
                <span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">lightbulb</span>
              </div>
              <h3 class="font-headline-sm text-headline-sm text-on-surface">{{ tLocale('electricity.card.balance') }}</h3>
            </div>
            <div
              :class="[
                'font-label-sm text-label-sm px-2 py-1 rounded-md flex items-center gap-1',
                parseFloat(balanceData.quantity) < 10 ? 'bg-error/10 text-error' : 'bg-success-teal/10 text-success-teal'
              ]"
            >
              <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">
                {{ parseFloat(balanceData.quantity) < 10 ? 'warning' : 'check_circle' }}
              </span>
              {{ balanceData.status }}
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4 relative z-10">
            <div>
              <p class="font-label-md text-label-md text-on-surface-variant mb-1">{{ tLocale('electricity.remainingKwh') }}</p>
              <p
                class="font-headline-lg text-headline-lg"
                :class="parseFloat(balanceData.quantity) < 10 ? 'text-error' : 'text-primary'"
              >{{ balanceData.quantity }}</p>
            </div>
            <div>
              <p class="font-label-md text-label-md text-on-surface-variant mb-1">{{ tLocale('electricity.remainingYuan') }}</p>
              <p class="font-headline-md text-headline-md text-on-surface mt-1">¥ {{ balanceData.balance }}</p>
            </div>
          </div>
          <div class="mt-5 flex gap-3 relative z-10">
            <button
              type="button"
              :class="[
                'flex-1 font-body-lg text-body-lg py-3 rounded-full flex items-center justify-center gap-2 active:scale-95 transition-transform',
                parseFloat(balanceData.quantity) < 10
                  ? 'bg-primary text-on-primary shadow-md shadow-primary/20'
                  : 'bg-primary-container/10 text-primary'
              ]"
              :disabled="payLoading"
              @click="openElectricityPay"
            >
              <span class="material-symbols-outlined text-[20px]" style="font-variation-settings: 'FILL' 1;">account_balance_wallet</span>
              {{ payLoading ? tLocale('electricity.pay.preparing') : parseFloat(balanceData.quantity) < 10 ? tLocale('electricity.pay.rechargeNow') : tLocale('electricity.pay.recharge') }}
            </button>
            <button
              class="bg-surface-container-lowest text-primary border border-primary/20 rounded-full w-12 h-12 flex items-center justify-center active:scale-95 transition-transform shadow-sm"
              @click="fetchBalance({ forceNetwork: true })"
            >
              <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 0;">refresh</span>
            </button>
          </div>
        </section>
      </template>

      <!-- Error State -->
      <div v-else-if="errorMsg" class="glass-card-warning rounded-2xl p-5 flex items-center gap-3">
        <span class="material-symbols-outlined text-error" style="font-variation-settings: 'FILL' 0;">error</span>
        <p class="font-body-md text-body-md text-error">{{ errorMsg }}</p>
      </div>

      <!-- Empty State -->
      <div v-else class="glass-card rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-center">
        <span class="material-symbols-outlined text-4xl text-outline" style="font-variation-settings: 'FILL' 0;">electric_meter</span>
        <p class="font-body-md text-body-md text-on-surface-variant">{{ tLocale('electricity.empty') }}</p>
      </div>

      <!-- 用电趋势：跟随所选房间 + 日/月动画柱图 -->
      <section class="util-card usage-card">
        <div class="util-card-head">
          <div>
            <h3>{{ tLocale('electricity.usage.title') }}</h3>
            <p v-if="displayRoomName" class="bound-tag">{{ displayRoomName }}</p>
            <p v-if="usageSourceHint" class="bound-tag soft">{{ usageSourceHint }}</p>
          </div>
          <div class="seg">
            <button type="button" :class="{ on: usageTab === 'week' }" @click="switchUsageTab('week')">{{ tLocale('electricity.usage.tabDay') }}</button>
            <button type="button" :class="{ on: usageTab === 'month' }" @click="switchUsageTab('month')">{{ tLocale('electricity.usage.tabMonth') }}</button>
          </div>
        </div>

        <div v-if="usageLoading" class="util-muted pulse">{{ tLocale('electricity.usage.loadingSmart') }}</div>

        <div v-else-if="usageError && !activePoints.length" class="util-err-row">
          <span>{{ usageError }}</span>
          <button type="button" class="link-btn" @click="loadUsageStats">{{ tLocale('electricity.usage.retry') }}</button>
        </div>

        <template v-else-if="activePoints.length">
          <div class="kpi-row">
            <div class="kpi pop">
              <span>{{ tLocale('electricity.usage.today') }}</span>
              <strong>{{ todayUse ?? '—' }}<small>{{ tLocale('electricity.usage.kwh') }}</small></strong>
            </div>
            <div class="kpi focus pop" v-if="selectedPoint">
              <span>{{ selectedPoint.fullLabel }}</span>
              <strong>{{ selectedPoint.value }}<small>{{ selectedPoint.unit }}</small></strong>
            </div>
            <div class="kpi pop">
              <span>{{ tLocale('electricity.usage.total') }}</span>
              <strong>{{ periodSum.toFixed(1) }}<small>{{ tLocale('electricity.usage.kwh') }}</small></strong>
            </div>
          </div>

          <div
            class="ibar"
            :class="{ ready: chartReady }"
            role="listbox"
            :aria-label="tLocale('electricity.usage.chartAria')"
            ref="ibarRef"
          >
            <button
              v-for="(p, i) in activePoints"
              :key="`${usageTab}-${p.fullLabel}-${i}`"
              type="button"
              class="ibar-col"
              role="option"
              :style="{ '--i': i }"
              :aria-selected="(selectedBarIdx < 0 ? i === activePoints.length - 1 : selectedBarIdx === i)"
              :class="{ active: selectedBarIdx < 0 ? i === activePoints.length - 1 : selectedBarIdx === i }"
              @click="selectBar(i)"
            >
              <div class="ibar-track">
                <div
                  class="ibar-fill"
                  :style="{
                    '--h': Math.max(10, (p.value / chartMax) * 100) + '%'
                  }"
                />
              </div>
              <span class="ibar-val">{{ p.value }}</span>
              <span class="ibar-lab">{{ p.label }}</span>
            </button>
          </div>
        </template>

        <!-- 已选房但无曲线：展示快照说明，禁止「请先选择宿舍」 -->
        <div v-else-if="usageSnapshotOnly" class="usage-snapshot">
          <p class="util-muted">
            {{
              usageStats?.message ||
              usageStats?.summary ||
              tLocale('electricity.usage.snapshotNoCurve')
            }}
          </p>
          <div v-if="usageSnapshotQuantity || usageSnapshotBalance" class="kpi-row snapshot-kpi">
            <div v-if="usageSnapshotQuantity" class="kpi pop">
              <span>{{ tLocale('electricity.usage.snapshotQuantity') }}</span>
              <strong>{{ usageSnapshotQuantity }}<small>{{ tLocale('electricity.usage.kwh') }}</small></strong>
            </div>
            <div v-if="usageSnapshotBalance" class="kpi pop">
              <span>{{ tLocale('electricity.usage.snapshotBalance') }}</span>
              <strong>{{ usageSnapshotBalance }}<small>{{ tLocale('electricity.usage.snapshotYuan') }}</small></strong>
            </div>
          </div>
          <button type="button" class="link-btn" @click="loadUsageStats">{{ tLocale('electricity.usage.refreshTrend') }}</button>
        </div>

        <div v-else class="util-muted">{{ usageEmptyText }}</div>
      </section>

      <!-- 充值：直给，无废话 -->
      <section class="util-card pay-card">
        <div class="pay-actions">
          <button
            type="button"
            class="pay-main"
            :disabled="payLoading"
            @click="openElectricityPay"
          >
            <span class="material-symbols-outlined">bolt</span>
            {{ payLoading ? tLocale('electricity.pay.opening') : tLocale('electricity.pay.main') }}
          </button>
          <button
            type="button"
            class="pay-side"
            :disabled="payLoading"
            :aria-pressed="showPayQr"
            @click="togglePayQr"
          >
            <span class="material-symbols-outlined">qr_code_2</span>
          </button>
        </div>
        <div v-if="showPayQr && payQr" class="pay-qr">
          <img :src="payQr" :alt="tLocale('electricity.pay.qrAlt')" width="180" height="180" />
        </div>
        <!-- 提醒：本页仅查询演示，缴费需前往官方 i 湖工（专名经字典两侧同值保留） -->
        <p class="pay-demo-hint">
          <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 0;">info</span>
          <span>{{ tfPayDemoHint }}</span>
        </p>
      </section>
    </main>
  </div>
</template>

<style src="../styles/views/ElectricityView.scoped.css" scoped></style>
