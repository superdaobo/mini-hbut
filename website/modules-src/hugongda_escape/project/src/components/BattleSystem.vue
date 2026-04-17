<template>
  <div class="battle-system">
    <div class="battle-bg">
      <div class="scanlines"></div>
      <div class="vignette"></div>
    </div>
    
    <div class="battle-container">
      <!-- 战斗标题 -->
      <div class="battle-header">
        <div class="battle-title">
          <span class="title-icon">⚔️</span>
          <span class="title-text">战斗中</span>
        </div>
        <div class="turn-counter">
          回合 {{ combat.turn }}
        </div>
      </div>
      
      <!-- 战斗区域 -->
      <div class="battle-arena">
        <!-- 玩家侧 -->
        <div class="combatant player-side" :class="{ active: combat.currentTurn === 'player' }">
          <div class="combatant-avatar">
            <div class="avatar-bg" :style="{ background: playerClass?.color }">
              {{ playerClass?.icon }}
            </div>
            <div class="turn-indicator" v-if="combat.currentTurn === 'player'">◀ 你的回合</div>
          </div>
          
          <div class="combatant-info">
            <div class="info-name">{{ playerClass?.name }}</div>
            <div class="info-level">Lv.{{ player.level }}</div>
          </div>
          
          <div class="combatant-stats">
            <div class="stat-bar hp-bar">
              <div class="bar-fill" :style="{ width: playerHpPercent + '%' }"></div>
              <span class="bar-text">{{ player.hp }}/{{ player.maxHp }}</span>
            </div>
            
            <div class="action-points">
              <div 
                v-for="n in combat.maxActionPoints" 
                :key="n"
                class="action-point"
                :class="{ available: n <= combat.actionPoints }"
              ></div>
            </div>
          </div>
        </div>
        
        <!-- VS -->
        <div class="vs-divider">
          <span class="vs-text">VS</span>
        </div>
        
        <!-- 敌人侧 -->
        <div 
          v-for="(enemy, index) in combat.enemies" 
          :key="enemy.id"
          class="combatant enemy-side"
          :class="{ active: combat.currentTurn === 'enemy', target: selectedTarget === index }"
          @click="selectTarget(index)"
        >
          <div class="combatant-avatar">
            <div class="avatar-bg enemy-bg">
              {{ enemy.icon }}
            </div>
            <div class="turn-indicator" v-if="combat.currentTurn === 'enemy'">敌人回合 ▶</div>
          </div>
          
          <div class="combatant-info">
            <div class="info-name">{{ enemy.name }}</div>
            <div class="info-type" v-if="enemy.boss">BOSS</div>
          </div>
          
          <div class="combatant-stats">
            <div class="stat-bar hp-bar enemy-hp">
              <div class="bar-fill" :style="{ width: (enemy.hp / enemy.maxHp * 100) + '%' }"></div>
              <span class="bar-text">{{ enemy.hp }}/{{ enemy.maxHp }}</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 战斗控制 -->
      <div class="battle-controls" v-if="combat.currentTurn === 'player'">
        <button 
          class="control-btn attack-btn"
          :disabled="combat.actionPoints <= 0"
          @click="performAttack"
        >
          <span class="btn-icon">⚔️</span>
          <span class="btn-text">攻击</span>
          <span class="btn-cost">-1 AP</span>
        </button>
        
        <button 
          class="control-btn skill-btn"
          :disabled="combat.actionPoints <= 0 || !hasSkill"
          @click="useSkill"
        >
          <span class="btn-icon">✨</span>
          <span class="btn-text">技能</span>
          <span class="btn-cost">-1 AP</span>
        </button>
        
        <button 
          class="control-btn item-btn"
          @click="useItem"
        >
          <span class="btn-icon">🎒</span>
          <span class="btn-text">物品</span>
        </button>
        
        <button 
          class="control-btn defend-btn"
          :disabled="combat.actionPoints <= 0"
          @click="defend"
        >
          <span class="btn-icon">🛡️</span>
          <span class="btn-text">防御</span>
          <span class="btn-cost">-1 AP</span>
        </button>
      </div>
      
      <!-- 等待提示 -->
      <div class="waiting-message" v-else>
        <div class="waiting-spinner"></div>
        <span>敌人行动中...</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const player = computed(() => gameStore.player)
const playerClass = computed(() => gameStore.classes[player.value.class])
const combat = computed(() => gameStore.combat)
const hasSkill = computed(() => player.value.skills.length > 0)

const selectedTarget = ref(0)

const playerHpPercent = computed(() => (player.value.hp / player.value.maxHp) * 100)

const selectTarget = (index) => {
  if (index < combat.value.enemies.length) {
    selectedTarget.value = index
  }
}

const performAttack = () => {
  gameStore.combatAttack(selectedTarget.value)
}

const useSkill = () => {
  // TODO: 实现技能系统
  alert('技能系统开发中...')
}

