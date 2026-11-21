/**
 * #1371 照片版校园地图（CampusPhotoMapView）源码契约。
 *
 * 仓库没有 @vue/test-utils / DOM 环境，组件行为通过源码契约锁定：
 * 两张地图卡片的 URL、本地缓存接线、手势/缩放能力，
 * 以及「已删除微信导览块、字符图标、死样式」不得回归。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('CampusPhotoMapView #1371 照片版地图契约', () => {
  const source = read('./CampusPhotoMapView.vue')

  it('必须包含两张校园地图图片与缓存接线', () => {
    expect(source).toContain('raw/main/map/map1.jpg')
    expect(source).toContain('raw/main/map/map2.jpg')
    expect(source).toContain('resolveCachedImage')
    expect(source).toContain("cacheKey: `campus-map-${item.id}`")
  })

  it('必须保留缩放/拖拽/捏合查看器能力', () => {
    expect(source).toContain('clamp(scale.value + delta, 1, 6)')
    expect(source).toContain('onPointerDown')
    expect(source).toContain('lastPinchDistance')
    expect(source).toContain('clampOffset')
    expect(source).toContain('resetView')
    expect(source).toContain('openRaw')
  })

  it('不得残留微信小程序导览代码', () => {
    expect(source).not.toContain('WECHAT_CAMPUS_GUIDE')
    expect(source).not.toContain('weixin://')
    expect(source).not.toContain('openWeChatMiniProgram')
    expect(source).not.toContain('mini-program')
  })

  it('不得用字符当图标，工具栏必须走 Material Symbols', () => {
    expect(source).not.toContain('☰')
    expect(source).not.toContain('◎')
    expect(source).toContain('material-symbols-outlined')
    expect(source).toContain('zoom_in')
    expect(source).toContain('zoom_out')
    expect(source).toContain('restart_alt')
    expect(source).toContain('open_in_new')
    expect(source).toContain('close')
  })

  it('不得保留旧 view-header 死样式', () => {
    expect(source).not.toContain('.view-header')
    expect(source).not.toContain('.header-btn')
    expect(source).not.toContain('.header-spacer')
  })

  it('查看器按钮必须有 aria-label', () => {
    expect(source).toContain('aria-label="关闭查看器"')
    expect(source).toContain('aria-label="缩小"')
    expect(source).toContain('aria-label="放大"')
    expect(source).toContain('aria-label="重置视图"')
    expect(source).toContain('aria-label="查看原图"')
  })
})
