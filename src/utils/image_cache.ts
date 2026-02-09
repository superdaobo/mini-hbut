import { convertFileSrc, invoke } from '@tauri-apps/api/core'

/**
 * 图片缓存策略（面向移动端与桌面端统一）：
 * 1. 业务只关心 cacheKey + 远程 URL，通过本工具拿到可直接展示的 src。
 * 2. Tauri 端：写入 AppCache（由 Rust 侧完成），并在前端保存元数据（更新时间、路径、来源 URL）。
 * 3. Web 端：不落磁盘，交给浏览器 HTTP 缓存；本地仅保留元数据用于 TTL 判断。
 * 4. 并发去重：同一 key/url 在一次渲染周期内只会触发一次真实请求。
 */
type CacheMeta = {
  key: string
  url: string
  path?: string
  updatedAt: number
}

type RemoteImageCachePayload = {
  path: string
  from_cache: boolean
  updated_at: string
  size: number
}

type ResolveImageOptions = {
  cacheKey: string
  url: string
  ttlHours?: number
}

const META_PREFIX = 'hbu_image_cache_meta_v1:'
const inFlight = new Map<string, Promise<string>>()

const isTauriRuntime = () => {
  if (typeof window === 'undefined') return false
  const w = window as any
  return Boolean(w.__TAURI__ || w.__TAURI_INTERNALS__ || window.location?.protocol === 'tauri:')
}

const metaKey = (cacheKey: string) => `${META_PREFIX}${cacheKey}`

const readMeta = (cacheKey: string): CacheMeta | null => {
  try {
    const raw = localStorage.getItem(metaKey(cacheKey))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      key: String(parsed.key || cacheKey),
      url: String(parsed.url || ''),
      path: parsed.path ? String(parsed.path) : undefined,
      updatedAt: Number(parsed.updatedAt || 0)
    }
  } catch {
    return null
  }
}

const writeMeta = (cacheKey: string, meta: CacheMeta) => {
  try {
    localStorage.setItem(metaKey(cacheKey), JSON.stringify(meta))
  } catch {
    // 忽略本地存储异常，避免影响主流程
  }
}

const ttlExpired = (updatedAt: number, ttlHours: number) => {
  if (!updatedAt) return true
  const ttlMs = Math.max(1, ttlHours) * 60 * 60 * 1000
  return Date.now() - updatedAt > ttlMs
}

const toLocalSrc = (path: string) => {
  try {
    return convertFileSrc(path)
  } catch {
    return ''
  }
}

async function resolveForTauri(options: ResolveImageOptions): Promise<string> {
  const { cacheKey, url, ttlHours = 24 * 7 } = options
  const meta = readMeta(cacheKey)
  const force = !meta || meta.url !== url || ttlExpired(meta.updatedAt, ttlHours)

  // 先走本地元数据命中，避免每次进入模块都 invoke 后端。
  if (!force && meta?.path) {
    const src = toLocalSrc(meta.path)
    if (src) return src
  }

  const payload = await invoke<RemoteImageCachePayload>('cache_remote_image', {
    cacheKey,
    url,
    force
  })

  if (!payload?.path) return url
  writeMeta(cacheKey, {
    key: cacheKey,
    url,
    path: payload.path,
    updatedAt: Date.now()
  })
  return toLocalSrc(payload.path) || url
}

async function resolveForWeb(options: ResolveImageOptions): Promise<string> {
  const { cacheKey, url, ttlHours = 24 } = options
  const meta = readMeta(cacheKey)
  const force = !meta || meta.url !== url || ttlExpired(meta.updatedAt, ttlHours)

  // Web 端不做文件落地，使用浏览器缓存，元数据仅用于刷新节奏控制。
  if (force) {
    writeMeta(cacheKey, {
      key: cacheKey,
      url,
      updatedAt: Date.now()
    })
  }
  return url
}

export async function resolveCachedImage(options: ResolveImageOptions): Promise<string> {
  const key = `${options.cacheKey}|${options.url}`
  if (!inFlight.has(key)) {
    inFlight.set(
      key,
      (async () => {
        try {
          if (isTauriRuntime()) {
            return await resolveForTauri(options)
          }
          return await resolveForWeb(options)
        } finally {
          inFlight.delete(key)
        }
      })()
    )
  }
  return inFlight.get(key)!
}
