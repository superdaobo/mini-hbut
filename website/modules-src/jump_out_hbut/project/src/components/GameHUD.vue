<template>
  <div class="game-hud">
    <!-- 顶部信息栏 -->
    <div class="hud-top">
      <div class="hud-left">
        <div class="score-display">
          <span class="score-value">{{ score }}</span>
        </div>
        <div class="combo-display" v-if="combo >= 2">
          <span class="combo-value" :key="combo">x{{ combo }}</span>
        </div>
      </div>

      <div class="hud-right">
        <span class="jump-count">
          <span class="jump-count-icon" aria-hidden="true"></span>
          <span>跳跃 {{ jumpCount }}</span>
        </span>
        <button
          class="mute-btn"
          :class="{ 'is-muted': muted }"
          :aria-label="muted ? '开启音效' : '关闭音效'"
          @click="$emit('toggleMute')"
        >
          <span class="mute-icon" aria-hidden="true"></span>
          <span class="mute-label">{{ muted ? '静音' : '音效' }}</span>
        </button>
      </div>
    </div>

    <!-- 蓄力进度条 -->
    <div class="charge-bar-container" v-if="chargePercent > 0">
      <div
        class="charge-bar-fill"
        :class="{ 'charge-full': chargePercent >= 1.0 }"
        :style="{ width: (chargePercent * 100) + '%' }"
      ></div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  score: {
    type: Number,
    default: 0
  },
  combo: {
    type: Number,
    default: 0
  },
  jumpCount: {
    type: Number,
    default: 0
  },
  chargePercent: {
    type: Number,
    default: 0
  },
  muted: {
    type: Boolean,
    default: false
  }
})

defineEmits(['toggleMute'])
</script>

<style scoped>
.game-hud {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 5;
  pointer-events: none;
  padding: env(safe-area-inset-top, 12px) 12px 0 12px;
}

.hud-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 12px;
}

.hud-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.score-display {
  background: rgba(15, 23, 42, 0.68);
  border: 1px solid rgba(125, 211, 252, 0.35);
  border-radius: 8px;
  padding: 4px 12px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
}

.score-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
}

.combo-display {
  background: rgba(255, 215, 0, 0.2);
  border: 1px solid rgba(255, 215, 0, 0.5);
  border-radius: 8px;
  padding: 4px 10px;
}

.combo-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: #FFD700;
  animation: comboPop 0.3s ease;
}

.hud-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.jump-count {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(15, 23, 42, 0.68);
  border: 1px solid rgba(125, 211, 252, 0.28);
  border-radius: 8px;
  padding: 4px 10px;
}

.jump-count-icon {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #38bdf8;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.22);
}

.mute-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  pointer-events: auto;
  background: rgba(15, 23, 42, 0.68);
  border: 1px solid rgba(125, 211, 252, 0.28);
  color: #fff;
  border-radius: 8px;
  padding: 6px 9px;
  font-size: 0.78rem;
  line-height: 1;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.mute-icon {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 2px solid currentColor;
  border-right-width: 5px;
}

.mute-btn.is-muted {
  color: rgba(255, 255, 255, 0.62);
  border-color: rgba(255, 255, 255, 0.2);
}

.mute-btn:active {
  background: rgba(15, 23, 42, 0.86);
}

/* 蓄力进度条 */
.charge-bar-container {
  margin: 0 12px;
  height: 6px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 3px;
  overflow: hidden;
}

.charge-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #4682B4, #87CEEB);
  border-radius: 3px;
  transition: width 0.05s linear;
}

.charge-bar-fill.charge-full {
  background: linear-gradient(90deg, #FFD700, #FFA500);
  animation: chargePulse 0.4s ease infinite alternate;
}

@keyframes comboPop {
  0% { transform: scale(1.4); }
  100% { transform: scale(1); }
}

@keyframes chargePulse {
  0% { opacity: 1; }
  100% { opacity: 0.6; }
}
</style>
