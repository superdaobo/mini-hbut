<template>
  <div class="victory">
    <div class="trophy">🏆</div>
    <h1 class="title">成功撤离!</h1>
    <p class="message">你带着战利品安全撤离了战场</p>
    
    <div class="victory-stats">
      <div class="stat-card">
        <div class="stat-icon">⚔️</div>
        <div class="stat-value">{{ enemiesDefeated }}</div>
        <div class="stat-label">击败敌人</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📦</div>
        <div class="stat-value">{{ itemsCollected }}</div>
        <div class="stat-label">收集物品</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⏱️</div>
        <div class="stat-value">{{ turnCount }}</div>
        <div class="stat-label">使用回合</div>
      </div>
    </div>
    
    <div class="rewards">
      <h3>获得战利品</h3>
      <div class="loot-grid">
        <div v-for="(item, index) in inventory" :key="index" class="loot-item">
          <span class="loot-icon">{{ item.icon }}</span>
          <span class="loot-name">{{ item.name }}</span>
        </div>
      </div>
    </div>
    
    <button class="play-again-btn" @click="restart">
      再次行动
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
const inventory = computed(() => gameStore.inventory)

const restart = () => {
  gameStore.restartGame()
}
</script>

<style scoped>
.victory {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background: linear-gradient(180deg, #1a1a2e 0%, #0f3460 100%);
  overflow-y: auto;
}

.trophy {
  font-size: 80px;
  margin-bottom: 20px;
  animation: shine 2s infinite;
}

.title {
  font-size: 36px;
  background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 10px;
  text-shadow: 0 0 30px rgba(255,215,0,0.3);
}

.message {
  color: #888;
  font-size: 16px;
  margin-bottom: 30px;
}

.victory-stats {
  display: flex;
  gap: 15px;
  margin-bottom: 30px;
}

.stat-card {
  background: rgba(255,255,255,0.1);
  border-radius: 15px;
  padding: 20px;
  text-align: center;
  min-width: 80px;
  border: 1px solid rgba(255,215,0,0.3);
}

.stat-icon {
  font-size: 24px;
  margin-bottom: 5px;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #ffd700;
  margin-bottom: 3px;
}

.stat-label {
  font-size: 12px;
  color: #888;
}

.rewards {
  width: 100%;
  max-width: 350px;
  background: rgba(0,0,0,0.3);
  border-radius: 15px;
  padding: 20px;
  margin-bottom: 30px;
}

.rewards h3 {
  color: #ffd700;
  text-align: center;
  margin-bottom: 15px;
  font-size: 18px;
}

.loot-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.loot-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 5px;
  background: rgba(255,255,255,0.05);
  border-radius: 8px;
}

.loot-icon {
  font-size: 24px;
  margin-bottom: 5px;
}

.loot-name {
  font-size: 10px;
  color: #888;
  text-align: center;
}

.play-again-btn {
  padding: 15px 50px;
  font-size: 18px;
  font-weight: bold;
  color: #1a1a2e;
  background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
  border: none;
  border-radius: 25px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 5px 20px rgba(255,215,0,0.4);
}

.play-again-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 8px 25px rgba(255,215,0,0.6);
}

@keyframes shine {
  0%, 100% { transform: scale(1) rotate(-5deg); filter: brightness(1); }
  50% { transform: scale(1.1) rotate(5deg); filter: brightness(1.2); }
}
</style>