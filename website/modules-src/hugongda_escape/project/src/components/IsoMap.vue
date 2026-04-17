<template>
  <div class="iso-map-container" ref="mapContainer">
    <div 
      class="iso-world"
      :style="worldTransform"
    >
      <!-- 地图格子 -->
      <div 
        v-for="cell in visibleCells"
        :key="`${cell.x}-${cell.y}`"
        class="iso-cell"
        :class="[
          cell.type,
          { 
            revealed: cell.revealed,
            player: isPlayer(cell),
            'has-enemy': cell.enemy && cell.revealed,
            'has-item': cell.content && cell.revealed,
            adjacent: isAdjacent(cell)
          }
        ]"
        :style="getCellStyle(cell)"
        @click="handleCellClick(cell)"
      >
        <!-- 地形基础 -->
        <div class="cell-base">
          <div class="cell-top" :style="{ background: getTerrainColor(cell.type) }"></div>
          <div class="cell-left" :style="{ background: getTerrainSideColor(cell.type, 'left') }"></div>
          <div class="cell-right" :style="{ background: getTerrainSideColor(cell.type, 'right') }"></div>
        </div>
        
        <!-- 内容层 -->
        <div class="cell-content" v-if="cell.revealed || isPlayer(cell)">
          <!-- 玩家 -->
          <div v-if="isPlayer(cell)" class="entity player-entity">
            <div class="entity-shadow"></div>
            <div class="entity-sprite">🎮</div>
            <div class="entity-glow"></div>
          </div>
          
          <!-- 敌人 -->
          <div v-else-if="cell.enemy" class="entity enemy-entity">
            <div class="entity-shadow"></div>
            <div class="entity-sprite">{{ cell.enemy.icon }}</div>
            <div class="enemy-hp-bar" v-if="cell.enemy.hp < cell.enemy.maxHp">
              <div class="hp-fill" :style="{ width: (cell.enemy.hp / cell.enemy.maxHp * 100) + '%' }"></div>
            </div>
          </div>
          
          <!-- 物品 -->
          <div v-else-if="cell.content" class="entity item-entity">
            <div class="item-glow"></div>
            <div class="entity-sprite">{{ cell.content.icon }}</div>
          </div>
          
          <!-- 撤离点 -->
          <div v-else-if="cell.type === 'exit'" class="entity exit-entity">
            <div class="exit-glow"></div>
            <div class="entity-sprite">🚁</div>
            <div class="exit-label">EXIT</div>
          </div>
        </div>
        
        <!-- 迷雾 -->
        <div v-if="!cell.revealed && !isPlayer(cell)" class="fog-overlay">
          <span class="fog-icon">?</span>
        </div>
        
        <!-- 可移动指示 -->
        <div v-if="isAdjacent(cell) && !cell.enemy && cell.revealed" class="move-indicator"></div>
      </div>
    </div>
    
    <!-- 迷你地图 -->
    <div class="minimap">
      <div class="minimap-content">
        <div 
          v-for="cell in allCells"
          :key="`mini-${cell.x}-${cell.y}`"
          class="minimap-cell"
          :class="{ 
            revealed: cell.revealed,
            player: isPlayer(cell),
            exit: cell.type === 'exit'
          }"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const mapData = computed(() => gameStore.mapData)
const mapSize = computed(() => gameStore.mapSize)
const player = computed(() => gameStore.player)

// 等距投影参数
const TILE_WIDTH = 60
const TILE_HEIGHT = 30

// 计算世界偏移（居中玩家）
const worldTransform = computed(() => {
  const playerIsoX = (player.value.x - player.value.y) * TILE_WIDTH / 2
  const playerIsoY = (player.value.x + player.value.y) * TILE_HEIGHT / 2
  
  return {
    transform: `translate(calc(50vw - ${playerIsoX}px - ${TILE_WIDTH / 2}px), calc(50vh - ${playerIsoY}px - 100px))`
  }
})

// 所有格子（用于迷你地图）
const allCells = computed(() => {
  const cells = []
  for (let y = 0; y < mapSize.value.height; y++) {
    for (let x = 0; x < mapSize.value.width; x++) {
      cells.push(mapData.value[y][x])
    }
  }
  return cells
})

// 可见格子（优化性能）
const visibleCells = computed(() => {
  return allCells.value
})

const isPlayer = (cell) => cell.x === player.value.x && cell.y === player.value.y

const isAdjacent = (cell) => {
  const dx = Math.abs(cell.x - player.value.x)
  const dy = Math.abs(cell.y - player.value.y)
  return dx + dy === 1
}

