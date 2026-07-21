/**
 * Vite/ESM 兼容的 qrcode 封装。
 * 勿使用 `import QRCode from 'qrcode'`：browser 构建无 default export，会导致异步组件整页加载失败白屏。
 */
import * as QRCodeNS from 'qrcode'

const QRCode = QRCodeNS?.default && typeof QRCodeNS.default.toDataURL === 'function'
  ? QRCodeNS.default
  : QRCodeNS

/**
 * @param {string} text
 * @param {import('qrcode').QRCodeToDataURLOptions} [options]
 * @returns {Promise<string>}
 */
export function qrToDataURL(text, options = {}) {
  const payload = String(text || '').trim()
  if (!payload) return Promise.reject(new Error('二维码内容为空'))
  if (typeof QRCode?.toDataURL !== 'function') {
    return Promise.reject(new Error('二维码库不可用'))
  }
  return QRCode.toDataURL(payload, {
    margin: 1,
    width: 220,
    ...options
  })
}

export { QRCode }
