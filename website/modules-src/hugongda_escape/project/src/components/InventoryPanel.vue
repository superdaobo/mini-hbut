<template>
  <div class="inventory-panel" @click.self="close">
    <div class="panel-content">
      <div class="panel-header">
        <h3>🎒 背包</h3>
        <button class="close-btn" @click="close">✕</button>
      </div>
      
      <div class="inventory-grid">
        <div 
          v-for="(item, index) in inventory" 
          :key="index"
          class="item-slot"
          :class="{ 'consumable': item.type === 'consumable' }"
          @click="handleItemClick(item, index)"
        >
          <span class="item-icon">{{ item.icon }}</span>
          <span class="item-name">{{ item.name }}</span>
          <span v-if="item.type === 'consumable'" class="use-badge">点击使用</span>
        </div>
        
        <div 
          v-for="n in emptySlots" 
          :key="`empty-${n}`"
          class="item-slot empty"
        >
          <span class="empty-text">空</span>
        </div>
      </div>
      
      <div class="item-details" v-if="selectedItem">
        <div class="detail-header">
          <span class="detail-icon">{{ selectedItem.item.icon }}</span>
          <span class="detail-name">{{ selectedItem.item.name }}</span>
        </div>
        <div class="detail-stats">
          <div v-if="selectedItem.item.attack" class="stat">
            攻击力: +{{ selectedItem.item.attack }}
          </div>
          <div v-if="selectedItem.item.defense" class="stat">
            防御力: +{{ selectedItem.item.defense }}
          </div>
          <div v-if="selectedItem.item.heal" class="stat">
            恢复: {{ selectedItem.item.heal }} HP
          </div>
          <div v-if="selectedItem.item.value" class="stat">
            价值: {{ selectedItem.item.value }} 金币
          </div>
        </div>
        <button 
          v-if="selectedItem.item.type === 'consumable'"
          class="use-btn"
          @click="useSelectedItem"
        >
          使用物品
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const props = defineProps({
  modelValue: Boolean
})

const emit = defineEmits(['close'])

const gameStore = useGameStore()
const inventory = computed(() => gameStore.inventory)
const maxInventorySlots = computed(() => gameStore.maxInventorySlots)

const emptySlots = computed(() => maxInventorySlots.value - inventory.value.length)

const selectedItem = ref(null)

const close = () => {
  selectedItem.value = null
  emit('close')
}

const handleItemClick = (item, index) => {
  selectedItem.value = { item, index }
}

const useSelectedItem = () => {
  if (selectedItem.value) {
    gameStore.useItem(selectedItem.value.index)
    selectedItem.value = null
    if (inventory.value.length === 0) {
      close()
    }
  }
}
</script>

<style scoped>
.inventory-panel {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
}

.panel-content {
  background: linear-gradient(180deg, #2a2a4a 0%, #1a1a2e 100%);
  border-radius: 20px;
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  overflow: hidden;
  border: 2px solid rgba(233,69,96,0.3);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.panel-header h3 {
  color: #fff;
  font-size: 18px;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  color: #888;
  font-size: 20px;
  cursor: pointer;
  padding: 5px;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #e94560;
}

.inventory-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  padding: 20px;
  max-height: 300px;
  overflow-y: auto;
}

.item-slot {
  aspect-ratio: 1;
  background: rgba(255,255,255,0.1);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid transparent;
  padding: 5px;
  position: relative;
}

.item-slot:hover {
  background: rgba(255,255,255,0.2);
  border-color: rgba(233,69,96,0.5);
  transform: scale(1.05);
}

.item-slot.empty {
  background: rgba(255,255,255,0.05);
  cursor: default;
}

.item-slot.empty:hover {
  transform: none;
  border-color: transparent;
}

.item-icon {
  font-size: 24px;
  margin-bottom: 3px;
}

.item-name {
  font-size: 10px;
  color: #ccc;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.empty-text {
  color: #555;
  font-size: 14px;
}

.use-badge {
  position: absolute;
  bottom: 2px;
  font-size: 8px;
  color: #4ade80;
  background: rgba(0,0,0,0.5);
  padding: 1px 4px;
  border-radius: 4px;
}

.item-details {
  background: rgba(0,0,0,0.3);
  padding: 20px;
  border-top: 1px solid rgba(255,255,255,0.1);
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 15px;
}

.detail-icon {
  font-size: 32px;
}

.detail-name {
  font-size: 18px;
  color: #fff;
  font-weight: bold;
}

.detail-stats {
  margin-bottom: 15px;
}

.detail-stats .stat {
  color: #888;
  font-size: 14px;
  padding: 5px 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.use-btn {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
}

.use-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(74,222,128,0.4);
}
</style>