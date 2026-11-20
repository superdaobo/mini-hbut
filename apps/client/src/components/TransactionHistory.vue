<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { formatRelativeTime } from '../utils/time.js'
import { invokeNative as invoke } from '../platform/native'
import { useI18n, tf } from '../utils/app_i18n'
import { TPageHeader, TEmptyState } from './templates'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back'])

// i18n（#794 批次 I）
const { t } = useI18n()

// State
const loading = ref(false)
const rawTransactions = ref([])
const errorMsg = ref('')
const selectedMonth = ref('') // Format: YYYY-MM
const monthStats = ref({ income: 0, expense: 0 })
const offline = ref(false)
const syncTime = ref('')

// ── P4-A（#1342）：余额明细 Tab ─────────────────────────────────────────────
// 与「消费流水」是**两套接口**：`balanceTradeList` 的 tradeType 是余额域编码 11/12/13，
// 传消费流水的 1/2/3 会拿到空列表（goal-17 实测）。因此两边各自维护一份数据与筛选状态。
/** 当前 Tab：consume（消费流水）/ balance（余额明细） */
const activeTab = ref('consume')
const balanceLoaded = ref(false)
const balanceLoading = ref(false)
const balanceError = ref('')
const balanceOffline = ref(false)
const balanceSyncTime = ref('')
const balanceRaw = ref([])
const balanceMonth = ref('')
/** 类型筛选：'' = 全部；否则为 tradeType 编码字符串 */
const balanceType = ref('')
/** 类型字典（来自 tradeListConfig{balance:true}；取不到时只有「全部」） */
const balanceTypes = ref([])

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

/**
 * 余额明细记录归一化。
 *
 * 上游 `balanceTradeList` 的响应结构未在实测笔记里留样，字段名按消费流水同一套
 * 多别名策略兜底；`tradeType` 保留原始编码，供类型筛选使用。
 */
const normalizeBalanceRecords = (list) => {
  if (!Array.isArray(list)) return []
  return list
    .map((item) => {
      const date = parseDateString(
        item.date || item.txDate || item.tradeTime || item.time || item.createTime || item.tradeDate
      )
      const rawAmt = normalizeAmount(
        item.amt || item.amount || item.money || item.fee || item.tradeAmount || item.transAmount,
        item
      )
      // 实测（2026-11-20）：`balanceTradeList` 的 amt 恒为正数，方向在 `in` 字段
      // （`0` = 支出、`1` = 收入）。这里统一补成带符号的字符串，模板与统计都按符号走。
      const isIncome =
        String(item.in ?? item.direction ?? '') === '1' ||
        String(item.in ?? '').toLowerCase() === 'true'
      const absAmt = String(rawAmt).replace(/^[+-]/, '')
      const amt = rawAmt === '' ? '' : isIncome ? absAmt : `-${absAmt}`
      const merchantName = item.merchantName || item.merchant || item.merchant_name || ''
      const summary =
        item.summary || item.tradeName || item.remark || item.title || item.description || ''
      const balance =
        item.balance ?? item.afterBalance ?? item.leftBalance ?? item.cardBalance ?? item.surplus ?? ''
      const tradeType =
        item.tradeType ?? item.tradeTypeCode ?? item.type ?? item.typeCode ?? ''
      return {
        ...item,
        date,
        amt,
        merchantName,
        summary,
        balance,
        tradeType: tradeType === '' || tradeType == null ? '' : String(tradeType)
      }
    })
    .filter((item) => item.date || item.amt || item.merchantName || item.summary)
}

