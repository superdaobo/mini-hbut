<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { fetchGradeDistribution } from '../utils/grade_distribution.js'

const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const items = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 50
const selectedItem = ref(null)

const SEGMENT_KEYS = ['90-100', '80-89', '70-79', '60-69', '<60']
const SEGMENT_COLORS = {
  '90-100': '#22c55e',
  '80-89': '#3b82f6',
  '70-79': '#f59e0b',
  '60-69': '#f97316',
  '<60': '#ef4444',
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

// 加载数据
const loadData = async () => {
  loading.value = true
  error.value = ''
  try {
    const q = searchQuery.value.trim()
    const result = await fetchGradeDistribution({
      teacher_name: q || null,
      page: page.value,
      page_size: pageSize,
    })
    items.value = result.items
    total.value = result.total
  } catch (e) {
    error.value = `查询失败：${e.message}`
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

// 是否已输入搜索关键词
const hasQuery = computed(() => searchQuery.value.trim().length > 0)

// 搜索防抖
let searchTimer = null
const onSearchInput = () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    if (hasQuery.value) {
      loadData()
    } else {
      items.value = []
      total.value = 0
    }
  }, 400)
}

// 挂科率计算
const failRate = (item) => {
  const failCount = item.score_segments?.['<60'] || 0
  if (!item.sample_count) return '-'
  return ((failCount / item.sample_count) * 100).toFixed(1) + '%'
}

// 打开详情
const containerRef = ref(null)
const scrollToTop = () => {
  const scrollEl = document.querySelector('.app-shell')
  if (scrollEl) {
    scrollEl.scrollTo({ top: 0, behavior: 'instant' })
  }
}
const openDetail = (item) => {
  selectedItem.value = item
  nextTick(scrollToTop)
}
const closeDetail = () => {
  selectedItem.value = null
  nextTick(scrollToTop)
}

// 分段计算
const segmentWidth = (item, key) => {
  const count = item.score_segments?.[key] || 0
  if (!item.sample_count) return 0
  return Math.max(2, (count / item.sample_count) * 100)
}
const segmentPercent = (item, key) => {
  const count = item.score_segments?.[key] || 0
  if (!item.sample_count) return '0.0'
  return ((count / item.sample_count) * 100).toFixed(1)
}
const segmentCount = (item, key) => item.score_segments?.[key] || 0

watch(page, () => {
  if (hasQuery.value) loadData()
})
</script>

