<template>
  <div class="game-over">
    <div class="skull">💀</div>
    <h1 class="title">行动失败</h1>
    <p class="message">你倒在了战场上...</p>
    
    <div class="stats-summary">
      <div class="stat-row">
        <span>击败敌人</span>
        <span class="value">{{ enemiesDefeated }}</span>
      </div>
      <div class="stat-row">
        <span>收集物品</span>
        <span class="value">{{ itemsCollected }}</span>
      </div>
      <div class="stat-row">
        <span>存活回合</span>
        <span class="value">{{ turnCount }}</span>
      </div>
    </div>
    
    <button class="restart-btn" @click="restart">
      重新部署
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const enemiesDefeated = computed(() => gameStore.enemiesDefeated)
const itemsCollected = computed(() => gameStore.itemsCollected)
const turnCount = computed(() => gameStore.turnCount)

const restart = () => {
  gameStore.restartGame()
}
</script>

<style scoped>
.game-over {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background: linear-gradient(180deg, #1a1a2e 0%, #2d132c 100%);
}

.skull {
  font-size: 80px;
  margin-bottom: 20px;
  animation: shake 2s infinite;
}

.title {
  font-size: 36px;
  color: #ff4444;
  margin-bottom: 10px;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
}

.message {
  color: #888;
  font-size: 16px;
  margin-bottom: 30px;
}

.stats-summary {
  background: rgba(0,0,0,0.3);
  border-radius: 15px;
  padding: 20px 30px;
  margin-bottom: 30px;
  min-width: 250px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  color: #ccc;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.stat-row:last-child {
  border-bottom: none;
}

.value {
  color: #e94560;
  font-weight: bold;
}

.restart-btn {
  padding: 15px 50px;
  font-size: 18px;
  font-weight: bold;
  color: white;
  background: linear-gradient(135deg, #e94560 0%, #ff6b6b 100%);
  border: none;
  border-radius: 25px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 5px 20px rgba(233,69,96,0.4);
}

.restart-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 8px 25px rgba(233,69,96,0.6);
}

@keyframes shake {
  0%, 100% { transform: rotate(-5deg); }
  50% { transform: rotate(5deg); }
}
</style>