/** 类型字典归一化：兼容 resultData / data / rows / list 与多套字段名。 */
const normalizeTradeTypes = (res) => {
  // 实测结构：`{resultData: {accTypes: [...], tradeTypes: [{name:'全部', type:'11,12,13'}, ...]}}`
  const nested = [res?.resultData, res?.data]
    .map((box) => (box && typeof box === 'object' ? box.tradeTypes : null))
    .find((item) => Array.isArray(item))
  const candidates = [nested, res?.resultData, res?.data, res?.rows, res?.list, res?.result]
  const raw = candidates.find((item) => Array.isArray(item))
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  return raw
    .map((item) => {
      const value = item?.tradeType ?? item?.type ?? item?.code ?? item?.value ?? item?.key
      const label =
        item?.tradeTypeName ??
        item?.typeName ??
        item?.name ??
        item?.label ??
        item?.desc ??
        item?.title ??
        ''
      if (value == null || value === '') return null
      const key = String(value)
      // 上游把「全部」也当成一个类型（`11,12,13`）；本页已有「全部」chip，跳过它
      if (key.includes(',')) return null
      if (seen.has(key)) return null
      seen.add(key)
      return { value: key, label: String(label || key) }
    })
    .filter(Boolean)
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
      errorMsg.value = res.message || res.msg || t('tx.error.fetchFailed')
      
      // If valid cache exists (from backend logic), rawTransactions might still be empty if error occurred on refresh?
      // Our backend implementation tailored cached returns on failure, so if we are here with success=false, 
      // it means both network and cache failed (or cache empty).
    }
  } catch (e) {
    console.error('Failed to fetch transactions:', e)
    errorMsg.value = tf('tx.error.network', { msg: e.toString() })
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
  if (!selectedMonth.value) return t('tx.noData')
  const [year, month] = selectedMonth.value.split('-')
  return tf('tx.monthLabel', { year, month: parseInt(month) })
})

// 按日期分组交易
const groupedTransactions = computed(() => {
  const groups = []
  const dateMap = new Map()
  
  currentMonthTransactions.value.forEach(item => {
    const dateKey = item.date ? item.date.substring(0, 10) : t('tx.unknownDate')
    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, [])
    }
    dateMap.get(dateKey).push(item)
  })
  
  for (const [dateKey, items] of dateMap) {
    const d = new Date(dateKey)
    const weekdays = [t('tx.weekday.0'), t('tx.weekday.1'), t('tx.weekday.2'), t('tx.weekday.3'), t('tx.weekday.4'), t('tx.weekday.5'), t('tx.weekday.6')]
    const dateLabel = !isNaN(d.getTime())
      ? tf('tx.dateLabel', { m: d.getMonth() + 1, d: d.getDate(), weekday: weekdays[d.getDay()] })
      : dateKey
    groups.push({ dateLabel, items })
  }
  
  return groups
})

// 获取交易图标
const getIconName = (item) => {
  const name = (item.merchantName || item.summary || '').toLowerCase()
  if (name.includes('\u98df\u5802') || name.includes('\u9910')) return 'restaurant'
  if (name.includes('\u8d85\u5e02') || name.includes('\u5546\u5e97')) return 'local_convenience_store'
  if (name.includes('\u5145\u503c') || name.includes('\u8f6c\u5165')) return 'account_balance_wallet'
  if (name.includes('\u56fe\u4e66') || name.includes('\u6253\u5370')) return 'menu_book'
  if (name.includes('\u8f66') || name.includes('\u4ea4\u901a')) return 'directions_bus'
  if (!item.amt.startsWith('-')) return 'account_balance_wallet'
  return 'payments'
}

// 获取图标颜色类
const getIconClass = (item) => {
  const name = (item.merchantName || item.summary || '').toLowerCase()
  if (name.includes('\u98df\u5802') || name.includes('\u9910')) return 'icon-orange'
  if (name.includes('\u8d85\u5e02') || name.includes('\u5546\u5e97')) return 'icon-sky'
  if (name.includes('\u5145\u503c') || name.includes('\u8f6c\u5165') || !item.amt.startsWith('-')) return 'icon-teal'
  if (name.includes('\u56fe\u4e66') || name.includes('\u6253\u5370')) return 'icon-primary'
  if (name.includes('\u8f66') || name.includes('\u4ea4\u901a')) return 'icon-secondary'
  return 'icon-primary'
}

// 格式化时间
const formatTime = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 余额展示：能转数字就固定两位小数，否则原样输出（上游可能是字符串或空） */
const formatBalance = (value) => {
  if (value == null || value === '') return ''
  const num = Number(value)
  if (isNaN(num)) return String(value)
  return num.toFixed(2)
}

// ── 余额明细：派生数据 ────────────────────────────────────────────────────
const balanceMonths = computed(() => {
  const months = new Set()
  balanceRaw.value.forEach((item) => {
    if (item.date) {
      const m = item.date.substring(0, 7)
      if (m) months.add(m)
    }
  })
  return Array.from(months).sort((a, b) => b.localeCompare(a))
})

const balanceMonthRecords = computed(() => {
  if (!balanceMonth.value) return []
  return balanceRaw.value.filter((item) => item.date && item.date.startsWith(balanceMonth.value))
})

