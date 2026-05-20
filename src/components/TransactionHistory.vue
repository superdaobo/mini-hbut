<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { formatRelativeTime } from '../utils/time.js'
import { invokeNative as invoke } from '../platform/native'
import { TPageHeader, TEmptyState } from './templates'

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
const offline = ref(false)
const syncTime = ref('')

const parseDateString = (value) => {
  if (!value) return ''
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return ''
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed
    const parsed = new Date(trimmed)
    if (!isNaN(parsed.getTime())) return parsed.toISOString().replace('T', ' ').slice(0, 19)
    return trimmed
  }
  if (typeof value === 'number') {
    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) return parsed.toISOString().replace('T', ' ').slice(0, 19)
  }
  return ''
}

const normalizeAmount = (value, item) => {
  if (value == null) return ''
  if (typeof value === 'number') return value.toFixed(2)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  if (item && item.money != null) return String(item.money)
  return ''
}

const normalizeTransactions = (list) => {
  if (!Array.isArray(list)) return []
  return list.map((item) => {
    const date = parseDateString(
      item.date || item.tradeTime || item.time || item.createTime || item.tradeDate || item.orderTime
    )
    const amt = normalizeAmount(
      item.amt || item.amount || item.money || item.fee || item.tradeAmount || item.transAmount,
      item
    )
    const merchantName = item.merchantName || item.merchant || item.merchant_name || ''
    const summary = item.summary || item.remark || item.title || item.description || ''
    const balance = item.balance || item.afterBalance || item.leftBalance || item.cardBalance || ''
    return {
      ...item,
      date,
      amt,
      merchantName,
      summary,
      balance
    }
  }).filter((item) => item.date || item.amt || item.merchantName || item.summary)
}

