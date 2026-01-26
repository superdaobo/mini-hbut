<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back'])

// State
const loading = ref(false)
const rawTransactions = ref([])
const errorMsg = ref('')
const selectedMonth = ref('') // Format: YYYY-MM
const monthStats = ref({ income: 0, expense: 0 })

// Computed: Extract available months from data
const availableMonths = computed(() => {
  const months = new Set()
  rawTransactions.value.forEach(t => {
    if (t.date) {
      // date format usually "YYYY-MM-DD HH:mm:ss"
      const m = t.date.substring(0, 7)
      months.add(m)
    }
  })
  // Sort descending (newest first)
  return Array.from(months).sort((a, b) => b.localeCompare(a))
})

// Computed: Filter transactions by selected month
const currentMonthTransactions = computed(() => {
  if (!selectedMonth.value) return []
  return rawTransactions.value.filter(t => t.date && t.date.startsWith(selectedMonth.value))
})

// Watch: Recalculate stats when current list changes
watch(currentMonthTransactions, (list) => {
  let inc = 0
  let exp = 0
  list.forEach(t => {
    // amt string often like "-10.50" or "0.50"
    const val = parseFloat(t.amt)
    if (!isNaN(val)) {
      if (val < 0) exp += Math.abs(val)
      else inc += val
    }
  })
  monthStats.value = { 
    income: inc.toFixed(2), 
    expense: exp.toFixed(2) 
  }
})

const initLoad = async () => {
  loading.value = true
  errorMsg.value = ''
  
  try {
    // Auto-calculate range for last 12 months
    const end = new Date()
    const start = new Date()
    start.setMonth(start.getMonth() - 12)
    
    // Request large page size to trigger backend full caching
    // 1000 items should cover most student's yearly transactions
    const res = await invoke('fetch_transaction_history', {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      pageNo: 1,
      pageSize: 1000 
    })

    if (res.success) {
      rawTransactions.value = res.resultData || []
      
      // Auto-select newest month if available
      if (availableMonths.value.length > 0) {
        selectedMonth.value = availableMonths.value[0]
      }
    } else {
      errorMsg.value = res.message || '获取数据失败'
      
      // If valid cache exists (from backend logic), rawTransactions might still be empty if error occurred on refresh?
      // Our backend implementation tailored cached returns on failure, so if we are here with success=false, 
      // it means both network and cache failed (or cache empty).
    }
  } catch (e) {
    console.error('Failed to fetch transactions:', e)
    errorMsg.value = '网络请求异常: ' + e.toString()
  } finally {
    loading.value = false
  }
}

const handleBack = () => emit('back')

onMounted(() => {
  initLoad()
})
</script>

<template>
  <div class="trans-view">
    <!-- Header -->
    <header class="trans-header">
      <button class="back-btn" @click="handleBack">← 返回</button>
      <div class="title">
        <span class="icon">💰</span>
        <span>交易记录</span>
      </div>
      <div class="placeholder"></div>
    </header>

    <div class="content">
      <!-- Month Selector & Stats -->
      <div class="dashboard-card">
        <div class="month-selector">
          <label>选择月份</label>
          <select v-model="selectedMonth" class="modern-select">
            <option v-if="availableMonths.length === 0" value="">暂无数据</option>
            <option v-for="m in availableMonths" :key="m" :value="m">
              {{ m }}
            </option>
          </select>
        </div>
        
        <div class="stats-row">
          <div class="stat-item">
            <span class="label">本月支出</span>
            <span class="value expense">¥ {{ monthStats.expense }}</span>
          </div>
          <div class="stat-item">
            <span class="label">本月存入</span>
            <span class="value income">¥ {{ monthStats.income }}</span>
          </div>
        </div>
      </div>

      <!-- Disclaimer -->
      <div class="disclaimer-text">
        <span class="icon">⚠️</span>
        提示：此功能仅在首次登录后有效，长期未登录可能导致查询失败。若无法加载，请尝试退出后重新登录。
      </div>

      <!-- Result List -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>正在同步近一年数据...</p>
      </div>

      <div v-else-if="currentMonthTransactions.length > 0" class="transaction-list">
        <div v-for="(item, index) in currentMonthTransactions" :key="index" class="trans-item">
          <div class="trans-icon">
            {{ item.amt.startsWith('-') ? '💸' : '💰' }}
          </div>
          <div class="trans-main">
            <div class="trans-name">{{ item.merchantName || item.summary || '未知交易' }}</div>
            <div class="trans-date">{{ item.date }}</div>
          </div>
          <div class="trans-right">
            <div class="trans-amt" :class="{ 'expense': item.amt.startsWith('-'), 'income': !item.amt.startsWith('-') }">
              {{ item.amt }}
            </div>
            <div class="trans-balance" v-if="item.balance">余额: {{ item.balance }}</div>
          </div>
        </div>
      </div>

      <div v-else-if="errorMsg" class="error-msg">
        {{ errorMsg }}
        <button @click="initLoad" class="retry-btn">重试</button>
      </div>
      
      <div v-else class="empty-state">
        <span class="empty-icon">📭</span>
        <p>该月份暂无交易记录</p>
        <button @click="initLoad" class="retry-btn" style="margin-top: 10px;">刷新数据</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trans-view {
  min-height: 100vh;
  background: #f5f7fa;
  font-family: 'Inter', sans-serif;
}

