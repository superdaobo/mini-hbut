<template>
  <div class="start-screen">
    <div class="title-section">
      <h1 class="game-title">湖工大撤离</h1>
      <p class="subtitle">搜 · 打 · 撤</p>
      <div class="title-decoration">
        <span class="deco-icon">🎮</span>
        <span class="deco-line"></span>
        <span class="deco-icon">⚔️</span>
        <span class="deco-line"></span>
        <span class="deco-icon">🏆</span>
      </div>
    </div>
    
    <div class="game-intro">
      <div class="intro-card">
        <div class="intro-icon">🔍</div>
        <div class="intro-text">
          <h3>搜索</h3>
          <p>在战场上搜寻物资、武器和装备</p>
        </div>
      </div>
      <div class="intro-card">
        <div class="intro-icon">⚔️</div>
        <div class="intro-text">
          <h3>战斗</h3>
          <p>击败敌人，掠夺战利品</p>
        </div>
      </div>
      <div class="intro-card">
        <div class="intro-icon">🚁</div>
        <div class="intro-text">
          <h3>撤离</h3>
          <p>到达撤离点，带着战利品离开</p>
        </div>
      </div>
    </div>
    
    <div class="start-btn-container">
      <button class="start-btn" @click="startGame">
        <span class="btn-text">开始行动</span>
        <span class="btn-shine"></span>
      </button>
    </div>
    
    <div class="version">v1.0.0</div>
  </div>
</template>

<script setup>
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()

const startGame = () => {
  gameStore.startGame()
}
</script>

<style scoped>
.start-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  position: relative;
  overflow: hidden;
}

.start-screen::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(233,69,96,0.1) 0%, transparent 70%);
  animation: rotate 20s linear infinite;
}

.title-section {
  text-align: center;
  margin-bottom: 30px;
  position: relative;
  z-index: 1;
}

.game-title {
  font-size: 42px;
  font-weight: bold;
  background: linear-gradient(135deg, #e94560 0%, #ff6b6b 50%, #ffd700 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 10px;
  text-shadow: 0 0 30px rgba(233,69,96,0.5);
  letter-spacing: 5px;
}

.subtitle {
  font-size: 20px;
  color: #888;
  letter-spacing: 15px;
  margin-bottom: 20px;
}

.title-decoration {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.deco-icon {
  font-size: 20px;
  animation: bounce 1.5s infinite;
}

.deco-icon:nth-child(3) { animation-delay: 0.2s; }
.deco-icon:nth-child(5) { animation-delay: 0.4s; }

.deco-line {
  width: 40px;
  height: 2px;
  background: linear-gradient(90deg, transparent, #e94560, transparent);
}

.game-intro {
  width: 100%;
  max-width: 350px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-bottom: 40px;
  position: relative;
  z-index: 1;
}

.intro-card {
  display: flex;
  align-items: center;
  gap: 15px;
  background: rgba(255,255,255,0.05);
  padding: 15px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.1);
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
}

.intro-card:hover {
  background: rgba(255,255,255,0.1);
  transform: translateX(5px);
  border-color: rgba(233,69,96,0.5);
}

.intro-icon {
  font-size: 30px;
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(233,69,96,0.2);
  border-radius: 10px;
}

.intro-text h3 {
  color: #fff;
  font-size: 16px;
  margin-bottom: 3px;
}

.intro-text p {
  color: #888;
  font-size: 13px;
}

.start-btn-container {
  position: relative;
  z-index: 1;
}

.start-btn {
  position: relative;
  padding: 18px 60px;
  font-size: 20px;
  font-weight: bold;
  color: white;
  background: linear-gradient(135deg, #e94560 0%, #ff6b6b 100%);
  border: none;
  border-radius: 30px;
  cursor: pointer;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(233,69,96,0.4);
  transition: all 0.3s ease;
}

.start-btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 15px 40px rgba(233,69,96,0.6);
}

.start-btn:active {
  transform: translateY(-1px);
}

.btn-text {
  position: relative;
  z-index: 1;
}

.btn-shine {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
  transition: left 0.5s ease;
}

.start-btn:hover .btn-shine {
  left: 100%;
}

.version {
  position: absolute;
  bottom: 20px;
  color: #555;
  font-size: 12px;
  z-index: 1;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
</style>