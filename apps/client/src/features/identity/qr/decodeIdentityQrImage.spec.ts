// goal-20 C2：本地二维码图片解码的 IPC 参数形状（Tauri v2：camelCase 键 + 普通数组）。
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../platform/native', () => ({
  invokeNative: vi.fn(),
  isTauriRuntime: vi.fn(() => true)
}))

import { invokeNative, isTauriRuntime } from '../../../platform/native'
import { decodeIdentityQrImage } from './decodeIdentityQrImage'

const mockInvoke = vi.mocked(invokeNative)

beforeEach(() => {
  mockInvoke.mockReset()
  vi.mocked(isTauriRuntime).mockReturnValue(true)
})

describe('decodeIdentityQrImage', () => {
  it('按 Tauri v2 约定传 camelCase 键与普通数组（嵌套 Uint8Array 走 JSON 会变成对象）', async () => {
    mockInvoke.mockResolvedValueOnce({ url: 'minihbut://school-login?x=1' })
    const result = await decodeIdentityQrImage(new Uint8Array([137, 80, 78, 71]), 'image/png')
    expect(result).toEqual({ url: 'minihbut://school-login?x=1' })
    const [command, args] = mockInvoke.mock.calls[0]
    expect(command).toBe('chaoxing_checkin_decode_qr_image')
    expect(args).toEqual({ imageBytes: [137, 80, 78, 71], mimeType: 'image/png' })
    expect(Array.isArray((args as { imageBytes: unknown }).imageBytes)).toBe(true)
    expect(JSON.parse(JSON.stringify(args))).toEqual({ imageBytes: [137, 80, 78, 71], mimeType: 'image/png' })
  })

  it('缺 MIME 时默认 image/png；解码失败 / 非 App 环境返回 null', async () => {
    mockInvoke.mockResolvedValueOnce({ url: '' })
    expect(await decodeIdentityQrImage(new Uint8Array([1]), '')).toBeNull()
    expect((mockInvoke.mock.calls[0][1] as { mimeType: string }).mimeType).toBe('image/png')
    mockInvoke.mockRejectedValueOnce(new Error('no qr'))
    expect(await decodeIdentityQrImage(new Uint8Array([1]), 'image/jpeg')).toBeNull()
    vi.mocked(isTauriRuntime).mockReturnValue(false)
    expect(await decodeIdentityQrImage(new Uint8Array([1]), 'image/png')).toBeNull()
    expect(mockInvoke).toHaveBeenCalledTimes(2)
  })
})
