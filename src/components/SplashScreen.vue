<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'

const props = defineProps({
  status: { type: String, default: 'connecting' },
  statusText: { type: String, default: '正在连接教务系统…' }
})

const emit = defineEmits(['dismiss'])

const show = ref(true)
const fadeOut = ref(false)
const logoReady = ref(false)
const buildingReady = ref(false)
const contentReady = ref(false)
const dotsCount = ref(0)

let dotsTimer = null
let staggerTimer = null

const statusDots = computed(() => '.'.repeat(dotsCount.value % 4))

const dismiss = () => {
  if (fadeOut.value) return
  fadeOut.value = true
  // 停掉所有持续动画，减轻 GPU 负担
  if (dotsTimer) { clearInterval(dotsTimer); dotsTimer = null }
  requestAnimationFrame(() => {
    setTimeout(() => {
      show.value = false
      emit('dismiss')
    }, 500)
  })
}

defineExpose({ dismiss })

onMounted(() => {
  dotsTimer = setInterval(() => { dotsCount.value++ }, 500)
  // 分阶段入场动画
  requestAnimationFrame(() => {
    logoReady.value = true
    staggerTimer = setTimeout(() => {
      buildingReady.value = true
      setTimeout(() => { contentReady.value = true }, 300)
    }, 400)
  })
})

onBeforeUnmount(() => {
  if (dotsTimer) clearInterval(dotsTimer)
  if (staggerTimer) clearTimeout(staggerTimer)
})
</script>

<template>
  <Transition name="splash-leave">
    <div v-if="show" class="splash-root" :class="{ 'splash-fade-out': fadeOut }">
      <!-- 背景层 -->
      <div class="splash-bg">
        <div class="splash-bg-image" />
        <div class="splash-bg-overlay" />
        <div class="splash-particles">
          <span v-for="i in 20" :key="i" class="particle" :style="{ '--i': i }" />
        </div>
      </div>

      <!-- 内容层 -->
      <div class="splash-content">
        <!-- 校徽 + 标题 -->
        <div class="splash-brand" :class="{ 'brand-enter': logoReady }">
          <div class="splash-logo-ring">
            <img src="/splash/app_icon.png" alt="Mini-HBUT" class="splash-logo" />
          </div>
          <h1 class="splash-title">Mini-HBUT</h1>
          <p class="splash-subtitle">湖北工业大学智慧校园助手</p>
        </div>

        <!-- 建筑插画 -->
        <div class="splash-illustration" :class="{ 'illustration-enter': buildingReady }">
          <img src="/splash/cas_building.png" alt="" class="splash-building" />
        </div>

        <!-- 加载指示器 -->
        <div class="splash-loader" :class="{ 'loader-enter': contentReady }">
          <div class="loader-spinner">
            <div class="spinner-ring" />
            <div class="spinner-ring spinner-ring-2" />
            <div class="spinner-ring spinner-ring-3" />
            <div class="spinner-dot" />
          </div>
          <p class="loader-text">{{ statusText }}{{ statusDots }}</p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ═══════════════════════════════════════════
   根容器
   ═══════════════════════════════════════════ */
.splash-root {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  will-change: opacity;
  contain: layout style;
}
.splash-fade-out {
  animation: splashFadeOut 0.5s ease-out forwards;
  pointer-events: none;
}
.splash-fade-out .splash-bg-image,
.splash-fade-out .splash-particles,
.splash-fade-out .spinner-ring,
.splash-fade-out .spinner-dot,
.splash-fade-out .splash-building,
.splash-fade-out .splash-logo {
  animation-play-state: paused !important;
}
.splash-fade-out .splash-bg-overlay {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

/* ═══════════════════════════════════════════
   背景
   ═══════════════════════════════════════════ */
.splash-bg {
  position: absolute;
  inset: 0;
}
.splash-bg-image {
  position: absolute;
  inset: 0;
  background: url('/splash/cas_bg.png') 50% center / cover no-repeat;
  animation: bgKen 20s ease-in-out infinite alternate;
  will-change: transform;
}
.splash-bg-overlay {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(99, 102, 241, 0.25) 0%, transparent 70%),
    radial-gradient(ellipse at 80% 100%, rgba(34, 211, 238, 0.15) 0%, transparent 60%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.15) 0%, rgba(15, 23, 42, 0.35) 100%);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

/* ── 粒子 ── */
.splash-particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.particle {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  left: calc(5% * var(--i));
  top: calc(100% + 10px);
  animation: particleRise calc(4s + var(--i) * 0.3s) calc(var(--i) * 0.15s) ease-in infinite;
  opacity: 0;
}
.particle:nth-child(odd) {
  width: 3px;
  height: 3px;
  background: rgba(99, 102, 241, 0.6);
}
.particle:nth-child(3n) {
  width: 5px;
  height: 5px;
  background: rgba(34, 211, 238, 0.5);
}

