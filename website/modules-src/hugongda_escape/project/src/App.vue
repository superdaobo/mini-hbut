<template>
  <div class="game-wrapper">
    <!-- 动态背景 -->
    <div class="bg-animation">
      <div class="grid-overlay"></div>
      <div class="particles"></div>
    </div>
    
    <!-- 主游戏容器 -->
    <div class="game-container">
      <!-- 菜单界面 -->
      <MainMenu v-if="gameState === 'menu'" />
      
      <!-- 职业选择 -->
      <ClassSelect v-else-if="gameState === 'class-select'" />
      
      <!-- 游戏主界面 -->
      <template v-else-if="gameState === 'playing'">
        <TopBar />
        <IsoMap />
        <BottomControls />
        <GameLog />
      </template>
      
      <!-- 战斗界面 -->
      <BattleSystem v-else-if="gameState === 'battle'" />
      
      <!-- 游戏结束 -->
      <GameEnd v-else-if="['gameover', 'victory'].includes(gameState)" />
    </div>
    
    <!-- 全局特效层 -->
    <div class="effects-layer" ref="effectsLayer"></div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useGameStore } from './stores/gameStore'
import MainMenu from './components/MainMenu.vue'
import ClassSelect from './components/ClassSelect.vue'
import TopBar from './components/TopBar.vue'
import IsoMap from './components/IsoMap.vue'
import BottomControls from './components/BottomControls.vue'
import GameLog from './components/GameLog.vue'
import BattleSystem from './components/BattleSystem.vue'
import GameEnd from './components/GameEnd.vue'

const gameStore = useGameStore()
const gameState = computed(() => gameStore.gameState)
</script>

<style scoped>
.game-wrapper {
  width: 100vw;
  height: 100vh;
  background: #0a0a0f;
  position: relative;
  overflow: hidden;
}

.bg-animation {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.grid-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    linear-gradient(rgba(0, 212, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 212, 255, 0.03) 1px, transparent 1px);
  background-size: 50px 50px;
  animation: gridMove 20s linear infinite;
}

@keyframes gridMove {
  0% { transform: perspective(500px) rotateX(60deg) translateY(0); }
  100% { transform: perspective(500px) rotateX(60deg) translateY(50px); }
}

.particles {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 50% 50%, rgba(0, 212, 255, 0.1) 0%, transparent 50%);
  animation: pulse 4s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.1); }
}

.game-container {
  position: relative;
  width: 100%;
  height: 100%;
  z-index: 10;
}

.effects-layer {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1000;
}
</style>