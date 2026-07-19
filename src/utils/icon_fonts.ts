/**
 * 本地图标字体加载（无 CDN）。
 * Material Symbols 在 /app-demo 子路径部署时，CSS @font-face 的绝对/相对解析易失败；
 * 使用 FontFace API 显式加载 woff2，确保详情页 ligature 图标渲染（否则显示英文 icon name）。
 */

const MATERIAL_FAMILY = 'Material Symbols Outlined'
const MATERIAL_WOFF2 = 'fonts/material-symbols-outlined.subset.woff2'
const MATERIAL_CSS = 'fonts/material-symbols-outlined.css'

let materialLoadPromise: Promise<boolean> | null = null

/** 解析相对 BASE_URL 的静态资源 URL（兼容 base: './' 的 app-demo 与根路径） */
export const resolvePublicAssetUrl = (relativePath: string): string => {
  const raw = String(relativePath || '').replace(/^\//, '')
  const base = String(import.meta.env.BASE_URL || './')
  const baseNorm = base.endsWith('/') ? base : `${base}/`
  try {
    // 相对当前文档 URL，避免在 iframe 子路径下拼出 /fonts 根路径
    return new URL(`${baseNorm}${raw}`, typeof location !== 'undefined' ? location.href : 'http://localhost/').href
  } catch {
    return `./${raw}`
  }
}

const injectStylesheet = (href: string, id: string) => {
  if (typeof document === 'undefined') return
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

/**
 * 确保 Material Symbols 已注册到 document.fonts。
 * 成功返回 true；失败不抛错（调用方已有英文 fallback）。
 */
export const ensureMaterialSymbolsFont = (): Promise<boolean> => {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
    return Promise.resolve(false)
  }
  if (materialLoadPromise) return materialLoadPromise

  materialLoadPromise = (async () => {
    const cssUrl = resolvePublicAssetUrl(MATERIAL_CSS)
    const fontUrl = resolvePublicAssetUrl(MATERIAL_WOFF2)
    injectStylesheet(cssUrl, 'mini-hbut-material-symbols-css')

    // 清理曾失败的同名 face，避免浏览器继续用 error 状态
    try {
      for (const face of [...document.fonts]) {
        if (face.family.replace(/["']/g, '') === MATERIAL_FAMILY && face.status === 'error') {
          document.fonts.delete(face)
        }
      }
    } catch {
      // ignore
    }

    // 若已有 loaded 的同名字体，直接成功
    try {
      const already = [...document.fonts].some(
        (f) => f.family.replace(/["']/g, '') === MATERIAL_FAMILY && f.status === 'loaded',
      )
      if (already) {
        await document.fonts.load(`24px "${MATERIAL_FAMILY}"`).catch(() => {})
        return true
      }
    } catch {
      // continue load
    }

    try {
      // 使用单一 weight：子集字体 + 可变轴，避免 100 700 范围在部分浏览器 @font-face 失败
      const face = new FontFace(MATERIAL_FAMILY, `url(${fontUrl}) format("woff2")`, {
        style: 'normal',
        weight: '400',
        display: 'block',
      })
      await face.load()
      document.fonts.add(face)
      await document.fonts.load(`24px "${MATERIAL_FAMILY}"`).catch(() => {})
      // 触发已有图标节点重排，使 liga 生效
      try {
        document.querySelectorAll('.material-symbols-outlined').forEach((el) => {
          const node = el as HTMLElement
          void node.offsetWidth
        })
      } catch {
        // ignore
      }
      return true
    } catch (error) {
      console.warn('[icon-fonts] Material Symbols FontFace load failed:', error)
      // 回退：仅依赖 CSS link（根路径部署仍可用）
      return false
    }
  })()

  return materialLoadPromise
}

/** Font Awesome + Material Symbols（详情页图标依赖后者） */
export const loadLocalIconFonts = (): Promise<void> => {
  return Promise.all([
    import('@fortawesome/fontawesome-free/css/fontawesome.css'),
    import('@fortawesome/fontawesome-free/css/solid.css'),
    ensureMaterialSymbolsFont(),
  ]).then(() => undefined).catch((e) => {
    console.warn('[Bootstrap] local icon fonts load failed:', e)
  })
}
