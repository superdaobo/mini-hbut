// src/features/sync/syncMigrationNotice.ts
//
// Epic #1243（G3-05 / mini-hbut#1258）：**旧「关闭同步」用户的迁移告知**（纯函数）。
//
// ## 背景
//
// 历史版本有「关闭云同步」开关（偏好键 `hbu_cloud_sync_user_disabled`）。Epic 把云同步
// 改成常驻基础能力，不再提供关闭 —— 但**绝不能静默开始上传**。
//
// 规则（冻结）：
//   1. 旧偏好为 `disabled` 且未确认过 → **必须显示告知页**；
//   2. 告知页给两个选择：「继续（开启同步）」与「暂不（本次不上传）」；
//   3. 「暂不」**不改变**旧偏好，下次启动再提示（不能一次点击就永久静默上传）；
//   4. 已确认过（`acknowledged`）→ 不再显示。

export type MigrationChoice = 'accept' | 'defer'

export interface MigrationInput {
  /** 旧偏好值（`localStorage['hbu_cloud_sync_user_disabled']`） */
  legacyDisabled?: string | boolean | null
  /** 用户是否已确认过（一次性标记） */
  acknowledged?: boolean
}

export interface MigrationModel {
  /** 是否显示告知页 */
  shouldShow: boolean
  title: string
  body: string
  acceptText: string
  deferText: string
}

/** 旧偏好是否表示「用户曾关闭同步」。 */
export const wasSyncDisabled = (legacy: MigrationInput['legacyDisabled']): boolean => {
  if (typeof legacy === 'boolean') return legacy
  const text = String(legacy ?? '').trim().toLowerCase()
  return text === '1' || text === 'true' || text === 'yes'
}

/**
 * 是否要展示迁移告知页。
 *
 * 只有「曾关闭 + 未确认」才展示 —— 从没关过的用户不该被打扰。
 */
export const buildMigrationNotice = (input: MigrationInput = {}): MigrationModel => {
  const shouldShow = wasSyncDisabled(input.legacyDisabled) && input.acknowledged !== true
  return {
    shouldShow,
    title: '云同步已成为基础能力',
    body:
      '云同步现在用于多设备一致与已授权应用读取你的数据，不再提供关闭开关。' +
      '继续即表示你同意开始同步；你也可以先选择「暂不」，本次不会上传任何数据。' +
      '你可以随时在「数据与授权」里导出或删除云端数据。',
    acceptText: '继续（开启同步）',
    deferText: '暂不（本次不上传）'
  }
}

export interface MigrationOutcome {
  /** 是否写入「已确认」标记 */
  markAcknowledged: boolean
  /** 是否清除旧偏好键 */
  clearLegacyKey: boolean
  /** 本次是否允许上传 */
  allowUpload: boolean
}

/**
 * 用户选择后的落地动作。
 *
 * **「暂不」必须 `allowUpload=false` 且 `markAcknowledged=false`** ——
 * 这样下次启动还会再问，绝不会因为点过一次就永久静默上传。
 */
export const resolveMigrationChoice = (choice: MigrationChoice): MigrationOutcome => {
  if (choice === 'accept') {
    return { markAcknowledged: true, clearLegacyKey: true, allowUpload: true }
  }
  return { markAcknowledged: false, clearLegacyKey: false, allowUpload: false }
}
