<template>
  <div class="start-screen">
    <div class="start-content">
      <h1 class="game-title">跳出湖工大</h1>
      <p class="game-subtitle">🦘 按住蓄力，松开跳跃</p>

      <!-- 操作提示（首次进入 3s 后消失） -->
      <div v-if="showTip" class="tip-banner">
        <span>💡 按住屏幕蓄力，松开跳跃到下一个平台</span>
      </div>

      <!-- 最高分 -->
      <div class="high-score" v-if="highScore > 0">
        <span class="label">最高分</span>
        <span class="value">{{ highScore }}</span>
      </div>

      <!-- 按钮区域 -->
      <div class="button-group">
        <button class="btn btn-primary" @click="$emit('startGame')">
          开始游戏
        </button>
        <button class="btn btn-secondary" @click="$emit('showLeaderboard')">
          排行榜
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

defineProps({
  highScore: {
    type: Number,
    default: 0
  }
})

defineEmits(['startGame', 'showLeaderboard'])

const showTip = ref(true)
let tipTimer = null

onMounted(() => {
  tipTimer = setTimeout(() => {
    showTip.value = false
  }, 3000)
})

onBeforeUnmount(() => {
  if (tipTimer) {
    clearTimeout(tipTimer)
  }
})
</script>

<style scoped>
.start-screen {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  z-index: 10;
}

.start-content {
  text-align: center;
  padding: 2rem;
  max-width: 360px;
  width: 90%;
}

.game-title {
  font-size: 2.5rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.5rem;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.game-subtitle {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 1.5rem;
}

.tip-banner {
  background: rgba(255, 215, 0, 0.15);
  border: 1px solid rgba(255, 215, 0, 0.4);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin-bottom: 1.5rem;
  color: #FFD700;
  font-size: 0.875rem;
  animation: fadeIn 0.3s ease;
}

.high-score {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 2rem;
  color: #fff;
}

.high-score .label {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.6);
}

.high-score .value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #FFD700;
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
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
