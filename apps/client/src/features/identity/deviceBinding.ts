// src/features/identity/deviceBinding.ts
//
// #677：设备绑定解析——`ensureDeviceBound` 的纯逻辑内核，依赖全部注入以便三分支单测。
//
// 行为合同（与 #622/#668 安全语义一致）：
// - 安全存储不可用 → fail closed（secure_storage_unavailable），绝不降级到文件/内存；
// - 无密钥 → 用当前请求 handoff 自动注册（防匿名设计不变）；
// - 有密钥且本地有 deviceId → 直接复用；
// - 有密钥但本地缺 deviceId（如首次注册服务端提交中断、清过应用数据）→
//   **静默补绑定**：复用现有密钥重走一次注册拿回绑定关系（Rust create_if_missing
//   会原样复用既有密钥），用户零感知；不再抛「尚未完成绑定」不可自愈错误。

import { IdentityServiceError } from './types'
import type { IdentityLocalDeviceStatus } from './types'

export interface DeviceBindingDeps {
  /** 读取本机设备状态（identity_device_status） */
  getDeviceStatus: () => Promise<IdentityLocalDeviceStatus>
  /** 用当前请求 handoff 执行一次 enrollment（取 challenge + Rust 注册命令） */
  enroll: (handoff: string) => Promise<{ device_id: string; user_id: string }>
  /** 本地持久化的 deviceId（可能因清应用数据/历史注册失败而缺失） */
  getStoredDeviceId: () => string | null
  /** 持久化绑定元数据 */
  saveDeviceMeta: (meta: { deviceId: string; userId: string }) => void
}

/** 解析当前设备的绑定关系，返回可用于签名的 deviceId。 */
export const resolveDeviceBinding = async (
  deps: DeviceBindingDeps,
  handoff: string
): Promise<string> => {
  let status: IdentityLocalDeviceStatus | null = null
  try {
    status = await deps.getDeviceStatus()
  } catch {
    status = null
  }
  if (status === null || status.available === false) {
    throw new IdentityServiceError(
      'secure_storage_unavailable',
      '本机安全存储不可用，无法完成授权',
      status?.error || 'identity_device_status unavailable'
    )
  }
  const storedDeviceId = deps.getStoredDeviceId()
  if (!status.has_key || !storedDeviceId) {
    // #677：无密钥=首次注册；有密钥但缺元数据=静默补绑定。两条路径合一、零额外交互。
    const enroll = await deps.enroll(handoff)
    deps.saveDeviceMeta({ deviceId: enroll.device_id, userId: enroll.user_id })
    return enroll.device_id
  }
  return storedDeviceId
}
