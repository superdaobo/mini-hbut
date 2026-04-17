<template>
  <div class="class-select">
    <h2 class="section-title">选择你的职业</h2>
    <p class="section-subtitle">不同职业有不同的优势和玩法</p>
    
    <div class="class-grid">
      <div 
        v-for="(cls, id) in classes" 
        :key="id"
        class="class-card"
        :class="{ selected: selectedClass === id }"
        :style="{ borderColor: selectedClass === id ? cls.color : 'transparent' }"
        @click="selectedClass = id"
      >
        <div class="class-icon" :style="{ background: cls.color }">
          {{ cls.icon }}
        </div>
        <h3 class="class-name">{{ cls.name }}</h3>
        <p class="class-desc">{{ cls.desc }}</p>
        
        <div class="class-stats">
          <div class="stat-bar">
            <span class="stat-label">生命</span>
            <div class="stat-progress">
              <div class="stat-fill" :style="{ width: (cls.stats.hp / 150 * 100) + '%', background: cls.color }"></div>
            </div>
            <span class="stat-value">{{ cls.stats.hp }}</span>
          </div>
          <div class="stat-bar">
            <span class="stat-label">攻击</span>
            <div class="stat-progress">
              <div class="stat-fill" :style="{ width: (cls.stats.attack / 40 * 100) + '%', background: cls.color }"></div>
            </div>
            <span class="stat-value">{{ cls.stats.attack }}</span>
          </div>
          <div class="stat-bar">
            <span class="stat-label">防御</span>
            <div class="stat-progress">
              <div class="stat-fill" :style="{ width: (cls.stats.defense / 25 * 100) + '%', background: cls.color }"></div>
            </div>
            <span class="stat-value">{{ cls.stats.defense }}</span>
          </div>
          <div class="stat-bar">
            <span class="stat-label">命中</span>
            <div class="stat-progress">
              <div class="stat-fill" :style="{ width: cls.stats.accuracy + '%', background: cls.color }"></div>
            </div>
            <span class="stat-value">{{ cls.stats.accuracy }}%</span>
          </div>
        </div>
        
        <div class="skills-preview">
          <div class="skill-tag" v-for="(skill, idx) in cls.skills" :key="idx">
            {{ skill.name }}
          </div>
        </div>
      </div>
    </div>
    
    <div class="action-buttons">
      <button class="back-btn" @click="gameStore.gameState = 'menu'">
        ← 返回
      </button>
      <button 
        class="confirm-btn" 
        :disabled="!selectedClass"
        @click="confirmSelection"
      >
        确认选择
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const classes = gameStore.classes
const selectedClass = ref(null)

const confirmSelection = () => {
  if (selectedClass.value) {
    gameStore.selectClass(selectedClass.value)
    gameStore.startGame()
  }
}
</script>

<style scoped>
.class-select {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 30px 20px;
  background: linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 100%);
}

.section-title {
  text-align: center;
  font-size: 32px;
  color: #fff;
  margin-bottom: 10px;
  text-shadow: 0 0 20px rgba(0, 212, 255, 0.5);
}

.section-subtitle {
  text-align: center;
  color: #888;
  font-size: 14px;
  margin-bottom: 30px;
}

.class-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 15px;
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.class-card {
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid transparent;
  border-radius: 16px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.class-card:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateY(-5px);
}

.class-card.selected {
  background: rgba(255, 255, 255, 0.15);
  box-shadow: 0 0 30px rgba(255, 255, 255, 0.1);
}

.class-icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  margin: 0 auto 15px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
}

.class-name {
  text-align: center;
  color: #fff;
  font-size: 20px;
  margin-bottom: 8px;
}

.class-desc {
  text-align: center;
  color: #888;
  font-size: 12px;
  margin-bottom: 20px;
}

.class-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stat-label {
  width: 40px;
  color: #666;
  font-size: 11px;
}

.stat-progress {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.stat-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.stat-value {
  width: 35px;
  text-align: right;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}

.skills-preview {
  display: flex;
  gap: 8px;
  margin-top: 15px;
  flex-wrap: wrap;
}

.skill-tag {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  font-size: 11px;
  color: #ccc;
}

.action-buttons {
  display: flex;
  justify-content: space-between;
  gap: 15px;
  margin-top: 20px;
}

.back-btn {
  padding: 15px 30px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  color: #ccc;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.confirm-btn {
  flex: 1;
  padding: 15px 30px;
  background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
  border: none;
  border-radius: 10px;
  color: white;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 5px 20px rgba(0, 212, 255, 0.3);
}

.confirm-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 212, 255, 0.5);
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>