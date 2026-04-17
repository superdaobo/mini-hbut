<template>
  <div class="game-log" :class="{ expanded: expanded }">
    <div class="log-header" @click="expanded = !expanded">
      <span class="log-title">📜 行动日志</span>
      <span class="toggle-icon">{{ expanded ? '▼' : '▲' }}</span>
    </div>
    
    <div class="log-content" ref="logContent">
      <div 
        v-for="(entry, index) in gameLog" 
        :key="entry.time"
        class="log-entry"
        :class="getEntryClass(entry.text)"
      >
        <span class="log-time">{{ formatTime(entry.time) }}</span>
        <span class="log-text">{{ entry.text }}</span>
      </div>
      
      <div v-if="gameLog.length === 0" class="log-empty">
        游戏开始，祝你行动顺利！
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const gameLog = computed(() => gameStore.gameLog)
const expanded = ref(false)
const logContent = ref(null)

const getEntryClass = (text) => {
  if (text.includes('击杀') || text.includes('击败')) return 'kill'
  if (text.includes('伤害') || text.includes('攻击')) return 'combat'
  if (text.includes('拾取') || text.includes('获得')) return 'loot'
  if (text.includes('升级')) return 'levelup'
  if (text.includes('撤离')) return 'victory'
  if (text.includes('阵亡')) return 'death'
  return ''
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

// 自动滚动到底部
watch(gameLog, () => {
  nextTick(() => {
    if (logContent.value) {
      logContent.value.scrollTop = 0
    }
  })
}, { deep: true })
</script>

<style scoped>
.game-log {
  position: fixed;
  left: 20px;
  top: 100px;
  width: 280px;
  background: rgba(15, 15, 26, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  overflow: hidden;
  z-index: 90;
  transition: all 0.3s ease;
}

.game-log.expanded {
  height: 400px;
}

.game-log:not(.expanded) {
  height: 200px;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  user-select: none;
}

.log-title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.toggle-icon {
  font-size: 12px;
  color: #888;
}

.log-content {
  height: calc(100% - 45px);
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column-reverse;
}

.log-entry {
  padding: 8px 10px;
  margin-bottom: 5px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.4;
  animation: slideIn 0.3s ease;
}

.log-entry.kill {
  background: rgba(255, 215, 0, 0.1);
  border-left: 3px solid #ffd700;
}

.log-entry.combat {
  background: rgba(255, 51, 102, 0.1);
  border-left: 3px solid #ff3366;
}

.log-entry.loot {
  background: rgba(0, 212, 255, 0.1);
  border-left: 3px solid #00d4ff;
}

.log-entry.levelup {
  background: rgba(138, 43, 226, 0.1);
  border-left: 3px solid #8a2be2;
}

.log-entry.victory {
  background: rgba(50, 205, 50, 0.1);
  border-left: 3px solid #32cd32;
}

.log-entry.death {
  background: rgba(220, 20, 60, 0.1);
  border-left: 3px solid #dc143c;
}

.log-time {
  font-size: 10px;
  color: #666;
  margin-right: 8px;
}

.log-text {
  color: #ccc;
}

.log-empty {
  text-align: center;
  color: #666;
  font-size: 12px;
  padding: 20px;
  font-style: italic;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* 滚动条样式 */
.log-content::-webkit-scrollbar {
  width: 4px;
}

.log-content::-webkit-scrollbar-track {
  background: transparent;
}

.log-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}
</style>