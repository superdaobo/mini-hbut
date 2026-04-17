<template>
  <div class="battle-scene">
    <div class="battle-header">
      <h2>⚔️ 战斗开始</h2>
      <div class="turn-indicator" :class="battleTurn">
        {{ battleTurn === 'player' ? '你的回合' : '敌人回合' }}
      </div>
    </div>
    
    <div class="battle-arena">
      <div class="combatant player-side">
        <div class="avatar">🎮</div>
        <div class="info">
          <div class="name">你</div>
          <div class="hp-bar">
            <div class="hp-fill" :style="{ width: playerHpPercent + '%' }"></div>
            <span class="hp-text">{{ player.hp }}/{{ player.maxHp }}</span>
          </div>
          <div class="stats">
            <span>⚔️ {{ player.attack }}</span>
            <span>🛡️ {{ player.defense }}</span>
          </div>
        </div>
      </div>
      
      <div class="vs">VS</div>
      
      <div class="combatant enemy-side" v-if="currentEnemy">
        <div class="avatar">{{ currentEnemy.icon }}</div>
        <div class="info">
          <div class="name">{{ currentEnemy.name }}</div>
          <div class="hp-bar">
            <div class="hp-fill enemy-hp" :style="{ width: enemyHpPercent + '%' }"></div>
            <span class="hp-text">{{ currentEnemy.hp }}/{{ currentEnemy.maxHp }}</span>
          </div>
          <div class="stats">
            <span>⚔️ {{ currentEnemy.attack }}</span>
            <span>🛡️ {{ currentEnemy.defense }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <div class="battle-log">
      <div v-for="(log, index) in battleLog" :key="index" class="log-entry">
        {{ log }}
      </div>
    </div>
    
    <div class="battle-controls">
      <button 
        class="action-btn attack" 
        @click="attack"
        :disabled="battleTurn !== 'player'"
      >
        ⚔️ 攻击
      </button>
      <button 
        class="action-btn item" 
        @click="useItem"
        :disabled="battleTurn !== 'player' || !hasConsumable"
      >
        💊 使用药品
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const player = computed(() => gameStore.player)
const currentEnemy = computed(() => gameStore.currentEnemy)
const battleTurn = computed(() => gameStore.battleTurn)
const battleLog = computed(() => gameStore.battleLog)
const inventory = computed(() => gameStore.inventory)

const playerHpPercent = computed(() => (player.value.hp / player.value.maxHp) * 100)
const enemyHpPercent = computed(() => currentEnemy.value ? (currentEnemy.value.hp / currentEnemy.value.maxHp) * 100 : 0)

const hasConsumable = computed(() => inventory.value.some(item => item.type === 'consumable'))

const attack = () => {
  gameStore.playerAttack()
}

const useItem = () => {
  const index = inventory.value.findIndex(item => item.type === 'consumable')
  if (index !== -1) {
    gameStore.useItem(index)
  }
}
</script>

<style scoped>
.battle-scene {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 15px;
  background: linear-gradient(180deg, #2a1a3e 0%, #1a1a2e 100%);
}

.battle-header {
  text-align: center;
  margin-bottom: 20px;
}

.battle-header h2 {
  color: #e94560;
  font-size: 24px;
  margin-bottom: 10px;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
}

.turn-indicator {
  display: inline-block;
  padding: 8px 20px;
  border-radius: 20px;
  font-weight: bold;
  font-size: 14px;
  transition: all 0.3s ease;
}

.turn-indicator.player {
  background: linear-gradient(135deg, #00d9ff 0%, #00ff88 100%);
  color: #000;
  animation: glow 1.5s infinite;
}

.turn-indicator.enemy {
  background: linear-gradient(135deg, #ff4444 0%, #ff0000 100%);
  color: #fff;
}

.battle-arena {
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 20px 0;
}

.combatant {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.avatar {
  font-size: 60px;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
  animation: float 3s ease-in-out infinite;
}

.enemy-side .avatar {
  animation: enemyFloat 3s ease-in-out infinite;
}

.info {
  text-align: center;
  min-width: 120px;
}

.name {
  color: #fff;
  font-weight: bold;
  font-size: 16px;
  margin-bottom: 5px;
}

.hp-bar {
  position: relative;
  height: 20px;
  background: rgba(0,0,0,0.5);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 5px;
}

.hp-fill {
  height: 100%;
  background: linear-gradient(90deg, #00d9ff 0%, #00ff88 100%);
  transition: width 0.3s ease;
}

.hp-fill.enemy-hp {
  background: linear-gradient(90deg, #ff4444 0%, #ff0000 100%);
}

.hp-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-size: 11px;
  font-weight: bold;
  text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
}

.stats {
  display: flex;
  justify-content: center;
  gap: 10px;
  color: #888;
  font-size: 12px;
}

.vs {
  font-size: 32px;
  font-weight: bold;
  color: #e94560;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
  animation: pulse 1s infinite;
}

.battle-log {
  flex: 1;
  background: rgba(0,0,0,0.3);
  border-radius: 10px;
  padding: 15px;
  margin: 15px 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column-reverse;
}

.log-entry {
  color: #ccc;
  font-size: 13px;
  padding: 5px 0;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.log-entry:first-child {
  color: #ffd700;
  font-weight: bold;
}

.battle-controls {
  display: flex;
  gap: 15px;
  justify-content: center;
}

.action-btn {
  flex: 1;
  max-width: 150px;
  padding: 15px 20px;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 15px rgba(0,0,0,0.3);
}

.action-btn.attack {
  background: linear-gradient(135deg, #e94560 0%, #ff6b6b 100%);
  color: white;
}

.action-btn.item {
  background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
  color: white;
}

.action-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0,0,0,0.4);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

@keyframes enemyFloat {
  0%, 100% { transform: translateY(0) scaleX(-1); }
  50% { transform: translateY(-5px) scaleX(-1); }
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

@keyframes glow {
  0%, 100% { box-shadow: 0 0 10px rgba(0,217,255,0.5); }
  50% { box-shadow: 0 0 25px rgba(0,217,255,0.8); }
}
</style>