const getCellStyle = (cell) => {
  const isoX = (cell.x - cell.y) * TILE_WIDTH / 2
  const isoY = (cell.x + cell.y) * TILE_HEIGHT / 2
  
  return {
    transform: `translate(${isoX}px, ${isoY}px)`,
    zIndex: cell.x + cell.y
  }
}

const getTerrainColor = (type) => {
  const colors = {
    floor: '#3a3a5c',
    wall: '#5c5c7a',
    cover: '#4a5568',
    bush: '#2d5016',
    exit: '#00d4ff'
  }
  return colors[type] || colors.floor
}

const getTerrainSideColor = (type, side) => {
  const base = getTerrainColor(type)
  return side === 'left' ? darken(base, 20) : darken(base, 40)
}

const darken = (color, percent) => {
  // 简化版颜色加深
  return color
}

const handleCellClick = (cell) => {
  const dx = cell.x - player.value.x
  const dy = cell.y - player.value.y
  
  if (Math.abs(dx) + Math.abs(dy) === 1) {
    gameStore.movePlayer(dx, dy)
  }
}
</script>

<style scoped>
.iso-map-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: radial-gradient(circle at center, #1a1a2e 0%, #0a0a0f 100%);
}

.iso-world {
  position: absolute;
  width: 0;
  height: 0;
  transition: transform 0.3s ease-out;
}

.iso-cell {
  position: absolute;
  width: 60px;
  height: 60px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cell-base {
  position: absolute;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
}

.cell-top {
  position: absolute;
  width: 60px;
  height: 30px;
  transform: rotateX(60deg) rotateZ(45deg);
  left: 0;
  top: 15px;
  border-radius: 4px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
}

.cell-left, .cell-right {
  position: absolute;
  width: 30px;
  height: 30px;
  display: none; /* 简化版，不显示侧面 */
}

.cell-content {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.entity {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.entity-shadow {
  position: absolute;
  bottom: -5px;
  width: 40px;
  height: 15px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 50%;
  filter: blur(3px);
}

.entity-sprite {
  font-size: 32px;
  z-index: 10;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
}

.player-entity .entity-sprite {
  animation: bounce 1s ease-in-out infinite;
}

.player-entity .entity-glow {
  position: absolute;
  width: 50px;
  height: 50px;
  background: radial-gradient(circle, rgba(0, 212, 255, 0.4) 0%, transparent 70%);
  border-radius: 50%;
  animation: pulse 2s ease-in-out infinite;
}

.enemy-entity .entity-sprite {
  filter: drop-shadow(0 0 8px rgba(255, 51, 102, 0.8));
}

.enemy-hp-bar {
  position: absolute;
  bottom: -10px;
  width: 40px;
  height: 4px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 2px;
  overflow: hidden;
}

.hp-fill {
  height: 100%;
  background: #ff3366;
  transition: width 0.3s ease;
}

.item-entity .entity-sprite {
  font-size: 24px;
  animation: float 2s ease-in-out infinite;
}

.item-glow {
  position: absolute;
  width: 30px;
  height: 30px;
  background: radial-gradient(circle, rgba(255, 215, 0, 0.5) 0%, transparent 70%);
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

.exit-entity .entity-sprite {
  font-size: 36px;
  animation: helicopter 2s ease-in-out infinite;
}

.exit-glow {
  position: absolute;
  width: 60px;
  height: 60px;
  background: radial-gradient(circle, rgba(0, 212, 255, 0.5) 0%, transparent 60%);
  border-radius: 50%;
  animation: pulse 1s ease-in-out infinite;
}

.exit-label {
  position: absolute;
  bottom: -20px;
  font-size: 10px;
  color: #00d4ff;
  font-weight: bold;
  text-shadow: 0 0 10px rgba(0, 212, 255, 0.8);
}

.fog-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(10, 10, 15, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.fog-icon {
  font-size: 20px;
  color: #444;
  font-weight: bold;
}

.move-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
  border: 2px solid rgba(0, 212, 255, 0.6);
  border-radius: 50%;
  animation: pulse 1s ease-in-out infinite;
  pointer-events: none;
}

/* 迷你地图 */
.minimap {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 120px;
  height: 120px;
  background: rgba(0, 0, 0, 0.7);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 10px;
}

.minimap-content {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  grid-template-rows: repeat(10, 1fr);
  gap: 1px;
  width: 100%;
  height: 100%;
}

.minimap-cell {
  background: #222;
  border-radius: 1px;
}

.minimap-cell.revealed {
  background: #444;
}

.minimap-cell.player {
  background: #00d4ff;
  box-shadow: 0 0 4px #00d4ff;
}

.minimap-cell.exit {
  background: #ff3366;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

@keyframes pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.1); }
}

@keyframes helicopter {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25% { transform: translateY(-3px) rotate(-5deg); }
  75% { transform: translateY(-3px) rotate(5deg); }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
</style>