/**
 * 列表与统计使用的记录。
 *
 * 实测：余额明细的记录里**没有** `tradeType` 字段（类型编码只在请求侧生效），
 * 所以「类型」筛选走**服务端**（`tradeType` 请求参数），这里不再做本地过滤。
 */
const balanceFilteredRecords = computed(() => balanceMonthRecords.value)

/** 切换类型：服务端重新取一次（类型编码来自 tradeListConfig{balance:true}） */
const selectBalanceType = (type) => {
  if (balanceType.value === type) return
  balanceType.value = type
  void loadBalance()
}

const balanceMonthLabel = computed(() => {
  if (!balanceMonth.value) return t('tx.noData')
  const [year, month] = balanceMonth.value.split('-')
  return tf('tx.monthLabel', { year, month: parseInt(month) })
})

/** 余额变动统计：负数为支出（消费），正数为充值/退款 */
const balanceStats = computed(() => {
  let inc = 0
  let exp = 0
  balanceFilteredRecords.value.forEach((item) => {
    const val = parseFloat(item.amt)
    if (isNaN(val)) return
    if (val < 0) exp += Math.abs(val)
    else inc += val
  })
  return { income: inc.toFixed(2), expense: exp.toFixed(2) }
})

const navigateBalanceMonth = (direction) => {
  const idx = balanceMonths.value.indexOf(balanceMonth.value)
  if (idx < 0) return
  const nextIdx = idx - direction
  if (nextIdx >= 0 && nextIdx < balanceMonths.value.length) {
    balanceMonth.value = balanceMonths.value[nextIdx]
  }
}

const loadBalanceTypes = async () => {
  if (balanceTypes.value.length > 0) return
  try {
    const res = await invoke('fetch_trade_list_config', { balance: true })
    balanceTypes.value = normalizeTradeTypes(res)
  } catch (e) {
    // 只影响「类型」下拉的文案，不阻断明细列表
    console.warn('Failed to fetch trade list config:', e)
  }
}

const loadBalance = async () => {
  balanceLoading.value = true
  balanceError.value = ''
  try {
    const end = new Date()
    const start = new Date()
    start.setMonth(start.getMonth() - 12)
    const res = await invoke('fetch_balance_trade_list', {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      pageNo: 1,
      pageSize: 1000,
      // 类型编码（11 消费 / 12 充值 / 13 补助）；空 = 后端默认 11,12,13
      tradeType: balanceType.value || ''
    })

    const isSuccess =
      res?.success === true ||
      res?.code === '' ||
      Array.isArray(res?.resultData) ||
      Array.isArray(res?.resultData?.list) ||
      Array.isArray(res?.data)
    if (isSuccess) {
      balanceOffline.value = !!res.offline
      balanceSyncTime.value = res.sync_time || ''
      // 实测：余额明细返回 `resultData: {count, list}`，消费流水才是纯数组
      const rawList =
        res.resultData?.list ||
        res.resultData ||
        res.data?.list ||
        res.data ||
        res.rows ||
        res.result ||
        res.list ||
        []
      balanceRaw.value = normalizeBalanceRecords(rawList)
      if (balanceMonths.value.length > 0) {
        balanceMonth.value = balanceMonths.value[0]
      }
    } else {
      balanceError.value = res.message || res.msg || t('tx.error.fetchFailed')
    }
  } catch (e) {
    console.error('Failed to fetch balance trade list:', e)
    balanceError.value = tf('tx.error.network', { msg: e.toString() })
  } finally {
    balanceLoading.value = false
  }
}

const retryBalance = () => {
  loadBalance()
  loadBalanceTypes()
}

