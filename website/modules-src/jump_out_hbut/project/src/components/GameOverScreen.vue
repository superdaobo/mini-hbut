<template>
  <div class="gameover-screen">
    <div class="gameover-content">
      <!-- 上传失败提示（顶部） -->
      <div v-if="uploadFailed" class="upload-error-banner">
        <span class="upload-error-status" aria-hidden="true"></span>
        <span class="upload-error-text">分数上传失败</span>
        <button class="upload-retry-btn" :disabled="retrying" @click="$emit('retryUpload')">
          {{ retrying ? '重试中...' : '重试' }}
        </button>
      </div>

      <h2 class="gameover-title">游戏结束</h2>

      <!-- 本次得分 -->
      <div class="score-section">
        <div class="current-score">
          <span class="label">本次得分</span>
          <span class="value">{{ score }}</span>
        </div>
        <div class="best-score" v-if="bestScore > 0">
          <span class="label">最高分</span>
          <span class="value">{{ bestScore }}</span>
          <span class="new-badge" v-if="isNewRecord">NEW!</span>
        </div>
      </div>

      <!-- 统计信息 -->
      <div class="stats-section">
        <div class="stat-item">
          <span class="stat-label">跳跃次数</span>
          <span class="stat-value">{{ jumpCount }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">游戏时长</span>
          <span class="stat-value">{{ formattedDuration }}</span>
        </div>
      </div>

      <!-- 按钮区域 -->
      <div class="button-group">
        <button class="btn btn-primary" @click="$emit('restart')">
          再来一局
        </button>
        <button class="btn btn-secondary" @click="$emit('showLeaderboard')">
          查看排行榜
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  score: {
    type: Number,
    default: 0
  },
  jumpCount: {
    type: Number,
    default: 0
  },
  duration: {
    type: Number,
    default: 0
  },
  uploadFailed: {
    type: Boolean,
    default: false
  },
  retrying: {
    type: Boolean,
    default: false
  }
})

defineEmits(['restart', 'showLeaderboard', 'retryUpload'])

// 最高分
const bestScore = computed(() => {
  return Number(localStorage.getItem('jump_out_hbut_highscore') || '0')
})

// 是否新纪录
const isNewRecord = computed(() => {
  return props.score >= bestScore.value && props.score > 0
})

// 格式化时长
const formattedDuration = computed(() => {
  const totalSeconds = Math.floor(props.duration / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes > 0) {
    return `${minutes}分${seconds}秒`
  }
  return `${seconds}秒`
})
</script>

<style scoped>
.gameover-screen {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.75);
  z-index: 10;
  animation: fadeIn 0.3s ease;
}

.gameover-content {
  text-align: center;
  padding: 2rem;
  max-width: 360px;
  width: 90%;
  background: rgba(30, 30, 30, 0.9);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.gameover-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 1.5rem;
}

/* 上传失败提示条 */
.upload-error-banner {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  margin-bottom: 1rem;
  background: rgba(255, 69, 0, 0.15);
  border: 1px solid rgba(255, 69, 0, 0.4);
  border-radius: 8px;
  animation: slideDown 0.3s ease;
}

.upload-error-status {
  flex: 0 0 auto;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #FF6B35;
  box-shadow: 0 0 0 4px rgba(255, 107, 53, 0.18);
}

.upload-error-text {
  font-size: 0.8rem;
  color: #FF6B35;
  font-weight: 600;
  margin-right: auto;
}

.upload-retry-btn {
  background: #FF6B35;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.3rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.upload-retry-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.upload-retry-btn:not(:disabled):active {
  transform: scale(0.95);
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.score-section {
  margin-bottom: 1.5rem;
}

.current-score {
  margin-bottom: 0.5rem;
}

.current-score .label {
  display: block;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 0.25rem;
}

.current-score .value {
  font-size: 2.5rem;
  font-weight: 700;
  color: #FFD700;
}

.best-score {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.best-score .label {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.5);
}

.best-score .value {
  font-size: 1rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
}

.new-badge {
  font-size: 0.7rem;
  font-weight: 700;
  color: #FF4500;
  background: rgba(255, 69, 0, 0.15);
  border-radius: 4px;
  padding: 2px 6px;
  animation: pulse 1s ease infinite;
}

.stats-section {
  display: flex;
  justify-content: center;
  gap: 2rem;
  margin-bottom: 1.5rem;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.stat-label {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
}

.stat-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: #fff;
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.btn {
  width: 100%;
  padding: 0.875rem 1.5rem;
  border: none;
  border-radius: 12px;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.btn:active {
  transform: scale(0.96);
}

.btn-primary {
  background: #4682B4;
  color: #fff;
  box-shadow: 0 4px 12px rgba(70, 130, 180, 0.4);
}

.btn-primary:hover {
  box-shadow: 0 6px 16px rgba(70, 130, 180, 0.6);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
