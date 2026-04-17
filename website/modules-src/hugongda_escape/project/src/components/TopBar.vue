<template>
  <div class="top-bar">
    <!-- 左侧：玩家状态 -->
    <div class="player-status">
      <div class="avatar-section">
        <div class="class-icon" :style="{ background: playerClass?.color }">
          {{ playerClass?.icon }}
        </div>
        <div class="level-badge">Lv.{{ player.level }}</div>
      </div>
      
      <div class="stats-section">
        <!-- 生命条 -->
        <div class="stat-row">
          <span class="stat-icon">❤️</span>
          <div class="progress-bar">
            <div class="progress-fill hp" :style="{ width: hpPercent + '%' }"></div>
            <span class="progress-text">{{ player.hp }}/{{ player.maxHp }}</span>
          </div>
        </div>
        
        <!-- 经验条 -->
        <div class="stat-row">
          <span class="stat-icon">⭐</span>
          <div class="progress-bar">
            <div class="progress-fill exp" :style="{ width: expPercent + '%' }"></div>
            <span class="progress-text">{{ player.exp }}/{{ player.expToNext }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 中间：战斗属性 -->
    <div class="combat-stats">
      <div class="combat-stat">
        <span class="stat-value">{{ player.attack }}</span>
        <span class="stat-label">⚔️ 攻击</span>
      </div>
      <div class="combat-stat">
        <span class="stat-value">{{ player.defense }}</span>
        <span class="stat-label">🛡️ 防御</span>
      </div>
      <div class="combat-stat">
        <span class="stat-value">{{ player.accuracy }}%</span>
        <span class="stat-label">🎯 命中</span>
      </div>
      <div class="combat-stat">
        <span class="stat-value">{{ player.critRate }}%</span>
        <span class="stat-label">💥 暴击</span>
      </div>
    </div>
    
    <!-- 右侧：任务进度 -->
    <div class="mission-progress">
      <div class="mission-item">
        <span class="mission-icon">⚔️</span>
        <span class="mission-count">{{ player.kills }}/3</span>
        <span class="mission-label">击杀</span>
      </div>
      <div class="mission-item">
        <span class="mission-icon">🎒</span>
        <span class="mission-count">{{ inventory.length }}/{{ maxInventorySlots }}</span>
        <span class="mission-label">背包</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const player = computed(() => gameStore.player)
const playerClass = computed(() => gameStore.classes[player.value.class])
const inventory = computed(() => gameStore.inventory)
const maxInventorySlots = computed(() => gameStore.maxInventorySlots)

const hpPercent = computed(() => (player.value.hp / player.value.maxHp) * 100)
const expPercent = computed(() => (player.value.exp / player.value.expToNext) * 100)
</script>

<style scoped>
.top-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 80px;
  background: linear-gradient(180deg, rgba(15, 15, 26, 0.95) 0%, rgba(15, 15, 26, 0.8) 100%);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 100;
}

.player-status {
  display: flex;
  align-items: center;
  gap: 15px;
}

.avatar-section {
  position: relative;
}

.class-icon {
  width: 50px;
  height: 50px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

.level-badge {
  position: absolute;
  bottom: -5px;
  right: -5px;
  background: #ff3366;
  color: white;
  font-size: 10px;
  font-weight: bold;
  padding: 2px 6px;
  border-radius: 8px;
}

.stats-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 150px;
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-icon {
  font-size: 14px;
  width: 20px;
}

.progress-bar {
  flex: 1;
  height: 16px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
}

.progress-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.progress-fill.hp {
  background: linear-gradient(90deg, #ff3366 0%, #ff0066 100%);
}

.progress-fill.exp {
  background: linear-gradient(90deg, #ffd700 0%, #ffaa00 100%);
}

.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 10px;
  color: white;
  font-weight: bold;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.combat-stats {
  display: flex;
  gap: 20px;
}

.combat-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
}

.stat-label {
  font-size: 11px;
  color: #888;
}

.mission-progress {
  display: flex;
  gap: 20px;
}

.mission-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.05);
  padding: 8px 15px;
  border-radius: 10px;
}

.mission-icon {
  font-size: 16px;
}

.mission-count {
  font-size: 16px;
  font-weight: 700;
  color: #00d4ff;
}

.mission-label {
  font-size: 10px;
  color: #666;
}
</style>