<template>
  <div ref="containerRef" class="gd-container">
    <!-- 详情页 / 列表页 互斥切换 -->
    <transition name="gd-slide" mode="out-in">

      <!-- ====== 详情页 ====== -->
      <div v-if="selectedItem" key="detail" class="gd-detail">
        <div class="gd-detail-header" @click="closeDetail">
          <span class="gd-back-icon">‹</span>
          <span>返回列表</span>
        </div>

        <div class="gd-detail-card">
          <div class="gd-detail-title">{{ selectedItem.course_name }}</div>
          <div class="gd-detail-meta">
            <span class="gd-meta-tag">👨‍🏫 {{ selectedItem.teacher_name }}</span>
            <span class="gd-meta-badge">{{ selectedItem.semester }}</span>
          </div>

          <!-- 统计指标 -->
          <div class="gd-detail-stats">
            <div class="gd-dstat">
              <div class="gd-dstat-value" style="color:#22c55e">{{ selectedItem.max_score ?? '-' }}</div>
              <div class="gd-dstat-label">最高分</div>
            </div>
            <div class="gd-dstat">
              <div class="gd-dstat-value" style="color:#ef4444">{{ selectedItem.min_score ?? '-' }}</div>
              <div class="gd-dstat-label">最低分</div>
            </div>
            <div class="gd-dstat">
              <div class="gd-dstat-value" style="color:#3b82f6">{{ selectedItem.avg_score ?? '-' }}</div>
              <div class="gd-dstat-label">平均分</div>
            </div>
            <div class="gd-dstat">
              <div class="gd-dstat-value" style="color:#8b5cf6">{{ selectedItem.median_score ?? '-' }}</div>
              <div class="gd-dstat-label">中位数</div>
            </div>
            <div class="gd-dstat">
              <div class="gd-dstat-value" style="color:var(--color-primary,#6366f1)">{{ selectedItem.sample_count ?? 0 }}</div>
              <div class="gd-dstat-label">样本数</div>
            </div>
          </div>

          <!-- 分段分布 -->
          <div class="gd-detail-segments">
            <div class="gd-seg-title">分数段分布</div>
            <div
              v-for="seg in SEGMENT_KEYS"
              :key="seg"
              class="gd-seg-row"
            >
              <span class="gd-seg-label">{{ seg }}</span>
              <div class="gd-seg-bar-bg">
                <div
                  class="gd-seg-bar"
                  :style="{
                    width: segmentWidth(selectedItem, seg) + '%',
                    backgroundColor: SEGMENT_COLORS[seg],
                  }"
                />
              </div>
              <span class="gd-seg-info">{{ segmentCount(selectedItem, seg) }}人 · {{ segmentPercent(selectedItem, seg) }}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ====== 列表页 ====== -->
      <div v-else key="list" class="gd-list-page">
        <!-- 搜索栏 -->
        <div class="gd-filters">
          <div class="gd-search">
            <span class="gd-search-icon">🔍</span>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索教师姓名..."
              class="gd-search-input"
              @input="onSearchInput"
            />
          </div>
        </div>

        <!-- 错误 -->
        <div v-if="error" class="gd-error">{{ error }}</div>

        <!-- 加载中 -->
        <div v-if="loading" class="gd-loading">
          <div class="gd-spinner" />
          <span>加载中...</span>
        </div>

        <!-- 未搜索提示 -->
        <div v-else-if="!hasQuery" class="gd-empty">
          <span class="gd-empty-icon">🔍</span>
          <p>请输入教师姓名搜索给分记录</p>
        </div>

        <!-- 空状态 -->
        <div v-else-if="items.length === 0 && !error" class="gd-empty">
          <span class="gd-empty-icon">📭</span>
          <p>暂无给分记录数据</p>
        </div>

        <!-- 课程列表 -->
        <div v-else class="gd-list">
          <div
            v-for="item in items"
            :key="item.id"
            class="gd-list-item"
            @click="openDetail(item)"
          >
            <div class="gd-item-left">
              <div class="gd-item-name">{{ item.course_name }}</div>
              <div class="gd-item-sub">
                <span>{{ item.teacher_name }}</span>
                <span class="gd-dot">·</span>
                <span>{{ item.semester }}</span>
              </div>
            </div>
            <div class="gd-item-right">
              <div class="gd-item-avg" :style="{ color: '#ef4444' }">{{ failRate(item) }}</div>
              <div class="gd-item-avg-label">挂科率</div>
            </div>
            <span class="gd-item-arrow">›</span>
          </div>
        </div>

        <!-- 分页 -->
        <div v-if="total > pageSize" class="gd-pagination">
          <button class="gd-page-btn" :disabled="page <= 1" @click="page--">‹ 上一页</button>
          <span class="gd-page-info">{{ page }} / {{ totalPages }}</span>
          <button class="gd-page-btn" :disabled="page >= totalPages" @click="page++">下一页 ›</button>
        </div>
      </div>

    </transition>
  </div>
</template>

<style scoped>
.gd-container {
  padding: 0 16px 16px;
  box-sizing: border-box;
  overflow: hidden;
}

