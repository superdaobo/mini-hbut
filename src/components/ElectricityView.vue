<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import axios from 'axios'
import { fetchWithCache } from '../utils/api.js'
import { useAppSettings } from '../utils/app_settings'
import { formatRelativeTime } from '../utils/time.js'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'logout'])

// 状态
const loading = ref(false)
const dormData = ref([])
const selectedPath = ref([]) // [area_id, building_id, level_id, room_id]
const balanceData = ref(null)
const errorMsg = ref('')
const offline = ref(false)
const syncTime = ref('')
const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const appSettings = useAppSettings()
const maxRetry = computed(() => appSettings.retry.electricity)
const retryDelayMs = computed(() => appSettings.retryDelayMs)

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

// 加载宿舍数据
onMounted(async () => {
  try {
    const { data } = await fetchWithCache('dormitory:data', async () => {
      const res = await axios.get('/dormitory_data.json')
      return { success: true, data: res.data }
    })
    dormData.value = data?.data || []
    
    // 尝试加载上次选择
    const saved = localStorage.getItem('last_dorm_selection')
    if (saved) {
      selectedPath.value = JSON.parse(saved)
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
const currentArea = computed(() => dormData.value.find(i => i.value === selectedPath.value[0]))

const currentBuilding = computed(() => {
  if (!currentArea.value || !selectedPath.value[1]) return null
  return currentArea.value.children?.find(i => i.value === selectedPath.value[1])
})

const currentLevel = computed(() => {
  if (!currentBuilding.value || !selectedPath.value[2]) return null
  return currentBuilding.value.children?.find(i => i.value === selectedPath.value[2])
})

// 处理选择变化
const handleSelect = (level, value) => {
  // 截断后续选择
  selectedPath.value = selectedPath.value.slice(0, level)
  selectedPath.value[level] = value
  
  // 自动查询
  if (level === 3) {
    // 保存选择
    localStorage.setItem('last_dorm_selection', JSON.stringify(selectedPath.value))
    fetchBalance()
  } else {
    balanceData.value = null
  }
}

// 查询余额
const fetchBalance = async (retryCount = 0) => {
  if (selectedPath.value.length !== 4) return
  
  loading.value = true
  if (retryCount === 0) errorMsg.value = ''

  const cacheKey = `electricity:${props.studentId}:${selectedPath.value.join('-')}`
  
  try {
    const [area_id, building_id, layer_id, room_id] = selectedPath.value
    
    // 构建 payload
    const payload = {
      area_id,
      building_id,
      layer_id, 
      room_id,
      student_id: props.studentId
    }
    
    // 调用 V2 API
    const { data, fromCache, timestamp } = await fetchWithCache(cacheKey, async () => {
      const res = await axios.post(`${API_BASE}/v2/electricity/balance`, payload)
      return res.data
    })
    
    if (data?.success) {
      balanceData.value = data
      offline.value = !!data.offline || !!fromCache
      if (offline.value) {
        syncTime.value = data.sync_time || (timestamp ? new Date(timestamp).toLocaleString() : '')
      } else {
        syncTime.value = data.sync_time || ''
      }
    } else {
      const cached = getStaleCache(cacheKey)
      if (cached?.data) {
        balanceData.value = cached.data
        offline.value = true
        syncTime.value = cached.data?.sync_time || new Date(cached.timestamp).toLocaleString()
        errorMsg.value = ''
      } else {
        errorMsg.value = data?.error || '查询失败'
      }
    }
  } catch (e) {
    console.error('电费查询错误:', e)
    
    // 针对 502/504 错误进行重试 (后端冷启动)
    if ((e.response && (e.response.status === 502 || e.response.status === 504)) || e.message.includes('Network Error')) {
      if (retryCount < maxRetry.value) {
        errorMsg.value = `系统预热中，正在重试 (${retryCount + 1}/${maxRetry.value})...`
        setTimeout(() => {
          fetchBalance(retryCount + 1)
        }, retryDelayMs.value)
        return // 保持 loading 为 true
      } else {
        errorMsg.value = '服务器响应超时，请稍后再试'
      }
    } else {
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
    // 只有在不重试的情况下才停止 loading
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
    <header class="elec-header">
      <button class="back-btn" @click="handleBack">← 返回</button>
      <div class="title">
        <span class="icon">⚡</span>
        <span>电费查询</span>
      </div>
      <span class="header-spacer" aria-hidden="true"></span>
    </header>

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
            :value="selectedPath[0]" 
            @change="e => handleSelect(0, e.target.value)"
            class="modern-select"
          >
            <option value="" disabled selected>选择校区</option>
            <option v-for="area in dormData" :key="area.value" :value="area.value">
              {{ area.label }}
            </option>
          </IOSSelect>
          
          <!-- 楼栋 -->
          <IOSSelect 
            :value="selectedPath[1]" 
            @change="e => handleSelect(1, e.target.value)"
            class="modern-select"
            :disabled="!selectedPath[0]"
          >
            <option value="" disabled selected>选择楼栋</option>
            <template v-if="currentArea">
              <option v-for="b in currentArea.children" :key="b.value" :value="b.value">
                {{ b.label }}
              </option>
            </template>
          </IOSSelect>
          
          <!-- 楼层 -->
          <IOSSelect 
            :value="selectedPath[2]" 
            @change="e => handleSelect(2, e.target.value)"
            class="modern-select"
            :disabled="!selectedPath[1]"
          >
            <option value="" disabled selected>选择楼层</option>
            <template v-if="currentBuilding">
              <option v-for="l in currentBuilding.children" :key="l.value" :value="l.value">
                {{ l.label }}
              </option>
            </template>
          </IOSSelect>
          
          <!-- 房间 -->
          <IOSSelect 
            :value="selectedPath[3]" 
            @change="e => handleSelect(3, e.target.value)"
            class="modern-select"
            :disabled="!selectedPath[2]"
          >
            <option value="" disabled selected>选择房间</option>
            <template v-if="currentLevel">
              <option v-for="r in currentLevel.children" :key="r.value" :value="r.value">
                {{ r.label }}
              </option>
            </template>
          </IOSSelect>
        </div>
      </div>

      <!-- 结果展示 -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>正在查询电费信息...</p>
      </div>
      
      <div v-else-if="balanceData" class="result-card">
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
        
        <button class="refresh-btn" @click="fetchBalance">
          🔄 刷新数据
        </button>
      </div>

      <div v-else-if="errorMsg" class="error-msg">
        {{ errorMsg }}
      </div>
      
      <div v-else class="empty-state">
        👆 请先选择宿舍以查询电费
      </div>
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
</style>
