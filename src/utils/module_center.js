const DEFAULT_MODULE_CDN_BASE = 'https://hbut.6661111.xyz/modules'

export const DEFAULT_MODULE_CENTER = Object.freeze({
  channel: 'main',
  modules: Object.freeze([
    Object.freeze({
      id: 'hecheng_hugongda',
      name: '合成湖工大',
      icon: '🎮',
      description: '下载最新游戏包并打开',
      key_required: false,
      kind: 'remote',
      order: 1
    }),
    Object.freeze({
      id: 'jump_out_hbut',
      name: '跳出湖工大',
      icon: '🦘',
      description: '跳一跳风格校园跳跃小游戏',
      key_required: false,
      kind: 'remote',
      order: 2
    }),
    Object.freeze({
      id: 'hbut_2048',
      name: '2048 湖工大版',
      icon: '🔢',
      description: '经典 2048 数字合并游戏',
      key_required: false,
      kind: 'remote',
      order: 3
    }),
    Object.freeze({
      id: 'clumsy_bird_hbut',
      name: '笨鸟先飞',
      icon: '🐦',
      description: '点击屏幕控制小鸟飞行',
      key_required: false,
      kind: 'remote',
      order: 4
    }),
    Object.freeze({
      id: 'hbut_monopoly',
      name: '湖工大富翁',
      icon: '🎲',
      description: '投骰走遍校园，经营金币与绩点',
      key_required: false,
      kind: 'remote',
      order: 5
    }),
    Object.freeze({
      id: 'hbut_miner',
      name: '湖工矿工',
      icon: '⛏️',
      description: '摆动吊钩抓取湖工宝物',
      key_required: false,
      kind: 'remote',
      order: 6
    }),
    Object.freeze({
      id: 'hbut_memory_match',
      name: '湖工记忆牌',
      icon: '🧠',
      description: '翻开校园记忆，配对湖工地点',
      key_required: false,
      kind: 'remote',
      order: 7
    })
  ])
})

const safeText = (value) => String(value ?? '').trim()
const firstNonEmpty = (...values) => {
  for (const value of values) {
    const text = safeText(value)
    if (text) return text
  }
  return ''
}
const toBool = (value) => value === true || value === 1 || value === '1'
const safeNumber = (value, fallback = 0) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

export const normalizeModuleCenterChannel = (value, fallback = 'main') => {
  const normalized = safeText(value).toLowerCase()
  if (normalized === 'latest') return 'latest'
  if (normalized === 'dev') return 'dev'
  if (normalized === 'main') return 'main'
  return fallback === 'dev' || fallback === 'latest' ? fallback : 'main'
}

export const buildModuleManifestUrl = ({
  rawUrl = '',
  channel = DEFAULT_MODULE_CENTER.channel,
  moduleId = '',
  moduleCdnBase = DEFAULT_MODULE_CDN_BASE
} = {}) => {
  const explicit = safeText(rawUrl)
  const normalizedChannel = normalizeModuleCenterChannel(channel)
  const id = safeText(moduleId)
  const base = safeText(moduleCdnBase).replace(/\/+$/, '') || DEFAULT_MODULE_CDN_BASE
  if (explicit) {
    try {
      return new URL(explicit, `${base}/${normalizedChannel}/`).toString()
    } catch {
      return explicit
    }
  }
  return id ? `${base}/${normalizedChannel}/${id}/manifest.json` : ''
}

