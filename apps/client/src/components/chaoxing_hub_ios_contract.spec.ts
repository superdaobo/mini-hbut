// iOS 课程中心崩溃防护契约测试（#528）
// 通过读取 ChaoxingHubView.vue 源码断言，验证防崩溃防护不回归：
// 1) 封面缩略图转换（origin → 150_150c）
// 2) iOS 渐进渲染真正生效（visibleCourses 以 courseRenderLimit 为准）
// 3) iOS loading 退场延后一帧（与列表首渲染错帧）
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { describe, it, expect } from 'vitest'

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'ChaoxingHubView.vue'), 'utf8')

describe('ChaoxingHubView iOS 崩溃防护契约', () => {
  it('课程封面 origin 原图转 150x150c 缩略图', () => {
    expect(source).toMatch(/\.replace\('\/star3\/origin\/', '\/star3\/150_150c\/'\)/)
  })

  it('渐进渲染真正生效：visibleCourses 以 courseRenderLimit 为准（非 max(batch, limit)）', () => {
    // Math.max(batch, limit) 会使首帧 limit=6 被 max(12,6)=12 吞掉 → 渐进失效
    expect(source).toMatch(/slice\(0, courseRenderLimit\.value\)/)
    expect(source).not.toMatch(/Math\.max\(IOS_SAFE_COURSE_BATCH, courseRenderLimit\.value\)/)
  })

  it('首帧小批 + rAF 逐批递增', () => {
    expect(source).toMatch(/Math\.min\(INITIAL_COURSE_BATCH, IOS_PROGRESSIVE_FIRST_BATCH\)/)
    expect(source).toMatch(/requestAnimationFrame\(step\)/)
    expect(source).toMatch(/courseRenderLimit\.value \+ 3/)
  })

  it('所有平台分批渲染：visibleCourses 无平台分支，以 courseRenderLimit 截断', () => {
    expect(source).toMatch(/slice\(0, courseRenderLimit\.value\)/)
    // 不再有「非 iOS 全量渲染」分支
    expect(source).not.toMatch(/if \(!isIOSLikeDevice\) return filteredCourses\.value/)
  })

  it('滚动自动加载：IntersectionObserver 哨兵 + 防抖', () => {
    expect(source).toMatch(/IntersectionObserver/)
    expect(source).toMatch(/loadMoreSentinelRef/)
    expect(source).toMatch(/lastCourseAutoLoadAt < 300/)
    expect(source).toMatch(/courseRenderLimit\.value \+= COURSE_LOAD_MORE_STEP/)
  })

  it('iOS loading 退场延后一帧（与列表首渲染错帧）', () => {
    expect(source).toMatch(/isIOSLikeDevice\)\s*\{\s*requestAnimationFrame\(\(\) => \{/)
  })

  it('rAF 清理覆盖卸载/内存告警/重置', () => {
    const cancelCount = (source.match(/cancelAnimationFrame\(progressiveRenderRaf\)/g) || []).length
    expect(cancelCount).toBeGreaterThanOrEqual(3)
  })
})
