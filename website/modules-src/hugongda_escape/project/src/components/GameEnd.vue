<template>
  <div class="game-end" :class="resultClass">
    <div class="result-container">
      <!-- 结果图标 -->
      <div class="result-icon">
        {{ isVictory ? '🏆' : '💀' }}
      </div>
      
      <!-- 标题 -->
      <h1 class="result-title">
        {{ isVictory ? '成功撤离！' : '行动失败' }}
      </h1>
      
      <!-- 结果描述 -->
      <p class="result-desc">
        {{ isVictory ? '你成功带着战利品撤离了战场' : '你的行动以失败告终...' }}
      </p>
      
      <!-- 统计面板 -->
      <div class="stats-panel">
        <div class="stat-row">
          <div class="stat-box">
            <span class="stat-icon">⚔️</span>
            <span class="stat-value">{{ player.kills }}</span>
            <span class="stat-label">击败敌人</span>
          </div>
          <div class="stat-box">
            <span class="stat-icon">📦</span>
            <span class="stat-value">{{ player.itemsLooted }}</span>
            <span class="stat-label">收集物品</span>
          </div>
          <div class="stat-box">
            <span class="stat-icon">⭐</span>
            <span class="stat-value">{{ player.level }}</span>
            <span class="stat-label">达到等级</span>
          </div>
        </div>
        
        <div class="exp-gained" v-if="isVictory">
          <span class="exp-label">获得经验</span>
          <span class="exp-value">+{{ player.exp }}</span>
        </div>
      </div>
      
      <!-- 奖励展示（仅胜利） -->
      <div class="rewards-section" v-if="isVictory && inventory.length > 0">
        <h3 class="rewards-title">获得战利品</h3>
        <div class="rewards-grid">
          <div v-for="(item, index) in inventory.slice(0, 6)" :key="index" class="reward-item">
            <span class="reward-icon">{{ item.icon }}</span>
            <span class="reward-name">{{ item.name }}</span>
          </div>
        </div>
      </div>
      
      <!-- 按钮 -->
      <div class="action-buttons">
        <button class="btn-primary" @click="restart">
          <span class="btn-icon">🔄</span>
          <span class="btn-text">再次行动</span>
        </button>
        <button class="btn-secondary" @click="backToMenu">
          <span class="btn-icon">🏠</span>
          <span class="btn-text">返回基地</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const player = computed(() => gameStore.player)
const inventory = computed(() => gameStore.inventory)
const isVictory = computed(() => gameStore.gameState === 'victory')
const resultClass = computed(() => isVictory.value ? 'victory' : 'defeat')

const restart = () => {
  gameStore.startGame()
}

const backToMenu = () => {
  gameStore.restart()
}
</script>

<style scoped>
.game-end {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 300;
}

.game-end.victory {
  background: linear-gradient(180deg, #0f2f1f 0%, #0a0a0f 100%);
}

.game-end.defeat {
  background: linear-gradient(180deg, #2f0f1f 0%, #0a0a0f 100%);
}

.result-container {
  text-align: center;
  padding: 40px;
  max-width: 400px;
}

.result-icon {
  font-size: 80px;
  margin-bottom: 20px;
  animation: bounce 2s ease-in-out infinite;
}

.victory .result-icon {
  filter: drop-shadow(0 0 30px rgba(255, 215, 0, 0.6));
}

.defeat .result-icon {
  filter: drop-shadow(0 0 30px rgba(220, 20, 60, 0.6));
}

.result-title {
  font-size: 36px;
  font-weight: 900;
  margin-bottom: 10px;
}

.victory .result-title {
  background: linear-gradient(135deg, #ffd700 0%, #ffaa00 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.defeat .result-title {
  color: #ff3366;
  text-shadow: 0 0 20px rgba(255, 51, 102, 0.5);
}

.result-desc {
  color: #888;
  font-size: 16px;
  margin-bottom: 30px;
}

.stats-panel {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 20px;
  padding: 25px;
  margin-bottom: 30px;
}

.stat-row {
  display: flex;
  justify-content: space-around;
  gap: 20px;
}

.stat-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.stat-icon {
  font-size: 28px;
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: #fff;
}

.victory .stat-value {
  color: #ffd700;
}

.stat-label {
  font-size: 12px;
  color: #666;
}

.exp-gained {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
}

.exp-label {
  color: #888;
  font-size: 14px;
}

.exp-value {
  color: #8a2be2;
  font-size: 24px;
  font-weight: 700;
}

.rewards-section {
  margin-bottom: 30px;
}

.rewards-title {
  color: #888;
  font-size: 14px;
  margin-bottom: 15px;
}

.rewards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.reward-item {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 15px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.reward-icon {
  font-size: 24px;
}

.reward-name {
  font-size: 10px;
  color: #888;
  text-align: center;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.btn-primary, .btn-secondary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 18px 30px;
  border: none;
  border-radius: 12px;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-primary {
  background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
  color: white;
  box-shadow: 0 10px 30px rgba(0, 212, 255, 0.4);
}

.btn-primary:hover {
  transform: translateY(-3px);
  box-shadow: 0 15px 40px rgba(0, 212, 255, 0.6);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}

.btn-icon {
  font-size: 20px;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0) rotate(-5deg); }
  50% { transform: translateY(-10px) rotate(5deg); }
}
</style>