export const normalizeModuleCenterEntry = (
  value,
  index = 0,
  channel = DEFAULT_MODULE_CENTER.channel,
  options = {}
) => {
  const raw = value && typeof value === 'object' ? value : {}
  const id = firstNonEmpty(raw.id, raw.module_id)
  if (!id) return null

  const kindText = safeText(raw.kind || raw.type).toLowerCase()
  const kind = kindText === 'internal' || id === 'shuake' ? 'internal' : 'remote'
  const view = firstNonEmpty(raw.view, raw.route, id === 'shuake' ? 'more_shuake' : '')
  const order = safeNumber(raw.order, index + 1)

  return {
    id,
    name: firstNonEmpty(raw.name, raw.module_name, raw.title, id),
    icon: firstNonEmpty(raw.icon, id === 'shuake' ? '🔐' : kind === 'remote' ? '📦' : '🧩'),
    description: firstNonEmpty(raw.description, raw.desc),
    key_required: id === 'shuake' || toBool(raw.key_required || raw.keyRequired),
    kind,
    view,
    order,
    min_compatible_version: firstNonEmpty(raw.min_compatible_version, raw.minCompatibleVersion),
    manifest_url:
      kind === 'remote'
        ? buildModuleManifestUrl({
            rawUrl: firstNonEmpty(raw.manifest_url, raw.manifestUrl),
            channel,
            moduleId: id,
            moduleCdnBase: options.moduleCdnBase
          })
        : ''
  }
}

const mergeRemoteCatalogFields = (item, catalogItem, channel, moduleCdnBase) => {
  if (!item || item.kind !== 'remote' || !catalogItem) return item
  return {
    ...catalogItem,
    ...item,
    kind: 'remote',
    manifest_url: firstNonEmpty(
      catalogItem.manifest_url,
      catalogItem.manifestUrl,
      item.manifest_url,
      buildModuleManifestUrl({ channel, moduleId: item.id, moduleCdnBase })
    )
  }
}

export const buildModuleCenterCards = ({
  channel = DEFAULT_MODULE_CENTER.channel,
  configuredModules = [],
  catalogModules = [],
  moduleCdnBase = DEFAULT_MODULE_CDN_BASE
} = {}) => {
  const normalizedChannel = normalizeModuleCenterChannel(channel)
  const normalize = (item, index) =>
    normalizeModuleCenterEntry(item, index, normalizedChannel, { moduleCdnBase })

  const builtInModules = DEFAULT_MODULE_CENTER.modules.map(normalize).filter(Boolean)
  const builtInInternalModules = builtInModules.filter((item) => item.kind === 'internal')
  const normalizedCatalogModules = (Array.isArray(catalogModules) ? catalogModules : [])
    .map(normalize)
    .filter(Boolean)
  const catalogMap = new Map(normalizedCatalogModules.map((item) => [item.id, item]))

  const normalizedConfiguredModules = (Array.isArray(configuredModules) ? configuredModules : [])
    .map(normalize)
    .filter(Boolean)

  const configuredMap = new Map(normalizedConfiguredModules.map((item) => [item.id, item]))
  const configuredInternalModules = normalizedConfiguredModules.filter((item) => item.kind === 'internal')

  // 内置游戏不依赖网站 catalog，避免线上 catalog 滞后时新增游戏入口消失。
  const mergedById = new Map()
  for (const item of builtInInternalModules) {
    mergedById.set(item.id, item)
  }
  for (const item of configuredInternalModules) {
    mergedById.set(item.id, item)
  }
  for (const item of builtInModules.filter((entry) => entry.kind === 'remote')) {
    const configuredItem = configuredMap.get(item.id)
    const catalogItem = catalogMap.get(item.id)
    const baseItem = configuredItem && configuredItem.kind === 'remote' ? { ...item, ...configuredItem } : item
    mergedById.set(
      item.id,
      mergeRemoteCatalogFields(baseItem, catalogItem, normalizedChannel, moduleCdnBase)
    )
  }
  for (const item of normalizedCatalogModules) {
    if (mergedById.has(item.id)) continue
    mergedById.set(item.id, item)
  }

  return [...mergedById.values()].sort((a, b) => {
    const orderDelta = safeNumber(a.order, 999) - safeNumber(b.order, 999)
    if (orderDelta !== 0) return orderDelta
    if (a.kind === 'internal' && b.kind !== 'internal') return -1
    if (a.kind !== 'internal' && b.kind === 'internal') return 1
    return safeText(a.id).localeCompare(safeText(b.id))
  })
}
