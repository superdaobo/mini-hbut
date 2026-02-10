<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'logout'])

const loading = ref(false)
const detailLoading = ref(false)
const error = ref('')
const detailError = ref('')
const hasSearched = ref(false)

const keyword = ref('')
const searchField = ref('keyWord')
const matchMode = ref('2')
const sortField = ref('issued_sort')
const sortClause = ref('desc')
const onlyOnShelf = ref(false)
const page = ref(1)
const rows = ref(10)
const total = ref(0)
const results = ref([])
const facetResult = ref({})
const dictData = ref({})

const isMobile = ref(false)
const filterPanelOpen = ref(false)
const brokenCovers = ref(new Set())

const selectedFilters = ref({
  resourceType: [],
  publisher: [],
  author: [],
  discode1: [],
  langCode: [],
  countryCode: [],
  locationId: []
})

const selectedBook = ref(null)
const selectedBookDetail = ref(null)

const filterMeta = [
  { key: 'resourceType', title: '资源类型' },
  { key: 'publisher', title: '出版社' },
  { key: 'author', title: '作者' },
  { key: 'discode1', title: '学科分类' },
  { key: 'langCode', title: '语种' },
  { key: 'countryCode', title: '出版地区' },
  { key: 'locationId', title: '馆藏位置' }
]

const totalPages = computed(() => {
  if (rows.value <= 0) return 0
  return Math.ceil(total.value / rows.value)
})

const searchSummary = computed(() => {
  if (!keyword.value.trim()) return '请输入关键词搜索图书'
  return `“${keyword.value.trim()}” 共检索到 ${total.value} 条记录`
})

const canShowFilters = computed(() => hasSearched.value)
const showFilterPanel = computed(() => canShowFilters.value && (!isMobile.value || filterPanelOpen.value))

const hasActiveFilters = computed(() =>
  Object.values(selectedFilters.value).some((arr) => Array.isArray(arr) && arr.length > 0)
)

const holdingData = computed(() => selectedBookDetail.value?.holding || {})

const detailBook = computed(() => {
  const detail = selectedBookDetail.value?.detail || {}
  const base = selectedBook.value || {}
  return {
    title: detail.title || base.title || '-',
    author: detail.author || base.author || '-',
    publisher: detail.publisher || base.publisher || '-',
    publishYear: detail.publishYear || base.publishYear || '-',
    isbn: detail.isbn || base.isbn || '-',
    callNo:
      (Array.isArray(detail.callNo) ? detail.callNo[0] : detail.callNo) ||
      (Array.isArray(base.callNo) ? base.callNo[0] : base.callNo) ||
      base.callNoOne ||
      '-',
    location:
      detail.locationName ||
      detail.location ||
      base.locationName ||
      base.locationIdName ||
      base.location ||
      '-',
    abstract:
      detail.adstract ||
      detail.ddAbstract ||
      base.adstract ||
      base.ddAbstract ||
      '暂无简介'
  }
})

const detailBorrowStatus = computed(() => {
  const detail = selectedBookDetail.value?.detail || {}
  const base = selectedBook.value || {}
  const status = detail.processTypeName || detail.statusName || base.processTypeName || base.statusName
  if (status) return status
  const orderFlag = String(holdingData.value?.orderFlag || '')
  if (orderFlag === '0') return '可借'
  if (orderFlag === '1') return '可预约'
  if (orderFlag === '2') return '不可预约'
  return '-'
})

const normalizeCoverUrl = (raw) => {
  if (!raw || typeof raw !== 'string') return ''
  const url = raw.trim()
  if (!url) return ''
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('/')) return `https://opac.hbut.edu.cn:8013${url}`
  return url
}

const getBookCover = (book = {}) => {
  const candidates = [
    book.duxiuImageUrl,
    book.cover,
    book.coverUrl,
    book.imgUrl,
    book.imageUrl,
    book.image,
    book.picUrl
  ]
  for (const candidate of candidates) {
    const normalized = normalizeCoverUrl(candidate)
    if (normalized) return normalized
  }
  return ''
}

