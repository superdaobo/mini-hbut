/** Mini-HBUT 本地开发端口（与 vite.config.ts / tauri.conf.json 保持一致） */
export const DEFAULT_DEV_HOST = '127.0.0.1'

// 1420 在 Windows Hyper-V 保留段 1408-1507；5173 易与其他 Vite 项目冲突
export const DEFAULT_DEV_PORT = 15173

export const resolveDevPort = () => {
  const parsed = Number(process.env.VITE_DEV_PORT)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DEV_PORT
}

export const resolveDevHost = () => String(process.env.VITE_DEV_HOST || DEFAULT_DEV_HOST).trim() || DEFAULT_DEV_HOST

export const devServerUrl = () => `http://${resolveDevHost() === '127.0.0.1' ? 'localhost' : resolveDevHost()}:${resolveDevPort()}`