/* ═══════════════════════════════════════════
   内容
   ═══════════════════════════════════════════ */
.splash-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 0 24px;
  width: 100%;
  max-width: 420px;
}

/* ── 品牌 ── */
.splash-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  opacity: 0;
  transform: translateY(30px) scale(0.9);
  transition: all 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.brand-enter {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.splash-logo-ring {
  position: relative;
  width: 88px;
  height: 88px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.splash-logo-ring::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    rgba(99, 102, 241, 0.8),
    rgba(168, 85, 247, 0.6),
    rgba(34, 211, 238, 0.8),
    rgba(99, 102, 241, 0.8)
  );
  animation: logoRingSpin 3s linear infinite;
  filter: blur(1px);
}
.splash-logo-ring::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: white;
  box-shadow:
    0 0 30px rgba(99, 102, 241, 0.3),
    0 0 60px rgba(99, 102, 241, 0.15);
}
.splash-logo {
  position: relative;
  z-index: 1;
  width: 56px;
  height: 56px;
  object-fit: contain;
  animation: logoPulse 2s ease-in-out infinite;
}

.splash-title {
  font-size: 28px;
  font-weight: 700;
  color: white;
  letter-spacing: 2px;
  text-shadow:
    0 2px 12px rgba(0, 0, 0, 0.3),
    0 0 40px rgba(99, 102, 241, 0.4);
  margin: 0;
  font-family: var(--ui-font-family);
}
.splash-subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  letter-spacing: 4px;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.3);
  margin: 0;
  font-family: var(--ui-font-family);
}

/* ── 插画 ── */
.splash-illustration {
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.illustration-enter {
  opacity: 1;
  transform: translateY(0);
}
.splash-building {
  width: min(280px, 70vw);
  max-height: 140px;
  object-fit: contain;
  filter: drop-shadow(0 4px 20px rgba(99, 102, 241, 0.3)) brightness(1.05);
  animation: buildingFloat 4s ease-in-out infinite;
}

/* ── 加载器 ── */
.splash-loader {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  opacity: 0;
  transform: translateY(15px);
  transition: all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.loader-enter {
  opacity: 1;
  transform: translateY(0);
}

.loader-spinner {
  position: relative;
  width: 48px;
  height: 48px;
}
.spinner-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2.5px solid transparent;
  border-top-color: rgba(255, 255, 255, 0.9);
  animation: spinnerSpin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
}
.spinner-ring-2 {
  inset: 5px;
  border-top-color: rgba(99, 102, 241, 0.8);
  animation-duration: 1.6s;
  animation-direction: reverse;
}
.spinner-ring-3 {
  inset: 10px;
  border-top-color: rgba(34, 211, 238, 0.7);
  animation-duration: 2s;
}
.spinner-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 6px;
  height: 6px;
  margin: -3px 0 0 -3px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.6);
  animation: dotPulse 1.2s ease-in-out infinite;
}

.loader-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.3);
  margin: 0;
  font-family: var(--ui-font-family);
  min-width: 180px;
  text-align: center;
}

/* ═══════════════════════════════════════════
   动画
   ═══════════════════════════════════════════ */
@keyframes bgKen {
  0%   { transform: scale(1); }
  100% { transform: scale(1.08); }
}

@keyframes logoRingSpin {
  to { transform: rotate(360deg); }
}

@keyframes logoPulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.05); }
}

@keyframes buildingFloat {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-8px); }
}

@keyframes spinnerSpin {
  to { transform: rotate(360deg); }
}

@keyframes dotPulse {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50%      { opacity: 1;   transform: scale(1.2); }
}

@keyframes particleRise {
  0%   { opacity: 0; transform: translateY(0) scale(0); }
  10%  { opacity: 0.8; transform: translateY(-20px) scale(1); }
  90%  { opacity: 0.3; }
  100% { opacity: 0; transform: translateY(calc(-100vh - 20px)) scale(0.5); }
}

@keyframes splashFadeOut {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}

/* ═══════════════════════════════════════════
   退出过渡
   ═══════════════════════════════════════════ */
.splash-leave-enter-active,
.splash-leave-leave-active {
  transition: opacity 0.5s ease;
}
.splash-leave-enter-from,
.splash-leave-leave-to {
  opacity: 0;
}

/* ═══════════════════════════════════════════
   响应式
   ═══════════════════════════════════════════ */
@media (max-height: 580px) {
  .splash-illustration { display: none; }
  .splash-content { gap: 16px; }
  .splash-logo-ring { width: 72px; height: 72px; }
  .splash-logo { width: 44px; height: 44px; }
  .splash-title { font-size: 24px; }
}

@media (min-width: 768px) {
  .splash-building { width: min(360px, 50vw); max-height: 180px; }
  .splash-title { font-size: 32px; letter-spacing: 3px; }
  .splash-subtitle { font-size: 15px; letter-spacing: 6px; }
}
</style>