/** 切换 Tab：余额明细首次进入才请求（懒加载） */
const selectTab = (tab) => {
  if (tab === activeTab.value) return
  activeTab.value = tab
  if (tab === 'balance' && !balanceLoaded.value) {
    balanceLoaded.value = true
    loadBalance()
    loadBalanceTypes()
  }
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
        <h1 class="header-title">{{ t('tx.title') }}</h1>
      </div>
    </header>

    <!-- Tab：消费流水 / 余额明细（P4-A #1342） -->
    <nav class="trans-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        class="trans-tab"
        :class="{ 'is-active': activeTab === 'consume' }"
        :aria-selected="activeTab === 'consume'"
        @click="selectTab('consume')"
      >
        {{ t('tx.tab.consume') }}
      </button>
      <button
        type="button"
        role="tab"
        class="trans-tab"
        :class="{ 'is-active': activeTab === 'balance' }"
        :aria-selected="activeTab === 'balance'"
        @click="selectTab('balance')"
      >
        {{ t('tx.tab.balance') }}
      </button>
    </nav>

    <!-- Offline Banner -->
    <div v-if="activeTab === 'consume' && offline" class="offline-banner">
      {{ tf('tx.offlineBanner', { time: formatRelativeTime(syncTime) }) }}
    </div>
    <div v-else-if="activeTab === 'balance' && balanceOffline" class="offline-banner">
      {{ tf('tx.offlineBanner', { time: formatRelativeTime(balanceSyncTime) }) }}
    </div>

    <main v-show="activeTab === 'consume'" class="trans-content">
      <!-- Month Selector & Stats Bento -->
      <section class="bento-section">
        <!-- Month Selector -->
        <div class="month-selector-card">
          <button class="month-nav-btn" @click="navigateMonth(-1)">
            <span class="material-symbols-outlined">chevron_left</span>
          </button>
          <div class="month-center">
            <span class="month-title">{{ selectedMonthLabel }}</span>
            <span class="month-subtitle">{{ tf('tx.monthCount', { n: currentMonthTransactions.length }) }}</span>
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
            <span class="stat-label">{{ t('tx.expense') }}</span>
            <div class="stat-value-row">
              <span class="stat-currency expense">¥</span>
              <span class="stat-amount expense">{{ monthStats.expense }}</span>
            </div>
          </div>
          <div class="stat-card income-card">
            <div class="stat-bg-icon">
              <span class="material-symbols-outlined fill">move_to_inbox</span>
            </div>
            <span class="stat-label">{{ t('tx.income') }}</span>
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
        <span>{{ t('tx.disclaimer') }}</span>
      </div>

      <!-- Transaction List -->
      <section class="list-section">
        <h2 class="section-title">{{ t('tx.detail') }}</h2>

        <TEmptyState v-if="loading" type="loading" :message="t('tx.syncingYear')" />

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
                <span class="trans-name">{{ item.merchantName || item.summary || t('tx.unknownMerchant') }}</span>
                <span class="trans-meta">{{ formatTime(item.date) }} · {{ t('tx.campusCardMeta') }}</span>
              </div>
              <div class="trans-amount" :class="{ 'is-expense': item.amt.startsWith('-'), 'is-income': !item.amt.startsWith('-') }">
                {{ item.amt.startsWith('-') ? item.amt : `+${item.amt}` }}
              </div>
            </div>
          </template>
        </div>

        <TEmptyState v-else-if="errorMsg" type="error" :message="errorMsg">
          <button @click="initLoad" class="retry-btn">{{ t('common.retry') }}</button>
        </TEmptyState>

        <TEmptyState v-else :message="t('tx.empty')">
          <button @click="initLoad" class="retry-btn">{{ t('tx.refreshData') }}</button>
        </TEmptyState>

        <div v-if="!loading && currentMonthTransactions.length > 0" class="list-end-hint">
          {{ t('tx.listEnd') }}
        </div>
      </section>
    </main>

    <!-- ── 余额明细（P4-A #1342）────────────────────────────────────────── -->
    <main v-show="activeTab === 'balance'" class="trans-content">
      <section class="bento-section">
        <div class="month-selector-card">
          <button class="month-nav-btn" @click="navigateBalanceMonth(-1)">
            <span class="material-symbols-outlined">chevron_left</span>
          </button>
          <div class="month-center">
            <span class="month-title">{{ balanceMonthLabel }}</span>
            <span class="month-subtitle">
              {{ tf('tx.monthCount', { n: balanceFilteredRecords.length }) }}
            </span>
          </div>
          <button class="month-nav-btn" @click="navigateBalanceMonth(1)">
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>

        <div class="stats-grid">
          <div class="stat-card expense-card">
            <div class="stat-bg-icon">
              <span class="material-symbols-outlined fill">outbox</span>
            </div>
            <span class="stat-label">{{ t('tx.expense') }}</span>
            <div class="stat-value-row">
              <span class="stat-currency expense">¥</span>
              <span class="stat-amount expense">{{ balanceStats.expense }}</span>
            </div>
          </div>
          <div class="stat-card income-card">
            <div class="stat-bg-icon">
              <span class="material-symbols-outlined fill">move_to_inbox</span>
            </div>
            <span class="stat-label">{{ t('tx.income') }}</span>
            <div class="stat-value-row">
              <span class="stat-currency income">¥</span>
              <span class="stat-amount income">{{ balanceStats.income }}</span>
            </div>
          </div>
        </div>

        <!-- 类型筛选：字典来自 tradeListConfig{balance:true}（11/12/13） -->
        <div v-if="balanceTypes.length > 0" class="type-filter">
          <button
            type="button"
            class="type-chip"
            :class="{ 'is-active': balanceType === '' }"
            @click="selectBalanceType('')"
          >
            {{ t('tx.balance.typeAll') }}
          </button>
          <button
            v-for="item in balanceTypes"
            :key="item.value"
            type="button"
            class="type-chip"
            :class="{ 'is-active': balanceType === item.value }"
            @click="selectBalanceType(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </section>

      <section class="list-section">
        <h2 class="section-title">{{ t('tx.balance.detail') }}</h2>

        <TEmptyState v-if="balanceLoading" type="loading" :message="t('tx.syncingYear')" />

        <div v-else-if="balanceFilteredRecords.length > 0" class="glass-list-card">
          <div
            v-for="(item, index) in balanceFilteredRecords"
            :key="`balance-${index}`"
            class="trans-item"
          >
            <div class="trans-icon-circle" :class="getIconClass(item)">
              <span class="material-symbols-outlined fill">{{ getIconName(item) }}</span>
            </div>
            <div class="trans-info">
              <span class="trans-name">
                {{ item.merchantName || item.summary || t('tx.unknownMerchant') }}
              </span>
              <span class="trans-meta">
                {{ item.date ? item.date.slice(5, 16) : t('tx.unknownDate') }}
                <template v-if="item.balance !== '' && item.balance != null">
                  · {{ t('tx.balance.remain') }} {{ formatBalance(item.balance) }}
                </template>
              </span>
            </div>
            <div
              class="trans-amount"
              :class="{
                'is-expense': String(item.amt).startsWith('-'),
                'is-income': !String(item.amt).startsWith('-')
              }"
            >
              {{ String(item.amt).startsWith('-') ? item.amt : `+${item.amt}` }}
            </div>
          </div>
        </div>

        <TEmptyState v-else-if="balanceError" type="error" :message="balanceError">
          <button @click="retryBalance" class="retry-btn">{{ t('common.retry') }}</button>
        </TEmptyState>

        <TEmptyState v-else :message="t('tx.balance.empty')">
          <button @click="retryBalance" class="retry-btn">{{ t('tx.refreshData') }}</button>
        </TEmptyState>

        <div v-if="!balanceLoading && balanceFilteredRecords.length > 0" class="list-end-hint">
          {{ t('tx.listEnd') }}
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