const getDetailCover = () => {
  const detail = selectedBookDetail.value?.detail || {}
  const holding = selectedBookDetail.value?.holding || {}
  const fromDetail = getBookCover(detail)
  if (fromDetail) return fromDetail
  const fromHolding = getBookCover(holding)
  if (fromHolding) return fromHolding
  return getBookCover(selectedBook.value || {})
}

const normalizeFacetEntries = (raw) => {
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw)
    .map(([value, count]) => ({
      value: String(value),
      count: Number(count) || 0
    }))
    .filter((item) => item.value && item.value !== 'null')
    .sort((a, b) => b.count - a.count)
}

const getDictLabelMap = (key) => {
  const source = dictData.value?.[key]
  if (!Array.isArray(source)) return new Map()
  const labelMap = new Map()
  source.forEach((item) => {
    const code = item?.code ?? item?.value ?? item?.id
    const name = item?.name ?? item?.label ?? item?.text
    if (code != null && name != null) labelMap.set(String(code), String(name))
  })
  return labelMap
}

const facetOptions = computed(() => {
  const output = {}
  for (const meta of filterMeta) {
    const entries = normalizeFacetEntries(facetResult.value?.[meta.key])
    const labelMap = getDictLabelMap(meta.key)
    output[meta.key] = entries.map((entry) => ({
      value: entry.value,
      count: entry.count,
      label: labelMap.get(entry.value) || entry.value
    }))
  }
  return output
})

const coverKeyOf = (book) => `${book?.recordId || ''}|${book?.isbn || ''}|${book?.title || ''}`

const isCoverAvailable = (book) => {
  const url = getBookCover(book)
  if (!url) return false
  return !brokenCovers.value.has(coverKeyOf(book))
}

const handleCoverError = (book) => {
  const next = new Set(brokenCovers.value)
  next.add(coverKeyOf(book))
  brokenCovers.value = next
}

const updateMobileState = () => {
  const mobile = window.innerWidth <= 900
  isMobile.value = mobile
  if (!mobile) {
    filterPanelOpen.value = hasSearched.value
  } else if (!hasSearched.value) {
    filterPanelOpen.value = false
  }
}

const buildSearchPayload = (nextPage = 1) => ({
  searchFieldContent: keyword.value.trim(),
  searchField: searchField.value,
  matchMode: matchMode.value,
  sortField: sortField.value,
  sortClause: sortClause.value,
  page: nextPage,
  rows: rows.value,
  onlyOnShelf: onlyOnShelf.value ? true : null,
  resourceType: [...selectedFilters.value.resourceType],
  publisher: [...selectedFilters.value.publisher],
  author: [...selectedFilters.value.author],
  discode1: [...selectedFilters.value.discode1],
  langCode: [...selectedFilters.value.langCode],
  countryCode: [...selectedFilters.value.countryCode],
  locationId: [...selectedFilters.value.locationId]
})

const loadDict = async () => {
  try {
    const res = await axios.post(`${API_BASE}/v2/library/dict`, {})
    if (res.data?.success) {
      const root = res.data?.data || {}
      dictData.value = root.data || {}
    }
  } catch {
    // 字典加载失败不影响主流程
  }
}

const executeSearch = async (nextPage = 1, skipEmptyValidation = false) => {
  error.value = ''
  const query = keyword.value.trim()
  if (!skipEmptyValidation && !query) {
    error.value = '请输入图书关键词'
    return
  }

  loading.value = true
  try {
    const payload = buildSearchPayload(nextPage)
    const res = await axios.post(`${API_BASE}/v2/library/search`, payload)
    const data = res.data
    if (!data?.success) {
      error.value = data?.error || '图书检索失败'
      return
    }

    const root = data?.data || {}
    const dataNode = root.data || {}
    results.value = Array.isArray(dataNode.searchResult) ? dataNode.searchResult : []
    facetResult.value = dataNode.facetResult || {}
    total.value = Number(dataNode.numFound || 0)
    page.value = nextPage
    hasSearched.value = true
    filterPanelOpen.value = !isMobile.value
  } catch (e) {
    error.value = e?.response?.data?.error || e?.message || '图书检索失败'
  } finally {
    loading.value = false
  }
}

