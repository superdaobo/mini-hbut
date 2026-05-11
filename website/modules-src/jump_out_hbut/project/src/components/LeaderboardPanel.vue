<template>
  <div class="leaderboard-panel">
    <div class="leaderboard-content">
      <!-- 头部 -->
      <div class="panel-header">
        <h2 class="panel-title">🏆 排行榜</h2>
        <button class="close-btn" @click="$emit('close')">✕</button>
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
        <div
          v-for="(item, index) in list"
          :key="index"
          class="rank-item"
          :class="{ 'rank-top': index < 3 }"
        >
          <span class="rank-number">{{ getRankDisplay(index) }}</span>
          <span class="rank-name">{{ item.player_name || '匿名玩家' }}</span>
          <span class="rank-score">{{ item.score }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { fetchGameLeaderboard } from '../utils/game_rank.js'

defineEmits(['close'])

const loading = ref(true)
const error = ref(false)
const list = ref([])

function getRankDisplay(index) {
  if (index === 0) return '🥇'
  if (index === 1) return '🥈'
  if (index === 2) return '🥉'
  return `${index + 1}`
}

async function loadLeaderboard() {
  loading.value = true
  error.value = false
  list.value = []

  try {
    const result = await fetchGameLeaderboard({ scope: 'class', limit: 20 })
    if (result.success && Array.isArray(result.data)) {
      list.value = result.data
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
  max-height: 60vh;
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

.rank-score {
  font-size: 1rem;
  font-weight: 700;
  color: #FFD700;
  margin-left: 0.5rem;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
