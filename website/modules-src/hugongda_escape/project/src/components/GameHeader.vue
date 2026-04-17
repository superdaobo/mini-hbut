<template>
  <div class="header">
    <div class="player-info">
      <div class="hp-bar">
        <div class="hp-fill" :style="{ width: hpPercent + '%' }"></div>
        <span class="hp-text">{{ player.hp }}/{{ player.maxHp }}</span>
      </div>
      <div class="stats">
        <span class="stat">⚔️ {{ player.attack }}</span>
        <span class="stat">🛡️ {{ player.defense }}</span>
        <span class="stat">📦 {{ inventory.length }}/{{ maxInventorySlots }}</span>
      </div>
    </div>
    <div class="game-stats">
      <div class="stat-item">
        <span class="label">击败</span>
        <span class="value">{{ enemiesDefeated }}</span>
      </div>
      <div class="stat-item">
        <span class="label">回合</span>
        <span class="value">{{ turnCount }}</span>
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
const maxInventorySlots = computed(() => gameStore.maxInventorySlots)
const enemiesDefeated = computed(() => gameStore.enemiesDefeated)
const turnCount = computed(() => gameStore.turnCount)

const hpPercent = computed(() => (player.value.hp / player.value.maxHp) * 100)
</script>

<style scoped>
.header {
  background: linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 100%);
  padding: 10px 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #e94560;
}

.player-info {
  flex: 1;
}

.hp-bar {
  position: relative;
  height: 24px;
  background: rgba(255,255,255,0.1);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 8px;
}

.hp-fill {
  height: 100%;
  background: linear-gradient(90deg, #e94560 0%, #ff6b6b 100%);
  transition: width 0.3s ease;
}

.hp-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-size: 12px;
  font-weight: bold;
  text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
}

.stats {
  display: flex;
  gap: 15px;
}

.stat {
  color: #fff;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 3px;
}

.game-stats {
  display: flex;
  gap: 20px;
}

.stat-item {
  text-align: center;
}

.stat-item .label {
  display: block;
  color: #888;
  font-size: 11px;
  margin-bottom: 2px;
}

.stat-item .value {
  display: block;
  color: #e94560;
  font-size: 18px;
  font-weight: bold;
}
</style>