<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import axios from 'axios'
import { fetchWithCache, setCachedData } from '../utils/api.js'
import { useAppSettings } from '../utils/app_settings'
import { formatRelativeTime } from '../utils/time.js'
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
    const { data } = await fetchWithCache('dormitory:data', async () => {
      const res = await axios.get('/dormitory_data.json')
      return { success: true, data: res.data }
    })
    dormData.value = mergeLevels(data?.data || [])
    
    // 尝试加载上次选择
    const saved = localStorage.getItem('last_dorm_selection')
    if (saved) {
      selectedPath.value = normalizeSelectionPath(JSON.parse(saved))
      if (selectedPath.value.length === 4) {
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
</script>

<template>
  <div class="elec-view">
    <!-- 头部 -->
    <TPageHeader icon="⚡" title="电费查询" @back="handleBack" />

    <div v-if="offline" class="offline-banner">
      当前显示为离线数据，更新于{{ formatRelativeTime(syncTime) }}
    </div>

    <div class="content">
      <!-- 提示信息 -->
      <div class="disclaimer-text">
        <span class="icon">⚠️</span>
        提示：此功能仅在首次登录后有效，长期未登录可能导致查询失败。若无法加载，请尝试退出后重新登录。
      </div>

      <!-- 宿舍选择器 -->
      <div class="selector-card">
        <h3>📍 选择宿舍</h3>
        
        <div class="select-group">
          <!-- 校区 -->
          <IOSSelect 
            v-model="selectedAreaValue"
            placeholder="选择校区"
            class="modern-select"
          >
            <option v-for="area in dormData" :key="area.value" :value="area.value">
              {{ area.label }}
            </option>
          </IOSSelect>
          
          <!-- 楼栋 -->
          <IOSSelect 
            v-model="selectedBuildingValue"
            placeholder="选择楼栋"
            class="modern-select"
            :disabled="!selectedPath[0]"
          >
            <template v-if="currentArea">
              <option v-for="b in currentArea.children" :key="b.value" :value="b.value">
                {{ b.label }}
              </option>
            </template>
          </IOSSelect>
          
          <!-- 楼层 -->
          <IOSSelect 
            v-model="selectedLevelValue"
            placeholder="选择楼层"
            class="modern-select"
            :disabled="!selectedPath[1]"
          >
            <template v-if="currentBuilding">
              <option v-for="l in currentBuilding.children" :key="l.value" :value="l.value">
                {{ l.label }}
              </option>
            </template>
          </IOSSelect>
          
          <!-- 房间 -->
          <IOSSelect 
            v-model="selectedRoomValue"
            placeholder="选择房间"
            class="modern-select"
            :disabled="!selectedPath[2]"
          >
            <template v-if="currentLevel">
              <option v-for="r in currentLevel.children" :key="r.value" :value="r.value">
                {{ r.label }}
              </option>
            </template>
          </IOSSelect>
        </div>
      </div>

      <!-- 结果展示 -->
      <TEmptyState v-if="loading" type="loading" message="正在查询电费信息..." />
      
      <div v-else-if="balanceData" class="result-section">
        <!-- 双计费模式：照明 + 空调 -->
        <template v-if="isDualBilling">
          <div class="result-card dual-card">
            <div class="dual-header">
              <div class="status-badge" :class="balanceData.status.includes('正常') ? 'normal' : 'warning'">
                {{ balanceData.status }}
              </div>
            </div>
            
            <div class="dual-grid">
              <!-- 照明 -->
              <div class="dual-item light-item">
                <div class="dual-icon">💡</div>
                <div class="dual-type">照明电费</div>
                <div class="dual-quantity" :class="{ low: parseFloat(balanceData.quantity) < 10 }">
                  {{ balanceData.quantity }} <small>度</small>
                </div>
                <div class="dual-balance">¥{{ balanceData.balance }}</div>
              </div>
              
              <!-- 空调 -->
              <div class="dual-item ac-item">
                <div class="dual-icon">❄️</div>
                <div class="dual-type">空调电费</div>
                <template v-if="acBalanceData">
                  <div class="dual-quantity" :class="{ low: parseFloat(acBalanceData.quantity) < 10 }">
                    {{ acBalanceData.quantity }} <small>度</small>
                  </div>
                  <div class="dual-balance">¥{{ acBalanceData.balance }}</div>
                </template>
                <template v-else>
                  <div class="dual-quantity muted">-- <small>度</small></div>
                  <div class="dual-balance muted">查询失败</div>
                </template>
              </div>
            </div>

            <div class="detail-row">
              <div class="detail-item">
                <span class="d-label">最后更新</span>
                <span class="d-value">{{ new Date().toLocaleTimeString() }}</span>
              </div>
            </div>
            
            <button class="refresh-btn" @click="fetchBalance({ forceNetwork: true })">
              🔄 刷新数据
            </button>
          </div>
        </template>

        <!-- 单计费模式 -->
        <template v-else>
          <div class="result-card">
            <div class="status-badge" :class="balanceData.status.includes('正常') ? 'normal' : 'warning'">
              {{ balanceData.status }}
            </div>
            
            <div class="balance-display">
              <div class="label">剩余电量</div>
              <div class="value" :class="{ low: parseFloat(balanceData.quantity) < 10 }">
                {{ balanceData.quantity }} <small>度</small>
              </div>
            </div>
            
            <div class="detail-row">
              <div class="detail-item">
                <span class="d-label">账户余额</span>
                <span class="d-value">¥{{ balanceData.balance }}</span>
              </div>
              <div class="detail-item">
                <span class="d-label">最后更新</span>
                <span class="d-value">{{ new Date().toLocaleTimeString() }}</span>
              </div>
            </div>
            
            <button class="refresh-btn" @click="fetchBalance({ forceNetwork: true })">
              🔄 刷新数据
            </button>
          </div>
        </template>
      </div>

      <TEmptyState v-else-if="errorMsg" type="error" :message="errorMsg" />
      
      <TEmptyState v-else message="👆 请先选择宿舍以查询电费" />
    </div>
  </div>
</template>

<style scoped>
.elec-view {
  min-height: 100vh;
  background: #f5f7fa;
}

.elec-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%);
  color: white;
}

