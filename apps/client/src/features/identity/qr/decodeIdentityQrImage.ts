// src/features/identity/qr/decodeIdentityQrImage.ts
//
// #627：QR 图片本地解码封装。
//
// 复用现有 Rust rqrr 能力（chaoxing_checkin_decode_qr_image 是通用本地 QR 解码，
// 命令名前缀为历史命名；不在 Rust 侧新建重复命令，避免第三套独立解析体系）。
// 安全边界：
//   - 图片字节只在本机 Rust 进程内解码，绝不上传服务器；
//   - 解码失败/无二维码只返回 null，调用方一律显示通用文案（不回显底层错误）。

import { invokeNative, isTauriRuntime } from '../../../platform/native'

/** 本地解码失败（图片损坏/无二维码/平台不支持）统一返回 null */
export type IdentityQrDecodeResult = { url: string } | null

/**
 * 在本地解码图片中的二维码文本。
 * - Tauri：复用 Rust rqrr（chaoxing_checkin_decode_qr_image），图片不出本机；
 * - 非 Tauri（Web/Capacitor）：无本地解码器，返回 null（由 UI 提示降级路径）。
 */
export const decodeIdentityQrImage = async (
  bytes: Uint8Array,
  mime: string
): Promise<IdentityQrDecodeResult> => {
  if (!isTauriRuntime()) {
    return null
  }
  try {
    const result = await invokeNative<{ url: string }>('chaoxing_checkin_decode_qr_image', {
      image_bytes: bytes,
      mime_type: mime || 'image/png'
    })
    if (result && typeof result.url === 'string' && result.url) {
      return { url: result.url }
    }
    return null
  } catch {
    // 解码异常：统一按“未识别到二维码”处理，不回显底层错误
    return null
  }
}
