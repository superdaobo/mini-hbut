<template>
  <div class="bottom-controls">
    <div class="controls-main">
      <!-- 方向控制 -->
      <div class="d-pad">
        <button class="d-btn up" @click="move(0, -1)">
          <span class="arrow">▲</span>
        </button>
        <div class="d-middle">
          <button class="d-btn left" @click="move(-1, 0)">
            <span class="arrow">◀</span>
          </button>
          <div class="d-center">
            <div class="player-mini">🎮</div>
          </div>
          <button class="d-btn right" @click="move(1, 0)">
            <span class="arrow">▶</span>
          </button>
        </div>
        <button class="d-btn down" @click="move(0, 1)">
          <span class="arrow">▼</span>
        </button>
      </div>
      
      <!-- 功能按钮 -->
      <div class="action-buttons">
        <button class="action-btn" @click="toggleInventory">
          <span class="btn-icon">🎒</span>
          <span class="btn-label">背包</span>
        </button>
        
        <button class="action-btn" @click="toggleEquipment">
          <span class="btn-icon">⚔️</span>
          <span class="btn-label">装备</span>
        </button>
        
        <button class="action-btn danger" @click="confirmExit">
          <span class="btn-icon">🏃</span>
          <span class="btn-label">撤离</span>
        </button>
      </div>
    </div>
    
    <!-- 快捷栏 -->
    <div class="quick-bar">
      <div 
        v-for="(item, index) in quickItems" 
        :key="index"
        class="quick-slot"
        :class="{ empty: !item, usable: item && item.type === 'consumable' }"
        @click="useQuickItem(index)"
      >
        <span v-if="item" class="quick-icon">{{ item.icon }}</span>
        <span v-else class="quick-number">{{ index + 1 }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const inventory = computed(() => gameStore.inventory)

const quickItems = computed(() => {
  return inventory.value.slice(0, 4)
})

const move = (dx, dy) => {
  gameStore.movePlayer(dx, dy)
}

const toggleInventory = () => {
  // TODO: 显示背包面板
  alert('背包功能开发中...')
}

const toggleEquipment = () => {
  // TODO: 显示装备面板
  const equipped = gameStore.equipped
  alert(`当前装备：\n武器: ${equipped.weapon?.name || '无'}\n护甲: ${equipped.armor?.name || '无'}`)
}

const confirmExit = () => {
  if (confirm('确定要放弃当前行动吗？')) {
    gameStore.gameState = 'menu'
  }
}

const useQuickItem = (index) => {
  const item = quickItems.value[index]
  if (item && item.type === 'consumable') {
    gameStore.useItem(index)
  }
}
</script>

<style scoped>
.bottom-controls {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(0deg, rgba(15, 15, 26, 0.95) 0%, rgba(15, 15, 26, 0.8) 100%);
  backdrop-filter: blur(10px);
  padding: 15px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 100;
}

.controls-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

/* D-Pad */
.d-pad {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.d-middle {
  display: flex;
  align-items: center;
  gap: 5px;
}

.d-btn {
  width: 55px;
  height: 55px;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.1s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.d-btn:hover {
  background: rgba(0, 212, 255, 0.2);
  border-color: rgba(0, 212, 255, 0.5);
  transform: scale(1.05);
}

.d-btn:active {
  transform: scale(0.95);
  background: rgba(0, 212, 255, 0.3);
}

.arrow {
  font-size: 20px;
  color: white;
}

.d-center {
  width: 55px;
  height: 55px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.player-mini {
  font-size: 24px;
  animation: bounce 1s ease-in-out infinite;
}

/* 动作按钮 */
.action-buttons {
  display: flex;
  gap: 15px;
}

.action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
}

.action-btn.danger {
  background: rgba(255, 51, 102, 0.2);
  border-color: rgba(255, 51, 102, 0.4);
}

.action-btn.danger:hover {
  background: rgba(255, 51, 102, 0.3);
}

.btn-icon {
  font-size: 24px;
}

.btn-label {
  font-size: 12px;
  color: #ccc;
}

/* 快捷栏 */
.quick-bar {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.quick-slot {
  width: 50px;
  height: 50px;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.quick-slot.empty {
  border-style: dashed;
  opacity: 0.5;
}

.quick-slot.usable {
  border-color: rgba(0, 212, 255, 0.5);
  background: rgba(0, 212, 255, 0.1);
}

.quick-slot:hover {
  transform: scale(1.1);
}

.quick-icon {
  font-size: 24px;
}

.quick-number {
  font-size: 14px;
  color: #666;
  font-weight: bold;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
</style>