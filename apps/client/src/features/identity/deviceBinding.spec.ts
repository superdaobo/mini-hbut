// src/features/identity/deviceBinding.spec.ts
//
// #677：设备绑定解析三分支单测。
// 回归背景：旧实现中「密钥已存在但本地缺 deviceId」会硬抛「当前设备尚未完成绑定」
// 且不可自愈（如首次注册服务端提交中断、清过应用数据）；现改为静默补绑定。

import { describe, expect, it, vi } from 'vitest'
import { IdentityServiceError } from './types'
import { resolveDeviceBinding, type DeviceBindingDeps } from './deviceBinding'

const status = (has_key: boolean, available = true) => ({
  available,
  has_key,
  fingerprint: has_key ? 'fp-x' : null,
  error: null
})

const makeDeps = (over: Partial<DeviceBindingDeps> = {}): DeviceBindingDeps => ({
  getDeviceStatus: vi.fn().mockResolvedValue(status(true)),
  enroll: vi.fn().mockResolvedValue({ device_id: 'dev-new', user_id: 'user-1' }),
  getStoredDeviceId: vi.fn().mockReturnValue('dev-stored'),
  saveDeviceMeta: vi.fn(),
  ...over
})

describe('#677 设备绑定解析（resolveDeviceBinding）', () => {
  it('无密钥 → 用当前 handoff 自动注册并持久化元数据', async () => {
    const deps = makeDeps({
      getDeviceStatus: vi.fn().mockResolvedValue(status(false)),
      getStoredDeviceId: vi.fn().mockReturnValue(null)
    })
    const deviceId = await resolveDeviceBinding(deps, 'handoff-1')
    expect(deviceId).toBe('dev-new')
    expect(deps.enroll).toHaveBeenCalledWith('handoff-1')
    expect(deps.saveDeviceMeta).toHaveBeenCalledWith({ deviceId: 'dev-new', userId: 'user-1' })
  })

  it('有密钥且有本地 deviceId → 直接复用，不触发注册', async () => {
    const deps = makeDeps()
    const deviceId = await resolveDeviceBinding(deps, 'handoff-2')
    expect(deviceId).toBe('dev-stored')
    expect(deps.enroll).not.toHaveBeenCalled()
    expect(deps.saveDeviceMeta).not.toHaveBeenCalled()
  })

  it('有密钥但缺本地 deviceId → 静默补绑定并持久化（不再硬报「尚未完成绑定」）', async () => {
    const deps = makeDeps({
      getStoredDeviceId: vi.fn().mockReturnValue(null),
      enroll: vi.fn().mockResolvedValue({ device_id: 'dev-rebind', user_id: 'user-1' })
    })
    const deviceId = await resolveDeviceBinding(deps, 'handoff-3')
    expect(deviceId).toBe('dev-rebind')
    expect(deps.getStoredDeviceId).toHaveBeenCalled()
    expect(deps.enroll).toHaveBeenCalledWith('handoff-3')
    expect(deps.saveDeviceMeta).toHaveBeenCalledWith({ deviceId: 'dev-rebind', userId: 'user-1' })
  })

  it('安全存储不可用 → fail closed 抛 secure_storage_unavailable', async () => {
    const deps = makeDeps({
      getDeviceStatus: vi.fn().mockResolvedValue(status(false, false))
    })
    await expect(resolveDeviceBinding(deps, 'handoff-4')).rejects.toMatchObject({
      code: 'secure_storage_unavailable'
    })
    expect(deps.enroll).not.toHaveBeenCalled()
  })

  it('安全存储命令本身抛错 → 同样 fail closed', async () => {
    const deps = makeDeps({
      getDeviceStatus: vi.fn().mockRejectedValue(new Error('invoke failed'))
    })
    await expect(resolveDeviceBinding(deps, 'handoff-5')).rejects.toBeInstanceOf(
      IdentityServiceError
    )
  })
})
