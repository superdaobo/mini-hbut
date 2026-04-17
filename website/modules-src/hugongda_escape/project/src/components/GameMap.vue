<template>
  <div class="map-container">
    <div class="map-grid" :style="gridStyle">
      <div
        v-for="cell in flattenedMap"
        :key="`${cell.x}-${cell.y}`"
        class="cell"
        :class="{
          'revealed': cell.revealed,
          'player': isPlayer(cell),
          'exit': cell.type === 'exit',
          'enemy': cell.type === 'enemy' && cell.revealed,
          'item': cell.type === 'item' && cell.revealed,
          'obstacle': cell.type === 'obstacle' && cell.revealed
        }"
        @click="handleCellClick(cell)"
      >
        <div class="cell-content" v-if="cell.revealed || isPlayer(cell)">
          <span v-if="isPlayer(cell)" class="icon player-icon">🎮</span>
          <span v-else-if="cell.type === 'exit'" class="icon">🚁</span>
          <span v-else-if="cell.type === 'enemy'" class="icon enemy-icon">{{ cell.enemy?.icon || '👤' }}</span>
          <span v-else-if="cell.type === 'item'" class="icon item-icon">{{ cell.content?.icon || '📦' }}</span>
          <span v-else-if="cell.type === 'obstacle'" class="icon">🚧</span>
          <span v-else class="icon">·</span>
        </div>
        <div v-else class="fog">?</div>
      </div>
    </div>
    <div class="legend">
      <div class="legend-item">
        <span class="dot exit"></span>
        <span>撤离点</span>
      </div>
      <div class="legend-item">
        <span class="dot enemy"></span>
        <span>敌人</span>
      </div>
      <div class="legend-item">
        <span class="dot item"></span>
        <span>物资</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const mapData = computed(() => gameStore.mapData)
const mapSize = computed(() => gameStore.mapSize)
const player = computed(() => gameStore.player)

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${mapSize.value}, 1fr)`,
  gridTemplateRows: `repeat(${mapSize.value}, 1fr)`
}))

const flattenedMap = computed(() => {
  const flat = []
  for (let y = 0; y < mapSize.value; y++) {
    for (let x = 0; x < mapSize.value; x++) {
      flat.push(mapData.value[y][x])
    }
  }
  return flat
})

const isPlayer = (cell) => cell.x === player.value.x && cell.y === player.value.y

const handleCellClick = (cell) => {
  const dx = cell.x - player.value.x
  const dy = cell.y - player.value.y
  
  // 只允许相邻移动（上下左右，不包括对角线）
  if (Math.abs(dx) + Math.abs(dy) === 1) {
    gameStore.movePlayer(dx, dy)
  }
}
</script>

<style scoped>
.map-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 10px;
  overflow: hidden;
}

.map-grid {
  display: grid;
  gap: 2px;
  background: rgba(0,0,0,0.3);
  padding: 5px;
  border-radius: 10px;
  flex: 1;
  max-height: calc(100vw - 20px);
}

.cell {
  aspect-ratio: 1;
  background: rgba(30,30,50,0.8);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  border: 1px solid rgba(255,255,255,0.1);
}

.cell.revealed {
  background: rgba(50,50,70,0.9);
  border-color: rgba(255,255,255,0.2);
}

.cell.player {
  background: linear-gradient(135deg, #e94560 0%, #ff6b6b 100%);
  box-shadow: 0 0 10px rgba(233,69,96,0.5);
  animation: pulse 1.5s infinite;
}

.cell.exit {
  background: linear-gradient(135deg, #00d9ff 0%, #00ff88 100%);
  box-shadow: 0 0 8px rgba(0,217,255,0.4);
}

.cell.enemy {
  background: rgba(139,0,0,0.6);
  border-color: #ff4444;
}

.cell.item {
  background: rgba(255,215,0,0.3);
  border-color: #ffd700;
  animation: glow 2s infinite;
}

.cell.obstacle {
  background: rgba(50,50,50,0.9);
  cursor: not-allowed;
}

.cell-content {
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.player-icon {
  font-size: 24px;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
}

.enemy-icon {
  filter: drop-shadow(0 0 5px rgba(255,0,0,0.5));
}

.item-icon {
  animation: bounce 1s infinite;
}

.fog {
  color: #444;
  font-size: 16px;
  font-weight: bold;
}

.legend {
  display: flex;
  justify-content: center;
  gap: 20px;
  padding: 10px;
  color: #888;
  font-size: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.dot.exit { background: #00d9ff; }
.dot.enemy { background: #ff4444; }
.dot.item { background: #ffd700; }

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

@keyframes glow {
  0%, 100% { box-shadow: 0 0 5px rgba(255,215,0,0.5); }
  50% { box-shadow: 0 0 15px rgba(255,215,0,0.8); }
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
</style>