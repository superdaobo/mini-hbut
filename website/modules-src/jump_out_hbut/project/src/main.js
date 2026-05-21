import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

const MODULE_ID = 'jump_out_hbut'
let sizeObserver = null
let syncTimer = null

function setModuleViewportVars() {
  if (typeof window === 'undefined') return
  const viewportHeight = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0
  const viewportWidth = window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 0
  if (viewportHeight > 0) {
    document.documentElement.style.setProperty('--module-vh', `${viewportHeight * 0.01}px`)
  }
  if (viewportWidth > 0) {
    document.documentElement.style.setProperty('--module-vw', `${viewportWidth * 0.01}px`)
  }
}

function getModuleHeight() {
  return Math.ceil(Math.max(
    window.visualViewport?.height || 0,
    window.innerHeight || 0,
    document.documentElement.clientHeight || 0,
    document.documentElement.scrollHeight || 0,
    document.body?.scrollHeight || 0
  ))
}

function notifyHostHeight() {
  if (typeof window === 'undefined' || window.parent === window) return
  window.parent.postMessage({
    type: 'mini-hbut:module-size',
    moduleId: MODULE_ID,
    module_id: MODULE_ID,
    height: getModuleHeight()
  }, '*')
}

function syncModuleFrame() {
  setModuleViewportVars()
  notifyHostHeight()
}

function scheduleModuleFrameSync() {
  if (typeof window === 'undefined') return
  if (syncTimer) window.clearTimeout(syncTimer)
  window.requestAnimationFrame(syncModuleFrame)
  syncTimer = window.setTimeout(syncModuleFrame, 180)
}

setModuleViewportVars()
createApp(App).mount('#app')
scheduleModuleFrameSync()

window.addEventListener('resize', scheduleModuleFrameSync, { passive: true })
window.addEventListener('orientationchange', scheduleModuleFrameSync, { passive: true })
window.visualViewport?.addEventListener('resize', scheduleModuleFrameSync, { passive: true })

if (typeof ResizeObserver !== 'undefined') {
  sizeObserver = new ResizeObserver(scheduleModuleFrameSync)
  sizeObserver.observe(document.documentElement)
  if (document.body) sizeObserver.observe(document.body)
}

window.addEventListener('beforeunload', () => {
  if (syncTimer) window.clearTimeout(syncTimer)
  sizeObserver?.disconnect()
})