const useItem = () => {
  const consumables = gameStore.inventory.filter(item => item.type === 'consumable')
  if (consumables.length === 0) {
    alert('没有可用的消耗品！')
    return
  }
  
  const itemNames = consumables.map((item, idx) => `${idx + 1}. ${item.name}`).join('\n')
  const choice = prompt(`选择要使用的物品（输入编号）：\n${itemNames}`)
  
  if (choice) {
    const index = parseInt(choice) - 1
    if (index >= 0 && index < consumables.length) {
      // 找到物品在原始inventory中的索引
      const originalIndex = gameStore.inventory.findIndex(item => item === consumables[index])
      if (originalIndex !== -1) {
        gameStore.useItem(originalIndex)
      }
    }
  }
}

const defend = () => {
  // TODO: 实现防御
  gameStore.addLog('进入防御姿态，本回合受到伤害减少50%')
  combat.value.actionPoints--
  if (combat.value.actionPoints <= 0) {
    // TODO: 结束玩家回合
  }
}
</script>

<style scoped>
.battle-system {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, #1a0f1f 0%, #0f0f1a 100%);
  z-index: 200;
  display: flex;
  flex-direction: column;
}

.battle-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
}

.scanlines {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.1),
    rgba(0, 0, 0, 0.1) 1px,
    transparent 1px,
    transparent 2px
  );
  pointer-events: none;
}

.vignette {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.6) 100%);
  pointer-events: none;
}

.battle-container {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
}

.battle-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.battle-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-icon {
  font-size: 28px;
}

.title-text {
  font-size: 24px;
  font-weight: 700;
  color: #ff3366;
  text-shadow: 0 0 20px rgba(255, 51, 102, 0.5);
}

.turn-counter {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  font-size: 14px;
  color: #888;
}

.battle-arena {
  flex: 1;
  display: flex;
  justify-content: space-around;
  align-items: center;
  gap: 40px;
}

.combatant {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
  padding: 30px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 20px;
  border: 2px solid transparent;
  transition: all 0.3s ease;
  min-width: 150px;
}

.combatant.active {
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 0 0 30px rgba(255, 255, 255, 0.1);
}

.combatant.target {
  border-color: #ff3366;
  box-shadow: 0 0 30px rgba(255, 51, 102, 0.3);
}

.combatant-avatar {
  position: relative;
}

.avatar-bg {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 50px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.avatar-bg.enemy-bg {
  background: linear-gradient(135deg, #ff3366 0%, #cc0066 100%);
}

.turn-indicator {
  position: absolute;
  bottom: -25px;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 12px;
  color: #00d4ff;
  font-weight: 600;
}

.combatant-info {
  text-align: center;
}

.info-name {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 5px;
}

.info-level, .info-type {
  font-size: 12px;
  color: #888;
}

.info-type {
  color: #ff3366;
  font-weight: 700;
}

.combatant-stats {
  width: 100%;
}

.stat-bar {
  position: relative;
  height: 24px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 10px;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #00d4ff 0%, #0099cc 100%);
  transition: width 0.3s ease;
}

.hp-bar.enemy-hp .bar-fill {
  background: linear-gradient(90deg, #ff3366 0%, #cc0066 100%);
}

.bar-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  color: white;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.action-points {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.action-point {
  width: 16px;
  height: 16px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  transition: all 0.3s ease;
}

.action-point.available {
  background: #00d4ff;
  box-shadow: 0 0 10px rgba(0, 212, 255, 0.8);
}

.vs-divider {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.vs-text {
  font-size: 36px;
  font-weight: 900;
  background: linear-gradient(135deg, #ffd700 0%, #ffaa00 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 0 30px rgba(255, 215, 0, 0.5);
  animation: pulse 2s ease-in-out infinite;
}

.battle-controls {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 15px;
  padding: 20px;
}

.control-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.control-btn:hover:not(:disabled) {
  transform: translateY(-3px);
  background: rgba(255, 255, 255, 0.15);
}

.control-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.attack-btn {
  background: rgba(255, 51, 102, 0.2);
  border-color: rgba(255, 51, 102, 0.4);
}

.attack-btn:hover:not(:disabled) {
  background: rgba(255, 51, 102, 0.3);
  box-shadow: 0 10px 30px rgba(255, 51, 102, 0.3);
}

.skill-btn {
  background: rgba(138, 43, 226, 0.2);
  border-color: rgba(138, 43, 226, 0.4);
}

.item-btn {
  background: rgba(0, 212, 255, 0.2);
  border-color: rgba(0, 212, 255, 0.4);
}

.defend-btn {
  background: rgba(50, 205, 50, 0.2);
  border-color: rgba(50, 205, 50, 0.4);
}

.btn-icon {
  font-size: 28px;
}

.btn-text {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.btn-cost {
  font-size: 11px;
  color: #888;
}

.waiting-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
  padding: 40px;
  color: #888;
  font-size: 18px;
}

.waiting-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 51, 102, 0.3);
  border-top-color: #ff3366;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.8; }
}
</style>