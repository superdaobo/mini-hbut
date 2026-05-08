// src/utils/widget_snapshot_bench.spec.ts
// 性能基线测试：writeSnapshot I/O P95 ≤ 50ms（fake bridge）+ 快照字节数 ≤ 32 KB
// 对齐 design §12.8

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildTodayCourseSnapshot } from './widget_snapshot'
import type { TodayCourseSnapshot } from '@mini-hbut/capacitor-plugin-mini-hbut-widget'

/** 最大 snapshot 字节数 */
const MAX_SNAPSHOT_BYTES = 32 * 1024

/** 性能基线：P95 ≤ 50ms */
const P95_THRESHOLD_MS = 50

/** 测试迭代次数 */
const ITERATIONS = 100

/**
 * 构造一个接近上限的 mock cache（14 门课，填满字段）
 */
function buildLargeCache(weekIndex: number, weekday: number) {
  const courses = []
  for (let i = 1; i <= 14; i++) {
    courses.push({
      name: `高等数学${i}（理工类）期末复习专题讲座`,
      location: `教学楼A${String(i).padStart(3, '0')}多媒体教室`,
      teacher: `张教授${i}`,
      period_start: i,
      period_end: i,
      time_start: `${String(7 + i).padStart(2, '0')}:00`,
      time_end: `${String(7 + i).padStart(2, '0')}:45`,
      weekday,
      weeks: [weekIndex],
      color: '#FF6B6B',
    })
  }
  return courses
}

/**
 * Fake bridge：模拟原生插件的 writeSnapshot 行为
 * 仅做 JSON 序列化 + 字节数校验，模拟 I/O 延迟 0-2ms
 */
async function fakeBridgeWriteSnapshot(snapshot: TodayCourseSnapshot): Promise<void> {
  const json = JSON.stringify(snapshot)
  const bytes = new TextEncoder().encode(json)
  if (bytes.length > MAX_SNAPSHOT_BYTES) {
    throw new Error('SNAPSHOT_TOO_LARGE')
  }
  // 模拟极小的异步 I/O 延迟
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('Widget Snapshot 性能基线', () => {
  const weekIndex = 5
  const weekday = 3 // 周三
  const now = new Date('2024-03-20T10:00:00+08:00')

  it('writeSnapshot I/O P95 ≤ 50ms（fake bridge 模拟）', async () => {
    const cache = buildLargeCache(weekIndex, weekday)
    const snapshot = buildTodayCourseSnapshot({
      cache,
      studentId: '2021123456',
      weekIndex,
      now,
    })

    const durations: number[] = []

    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now()
      await fakeBridgeWriteSnapshot(snapshot)
      const end = performance.now()
      durations.push(end - start)
    }

    // 排序后取 P95
    durations.sort((a, b) => a - b)
    const p95Index = Math.ceil(ITERATIONS * 0.95) - 1
    const p95 = durations[p95Index]

    console.log(`[bench] writeSnapshot P95: ${p95.toFixed(2)}ms (${ITERATIONS} iterations)`)
    console.log(`[bench] writeSnapshot P50: ${durations[Math.ceil(ITERATIONS * 0.5) - 1].toFixed(2)}ms`)
    console.log(`[bench] writeSnapshot max: ${durations[durations.length - 1].toFixed(2)}ms`)

    expect(p95).toBeLessThanOrEqual(P95_THRESHOLD_MS)
  })

  it('快照序列化后字节数 ≤ 32 KB（14 门课满载）', () => {
    const cache = buildLargeCache(weekIndex, weekday)
    const snapshot = buildTodayCourseSnapshot({
      cache,
      studentId: '2021123456',
      weekIndex,
      now,
    })

    const json = JSON.stringify(snapshot)
    const byteLength = new TextEncoder().encode(json).length

    console.log(`[bench] Snapshot size: ${byteLength} bytes (${(byteLength / 1024).toFixed(2)} KB)`)
    console.log(`[bench] Courses count: ${snapshot.courses.length}`)

    expect(byteLength).toBeLessThanOrEqual(MAX_SNAPSHOT_BYTES)
  })

  it('空课表快照序列化字节数极小', () => {
    const snapshot = buildTodayCourseSnapshot({
      cache: [],
      studentId: '2021123456',
      weekIndex,
      now,
    })

    const json = JSON.stringify(snapshot)
    const byteLength = new TextEncoder().encode(json).length

    console.log(`[bench] Empty snapshot size: ${byteLength} bytes`)

    // 空课表快照应该非常小（< 256 bytes）
    expect(byteLength).toBeLessThan(256)
    expect(byteLength).toBeLessThanOrEqual(MAX_SNAPSHOT_BYTES)
  })

  it('buildTodayCourseSnapshot 纯函数性能 P95 ≤ 10ms', () => {
    const cache = buildLargeCache(weekIndex, weekday)
    const durations: number[] = []

    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now()
      buildTodayCourseSnapshot({
        cache,
        studentId: '2021123456',
        weekIndex,
        now,
      })
      const end = performance.now()
      durations.push(end - start)
    }

    durations.sort((a, b) => a - b)
    const p95Index = Math.ceil(ITERATIONS * 0.95) - 1
    const p95 = durations[p95Index]

    console.log(`[bench] buildTodayCourseSnapshot P95: ${p95.toFixed(2)}ms`)

    expect(p95).toBeLessThanOrEqual(10)
  })
})