const applyFilters = async () => {
  if (!hasSearched.value || !keyword.value.trim()) return
  await executeSearch(1, true)
}

const toggleFilter = async (key, value) => {
  const list = selectedFilters.value[key] || []
  if (list.includes(value)) {
    selectedFilters.value[key] = list.filter((item) => item !== value)
  } else {
    selectedFilters.value[key] = [...list, value]
  }
  await applyFilters()
}

const clearFilters = async () => {
  for (const key of Object.keys(selectedFilters.value)) {
    selectedFilters.value[key] = []
  }
  await applyFilters()
}

const changePage = async (target) => {
  if (target < 1 || target > totalPages.value || target === page.value) return
  await executeSearch(target, true)
}

const openDetail = async (book) => {
  selectedBook.value = book
  selectedBookDetail.value = null
  detailError.value = ''
  detailLoading.value = true

  try {
    const res = await axios.post(`${API_BASE}/v2/library/detail`, {
      title: book?.title || '',
      isbn: book?.isbn || '',
      record_id: book?.recordId ?? null
    })
    const payload = res.data
    if (!payload?.success) {
      detailError.value = payload?.error || '加载图书详情失败'
      return
    }
    selectedBookDetail.value = payload?.data || {}
  } catch (e) {
    detailError.value = e?.response?.data?.error || e?.message || '加载图书详情失败'
  } finally {
    detailLoading.value = false
  }
}

const closeDetail = () => {
  selectedBook.value = null
  selectedBookDetail.value = null
  detailError.value = ''
}

const submitSearch = async () => {
  await executeSearch(1, false)
}

watch(onlyOnShelf, async () => {
  await applyFilters()
})

onMounted(async () => {
  updateMobileState()
  window.addEventListener('resize', updateMobileState)
  await loadDict()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateMobileState)
})
</script>

