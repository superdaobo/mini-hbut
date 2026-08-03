// 测试 fixture：scripts/restore_website_cdn_assets.mjs 类型声明（与导出对齐）
export const CDN_ASSET_DIRS: readonly string[]

export function resolveWebsitePagesAssetDir(checkoutRoot: string, assetDir: string): string

export function restoreWebsiteCdnAssets(options: {
  checkoutRoot: string
  publicRoot?: string
  assetDirs?: readonly string[]
  [key: string]: unknown
}): Promise<unknown>
