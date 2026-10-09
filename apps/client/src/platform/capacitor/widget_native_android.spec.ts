import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn(async (_command: string, _args?: unknown) => {}))

vi.mock('@/platform/native', () => ({
  isTauriRuntime: () => true,
  isCapacitorRuntime: () => false,
  invokeNative: invoke,
}))
vi.mock('@/utils/debug_logger', () => ({
  pushDebugLog: vi.fn(),
}))

beforeEach(() => {
  invoke.mockClear()
  vi.resetModules()
  vi.stubGlobal('navigator', { userAgent: 'Android 15 Chrome' })
})

describe('#1029 Tauri Android 原生小组件桥真实通信', () => {
  it('写电费后调用 Rust 命令和刷新，而不是静默 no-op', async () => {
    const { writeElectricitySnapshot } = await import('./widget')
    await writeElectricitySnapshot({ quantity: 108.6, room: '7栋 1层', updated_at: '2026-10-09T00:00:00.000Z' })
    expect(invoke).toHaveBeenCalledWith('write_electricity_snapshot', {
      json: JSON.stringify({ quantity: 108.6, room: '7栋 1层', updated_at: '2026-10-09T00:00:00.000Z' })
    })
    expect(invoke).toHaveBeenCalledWith('request_widget_refresh')
  })

  it('原生失败必须 reject，前端不能误认为同步成功', async () => {
    const { writeExamSnapshot } = await import('./widget')
    invoke.mockRejectedValueOnce(new Error('native storage unavailable'))
    await expect(writeExamSnapshot({ exams: [] })).rejects.toThrow('native storage unavailable')
  })

  it('登出清空旧课表、电费、考试后请求 RemoteViews 重新绘制', async () => {
    const { clearSnapshot } = await import('./widget')
    await clearSnapshot()
    expect(invoke).toHaveBeenCalledWith('clear_widget_snapshot')
    expect(invoke).toHaveBeenCalledWith('request_widget_refresh')
  })
})