<template>
  <div class="library-view">
    <header class="view-header">
      <button class="header-btn" @click="emit('back')">返回</button>
      <h1>图书查询</h1>
      <button class="header-btn danger" @click="emit('logout')">退出</button>
    </header>

    <section class="search-panel">
      <div class="search-row">
        <input
          v-model="keyword"
          class="search-input"
          type="text"
          placeholder="请输入书名 / 作者 / 关键词"
          @keyup.enter="submitSearch"
        />
        <button class="search-btn" :disabled="loading" @click="submitSearch">
          {{ loading ? '检索中...' : '搜索图书' }}
        </button>
      </div>

      <div v-if="canShowFilters" class="search-ops">
        <label class="select-line">
          检索字段
          <select v-model="searchField">
            <option value="keyWord">综合</option>
            <option value="title">书名</option>
            <option value="author">作者</option>
            <option value="isbn">ISBN</option>
          </select>
        </label>
        <label class="checkbox-line">
          <input v-model="onlyOnShelf" type="checkbox" />
          仅显示在架馆藏
        </label>
        <button class="ghost-btn" :disabled="!hasActiveFilters" @click="clearFilters">清空筛选</button>
        <button
          v-if="isMobile"
          class="filter-toggle"
          @click="filterPanelOpen = !filterPanelOpen"
        >
          {{ filterPanelOpen ? '收起筛选' : '展开筛选' }}
        </button>
      </div>

      <p class="summary">{{ searchSummary }}</p>
      <p v-if="error" class="error">{{ error }}</p>
    </section>

    <section class="content-layout" :class="{ 'with-filter': showFilterPanel }">
      <aside v-if="showFilterPanel" class="filter-panel">
        <article v-for="group in filterMeta" :key="group.key" class="filter-group">
          <h3>{{ group.title }}</h3>
          <div class="chips">
            <button
              v-for="item in facetOptions[group.key] || []"
              :key="`${group.key}-${item.value}`"
              class="chip"
              :class="{ active: selectedFilters[group.key].includes(item.value) }"
              @click="toggleFilter(group.key, item.value)"
            >
              <span>{{ item.label }}</span>
              <small>{{ item.count }}</small>
            </button>
            <span v-if="!(facetOptions[group.key] || []).length" class="empty-chip">暂无可筛选项</span>
          </div>
        </article>
      </aside>

      <div class="result-panel">
        <div v-if="loading" class="loading-box">正在检索图书...</div>
        <div v-else-if="!results.length" class="empty-box">
          {{ hasSearched ? '暂无检索结果' : '请输入关键词后点击“搜索图书”开始查询' }}
        </div>
        <div v-else class="result-list">
          <article
            v-for="book in results"
            :key="`${book.recordId || book.title}-${book.isbn}`"
            class="book-card"
            @click="openDetail(book)"
          >
            <div class="book-cover-wrap">
              <img
                v-if="isCoverAvailable(book)"
                :src="getBookCover(book)"
                :alt="book.title || '封面'"
                class="book-cover"
                loading="lazy"
                @error="handleCoverError(book)"
              />
              <div v-else class="book-cover-empty">暂无封面</div>
            </div>
            <div class="book-info">
              <h3 class="book-title">{{ book.title || '-' }}</h3>
              <p class="book-meta">作者：{{ book.author || '-' }}</p>
              <p class="book-meta">出版社：{{ book.publisher || '-' }}</p>
              <p class="book-meta">
                索书号：{{ (book.callNo && book.callNo[0]) || book.callNoOne || '-' }}
                <span class="split">|</span>
                出版年：{{ book.publishYear || '-' }}
              </p>
              <p class="book-badge">在架 {{ book.onShelfCountI ?? 0 }} / 馆藏 {{ book.physicalCount ?? 0 }}</p>
            </div>
          </article>
        </div>

        <div class="pager" v-if="totalPages > 1">
          <button class="pager-btn" :disabled="page <= 1 || loading" @click="changePage(page - 1)">上一页</button>
          <span class="pager-info">第 {{ page }} / {{ totalPages }} 页</span>
          <button class="pager-btn" :disabled="page >= totalPages || loading" @click="changePage(page + 1)">下一页</button>
        </div>
      </div>
    </section>

    <div v-if="selectedBook" class="detail-mask" @click.self="closeDetail">
      <div class="detail-card">
        <header class="detail-head">
          <h2>{{ detailBook.title }}</h2>
          <button class="close-btn" @click="closeDetail">关闭</button>
        </header>

        <div v-if="detailLoading" class="loading-box">正在加载详情...</div>
        <div v-else>
          <p v-if="detailError" class="error">{{ detailError }}</p>

          <section class="detail-main">
            <div class="detail-cover-wrap">
              <img v-if="getDetailCover()" :src="getDetailCover()" :alt="detailBook.title" class="detail-cover" />
              <div v-else class="detail-cover-empty">暂无封面</div>
            </div>
            <div class="detail-grid">
              <article class="detail-item">
                <span class="label">ISBN</span>
                <span class="value">{{ detailBook.isbn }}</span>
              </article>
              <article class="detail-item">
                <span class="label">作者</span>
                <span class="value">{{ detailBook.author }}</span>
              </article>
              <article class="detail-item">
                <span class="label">出版社</span>
                <span class="value">{{ detailBook.publisher }}</span>
              </article>
              <article class="detail-item">
                <span class="label">出版年</span>
                <span class="value">{{ detailBook.publishYear }}</span>
              </article>
              <article class="detail-item">
                <span class="label">索书号</span>
                <span class="value">{{ detailBook.callNo }}</span>
              </article>
              <article class="detail-item">
                <span class="label">馆藏地</span>
                <span class="value">{{ detailBook.location }}</span>
              </article>
              <article class="detail-item">
                <span class="label">借阅状态</span>
                <span class="value">{{ detailBorrowStatus }}</span>
              </article>
              <article class="detail-item">
                <span class="label">馆藏记录号</span>
                <span class="value">{{ selectedBook?.recordId || '-' }}</span>
              </article>
            </div>
          </section>

          <section class="holding-panel">
            <h3>馆藏信息</h3>
            <div class="holding-grid">
              <article class="detail-item">
                <span class="label">在架数量</span>
                <span class="value">{{ holdingData.onShelfCount ?? selectedBook?.onShelfCountI ?? 0 }}</span>
              </article>
              <article class="detail-item">
                <span class="label">实体馆藏</span>
                <span class="value">{{ holdingData.pCount ?? selectedBook?.physicalCount ?? 0 }}</span>
              </article>
              <article class="detail-item">
                <span class="label">元数据数量</span>
                <span class="value">{{ holdingData.metadataCount ?? '-' }}</span>
              </article>
              <article class="detail-item">
                <span class="label">预约标记</span>
                <span class="value">{{ holdingData.orderFlag ?? '-' }}</span>
              </article>
            </div>
          </section>

          <section class="detail-desc">
            <h3>内容简介</h3>
            <p>{{ detailBook.abstract }}</p>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.library-view {
  min-height: 100%;
  padding: 14px;
  color: #10213a;
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(245, 247, 255, 0.95);
  border: 1px solid rgba(96, 114, 176, 0.2);
  backdrop-filter: blur(10px);
}

