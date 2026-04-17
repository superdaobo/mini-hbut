<template>
  <div class="game-controls">
    <div class="control-row">
      <button class="control-btn inventory-btn" @click="toggleInventory">
        <span class="btn-icon">🎒</span>
        <span class="btn-label">背包</span>
      </button>
      <div class="d-pad">
        <button class="d-btn up" @click="move(0, -1)">▲</button>
        <div class="d-middle">
          <button class="d-btn left" @click="move(-1, 0)">◀</button>
          <div class="d-center">●</div>
          <button class="d-btn right" @click="move(1, 0)">▶</button>
        </div>
        <button class="d-btn down" @click="move(0, 1)">▼</button>
      </div>
      <button class="control-btn menu-btn" @click="showHelp">
        <span class="btn-icon">❓</span>
        <span class="btn-label">帮助</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()

const emit = defineEmits(['toggle-inventory'])

const move = (dx, dy) => {
  if (gameStore.gameState === 'playing') {
    gameStore.movePlayer(dx, dy)
  }
}

const toggleInventory = () => {
  emit('toggle-inventory')
}

const showHelp = () => {
  alert('湖工大撤离 - 游戏帮助\n\n🔍 搜索：移动到物资格自动拾取\n⚔️ 战斗：遭遇敌人自动进入战斗\n🚁 撤离：击败3个敌人后到达撤离点\n\n💡 提示：\n- 使用背包中的药品恢复生命\n- 击败敌人获得经验和装备\n- 合理规划路线，不要贪战！')
}
</script>

<style scoped>
.game-controls {
  background: rgba(0,0,0,0.5);
  padding: 15px;
  border-top: 2px solid rgba(233,69,96,0.3);
}

.control-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.control-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 10px 15px;
  background: rgba(255,255,255,0.1);
  border: 2px solid rgba(255,255,255,0.2);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.control-btn:hover {
  background: rgba(233,69,96,0.3);
  border-color: rgba(233,69,96,0.5);
  transform: scale(1.05);
}

.control-btn:active {
  transform: scale(0.95);
}

.btn-icon {
  font-size: 24px;
}

.btn-label {
  font-size: 12px;
  color: #888;
}

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
  width: 50px;
  height: 50px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #2a2a4a 0%, #1a1a2e 100%);
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.1s ease;
  box-shadow: 0 4px 10px rgba(0,0,0,0.3);
  border: 2px solid rgba(233,69,96,0.3);
}

.d-btn:hover {
  background: linear-gradient(135deg, #e94560 0%, #ff6b6b 100%);
  transform: scale(1.1);
}

.d-btn:active {
  transform: scale(0.95);
  box-shadow: 0 2px 5px rgba(0,0,0,0.3);
}

.d-center {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #e94560;
  font-size: 16px;
}

@media (max-width: 380px) {
  .d-btn {
    width: 45px;
    height: 45px;
    font-size: 18px;
  }
  
  .control-btn {
    padding: 8px 12px;
  }
  
  .btn-icon {
    font-size: 20px;
  }
}
</style>