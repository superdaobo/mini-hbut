// src/features/school_login/overlayHost.ts
//
// goal-20：按需把「用 Mini-HBUT 登录」确认弹窗挂到 document.body（独立的小 Vue 应用）。
// 不放进 App.vue：App.vue 已在 god-files 上限边缘，且弹窗状态全在 schoolLoginStore，
// 不依赖 App 的插件 / 路由。首次收到登录请求（深链或设置页入口）时挂载一次，之后复用。

import { createApp } from 'vue'

import SchoolLoginOverlay from './SchoolLoginOverlay.vue'

let mounted = false

export const ensureSchoolLoginOverlayMounted = (): void => {
  if (mounted || typeof document === 'undefined' || !document.body) return
  const host = document.createElement('div')
  host.id = 'school-login-overlay-root'
  document.body.appendChild(host)
  createApp(SchoolLoginOverlay).mount(host)
  mounted = true
}