.view-header h1 {
  margin: 0;
  font-size: clamp(16px, 2.4vw, 20px);
  font-weight: 900;
}

.header-btn {
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #f8fafc, #e2e8f0);
  color: #14213d;
  font-size: 12px;
  font-weight: 800;
  padding: 6px 9px;
  cursor: pointer;
}

.header-btn.danger {
  color: #b91c1c;
}

.search-panel {
  margin-top: 10px;
  border-radius: 14px;
  padding: 10px;
  background: rgba(245, 247, 255, 0.94);
  border: 1px solid rgba(96, 114, 176, 0.2);
}

.search-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-input {
  flex: 1;
  min-width: 0;
  border: 1px solid #b8c6e5;
  border-radius: 10px;
  padding: 9px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #0f172a;
}

.search-btn,
.filter-toggle,
.ghost-btn,
.pager-btn,
.chip,
.close-btn {
  border: none;
  cursor: pointer;
}

.search-btn {
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #0ea5e9);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  padding: 9px 12px;
}

.search-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.search-ops {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-toggle {
  border-radius: 10px;
  background: #e2e8f0;
  color: #0f172a;
  font-size: 11px;
  font-weight: 700;
  padding: 8px 10px;
}

.select-line {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 700;
  color: #334155;
}

.select-line select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
}

.checkbox-line {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
}

.ghost-btn {
  background: transparent;
  color: #1d4ed8;
  border: 1px solid #93c5fd;
  border-radius: 8px;
  padding: 6px 9px;
  font-size: 11px;
  font-weight: 700;
}

.summary {
  margin: 8px 0 0;
  font-size: 11px;
  font-weight: 700;
  color: #475569;
}

.error {
  margin-top: 8px;
  color: #b91c1c;
  font-size: 11px;
  font-weight: 700;
}

.content-layout {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.content-layout.with-filter {
  grid-template-columns: minmax(210px, 260px) 1fr;
}

.filter-panel,
.result-panel {
  border-radius: 14px;
  padding: 10px;
  background: rgba(245, 247, 255, 0.94);
  border: 1px solid rgba(96, 114, 176, 0.2);
}

.filter-group + .filter-group {
  margin-top: 10px;
}

.filter-group h3 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 900;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  padding: 5px 8px;
  font-size: 10px;
  font-weight: 700;
  background: #e2e8f0;
  color: #1e293b;
}