// Computed: Extract available months from data
const availableMonths = computed(() => {
  const months = new Set()
  rawTransactions.value.forEach(t => {
    if (t.date) {
      const m = t.date.substring(0, 7)
      if (m) months.add(m)
    }
  })
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

    const isSuccess = res?.success === true || res?.code === '' || Array.isArray(res?.resultData) || Array.isArray(res?.data)
    if (isSuccess) {
      offline.value = !!res.offline
      syncTime.value = res.sync_time || ''
      const rawList = res.resultData || res.data || res.rows || res.result || res.list || []
      rawTransactions.value = normalizeTransactions(rawList)
      
      // Auto-select newest month if available
      if (availableMonths.value.length > 0) {
        selectedMonth.value = availableMonths.value[0]
      }
    } else {
      errorMsg.value = res.message || res.msg || '获取数据失败'
      
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

// 月份导航
const navigateMonth = (direction) => {
  const idx = availableMonths.value.indexOf(selectedMonth.value)
  if (idx < 0) return
  const nextIdx = idx - direction // 因为 availableMonths 是降序排列
  if (nextIdx >= 0 && nextIdx < availableMonths.value.length) {
    selectedMonth.value = availableMonths.value[nextIdx]
  }
}

// 格式化月份显示
const selectedMonthLabel = computed(() => {
  if (!selectedMonth.value) return '暂无数据'
  const [year, month] = selectedMonth.value.split('-')
  return `${year}年 ${parseInt(month)}月`
})

// 按日期分组交易
const groupedTransactions = computed(() => {
  const groups = []
  const dateMap = new Map()
  
  currentMonthTransactions.value.forEach(item => {
    const dateKey = item.date ? item.date.substring(0, 10) : '未知日期'
    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, [])
    }
    dateMap.get(dateKey).push(item)
  })
  
  for (const [dateKey, items] of dateMap) {
    const d = new Date(dateKey)
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
    const dateLabel = !isNaN(d.getTime())
      ? `${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`
      : dateKey
    groups.push({ dateLabel, items })
  }
  
  return groups
})

// 获取交易图标
const getIconName = (item) => {
  const name = (item.merchantName || item.summary || '').toLowerCase()
  if (name.includes('食堂') || name.includes('餐')) return 'restaurant'
  if (name.includes('超市') || name.includes('商店')) return 'local_convenience_store'
  if (name.includes('充值') || name.includes('转入')) return 'account_balance_wallet'
  if (name.includes('图书') || name.includes('打印')) return 'menu_book'
  if (name.includes('车') || name.includes('交通')) return 'directions_bus'
  if (!item.amt.startsWith('-')) return 'account_balance_wallet'
  return 'payments'
}

// 获取图标颜色类
const getIconClass = (item) => {
  const name = (item.merchantName || item.summary || '').toLowerCase()
  if (name.includes('食堂') || name.includes('餐')) return 'icon-orange'
  if (name.includes('超市') || name.includes('商店')) return 'icon-sky'
  if (name.includes('充值') || name.includes('转入') || !item.amt.startsWith('-')) return 'icon-teal'
  if (name.includes('图书') || name.includes('打印')) return 'icon-primary'
  if (name.includes('车') || name.includes('交通')) return 'icon-secondary'
  return 'icon-primary'
}

// 格式化时间
const formatTime = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(() => {
  initLoad()
})
</script>

<template>
  <div class="trans-view">
    <!-- TopAppBar -->
    <header class="trans-header">
      <div class="header-left">
        <button class="header-icon-btn" @click="handleBack">
          <span class="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 class="header-title">💳 交易记录</h1>
      </div>
    </header>

    <!-- Offline Banner -->
    <div v-if="offline" class="offline-banner">
      当前显示为离线数据，更新于{{ formatRelativeTime(syncTime) }}
    </div>

    <main class="trans-content">
      <!-- Month Selector & Stats Bento -->
      <section class="bento-section">
        <!-- Month Selector -->
        <div class="month-selector-card">
          <button class="month-nav-btn" @click="navigateMonth(-1)">
            <span class="material-symbols-outlined">chevron_left</span>
          </button>
          <div class="month-center">
            <span class="month-title">{{ selectedMonthLabel }}</span>
            <span class="month-subtitle">本月共 {{ currentMonthTransactions.length }} 笔交易</span>
          </div>
          <button class="month-nav-btn" @click="navigateMonth(1)">
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>

        <!-- Stats Grid -->
        <div class="stats-grid">
          <div class="stat-card expense-card">
            <div class="stat-bg-icon">
              <span class="material-symbols-outlined fill">outbox</span>
            </div>
            <span class="stat-label">本月支出</span>
            <div class="stat-value-row">
              <span class="stat-currency expense">¥</span>
              <span class="stat-amount expense">{{ monthStats.expense }}</span>
            </div>
          </div>
          <div class="stat-card income-card">
            <div class="stat-bg-icon">
              <span class="material-symbols-outlined fill">move_to_inbox</span>
            </div>
            <span class="stat-label">本月存入</span>
            <div class="stat-value-row">
              <span class="stat-currency income">¥</span>
              <span class="stat-amount income">{{ monthStats.income }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Disclaimer -->
      <div class="disclaimer-card">
        <span class="material-symbols-outlined disclaimer-icon">info</span>
        <span>此功能仅在首次登录后有效，长期未登录可能导致查询失败。若无法加载，请尝试退出后重新登录。</span>
      </div>

      <!-- Transaction List -->
      <section class="list-section">
        <h2 class="section-title">账单明细</h2>

        <TEmptyState v-if="loading" type="loading" message="正在同步近一年数据..." />

        <div v-else-if="currentMonthTransactions.length > 0" class="glass-list-card">
          <template v-for="(group, gIdx) in groupedTransactions" :key="gIdx">
            <div class="date-group-label">{{ group.dateLabel }}</div>
            <div
              v-for="(item, index) in group.items"
              :key="`${gIdx}-${index}`"
              class="trans-item"
            >
              <div class="trans-icon-circle" :class="getIconClass(item)">
                <span class="material-symbols-outlined fill">{{ getIconName(item) }}</span>
              </div>
              <div class="trans-info">
                <span class="trans-name">{{ item.merchantName || item.summary || '未知交易' }}</span>
                <span class="trans-meta">{{ formatTime(item.date) }} · 校园卡消费</span>
              </div>
              <div class="trans-amount" :class="{ 'is-expense': item.amt.startsWith('-'), 'is-income': !item.amt.startsWith('-') }">
                {{ item.amt.startsWith('-') ? item.amt : `+${item.amt}` }}
              </div>
            </div>
          </template>
        </div>

        <TEmptyState v-else-if="errorMsg" type="error" :message="errorMsg">
          <button @click="initLoad" class="retry-btn">重试</button>
        </TEmptyState>

        <TEmptyState v-else message="该月份暂无交易记录">
          <button @click="initLoad" class="retry-btn">刷新数据</button>
        </TEmptyState>

        <div v-if="!loading && currentMonthTransactions.length > 0" class="list-end-hint">
          没有更多记录了
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.trans-view {
  min-height: 100vh;
  background: var(--md-sys-color-background, #f6fafe);
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  max-width: 448px;
  margin: 0 auto;
  position: relative;
  padding-bottom: 6rem;
}

/* Header */
.trans-header {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 1rem;
  height: 4rem;
  background: rgba(246, 250, 254, 0.9);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--md-sys-color-surface-variant, #dfe3e7);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.header-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: var(--md-sys-color-on-surface, #171c1f);
  cursor: pointer;
  transition: background 0.2s;
}

.header-icon-btn:hover {
  background: var(--md-sys-color-surface-container-low, #f0f4f8);
}

.header-title {
  font-size: 20px;
  line-height: 28px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface, #171c1f);
  margin: 0;
}

/* Offline Banner */
.offline-banner {
  background: #fff3cd;
  color: #856404;
  padding: 10px 16px;
  text-align: center;
  font-size: 14px;
}

/* Content */
.trans-content {
  padding: 1.25rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Bento Section */
.bento-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Month Selector Card */
.month-selector-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--md-sys-color-surface-container-lowest, #ffffff);
  padding: 1rem;
  border-radius: 1rem;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
  border: 1px solid var(--md-sys-color-surface-variant, #dfe3e7);
}

.month-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: var(--md-sys-color-on-surface-variant, #424754);
  cursor: pointer;
  transition: background 0.2s;
}

.month-nav-btn:hover {
  background: var(--md-sys-color-surface-container, #eaeef2);
}

.month-center {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.month-title {
  font-size: 18px;
  line-height: 24px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface, #171c1f);
}

.month-subtitle {
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface-variant, #424754);
  margin-top: 0.25rem;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.stat-card {
  background: linear-gradient(135deg, var(--md-sys-color-surface-container-lowest, #ffffff) 0%, var(--md-sys-color-surface, #f6fafe) 100%);
  padding: 1rem;
  border-radius: 1rem;
  border: 1px solid var(--md-sys-color-surface-variant, #dfe3e7);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 7rem;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
}

.stat-bg-icon {
  position: absolute;
  top: 0;
  right: 0;
  padding: 0.75rem;
  opacity: 0.1;
}

.stat-bg-icon .material-symbols-outlined {
  font-size: 3.5rem;
}

.expense-card .stat-bg-icon {
  color: #ef4444;
}

.income-card .stat-bg-icon {
  color: #14b8a6;
}

.stat-label {
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface-variant, #424754);
  position: relative;
  z-index: 1;
}

.stat-value-row {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  position: relative;
  z-index: 1;
}

.stat-currency {
  font-size: 18px;
  line-height: 24px;
  font-weight: 700;
}

.stat-amount {
  font-size: 30px;
  line-height: 36px;
  letter-spacing: -0.02em;
  font-weight: 700;
}

.stat-currency.expense,
.stat-amount.expense {
  color: #ef4444;
}

.stat-currency.income,
.stat-amount.income {
  color: #14b8a6;
}

/* Disclaimer */
.disclaimer-card {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: rgba(255, 247, 237, 0.95);
  border: 1px solid rgba(251, 211, 141, 0.4);
  border-radius: 1rem;
  font-size: 13px;
  line-height: 1.6;
  color: #c05621;
}

.disclaimer-icon {
  color: #f97316;
  font-size: 18px;
  flex-shrink: 0;
  margin-top: 2px;
}

/* List Section */
.list-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-title {
  font-size: 18px;
  line-height: 24px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface, #171c1f);
  padding: 0 0.5rem;
  margin: 0;
}

/* Glass List Card */
.glass-list-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 1.5rem;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border: 1px solid var(--md-sys-color-surface-variant, #dfe3e7);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
}

.date-group-label {
  padding: 0.5rem 0.75rem 0.25rem;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface-variant, #424754);
}

.date-group-label:not(:first-child) {
  padding-top: 1rem;
}

/* Transaction Item */
.trans-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  background: var(--md-sys-color-surface, #f6fafe);
  border-radius: 1rem;
  transition: background 0.2s;
  cursor: pointer;
}

.trans-item:hover {
  background: var(--md-sys-color-surface-container-low, #f0f4f8);
}

.trans-icon-circle {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.trans-icon-circle .material-symbols-outlined {
  font-size: 20px;
}

.icon-orange {
  background: rgba(249, 115, 22, 0.1);
  color: #f97316;
}

.icon-sky {
  background: rgba(56, 189, 248, 0.1);
  color: #38bdf8;
}

.icon-teal {
  background: rgba(20, 184, 166, 0.1);
  color: #14b8a6;
}

.icon-primary {
  background: rgba(0, 88, 190, 0.1);
  color: #0058be;
}

.icon-secondary {
  background: rgba(88, 95, 108, 0.1);
  color: #585f6c;
}

.trans-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-left: 0.75rem;
  overflow: hidden;
}

.trans-name {
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface, #171c1f);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.trans-meta {
  font-size: 10px;
  line-height: 14px;
  letter-spacing: 0.02em;
  font-weight: 600;
  color: var(--md-sys-color-on-surface-variant, #424754);
  margin-top: 2px;
}

.trans-amount {
  font-size: 18px;
  line-height: 24px;
  font-weight: 700;
  flex-shrink: 0;
  margin-left: 0.5rem;
}

.trans-amount.is-expense {
  color: #ef4444;
}

.trans-amount.is-income {
  color: #14b8a6;
}

/* List End Hint */
.list-end-hint {
  text-align: center;
  padding: 1rem 0;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--md-sys-color-outline, #727785);
}

/* Retry Button */
.retry-btn {
  margin-top: 10px;
  padding: 8px 20px;
  border-radius: 9999px;
  border: none;
  background: var(--md-sys-color-primary, #0058be);
  color: #ffffff;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.retry-btn:hover {
  background: #004395;
}

/* Material Symbols */
.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

.material-symbols-outlined.fill {
  font-variation-settings: 'FILL' 1;
}
</style>
