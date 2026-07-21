/**
 * 浏览器端二维码生成（Vite / Tauri WebView 安全）。
 *
 * 禁止在业务组件里静态 `import QRCode from 'qrcode'`：
 * - package 的 browser 入口是 CJS（require），原生 ESM 会报 require is not defined
 * - 顶层 import 失败会拖垮整个异步页面 → 白屏
 *
 * 本模块使用动态 import；并依赖 vite optimizeDeps.include 预构建 qrcode。
 * 若仍失败，回退到「外链图」与「可点击链接文案」，保证页面可开。
 */

/**
 * @param {string} text
 * @param {{ width?: number, margin?: number, text?: string }} [options]
 * @returns {Promise<string>} data URL 或 https 图片 URL
 */
export async function qrToDataURL(text, options = {}) {
  const payload = String(options.text ?? text ?? '').trim()
  if (!payload) throw new Error('二维码内容为空')

  const width = Number(options.width) > 0 ? Number(options.width) : 220
  const margin = Number.isFinite(Number(options.margin)) ? Number(options.margin) : 1

  // 1) 预构建后的 qrcode（动态 import，不阻塞组件挂载）
  try {
    const mod = await import(/* @vite-ignore */ 'qrcode')
    const api = resolveQrApi(mod)
    if (api) {
      return await api.toDataURL(payload, {
        margin,
        width,
        errorCorrectionLevel: 'M'
      })
    }
  } catch {
    // continue
  }

  // 2) 在线图片回退（不依赖本地 CJS）；校园网外一般可用
  // 注意：这不是 data URL，但 <img src> 可直接使用
  return (
    'https://api.qrserver.com/v1/create-qr-code/?size=' +
    encodeURIComponent(`${width}x${width}`) +
    '&margin=' +
    encodeURIComponent(String(margin)) +
    '&data=' +
    encodeURIComponent(payload)
  )
}

function resolveQrApi(mod) {
  if (!mod) return null
  if (typeof mod.toDataURL === 'function') return mod
  if (mod.default && typeof mod.default.toDataURL === 'function') return mod.default
  if (mod.default && mod.default.default && typeof mod.default.default.toDataURL === 'function') {
    return mod.default.default
  }
  return null
}