.chip small {
  color: #475569;
}

.chip.active {
  background: linear-gradient(135deg, #2563eb, #0ea5e9);
  color: #fff;
}

.chip.active small {
  color: #e2e8f0;
}

.empty-chip {
  color: #64748b;
  font-size: 10px;
}

.result-list {
  display: grid;
  gap: 8px;
}

.book-card {
  display: grid;
  grid-template-columns: 78px 1fr;
  gap: 10px;
  border-radius: 12px;
  border: 1px solid #cbd5e1;
  background: #fff;
  padding: 9px;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.book-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.12);
}

.book-cover-wrap {
  width: 78px;
  height: 106px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
}

.book-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.book-cover-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #64748b;
  background: linear-gradient(135deg, #eef2ff, #f8fafc);
}

.book-info {
  min-width: 0;
}

.book-title {
  margin: 0;
  color: #0f172a;
  font-size: 14px;
  font-weight: 900;
  line-height: 1.35;
}

.book-meta {
  margin: 5px 0 0;
  color: #334155;
  font-size: 11px;
  line-height: 1.45;
}

.split {
  margin: 0 6px;
  color: #94a3b8;
}

.book-badge {
  margin: 7px 0 0;
  display: inline-block;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 800;
}

.loading-box,
.empty-box {
  border-radius: 12px;
  border: 1px dashed #94a3b8;
  padding: 16px;
  text-align: center;
  color: #475569;
  font-weight: 700;
  font-size: 11px;
}

.pager {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.pager-btn {
  border-radius: 8px;
  background: #e2e8f0;
  color: #0f172a;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 700;
}

.pager-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pager-info {
  font-size: 11px;
  color: #334155;
  font-weight: 700;
}

.detail-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
}

.detail-card {
  width: min(940px, 100%);
  max-height: 92vh;
  overflow: auto;
  border-radius: 16px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  padding: 12px;
}

.detail-head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  justify-content: space-between;
}

.detail-head h2 {
  margin: 0;
  color: #0f172a;
  font-size: 16px;
  font-weight: 900;
  line-height: 1.3;
}

.close-btn {
  border-radius: 8px;
  background: #e2e8f0;
  color: #0f172a;
  font-size: 11px;
  font-weight: 700;
  padding: 6px 9px;
}

.detail-main {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 10px;
}

.detail-cover-wrap {
  width: 120px;
  height: 160px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #dbe4f0;
  background: #eef2ff;
}

.detail-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-cover-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #64748b;
}

.detail-grid,
.holding-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.holding-grid {
  margin-top: 10px;
}

.detail-item {
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #fff;
  padding: 7px 9px;
}

.detail-item .label {
  display: block;
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
}

.detail-item .value {
  margin-top: 4px;
  display: block;
  color: #0f172a;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.4;
  word-break: break-all;
}

.holding-panel,
.detail-desc {
  margin-top: 10px;
}

.holding-panel h3,
.detail-desc h3 {
  margin: 0;
  color: #0f172a;
  font-size: 13px;
  font-weight: 900;
}

.detail-desc p {
  margin: 8px 0 0;
  color: #334155;
  line-height: 1.6;
  font-size: 11px;
  white-space: pre-wrap;
}

@media (max-width: 900px) {
  .library-view {
    padding: 12px;
  }

  .view-header h1 {
    font-size: 16px;
  }

  .search-row {
    flex-wrap: wrap;
  }

  .search-btn {
    width: 100%;
  }

  .book-card {
    grid-template-columns: 68px 1fr;
  }

  .book-cover-wrap {
    width: 68px;
    height: 92px;
  }

  .detail-main {
    grid-template-columns: 1fr;
  }

  .detail-cover-wrap {
    width: 110px;
    height: 148px;
  }

  .detail-grid,
  .holding-grid {
    grid-template-columns: 1fr;
  }
}
</style>