/* ── 搜索栏 ── */
.gd-filters {
  display: flex;
  margin-bottom: 12px;
  box-sizing: border-box;
}
.gd-search {
  flex: 1;
  position: relative;
}
.gd-search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  pointer-events: none;
}
.gd-search-input {
  width: 100%;
  padding: 9px 12px 9px 32px;
  border-radius: 10px;
  border: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-bg-card, #fff);
  font-size: 14px;
  color: var(--color-text, #334155);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
.gd-search-input:focus {
  border-color: var(--color-primary, #6366f1);
}

/* ── 列表项 ── */
.gd-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--color-border, #e2e8f0);
  border-radius: 12px;
  overflow: hidden;
}
.gd-list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--color-bg-card, #fff);
  cursor: pointer;
  transition: background 0.15s;
}
.gd-list-item:active {
  background: var(--color-bg-secondary, #f8fafc);
}
.gd-item-left {
  flex: 1;
  min-width: 0;
}
.gd-item-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #334155);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gd-item-sub {
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  margin-top: 2px;
}
.gd-dot {
  margin: 0 4px;
}
.gd-item-right {
  text-align: center;
  flex-shrink: 0;
}
.gd-item-avg {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-primary, #6366f1);
  line-height: 1;
}
.gd-item-avg-label {
  font-size: 10px;
  color: var(--color-text-muted, #94a3b8);
  margin-top: 2px;
}
.gd-item-arrow {
  font-size: 18px;
  color: var(--color-text-muted, #c0c8d4);
  flex-shrink: 0;
}

/* ── 详情页 ── */
.gd-detail-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 0 14px;
  font-size: 14px;
  color: var(--color-primary, #6366f1);
  cursor: pointer;
  font-weight: 500;
}
.gd-back-icon {
  font-size: 20px;
  line-height: 1;
}
.gd-detail-card {
  border-radius: 14px;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  padding: 18px 16px;
}
.gd-detail-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--color-text, #334155);
  margin-bottom: 8px;
}
.gd-detail-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
}
.gd-meta-tag {
  font-size: 13px;
  color: var(--color-text-muted, #94a3b8);
}
.gd-meta-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--color-primary-soft, #eef2ff);
  color: var(--color-primary, #6366f1);
}

/* ── 详情统计 ── */
.gd-detail-stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  margin-bottom: 20px;
  padding: 14px 0;
  border-top: 1px solid var(--color-border, #e2e8f0);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}
.gd-dstat {
  text-align: center;
}
.gd-dstat-value {
  font-size: 20px;
  font-weight: 800;
  line-height: 1.2;
}
.gd-dstat-label {
  font-size: 11px;
  color: var(--color-text-muted, #94a3b8);
  margin-top: 4px;
}

/* ── 分段分布 ── */
.gd-detail-segments {
  margin-top: 4px;
}
.gd-seg-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #334155);
  margin-bottom: 10px;
}
.gd-seg-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.gd-seg-label {
  width: 46px;
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  text-align: right;
  flex-shrink: 0;
}
.gd-seg-bar-bg {
  flex: 1;
  height: 16px;
  background: var(--color-bg-secondary, #f1f5f9);
  border-radius: 8px;
  overflow: hidden;
}
.gd-seg-bar {
  height: 100%;
  border-radius: 8px;
  transition: width 0.5s ease-out;
}
.gd-seg-info {
  width: 80px;
  font-size: 11px;
  color: var(--color-text-muted, #94a3b8);
  flex-shrink: 0;
}

/* ── 状态 ── */
.gd-error {
  padding: 12px 16px;
  margin-bottom: 12px;
  border-radius: 10px;
  background: #fef2f2;
  color: #dc2626;
  font-size: 14px;
}
.gd-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
  color: var(--color-text-muted, #94a3b8);
  font-size: 14px;
}
.gd-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border, #e2e8f0);
  border-top-color: var(--color-primary, #6366f1);
  border-radius: 50%;
  animation: gd-spin 0.8s linear infinite;
}
@keyframes gd-spin { to { transform: rotate(360deg); } }
.gd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 0;
  color: var(--color-text-muted, #94a3b8);
}
.gd-empty-icon { font-size: 40px; }

/* ── 分页 ── */
.gd-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 14px;
  padding: 8px 0;
}
.gd-page-btn {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-bg-card, #fff);
  color: var(--color-text, #334155);
  font-size: 13px;
  cursor: pointer;
}
.gd-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.gd-page-info {
  font-size: 13px;
  color: var(--color-text-muted, #94a3b8);
}

/* ── 过渡动画 ── */
.gd-slide-enter-active, .gd-slide-leave-active {
  transition: opacity 0.15s ease;
}
.gd-slide-enter-from,
.gd-slide-leave-to {
  opacity: 0;
}
</style>
