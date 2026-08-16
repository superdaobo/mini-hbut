<script setup>
import { defineProps, defineEmits, watch, ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  steps: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['complete'])

const allComplete = ref(false)

watch(() => props.steps, (newSteps) => {
  if (newSteps.every(s => s.status === 'done')) {
    allComplete.value = true
    setTimeout(() => emit('complete'), 2000)
  }
}, { deep: true })
</script>

<template>
  <div class="progress-container">
    <div class="progress-card">
      <h2 class="progress-title">
        <span class="icon">🔄</span> 
        查询进度
      </h2>
      
      <div class="timeline">
        <div 
          v-for="(step, index) in steps" 
          :key="step.id"
          :class="['timeline-item', step.status]"
        >
          <div class="timeline-marker">
            <span v-if="step.status === 'done'" class="check">✓</span>
            <span v-else-if="step.status === 'active'" class="spinner"></span>
            <span v-else class="dot"></span>
          </div>
          <div class="timeline-content">
            <h3>{{ step.label }}</h3>
            <p v-if="step.message" class="message">{{ step.message }}</p>
          </div>
          <div v-if="index < steps.length - 1" class="timeline-line"></div>
        </div>
      </div>
      
      <div v-if="allComplete" class="complete-message">
        <span class="success-icon">✅</span>
        查询完成！正在跳转...
      </div>
    </div>
  </div>
</template>

<style scoped>
.progress-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.progress-card {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  padding: 40px;
  min-width: 400px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

.progress-title {
  font-size: 24px;
  color: #333;
  margin-bottom: 30px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.timeline {
  position: relative;
}

.timeline-item {
  display: flex;
  align-items: flex-start;
  margin-bottom: 25px;
  position: relative;
}

.timeline-item:last-child {
  margin-bottom: 0;
}

.timeline-marker {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e0e0e0;
  flex-shrink: 0;
  margin-right: 15px;
  transition: all 0.3s ease;
}

.timeline-item.done .timeline-marker {
  background: linear-gradient(135deg, #10b981, #059669);
}

.timeline-item.active .timeline-marker {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
  50% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
}

.check {
  color: white;
  font-weight: bold;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.dot {
  width: 12px;
  height: 12px;
  background: #999;
  border-radius: 50%;
}

.timeline-content h3 {
  margin: 0;
  font-size: 16px;
  color: #333;
}

.timeline-item.pending .timeline-content h3 {
  color: #999;
}

.timeline-item.done .timeline-content h3 {
  color: #10b981;
}

.timeline-item.active .timeline-content h3 {
  color: #3b82f6;
  font-weight: 600;
}

.message {
  margin: 5px 0 0;
  font-size: 13px;
  color: #666;
}

.timeline-line {
  position: absolute;
  left: 19px;
  top: 45px;
  width: 2px;
  height: calc(100% - 15px);
  background: #e0e0e0;
}

.timeline-item.done .timeline-line {
  background: #10b981;
}

.complete-message {
  margin-top: 30px;
  padding: 15px;
  background: linear-gradient(135deg, #d1fae5, #a7f3d0);
  border-radius: 12px;
  text-align: center;
  font-weight: 600;
  color: #059669;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.success-icon {
  font-size: 24px;
}
</style>
