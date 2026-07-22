<script setup>
import { ref, onMounted, computed, watch } from 'vue'
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
import { TPageHeader, TEmptyState } from './templates'

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
        const lightMatch = label.match(/^照明(\d+)层$/)
        const acMatch = label.match(/^空调(\d+)层$/)
        if (lightMatch) {
          lightLevels[lightMatch[1]] = level
        } else if (acMatch) {
          acLevels[acMatch[1]] = level
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
            const num = (r.label || '').replace(/房间$/, '')
            acByNum[num] = r.value
          })
          ;(lightLevel.children || []).forEach(r => {
            const lightNum = (r.label || '').replace(/房间$/, '')
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
          label: `${floorNum}层`,
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
    console.error('加载宿舍数据失败:', e)
    errorMsg.value = '无法加载宿舍列表，请稍后重试'
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
        errorMsg.value = lightResult.data?.error || '查询失败'
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
    console.error('电费查询错误:', e)
    
    if ((e.response && (e.response.status === 502 || e.response.status === 504)) || e.message.includes('Network Error')) {
      if (retryCount < maxRetry.value) {
        errorMsg.value = `系统预热中，正在重试 (${retryCount + 1}/${maxRetry.value})...`
        setTimeout(() => {
          fetchBalance({ retryCount: retryCount + 1, forceNetwork })
        }, retryDelayMs.value)
        return
      } else {
        errorMsg.value = '服务器响应超时，请稍后再试'
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
        errorMsg.value = e.message || '网络错误'
        balanceData.value = null
      }
    }
  } finally {
    if (!String(errorMsg.value || '').includes('正在重试')) {
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

const weekPoints = computed(() => {
  const pts = usageStats.value?.points
  if (!Array.isArray(pts)) return []
  return pts.slice(-6).map((p) => ({
    label: String(p?.label || p?.date || '').replace(/^\d{4}-/, '').slice(0, 5) || '—',
    fullLabel: String(p?.label || p?.date || '—'),
    value: Number(p?.value ?? p?.dayuse ?? 0) || 0,
    unit: p?.unit || '度'
  }))
})

const monthPoints = computed(() => {
  const pts = usageStats.value?.month_points || usageStats.value?.monthPoints
  if (!Array.isArray(pts)) return []
  return pts.slice(-8).map((p) => ({
    label: String(p?.label || '').replace(/^\d{4}-?/, '') || '—',
    fullLabel: String(p?.label || '—'),
    value: Number(p?.value ?? 0) || 0,
    unit: p?.unit || '度'
  }))
})

const activePoints = computed(() =>
  usageTab.value === 'month' ? monthPoints.value : weekPoints.value
)

const chartMax = computed(() => {
  const vals = activePoints.value.map((p) => p.value)
  const m = Math.max(0, ...vals)
  return m > 0 ? m : 1
})

const selectedPoint = computed(() => {
  const pts = activePoints.value
  if (!pts.length) return null
  const i = selectedBarIdx.value >= 0 && selectedBarIdx.value < pts.length
    ? selectedBarIdx.value
    : pts.length - 1
  return { ...pts[i], index: i }
})

const todayUse = computed(
  () => usageStats.value?.today_use ?? usageStats.value?.todayUse ?? null
)

const selectBar = (i) => {
  selectedBarIdx.value = i
}

const switchUsageTab = (tab) => {
  usageTab.value = tab
  selectedBarIdx.value = -1
}

const openElectricityPay = async () => {
  payLoading.value = true
  try {
    // 每次重新签发：浏览器 tid 用一次即失效
    const res = await prepareOneCodeAppOpen({ appCode: 'electric', appName: '缴电费' })
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
    showToast(String(e?.message || e || '打开失败'))
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
    const res = await prepareOneCodeAppOpen({ appCode: 'electric', appName: '缴电费' })
    payQr.value = await qrToDataURL(res.openUrl, { width: 180 })
    showPayQr.value = true
  } catch (e) {
    showToast(String(e?.message || e || '生成二维码失败'))
  } finally {
    payLoading.value = false
  }
}

const loadUsageStats = async () => {
  if (!isTauriRuntime()) return
  if (selectedPath.value.length < 4) return
  const roomId = String(selectedPath.value[3] || '').trim()
  if (!roomId) return
  usageLoading.value = true
  usageError.value = ''
  selectedBarIdx.value = -1
  try {
    const res = await invokeNative('electricity_usage_stats', {
      roomPath: [...selectedPath.value],
      roomVerify: roomId
    })
    usageStats.value = res || null
    if (res?.success === false && !(Array.isArray(res?.points) && res.points.length)) {
      usageError.value = String(res?.message || '暂无用电数据')
    }
  } catch (e) {
    usageError.value = String(e?.message || e || '加载失败')
    usageStats.value = null
  } finally {
    usageLoading.value = false
  }
}

watch(
  () => selectedPath.value.join('|'),
  (key, prev) => {
    if (key === prev) return
    usageStats.value = null
    usageError.value = ''
    selectedBarIdx.value = -1
    showPayQr.value = false
    if (selectedPath.value.length === 4) void loadUsageStats()
  }
)

watch(
  () => balanceData.value,
  (v) => {
    if (v && selectedPath.value.length === 4) void loadUsageStats()
  }
)

</script>

<template>
  <div class="electricity-page text-on-surface min-h-screen flex flex-col font-body-md max-w-[448px] mx-auto relative overflow-x-hidden">
    <!-- Header -->
    <TPageHeader icon="bolt" title="电费查询" @back="handleBack" />

    <main class="flex-1 px-container-padding pb-[100px] flex flex-col gap-5 mt-4">
      <!-- Offline Banner -->
      <div v-if="offline" class="bg-surface-container-high rounded-lg p-3 flex items-start gap-3">
        <span class="material-symbols-outlined text-secondary mt-0.5" style="font-variation-settings: 'FILL' 0;">cloud_off</span>
        <div>
          <p class="font-body-md text-on-surface-variant text-body-md">当前显示为离线缓存数据</p>
          <p class="font-label-md text-outline text-label-md mt-1">最后更新: {{ formatRelativeTime(syncTime) }}</p>
        </div>
      </div>

      <!-- Dormitory Selector Card -->
      <section class="glass-card rounded-2xl p-5">
        <h2 class="font-headline-sm text-headline-sm text-on-surface mb-4 flex items-center gap-2">
          <span class="material-symbols-outlined text-primary" style="font-variation-settings: 'FILL' 0;">apartment</span>
          宿舍信息
        </h2>
        <div class="grid grid-cols-2 gap-3">
          <!-- 校区 -->
          <div class="relative">
            <label class="block font-label-sm text-label-sm text-outline mb-1 pl-1">校区</label>
            <IOSSelect v-model="selectedAreaValue" placeholder="选择校区" class="w-full bg-surface-container-low rounded-xl text-sm">
              <option value="" disabled>选择校区</option>
              <option v-for="area in dormData" :key="area.value" :value="area.value">{{ area.label }}</option>
            </IOSSelect>
          </div>
          <!-- 楼栋 -->
          <div class="relative">
            <label class="block font-label-sm text-label-sm text-outline mb-1 pl-1">楼栋</label>
            <IOSSelect v-model="selectedBuildingValue" :disabled="!selectedPath[0]" placeholder="选择楼栋" class="w-full bg-surface-container-low rounded-xl text-sm">
              <option value="" disabled>选择楼栋</option>
              <template v-if="currentArea">
                <option v-for="b in currentArea.children" :key="b.value" :value="b.value">{{ b.label }}</option>
              </template>
            </IOSSelect>
          </div>
          <!-- 楼层 -->
          <div class="relative">
            <label class="block font-label-sm text-label-sm text-outline mb-1 pl-1">楼层</label>
            <IOSSelect v-model="selectedLevelValue" :disabled="!selectedPath[1]" placeholder="选择楼层" class="w-full bg-surface-container-low rounded-xl text-sm">
              <option value="" disabled>选择楼层</option>
              <template v-if="currentBuilding">
                <option v-for="l in currentBuilding.children" :key="l.value" :value="l.value">{{ l.label }}</option>
              </template>
            </IOSSelect>
          </div>
          <!-- 房间 -->
          <div class="relative">
            <label class="block font-label-sm text-label-sm text-outline mb-1 pl-1">房间</label>
            <IOSSelect v-model="selectedRoomValue" :disabled="!selectedPath[2]" placeholder="选择房间" class="w-full bg-surface-container-low rounded-xl text-sm">
              <option value="" disabled>选择房间</option>
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
        <p class="font-body-md text-body-md text-on-surface-variant">正在查询电费信息...</p>
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
              <h3 class="font-headline-sm text-headline-sm text-on-surface">照明用电</h3>
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
              {{ parseFloat(balanceData.quantity) < 10 ? '余额不足' : '运行正常' }}
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4 relative z-10">
            <div>
              <p class="font-label-md text-label-md text-on-surface-variant mb-1">剩余电量 (度)</p>
              <p
                class="font-headline-lg text-headline-lg"
                :class="parseFloat(balanceData.quantity) < 10 ? 'text-error' : 'text-primary'"
              >{{ balanceData.quantity }}</p>
            </div>
            <div>
              <p class="font-label-md text-label-md text-on-surface-variant mb-1">剩余金额 (元)</p>
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
              {{ payLoading ? '准备中…' : parseFloat(balanceData.quantity) < 10 ? '立即充值' : '去充值' }}
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
              <h3 class="font-headline-sm text-headline-sm text-on-surface">空调用电</h3>
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
              {{ parseFloat(acBalanceData.quantity) < 10 ? '余额不足' : '运行正常' }}
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4 relative z-10">
            <div>
              <p class="font-label-md text-label-md text-on-surface-variant mb-1">剩余电量 (度)</p>
              <p
                class="font-headline-lg text-headline-lg"
                :class="parseFloat(acBalanceData.quantity) < 10 ? 'text-error' : 'text-primary'"
              >{{ acBalanceData.quantity }}</p>
            </div>
            <div>
              <p class="font-label-md text-label-md text-on-surface-variant mb-1">剩余金额 (元)</p>
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
              {{ payLoading ? '准备中…' : '去充值' }}
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
          <p class="font-body-md text-body-md text-on-surface-variant">空调电费查询失败</p>
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
              <h3 class="font-headline-sm text-headline-sm text-on-surface">电费余额</h3>
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
              <p class="font-label-md text-label-md text-on-surface-variant mb-1">剩余电量 (度)</p>
              <p
                class="font-headline-lg text-headline-lg"
                :class="parseFloat(balanceData.quantity) < 10 ? 'text-error' : 'text-primary'"
              >{{ balanceData.quantity }}</p>
            </div>
            <div>
              <p class="font-label-md text-label-md text-on-surface-variant mb-1">剩余金额 (元)</p>
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
              {{ payLoading ? '准备中…' : parseFloat(balanceData.quantity) < 10 ? '立即充值' : '去充值' }}
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
        <p class="font-body-md text-body-md text-on-surface-variant">请先选择宿舍以查询电费</p>
      </div>

      <!-- 用电趋势：可交互柱图，周/月切换 -->
      <section v-if="selectedPath.length === 4" class="util-card">
        <div class="util-card-head">
          <h3>用电</h3>
          <div class="seg">
            <button
              type="button"
              :class="{ on: usageTab === 'week' }"
              @click="switchUsageTab('week')"
            >近6日</button>
            <button
              type="button"
              :class="{ on: usageTab === 'month' }"
              @click="switchUsageTab('month')"
            >月</button>
          </div>
        </div>

        <div v-if="usageLoading" class="util-muted">加载中…</div>

        <div v-else-if="usageError && !activePoints.length" class="util-err-row">
          <span>{{ usageError }}</span>
          <button type="button" class="link-btn" @click="loadUsageStats">重试</button>
        </div>

        <template v-else-if="activePoints.length">
          <div class="kpi-row">
            <div class="kpi">
              <span>今日</span>
              <strong>{{ todayUse ?? '—' }}<small>度</small></strong>
            </div>
            <div class="kpi focus" v-if="selectedPoint">
              <span>{{ selectedPoint.fullLabel }}</span>
              <strong>{{ selectedPoint.value }}<small>{{ selectedPoint.unit }}</small></strong>
            </div>
            <div class="kpi" v-if="usageStats?.price != null">
              <span>电价</span>
              <strong>{{ usageStats.price }}<small>元</small></strong>
            </div>
          </div>

          <div class="ibar" role="listbox" :aria-label="usageTab === 'week' ? '近6日用电' : '月用电'">
            <button
              v-for="(p, i) in activePoints"
              :key="`${usageTab}-${i}`"
              type="button"
              class="ibar-col"
              role="option"
              :aria-selected="(selectedBarIdx < 0 ? i === activePoints.length - 1 : selectedBarIdx === i)"
              :class="{ active: selectedBarIdx < 0 ? i === activePoints.length - 1 : selectedBarIdx === i }"
              @click="selectBar(i)"
            >
              <div class="ibar-track">
                <div
                  class="ibar-fill"
                  :style="{ height: Math.max(10, (p.value / chartMax) * 100) + '%' }"
                />
              </div>
              <span class="ibar-lab">{{ p.label }}</span>
            </button>
          </div>
        </template>

        <div v-else class="util-muted">暂无数据</div>
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
            {{ payLoading ? '打开中…' : '缴电费' }}
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
          <img :src="payQr" alt="缴电费" width="180" height="180" />
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* 与成绩查询一致的浅白底，避免透明玻璃在浅色主题下“整页发白看不见” */
.electricity-page {
  min-height: 100%;
  background: #f6fafe;
  color: #1e293b;
}

.glass-card {
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.95);
  box-shadow: 0 4px 15px rgba(15, 23, 42, 0.04);
}

.glass-card-warning {
  background: #fff7f6;
  border: 1px solid rgba(254, 202, 202, 0.9);
  box-shadow: 0 8px 18px rgba(186, 26, 26, 0.06);
}

.glass-card-info {
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.95);
  box-shadow: 0 4px 15px rgba(15, 23, 42, 0.04);
}

html.dark .electricity-page {
  background: var(--ui-bg, #0b1220);
  color: var(--ui-text, #e2e8f0);
}

html.dark .glass-card,
html.dark .glass-card-info {
  background: var(--ui-surface, #111827);
  border-color: rgba(51, 65, 85, 0.9);
}

html.dark .glass-card-warning {
  background: color-mix(in oklab, #7f1d1d 28%, #111827);
  border-color: rgba(248, 113, 113, 0.35);
}

/* —— 工具页：扁平、可点、少文案 —— */
.util-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 14px 14px 16px;
}
.util-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.util-card-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}
.seg {
  display: inline-flex;
  background: #f1f5f9;
  border-radius: 999px;
  padding: 2px;
  gap: 2px;
}
.seg button {
  border: 0;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 999px;
  min-height: 32px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.seg button.on {
  background: #059669;
  color: #fff;
}
.kpi-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}
.kpi {
  background: #f8fafc;
  border-radius: 12px;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 56px;
}
.kpi.focus {
  background: #ecfdf5;
  outline: 1px solid #a7f3d0;
}
.kpi span {
  font-size: 11px;
  color: #64748b;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kpi strong {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
  line-height: 1.1;
}
.kpi small {
  font-size: 11px;
  font-weight: 500;
  color: #64748b;
  margin-left: 2px;
}
.ibar {
  display: flex;
  align-items: stretch;
  gap: 6px;
  height: 148px;
  padding-top: 4px;
}
.ibar-col {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.ibar-track {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: #f1f5f9;
  border-radius: 10px 10px 4px 4px;
  padding: 0 4px 0;
  min-height: 100px;
}
.ibar-fill {
  width: 72%;
  max-width: 28px;
  min-height: 10px;
  border-radius: 8px 8px 3px 3px;
  background: #94a3b8;
  transition: height 0.2s ease, background 0.15s ease, transform 0.15s ease;
}
.ibar-col.active .ibar-fill {
  background: #059669;
  transform: scaleX(1.05);
}
.ibar-col:active .ibar-fill {
  transform: scale(0.96);
}
.ibar-lab {
  font-size: 10px;
  color: #94a3b8;
  font-weight: 600;
}
.ibar-col.active .ibar-lab {
  color: #059669;
}
.util-muted {
  font-size: 13px;
  color: #94a3b8;
  padding: 12px 0 4px;
}
.util-err-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  color: #dc2626;
}
.link-btn {
  border: 0;
  background: transparent;
  color: #059669;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  min-height: 40px;
  padding: 0 8px;
}
.pay-card {
  padding: 12px;
}
.pay-actions {
  display: flex;
  gap: 8px;
}
.pay-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  border: 0;
  border-radius: 14px;
  background: #059669;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.pay-main:active:not(:disabled) {
  transform: scale(0.97);
}
.pay-main:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.pay-main .material-symbols-outlined {
  font-size: 22px;
}
.pay-side {
  width: 48px;
  min-height: 48px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.pay-side:active:not(:disabled) {
  transform: scale(0.96);
}
.pay-side .material-symbols-outlined {
  font-size: 24px;
}
.pay-qr {
  margin-top: 12px;
  display: flex;
  justify-content: center;
}
.pay-qr img {
  width: 180px;
  height: 180px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
}
html.dark .util-card {
  background: var(--ui-surface, #111827);
  border-color: #334155;
}
html.dark .util-card-head h3,
html.dark .kpi strong {
  color: #e2e8f0;
}
html.dark .seg {
  background: #1e293b;
}
html.dark .kpi,
html.dark .ibar-track {
  background: #1e293b;
}
html.dark .kpi.focus {
  background: color-mix(in oklab, #059669 22%, #111827);
  outline-color: #065f46;
}
html.dark .pay-side {
  background: #1e293b;
  border-color: #334155;
  color: #e2e8f0;
}
html.dark .ibar-fill {
  background: #64748b;
}
html.dark .ibar-col.active .ibar-fill {
  background: #10b981;
}
@media (prefers-reduced-motion: reduce) {
  .ibar-fill,
  .pay-main,
  .seg button {
    transition: none;
  }
}
html.dark .week-val {
  color: #cbd5e1;
}
</style>