.trans-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, #FF6B6B 0%, #EE5253 100%);
  color: white;
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(238, 82, 83, 0.3);
}

.trans-header .title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
}

.back-btn {
  padding: 8px 16px;
  border-radius: 20px;
  border: none;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 14px;
  backdrop-filter: blur(4px);
  transition: background 0.2s;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.placeholder { width: 60px; }

.content {
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
}

.dashboard-card {
  background: white;
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 24px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.05);
}

.month-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.calendar-icon { font-size: 20px; }

.modern-select {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid #edf2f7;
  border-radius: 12px;
  background: #f8fafc;
  font-size: 16px;
  color: #2d3748;
  font-weight: 500;
  outline: none;
  transition: all 0.2s;
}

.modern-select:focus {
  border-color: #EE5253;
  box-shadow: 0 0 0 3px rgba(238, 82, 83, 0.1);
}

.stats-row {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding-top: 16px;
  border-top: 1px solid #edf2f7;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-item .label {
  font-size: 12px;
  color: #a0aec0;
  font-weight: 500;
}

.stat-item .value {
  font-size: 20px;
  font-weight: 700;
  font-family: 'Outfit', sans-serif;
}

.value.expense { color: #2d3748; }
.value.income { color: #48bb78; }

.transaction-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.trans-item {
  background: white;
  border-radius: 16px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);
  transition: transform 0.2s;
}

.trans-item:active {
  transform: scale(0.98);
}

.trans-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #fff5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.trans-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
}

.trans-name {
  font-weight: 600;
  color: #2d3748;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.trans-date {
  font-size: 12px;
  color: #a0aec0;
}

.trans-right {
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-end;
}

.trans-amt {
  font-weight: 700;
  font-size: 16px;
  font-family: 'Outfit', sans-serif;
}

.trans-amt.expense { color: #2d3748; }
.trans-amt.income { color: #48bb78; }

.trans-balance {
  font-size: 11px;
  color: #cbd5e0;
}

.loading-state, .empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #718096;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  display: block;
  opacity: 0.5;
}

.error-msg {
  text-align: center;
  padding: 20px;
  color: #e53e3e;
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(229, 62, 62, 0.1);
}

.retry-btn {
  margin-left: 10px;
  padding: 6px 16px;
  border-radius: 8px;
  border: none;
  background: #fee2e2;
  color: #e53e3e;
  font-weight: 600;
  cursor: pointer;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #FF6B6B;
  border-radius: 50%;
  margin: 0 auto 16px;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
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
  transition: all 0.3s ease;
}

.disclaimer-text:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(237, 137, 54, 0.12);
}

.disclaimer-text .icon {
  font-size: 18px;
  flex-shrink: 0;
  margin-top: 1px;
}
</style>
