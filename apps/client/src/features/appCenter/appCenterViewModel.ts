// src/features/appCenter/appCenterViewModel.ts
//
// Epic #1243（G2-04 / mini-hbut#1253）：**应用中心页**的展示模型（纯函数）。
//
// 输入是服务端 `/api/app-catalog/v1/apps` 的原样数组（或 T08 数据层归一化后的条目），
// 输出是可直接渲染的卡片列表。**本模块不拉取、不 import 数据层**：
// 展示层不依赖其它 PR 链的内部类型（T17 在同步状态页踩过这个坑）。
//
// 三条产品红线（都写进测试）：
//   1. `status !== 'active'` 的卡片必须显示「已下架」，且**不可进入**（不能给 SSO）；
//   2. 未提供隐私说明 → 显示「未提供隐私说明」，**不隐藏**这条信息；
//   3. `allowed_origins` 为空 = **不可内嵌**（不是「不限制」）。

export type AppCardState = 'available' | 'disabled'

export interface AppCard {
  clientId: string
  label: string
  owner: string
  state: AppCardState
  /** 状态徽标文案 */
  badge: string
  /** 可申请的数据类别（人类可读） */
  domains: string[]
  /** 是否允许内嵌（空 allowed_origins = 不允许） */
  embeddable: boolean
  /** 隐私说明地址；空串 = 未提供 */
  privacyUrl: string
  /** 是否可以点进去（disabled 一律不可） */
  actionable: boolean
}

export interface AppCenterModel {
  cards: AppCard[]
  /** 页面级提示 */
  notice: string
  /** 是否所有卡片都不可用（用于空态文案） */
  allDisabled: boolean
}

const DOMAIN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  profile: '基本资料',
  schedule: '课表',
  grades: '成绩',
  exams: '考试',
  rank: '排名',
  cloud_sync: '云同步',
  forum: '论坛',
  game: '游戏'
})

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const safeText = (value: unknown): string => String(value ?? '').trim()

/** 裸 https origin 判定（与清单校验、沙箱判定同口径）。 */
export const isBareHttpsOrigin = (value: unknown): boolean => {
  const text = safeText(value)
  if (!text || text !== String(value ?? '') || text.includes('*')) return false
  if (!text.toLowerCase().startsWith('https://')) return false
  const authority = text.slice('https://'.length)
  if (!authority || authority !== authority.toLowerCase()) return false
  if (/[/?#@]/.test(authority)) return false
  const host = authority.split(':')[0]
  return Boolean(host) && host.includes('.')
}

const domainLabels = (raw: unknown): string[] => {
  if (!isPlainObject(raw)) return []
  return Object.keys(raw)
    .map((key) => DOMAIN_LABELS[key] || key)
    .filter((label) => Boolean(label))
}

/**
 * 目录 → 卡片列表。
 *
 * 缺 `client_id` 的条目**直接丢弃**（无法渲染、也无法使用）。
 * 非数组输入 → 空列表 + 页面提示（fail closed，不猜）。
 */
export const buildAppCenter = (apps: unknown): AppCenterModel => {
  if (!Array.isArray(apps)) {
    return { cards: [], notice: '暂时无法加载应用列表', allDisabled: false }
  }
  const cards: AppCard[] = []
  for (const raw of apps) {
    if (!isPlainObject(raw)) continue
    const clientId = safeText(raw.client_id)
    if (!clientId) continue
    const status = safeText(raw.status)
    const active = status === 'active'
    const origins = (Array.isArray(raw.allowed_origins) ? raw.allowed_origins : []).filter((origin) =>
      isBareHttpsOrigin(origin)
    )
    cards.push({
      clientId,
      label: safeText(raw.label) || clientId,
      owner: safeText(raw.owner),
      state: active ? 'available' : 'disabled',
      badge: active ? '已审核' : '已下架',
      domains: domainLabels(raw.data_domains),
      embeddable: active && origins.length > 0,
      privacyUrl: safeText(raw.privacy_url),
      actionable: active
    })
  }

  const allDisabled = cards.length > 0 && cards.every((card) => !card.actionable)
  let notice = ''
  if (cards.length === 0) {
    notice = '暂无已审核的应用'
  } else if (allDisabled) {
    notice = '已审核的应用当前均不可用'
  }
  return { cards, notice, allDisabled }
}

/** 卡片的隐私说明文案（未提供时**明说**，不隐藏）。 */
export const privacyText = (card: AppCard): string =>
  card.privacyUrl ? '查看隐私说明' : '未提供隐私说明'

/** 卡片副标题：负责人 + 可申请类别。 */
export const cardSubtitle = (card: AppCard): string => {
  const parts: string[] = []
  if (card.owner) parts.push(`负责人：${card.owner}`)
  parts.push(card.domains.length ? `可申请：${card.domains.join('、')}` : '未申请数据类别')
  return parts.join(' · ')
}

/** 点击卡片时的判定（disabled 一律不可进入）。 */
export const canOpenCard = (card: AppCard | null | undefined): boolean =>
  !!card && card.state === 'available' && card.actionable
