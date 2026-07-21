<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import axios from 'axios'
import QRCode from 'qrcode'
import { setCachedData, fetchWithCache } from '../utils/api.js'
import { useAppSettings } from '../utils/app_settings'
import { formatRelativeTime } from '../utils/time.js'
import { fetchDormitoryDataset } from '../utils/static_resource_cache.js'
import { writeElectricityToWidget } from '../utils/widget_bridge'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { openExternal } from '../utils/external_link'
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
    if (!errorMsg.value.includes('正在重试')) {
      loading.value = false
    }
  }
}

const handleBack = () => emit('back')
const handleLogout = () => emit('logout')

/** 缴电费官方入口（链接 + 二维码），不内嵌支付 — #438 */
const payLoading = ref(false)
const payUrl = ref('')
const payQr = ref('')
const payHint = ref('')
const showPayPanel = ref(false)
const usageStats = ref(null)

const prepareElectricityPay = async () => {
  payLoading.value = true
  payHint.value = ''
  try {
    if (!isTauriRuntime()) {
      throw new Error('请在客户端内生成缴纳入口')
    }
    const res = await invokeNative('one_code_app_open_prepare', {
      app_code: 'electric',
      app_name: '缴电费'
    })
    const url = String(res?.open_url || res?.pay_url || '').trim()
    if (!url) throw new Error(res?.message || '未能生成缴纳链接')
    payUrl.value = url
    payHint.value = String(res?.hint || '打开官方一码通完成缴纳；App 不内嵌支付。')
    payQr.value = await QRCode.toDataURL(url, { margin: 1, width: 200 })
    showPayPanel.value = true
  } catch (e) {
    showToast(String(e?.message || e || '生成失败'))
  } finally {
    payLoading.value = false
  }
}

const openElectricityPay = async () => {
  if (!payUrl.value) {
    await prepareElectricityPay()
  }
  if (payUrl.value) {
    try {
      await openExternal(payUrl.value)
    } catch (e) {
      showToast(String(e?.message || e || '打开失败'))
    }
  }
}

const loadUsageStats = async () => {
  if (!isTauriRuntime() || !propsPath.value[3]) return
  try {
    const res = await invokeNative('electricity_usage_stats', {
      room_path: selectedPath.value
    })
    if (res?.success !== false) usageStats.value = res
  } catch {
    usageStats.value = null
  }
}

watch(
  () => balanceData.value,
  (v) => {
    if (v) void loadUsageStats()
  }
)
</script>

<template>
  <div class="bg-surface text-on-surface min-h-screen flex flex-col font-body-md max-w-[448px] mx-auto relative overflow-x-hidden">
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

      <!-- 用电量统计摘要（有数据时）#438 -->
      <section v-if="usageStats?.points?.length" class="glass-card rounded-2xl p-5">
        <h3 class="font-headline-sm text-headline-sm text-on-surface mb-3 flex items-center gap-2">
          <span class="material-symbols-outlined text-primary">insights</span>
          用电统计
        </h3>
        <p v-if="usageStats.summary" class="font-body-md text-body-md text-on-surface-variant mb-2">
          {{ usageStats.summary }}
        </p>
        <ul class="space-y-1 text-sm text-on-surface-variant">
          <li v-for="(p, i) in usageStats.points.slice(0, 7)" :key="i">
            {{ p.label || p.date }}：{{ p.value }}{{ p.unit || ' 度' }}
          </li>
        </ul>
      </section>

      <!-- 缴电费链接 / 二维码 #438 -->
      <section v-if="showPayPanel && payUrl" class="glass-card rounded-2xl p-5 flex flex-col gap-3">
        <h3 class="font-headline-sm text-headline-sm text-on-surface">缴电费入口</h3>
        <p class="font-body-md text-body-md text-on-surface-variant">{{ payHint }}</p>
        <p class="text-xs break-all text-outline">{{ payUrl }}</p>
        <img v-if="payQr" :src="payQr" alt="缴电费二维码" class="w-[200px] h-[200px] mx-auto rounded-xl bg-white" />
        <div class="flex gap-2 flex-wrap">
          <button
            type="button"
            class="flex-1 bg-primary text-on-primary py-3 rounded-full"
            @click="openElectricityPay"
          >
            打开官方缴纳页
          </button>
          <button type="button" class="px-4 py-3 rounded-full border border-primary/30 text-primary" @click="prepareElectricityPay">
            刷新二维码
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.glass-card {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
}

.glass-card-warning {
  background: linear-gradient(135deg, rgba(255, 218, 214, 0.9) 0%, rgba(255, 255, 255, 0.9) 100%);
  border: 1px solid rgba(255, 218, 214, 0.5);
  box-shadow: 0 10px 20px rgba(186, 26, 26, 0.1);
}

.glass-card-info {
  background: linear-gradient(135deg, rgba(216, 226, 255, 0.9) 0%, rgba(255, 255, 255, 0.9) 100%);
  border: 1px solid rgba(216, 226, 255, 0.5);
}
</style>
