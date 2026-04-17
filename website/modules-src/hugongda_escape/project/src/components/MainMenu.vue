<template>
  <div class="main-menu">
    <div class="logo-container">
      <div class="logo-icon">🎮</div>
      <h1 class="game-title">
        <span class="title-main">湖工大</span>
        <span class="title-sub">撤离</span>
      </h1>
      <div class="version-badge">PRO v2.0</div>
    </div>
    
    <div class="features-showcase">
      <div class="feature-card" v-for="(feature, index) in features" :key="index">
        <div class="feature-icon">{{ feature.icon }}</div>
        <div class="feature-text">{{ feature.text }}</div>
      </div>
    </div>
    
    <div class="menu-buttons">
      <button class="menu-btn primary" @click="startGame">
        <span class="btn-icon">⚡</span>
        <span class="btn-text">开始行动</span>
        <div class="btn-glow"></div>
      </button>
      
      <button class="menu-btn secondary" @click="showTutorial">
        <span class="btn-icon">📖</span>
        <span class="btn-text">新手教程</span>
      </button>
    </div>
    
    <div class="stats-preview">
      <div class="stat-item">
        <div class="stat-value">{{ totalRuns }}</div>
        <div class="stat-label">行动次数</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ successRate }}%</div>
        <div class="stat-label">成功率</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()

const features = [
  { icon: '⚔️', text: '战术战斗' },
  { icon: '🎯', text: '2.5D视角' },
  { icon: '🎒', text: '丰富装备' },
  { icon: '🏆', text: '永久成长' }
]

const totalRuns = ref(0)
const successRate = ref(0)

const startGame = () => {
  gameStore.gameState = 'class-select'
}

const showTutorial = () => {
  alert(`【湖工大撤离Pro - 新手教程】

🎮 基础操作：
• 点击方向键或地图相邻格子移动
• 发现敌人自动进入战斗
• 移动到物品格自动拾取

⚔️ 战斗系统：
• 每回合有2个行动点
• 可选择攻击、使用物品或技能
• 注意命中率、暴击率和闪避

🏆 胜利条件：
• 击败至少3个敌人
• 到达地图右下角的撤离点（🚁）

💡 提示：
• 不同职业有不同优势
• 合理规划路线，避免被多个敌人围攻
• 善用掩体和地形优势`)
}
</script>

<style scoped>
.main-menu {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background: radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0f 100%);
}

.logo-container {
  text-align: center;
  margin-bottom: 40px;
}

.logo-icon {
  font-size: 60px;
  margin-bottom: 10px;
  animation: float 3s ease-in-out infinite;
}

.game-title {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
}

.title-main {
  font-size: 48px;
  font-weight: 900;
  background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 0 40px rgba(0, 212, 255, 0.5);
  letter-spacing: 8px;
}

.title-sub {
  font-size: 72px;
  font-weight: 900;
  background: linear-gradient(135deg, #ff3366 0%, #ff0066 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 12px;
  margin-top: -10px;
}

.version-badge {
  display: inline-block;
  padding: 5px 15px;
  background: rgba(0, 212, 255, 0.2);
  border: 1px solid rgba(0, 212, 255, 0.5);
  border-radius: 20px;
  color: #00d4ff;
  font-size: 12px;
  margin-top: 10px;
}

.features-showcase {
  display: flex;
  gap: 20px;
  margin-bottom: 50px;
}

.feature-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 15px 20px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  transition: all 0.3s ease;
}

.feature-card:hover {
  background: rgba(0, 212, 255, 0.1);
  border-color: rgba(0, 212, 255, 0.3);
  transform: translateY(-5px);
}

.feature-icon {
  font-size: 28px;
  margin-bottom: 5px;
}

.feature-text {
  color: #888;
  font-size: 12px;
}

.menu-buttons {
  display: flex;
  flex-direction: column;
  gap: 15px;
  width: 100%;
  max-width: 300px;
}

.menu-btn {
  position: relative;
  padding: 18px 30px;
  border: none;
  border-radius: 12px;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  overflow: hidden;
}

.menu-btn.primary {
  background: linear-gradient(135deg, #ff3366 0%, #ff0066 100%);
  color: white;
  box-shadow: 0 10px 30px rgba(255, 51, 102, 0.4);
}

.menu-btn.primary:hover {
  transform: translateY(-3px);
  box-shadow: 0 15px 40px rgba(255, 51, 102, 0.6);
}

.btn-glow {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.3) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.3s;
}

.menu-btn.primary:hover .btn-glow {
  opacity: 1;
}

.menu-btn.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.menu-btn.secondary:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.btn-icon {
  font-size: 20px;
}

.stats-preview {
  display: flex;
  gap: 40px;
  margin-top: 40px;
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #00d4ff;
}

.stat-label {
  font-size: 12px;
  color: #666;
  margin-top: 5px;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
</style>