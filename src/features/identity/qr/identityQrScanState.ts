// src/features/identity/qr/identityQrScanState.ts
//
// #627：扫一扫登录的扫描器 UI 状态机（纯 reducer，可单测）。
//
// 状态（issue #627「UI 状态」清单）：
//   permission_needed / scanning / parsing / invalid_code /
//   expired_request / loading_request / approval_opened
//
// 设计约定：
//   - 本状态机**不持有任何网络/相机副作用**，只描述 UI 相位迁移；
//   - 真正流程：扫描 -> 本地解析（parseIdentityQr）-> 提交 IdentityCoordinator
//     （与同设备 Deep Link 同一 submitIntent 入口）-> #623 Overlay 接管审批；
//   - 本地无法判定"过期"（无 expires_at），expired_request 由 Core 判定后置入；
//   - 组件卸载/关闭必须回到初始态（防 background/resume 残留）。

/** 扫描器 UI 相位（issue #627 原文） */
export type IdentityQrScanPhase =
  | 'permission_needed' // 相机权限未授予（可降级为相册/手动入口）
  | 'scanning' // 等待用户拍摄/选择图片或粘贴链接
  | 'parsing' // 图片解码 + payload 解析中
  | 'invalid_code' // 不是有效的 Mini-HBUT 登录二维码
  | 'expired_request' // 请求已过期（Core 判定后置入）
  | 'loading_request' // 已提交，等待请求详情（Overlay 加载中）
  | 'approval_opened' // 审批 Overlay 已接管，扫描器只保留反馈

export type IdentityQrScanEvent =
  | { type: 'OPEN' } // 打开扫描器
  | { type: 'PERMISSION_DENIED' } // 相机权限被拒（降级到相册/手动）
  | { type: 'PICK_STARTED' } // 用户选择/拍摄了图片，开始本地解析
  | { type: 'PARSE_INVALID' } // 解析失败（非有效身份二维码）
  | { type: 'SUBMIT_REJECTED' } // intent store 拒绝（重复/队列满），回扫描态
  | { type: 'SUBMITTED' } // 已提交 coordinator（等待详情/Overlay）
  | { type: 'REQUEST_EXPIRED' } // Core 判定过期
  | { type: 'APPROVAL_OPENED' } // 审批 Overlay 可见
  | { type: 'RESET' } // 关闭/重新打开（组件卸载后必须回到初始态）

export interface IdentityQrScanState {
  phase: IdentityQrScanPhase
}

export const INITIAL_QR_SCAN_STATE: IdentityQrScanState = { phase: 'scanning' }

export const identityQrScanReducer = (
  state: IdentityQrScanState,
  event: IdentityQrScanEvent
): IdentityQrScanState => {
  switch (event.type) {
    case 'OPEN':
    case 'RESET':
      // 重新打开一律回到扫描态（残留的错误/终态不跨会话保留）
      return INITIAL_QR_SCAN_STATE
    case 'PERMISSION_DENIED':
      // 权限拒绝：保留可降级入口（相册/手动），回到 scanning 态并允许 UI 提示
      return { phase: 'permission_needed' }
    case 'PICK_STARTED':
      return { phase: 'parsing' }
    case 'PARSE_INVALID':
      return { phase: 'invalid_code' }
    case 'SUBMIT_REJECTED':
      // 已在等待中/队列满：回到扫描态（用户可换一个二维码）
      return { phase: 'scanning' }
    case 'SUBMITTED':
      return { phase: 'loading_request' }
    case 'REQUEST_EXPIRED':
      return { phase: 'expired_request' }
    case 'APPROVAL_OPENED':
      return { phase: 'approval_opened' }
    default:
      return state
  }
}
