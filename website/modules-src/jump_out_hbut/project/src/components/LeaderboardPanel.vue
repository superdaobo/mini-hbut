<template>
  <div class="leaderboard-panel">
    <div class="leaderboard-content">
      <!-- 头部 -->
      <div class="panel-header">
        <h2 class="panel-title">🏆 排行榜</h2>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <!-- Tab 切换 -->
      <div class="tab-bar">
        <button
          v-for="tab in tabs"
          :key="tab.scope"
          class="tab-btn"
          :class="{ active: activeScope === tab.scope }"
          @click="switchTab(tab.scope)"
        >{{ tab.label }}</button>
      </div>

      <!-- 加载中 -->
      <div v-if="loading" class="state-container">
        <div class="loading-spinner"></div>
        <p class="state-text">加载中...</p>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="error" class="state-container">
        <p class="state-text error-text">排行榜暂时不可用</p>
        <button class="btn btn-retry" @click="loadLeaderboard">重试</button>
      </div>

      <!-- 空状态 -->
      <div v-else-if="list.length === 0" class="state-container">
        <p class="state-text">暂无排行数据</p>
      </div>

      <!-- 排行榜列表 -->
      <div v-else class="leaderboard-list">
        <!-- 班级总分榜 -->
        <template v-if="activeScope === 'class_total'">
          <div
            v-for="(item, index) in list"
            :key="index"
            class="rank-item"
            :class="{ 'rank-top': index < 3, 'rank-self': item.is_self }"
          >
            <span class="rank-number">{{ getRankDisplay(index) }}</span>
            <span class="rank-name">{{ item.class_name || '未知班级' }}</span>
            <span class="rank-meta">{{ item.player_count }}人</span>
            <span class="rank-score">{{ item.total_score }}</span>
          </div>
        </template>
        <!-- 个人榜（班级/全校） -->
        <template v-else>
          <div
            v-for="(item, index) in list"
            :key="index"
            class="rank-item"
            :class="{ 'rank-top': index < 3, 'rank-self': item.is_self }"
          >
            <span class="rank-number">{{ getRankDisplay(index) }}</span>
            <span class="rank-name">{{ item.player_name || '匿名玩家' }}</span>
            <span class="rank-score">{{ item.score }}</span>
          </div>
        </template>
      </div>

      <!-- 我的排名 -->
      <div v-if="!loading && !error && player" class="my-rank-bar">
        <span>我的最高分: {{ player.score }}</span>
        <span v-if="player.class_rank">班级第{{ player.class_rank }}名</span>
        <span v-if="player.school_rank">全校第{{ player.school_rank }}名</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { fetchGameLeaderboard } from '../utils/game_rank.js'

defineEmits(['close'])

const tabs = [
  { scope: 'class', label: '班级榜' },
  { scope: 'school', label: '全校榜' },
  { scope: 'class_total', label: '班级总分' }
]

const activeScope = ref('class')
const loading = ref(true)
const error = ref(false)
const list = ref([])
const player = ref(null)

function getRankDisplay(index) {
  if (index === 0) return '🥇'
  if (index === 1) return '🥈'
  if (index === 2) return '🥉'
  return `${index + 1}`
}

function switchTab(scope) {
  activeScope.value = scope
  loadLeaderboard()
}

async function loadLeaderboard() {
  loading.value = true
  error.value = false
  list.value = []
  player.value = null

  try {
    const result = await fetchGameLeaderboard({
      scope: activeScope.value,
      limit: 30
    })
    if (result.success) {
      list.value = Array.isArray(result.leaderboard) ? result.leaderboard : (Array.isArray(result.data) ? result.data : [])
      player.value = result.player || null
    } else {
      error.value = true
    }
  } catch (e) {
    error.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadLeaderboard()
})
</script>

<style scoped>
.leaderboard-panel {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
  z-index: 10;
  animation: fadeIn 0.3s ease;
}

.leaderboard-content {
  max-width: 400px;
  width: 90%;
  max-height: 80vh;
  background: rgba(30, 30, 30, 0.95);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #fff;
}

.close-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Tab 栏 */
.tab-bar {
  display: flex;
  padding: 0.5rem 1rem;
  gap: 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.tab-btn {
  flex: 1;
  padding: 0.5rem 0;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  background: rgba(70, 130, 180, 0.3);
  color: #fff;
}

.tab-btn:hover:not(.active) {
  background: rgba(255, 255, 255, 0.1);
}

.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  gap: 1rem;
}

.state-text {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.6);
}

.error-text {
  color: rgba(255, 100, 100, 0.8);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #4682B4;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.btn-retry {
  background: #4682B4;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 0.5rem 1.5rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.btn-retry:active {
  transform: scale(0.96);
}

.leaderboard-list {
  overflow-y: auto;
  padding: 0.5rem 0;
  max-height: 50vh;
}

.rank-item {
  display: flex;
  align-items: center;
  padding: 0.75rem 1.25rem;
  transition: background 0.15s;
}

.rank-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.rank-item.rank-top {
  background: rgba(255, 215, 0, 0.05);
}

.rank-item.rank-self {
  background: rgba(70, 130, 180, 0.15);
  border-left: 3px solid #4682B4;
}

.rank-number {
  width: 36px;
  font-size: 1rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
}

.rank-top .rank-number {
  font-size: 1.2rem;
}

.rank-name {
  flex: 1;
  font-size: 0.9rem;
  color: #fff;
  margin-left: 0.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-meta {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  margin-left: 0.5rem;
}

.rank-score {
  font-size: 1rem;
  font-weight: 700;
  color: #FFD700;
  margin-left: 0.5rem;
}

/* 我的排名条 */
.my-rank-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.7);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