/* Tab：消费流水 / 余额明细 */
.trans-tabs {
  position: sticky;
  top: 4rem;
  z-index: 40;
  display: flex;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background: rgba(246, 250, 254, 0.9);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--md-sys-color-surface-variant, #dfe3e7);
}

.trans-tab {
  flex: 1;
  height: 2.25rem;
  border: 1px solid var(--md-sys-color-surface-variant, #dfe3e7);
  border-radius: 9999px;
  background: var(--md-sys-color-surface-container-lowest, #ffffff);
  color: var(--md-sys-color-on-surface-variant, #424754);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.trans-tab.is-active {
  background: var(--md-sys-color-primary, #0058be);
  border-color: var(--md-sys-color-primary, #0058be);
  color: #ffffff;
}

/* 余额明细：类型筛选 */
.type-filter {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding: 0.125rem 0.125rem 0.25rem;
  scrollbar-width: none;
}

.type-filter::-webkit-scrollbar {
  display: none;
}

.type-chip {
  flex: 0 0 auto;
  padding: 0.375rem 0.875rem;
  border-radius: 9999px;
  border: 1px solid var(--md-sys-color-surface-variant, #dfe3e7);
  background: var(--md-sys-color-surface-container-lowest, #ffffff);
  color: var(--md-sys-color-on-surface-variant, #424754);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.type-chip.is-active {
  background: rgba(0, 88, 190, 0.1);
  border-color: rgba(0, 88, 190, 0.35);
  color: #0058be;
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