.elec-header .title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 20px;
  font-weight: 600;
}

.back-btn, .logout-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  transition: background 0.2s;
}

.back-btn:hover, .logout-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.content {
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
}

.selector-card {
  background: white;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  margin-bottom: 20px;
}

.selector-card h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: #2d3748;
}

.select-group {
  display: grid;
  gap: 12px;
}

.modern-select {
  width: 100%;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 14px;
  color: #4a5568;
  background-color: #fff;
  cursor: pointer;
  outline: none;
  transition: border-color 0.2s;
}

.modern-select:focus {
  border-color: #e53e3e;
}

.modern-select:disabled {
  background-color: #f7fafc;
  cursor: not-allowed;
  opacity: 0.7;
}

/* 结果卡片 */
.result-card {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 8px 24px rgba(229, 62, 62, 0.1);
  text-align: center;
  position: relative;
  overflow: hidden;
}

.status-badge {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.status-badge.normal {
  background: #def7ec;
  color: #03543f;
}

.status-badge.warning {
  background: #fde8e8;
  color: #9b1c1c;
}

.balance-display {
  margin: 20px 0;
}

.balance-display .label {
  font-size: 14px;
  color: #718096;
  margin-bottom: 8px;
}

.balance-display .value {
  font-size: 42px;
  font-weight: 700;
  color: #2d3748;
}

.balance-display .value.low {
  color: #e53e3e;
}

.balance-display .value small {
  font-size: 16px;
  font-weight: 500;
  color: #718096;
}

.disclaimer-text {
  background: rgba(255, 247, 237, 0.95);
  color: #c05621;
  padding: 16px;
  border-radius: 16px;
  font-size: 13px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 24px;
  line-height: 1.6;
  border: 1px solid rgba(251, 211, 141, 0.4);
  box-shadow: 0 4px 12px rgba(237, 137, 54, 0.08);
  backdrop-filter: blur(8px);
}

.disclaimer-text .icon {
  font-size: 18px;
  flex-shrink: 0;
  margin-top: 1px;
}

.detail-row {
  display: flex;
  justify-content: center;
  gap: 32px;
  margin-bottom: 24px;
  padding-top: 20px;
  border-top: 1px solid #f0f0f0;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.d-label {
  font-size: 12px;
  color: #a0aec0;
}

.d-value {
  font-size: 16px;
  font-weight: 600;
  color: #4a5568;
}

.refresh-btn {
  width: 100%;
  padding: 12px;
  background: #f7fafc;
  color: #4a5568;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-btn:hover {
  background: #edf2f7;
  transform: translateY(-2px);
}

.loading-state, .empty-state, .error-msg {
  text-align: center;
  padding: 40px;
  color: #718096;
}

.error-msg {
  color: #e53e3e;
  background: #fff5f5;
  border-radius: 12px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #e53e3e;
  border-radius: 50%;
  margin: 0 auto 16px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.offline-banner {
  margin: 12px 20px 0;
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #b91c1c;
  border-radius: 12px;
  font-weight: 600;
}

/* 双计费布局 */
.result-section {
  margin-bottom: 20px;
}

.dual-card {
  text-align: left;
}

.dual-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.dual-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;
}

.dual-item {
  background: #f7fafc;
  border-radius: 12px;
  padding: 16px;
  text-align: center;
}

.light-item {
  background: #fffbeb;
  border: 1px solid #fef3c7;
}

.ac-item {
  background: #eff6ff;
  border: 1px solid #dbeafe;
}

.dual-icon {
  font-size: 28px;
  margin-bottom: 6px;
}

.dual-type {
  font-size: 13px;
  color: #718096;
  margin-bottom: 8px;
  font-weight: 500;
}

.dual-quantity {
  font-size: 32px;
  font-weight: 700;
  color: #2d3748;
  line-height: 1.2;
}

.dual-quantity.low {
  color: #e53e3e;
}

.dual-quantity.muted {
  color: #a0aec0;
}

.dual-quantity small {
  font-size: 14px;
  font-weight: 500;
  color: #718096;
}

.dual-balance {
  font-size: 14px;
  color: #4a5568;
  margin-top: 4px;
  font-weight: 600;
}

.dual-balance.muted {
  color: #a0aec0;
  font-weight: 400;
}
</style>
