/**
 * Tauri 开发时 Vite 端口。默认 5173，避开 Windows Hyper-V 常保留的 1408-1507 段（原 1420 会 EACCES）。
 */
export const TAURI_DEV_VITE_PORT = Number(process.env.TAURI_DEV_VITE_PORT || 5173)
export const TAURI_DEV_URL = `http://localhost:${TAURI_DEV_VITE_PORT}`
