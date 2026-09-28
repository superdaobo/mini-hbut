/**
 * 契约 A：客户端灰度（canary）纯函数层测试。
 *
 * 覆盖：
 * - SHA-256 实现正确性（FIPS 180-4 标准向量，分桶公式依赖它）；
 * - 版本模式（与契约 B 服务端同构的「字面前缀 + 末尾 `*`」语义）校验与匹配；
 * - `normalizeGamePlatformCanary` 严格校验（非法 → 全关哨兵，缺省 → 不做灰度）；
 * - 判定顺序不可调换：deny_versions → allow_students → allow_versions → percent 分桶；
 * - fail closed：percent 边界 / 类型非法 / 分桶键不可得一律排除；
 * - 分桶稳定（同 id 同结果）与分布合理（固定种子 1000 个 id 实测命中数）。
 */
import { describe, expect, it } from 'vitest'
import {
  INVALID_GAME_PLATFORM_CANARY,
  canaryRequiresBucket,
  evaluateGamePlatformCanary,
  gameCanaryBucket,
  isValidGameVersionPattern,
  matchGameVersionPattern,
  normalizeGameInstallId,
  normalizeGamePlatformCanary,
  sha256Hex
} from './game_center/canary'

const STUDENT = '2024000001'
const OTHER_STUDENT = '2024000002'
const BETA_CLIENT = '1.4.12-beta.1'
/** 确定性 32 hex 安装 id（测试固定值） */
const INSTALL_A = 'a'.repeat(32)

const parse = (raw: unknown) => normalizeGamePlatformCanary(raw)

/** 归一化 + 判定的一站式辅助（canary 传原始 JSON 形态） */
const decide = (
  raw: unknown,
  ctx: { appVersion?: unknown; studentId?: unknown; installId?: unknown } = {}
) =>
  evaluateGamePlatformCanary({
    canary: normalizeGamePlatformCanary(raw),
    appVersion: ctx.appVersion ?? BETA_CLIENT,
    studentId: ctx.studentId ?? '',
    installId: ctx.installId ?? INSTALL_A
  })

describe('sha256（同步实现，分桶公式依赖）', () => {
  it('匹配 FIPS 180-4 标准测试向量', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    )
    // 跨 64 字节分块边界（55/56/64 字节 + UTF-8 代理对）
    expect(sha256Hex('a'.repeat(55))).toBe(
      '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318'
    )
    expect(sha256Hex('a'.repeat(56))).toBe(
      'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a'
    )
    expect(sha256Hex('\u{1F600}')).toBe(
      'f0443a342c5ef54783a111b51ba56c938e474c32324d90c3a60c9c8e3a37e2d9'
    )
  })

  it('输出恒为 64 位小写 hex，且确定性（同输入同结果）', () => {
    for (const value of ['', 'abc', '安装 id', '0'.repeat(200)]) {
      const digest = sha256Hex(value)
      expect(digest).toMatch(/^[0-9a-f]{64}$/)
      expect(sha256Hex(value)).toBe(digest)
    }
  })
})

describe('版本模式（契约 A 客户端 / 契约 B 服务端同构）', () => {
  it('合法模式：精确串或「字面前缀 + 末尾 *」', () => {
    expect(isValidGameVersionPattern('1.4.12')).toBe(true)
    expect(isValidGameVersionPattern('1.4.12-beta.1')).toBe(true)
    expect(isValidGameVersionPattern('1.4.12-beta.*')).toBe(true)
    expect(isValidGameVersionPattern('1.*')).toBe(true)
  })

  it('非法模式：单独 * / 中间 * / 空串 / 空白 / 非字符串', () => {
    // 单独 `*` = 全匹配 → 拒绝（需要全量时请去掉 canary 或用块级开关，fail closed 精神）
    expect(isValidGameVersionPattern('*')).toBe(false)
    expect(isValidGameVersionPattern('1.*.3')).toBe(false)
    expect(isValidGameVersionPattern('1.4.*.*')).toBe(false)
    expect(isValidGameVersionPattern('')).toBe(false)
    expect(isValidGameVersionPattern(' 1.4.*')).toBe(false)
    expect(isValidGameVersionPattern('1.4.* ')).toBe(false)
    expect(isValidGameVersionPattern('1.4.12 beta.*')).toBe(false)
    expect(isValidGameVersionPattern('版本*')).toBe(false)
    expect(isValidGameVersionPattern(123 as unknown)).toBe(false)
    expect(isValidGameVersionPattern(null as unknown)).toBe(false)
  })

  it('匹配语义：精确相等 / 末尾通配前缀匹配 / 区分大小写 / 空版本不匹配', () => {
    expect(matchGameVersionPattern('1.4.12-beta.1', '1.4.12-beta.1')).toBe(true)
    expect(matchGameVersionPattern('1.4.12-beta.1', '1.4.12-beta.10')).toBe(false)
    expect(matchGameVersionPattern('1.4.12-beta.*', '1.4.12-beta.1')).toBe(true)
    expect(matchGameVersionPattern('1.4.12-beta.*', '1.4.12-beta.99')).toBe(true)
    // 前缀必须包含 `*` 前的点：`1.4.12-beta.*` 不匹配 `1.4.12-beta`（无后缀）
    expect(matchGameVersionPattern('1.4.12-beta.*', '1.4.12-beta')).toBe(false)
    expect(matchGameVersionPattern('1.4.12-beta.*', '1.4.12')).toBe(false)
    expect(matchGameVersionPattern('1.4.12', '1.4.12.0')).toBe(false)
    expect(matchGameVersionPattern('1.4.12', '1.4.12')).toBe(true)
    expect(matchGameVersionPattern('1.4.12-Beta.*', '1.4.12-beta.1')).toBe(false)
    expect(matchGameVersionPattern('1.4.12-beta.*', '')).toBe(false)
  })
})

describe('normalizeGamePlatformCanary（严格校验，fail closed）', () => {
  it('字段缺省（undefined/null）→ null：不做灰度，由 enabled / flags 决定', () => {
    expect(normalizeGamePlatformCanary(undefined)).toBeNull()
    expect(normalizeGamePlatformCanary(null)).toBeNull()
  })

  it('canary 存在但 percent 缺省 → 0%（宁可关，不得默认全量）', () => {
    const parsed = parse({})
    expect(parsed).not.toBeNull()
    expect(parsed?.percent).toBe(0)
    expect(parsed?.allow_versions).toEqual([])
    expect(parsed?.deny_versions).toEqual([])
    expect(parsed?.allow_students).toEqual([])
    const decision = decide({})
    expect(decision.included).toBe(false)
    expect(decision.reason).toBe('percent_zero')
  })

  it('percent 越界 / 类型非法 → 全关哨兵（引用相等）', () => {
    for (const percent of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY, '5', '50%', {}, [], true]) {
      expect(parse({ percent }), `percent=${JSON.stringify(percent)}`).toBe(INVALID_GAME_PLATFORM_CANARY)
    }
    expect(decide({ percent: -1 }).reason).toBe('canary_invalid')
    expect(decide({ percent: 101 }).reason).toBe('canary_invalid')
  })

  it('percent 边界 0 / 100 合法；允许小数百分比', () => {
    expect(parse({ percent: 0 })?.percent).toBe(0)
    expect(parse({ percent: 100 })?.percent).toBe(100)
    expect(parse({ percent: 5.5 })?.percent).toBe(5.5)
  })

  it('canary 非对象 / 版本串非法 / 学号条目非法 → 全关哨兵', () => {
    expect(parse('garbage')).toBe(INVALID_GAME_PLATFORM_CANARY)
    expect(parse([])).toBe(INVALID_GAME_PLATFORM_CANARY)
    expect(parse(5)).toBe(INVALID_GAME_PLATFORM_CANARY)
    expect(parse({ percent: 5, allow_versions: ['1.*.3'] })).toBe(INVALID_GAME_PLATFORM_CANARY)
    expect(parse({ percent: 5, deny_versions: '*' })).toBe(INVALID_GAME_PLATFORM_CANARY)
    expect(parse({ percent: 5, allow_versions: [123] })).toBe(INVALID_GAME_PLATFORM_CANARY)
    expect(parse({ percent: 5, allow_students: ['abc'] })).toBe(INVALID_GAME_PLATFORM_CANARY)
    expect(parse({ percent: 5, allow_students: ['12345'] })).toBe(INVALID_GAME_PLATFORM_CANARY)
    expect(parse({ percent: 5, allow_versions: '1.4.*' })).toBe(INVALID_GAME_PLATFORM_CANARY)
  })

  it('归一化幂等：全关哨兵再次归一化仍是同一哨兵', () => {
    expect(normalizeGamePlatformCanary(INVALID_GAME_PLATFORM_CANARY)).toBe(
      INVALID_GAME_PLATFORM_CANARY
    )
    const once = parse({ percent: 5, allow_versions: ['1.4.12-beta.*'], allow_students: [STUDENT] })
    const twice = normalizeGamePlatformCanary(once)
    expect(twice).toEqual(once)
  })
})

describe('判定顺序（deny_versions → allow_students → allow_versions → percent）', () => {
  it('deny_versions 命中优先于 allow_students 与 allow_versions → 排除', () => {
    const decision = decide(
      {
        percent: 100,
        deny_versions: ['1.4.12-beta.*'],
        allow_versions: ['1.4.12-beta.*'],
        allow_students: [STUDENT]
      },
      { studentId: STUDENT }
    )
    expect(decision).toEqual({ included: false, reason: 'deny_version', bucket: null })
  })

  it('deny_versions 精确串命中同样优先（不因 percent=100 而放行）', () => {
    const decision = decide({ percent: 100, deny_versions: ['1.4.12-beta.1'] })
    expect(decision.included).toBe(false)
    expect(decision.reason).toBe('deny_version')
  })

  it('allow_students 命中优先于 allow_versions 与 percent（percent=0 也纳入）', () => {
    const decision = decide(
      { percent: 0, allow_versions: ['9.9.*'], allow_students: [STUDENT] },
      { studentId: STUDENT }
    )
    expect(decision).toEqual({ included: true, reason: 'allow_student', bucket: null })
  })

  it('allow_versions 命中优先于 percent（percent=0 也纳入）', () => {
    const decision = decide({ percent: 0, allow_versions: ['1.4.12-beta.*'] })
    expect(decision).toEqual({ included: true, reason: 'allow_version', bucket: null })
  })

  it('percent 只在无白名单命中时生效（白名单都不命中才分桶）', () => {
    const notAllowed = decide(
      { percent: 100, allow_versions: ['9.9.*'], allow_students: [OTHER_STUDENT] },
      { studentId: STUDENT }
    )
    expect(notAllowed.reason).toBe('percent_full')
    expect(notAllowed.included).toBe(true)
    expect(notAllowed.bucket).not.toBeNull()

    const zero = decide(
      { percent: 0, allow_versions: ['9.9.*'], allow_students: [OTHER_STUDENT] },
      { studentId: STUDENT }
    )
    expect(zero.reason).toBe('percent_zero')
    expect(zero.included).toBe(false)
  })

  it('学号非合法学号时不参与白名单（回落分桶，不猜测身份）', () => {
    const decision = decide(
      { percent: 0, allow_students: [STUDENT] },
      { studentId: 'not-a-student-id' }
    )
    expect(decision.reason).toBe('percent_zero')
    expect(decision.included).toBe(false)
  })
})

describe('percent 边界与 fail closed', () => {
  it('percent=0 → 全关（不需要分桶键）', () => {
    expect(decide({ percent: 0 }, { installId: '' })).toEqual({
      included: false,
      reason: 'percent_zero',
      bucket: null
    })
  })

  it('percent=100 → 全开（有分桶键时）', () => {
    const decision = decide({ percent: 100 })
    expect(decision.included).toBe(true)
    expect(decision.reason).toBe('percent_full')
    expect(decision.bucket).toBe(gameCanaryBucket(INSTALL_A))
  })

  it('2026-09-28 安全口径：percent>0 时一律要求分桶键（不可得 → 一律排除）', () => {
    expect(decide({ percent: 5 }, { installId: '' })).toEqual({
      included: false,
      reason: 'bucket_unavailable',
      bucket: null
    })
    // percent=100 也要求分桶键（契约「分桶键不可得 → 一律排除」的字面语义）
    expect(decide({ percent: 100 }, { installId: '' })).toEqual({
      included: false,
      reason: 'bucket_unavailable',
      bucket: null
    })
    // 非法 / 污染的分桶键同样不可得
    expect(decide({ percent: 5 }, { installId: 'garbage' }).reason).toBe('bucket_unavailable')
    expect(decide({ percent: 5 }, { installId: 'z'.repeat(32) }).reason).toBe('bucket_unavailable')
  })

  it('canary 缺省（不做灰度）时不受分桶键影响 → 纳入（由 enabled/flags 决定）', () => {
    expect(
      evaluateGamePlatformCanary({ canary: null, installId: '' })
    ).toEqual({ included: true, reason: 'no_canary', bucket: null })
  })

  it('canary 非法哨兵 → 排除（即使 installId 与白名单都可用）', () => {
    expect(
      evaluateGamePlatformCanary({
        canary: INVALID_GAME_PLATFORM_CANARY,
        appVersion: BETA_CLIENT,
        studentId: STUDENT,
        installId: INSTALL_A
      })
    ).toEqual({ included: false, reason: 'canary_invalid', bucket: null })
  })

  it('canaryRequiresBucket：命中黑白名单 / 非法 / 缺省 → 不需要键；percent>0 未命中 → 需要键', () => {
    expect(canaryRequiresBucket(null, BETA_CLIENT, STUDENT)).toBe(false)
    expect(canaryRequiresBucket(INVALID_GAME_PLATFORM_CANARY, BETA_CLIENT, STUDENT)).toBe(false)
    const canary = parse({
      percent: 5,
      deny_versions: ['1.4.12-beta.*'],
      allow_versions: ['2.0.*'],
      allow_students: [OTHER_STUDENT]
    })
    expect(canaryRequiresBucket(canary, BETA_CLIENT, STUDENT)).toBe(false) // deny 命中
    expect(canaryRequiresBucket(canary, '2.0.1', STUDENT)).toBe(false) // allow_version 命中
    expect(canaryRequiresBucket(canary, '3.0.0', OTHER_STUDENT)).toBe(false) // allow_student 命中
    expect(canaryRequiresBucket(canary, '3.0.0', STUDENT)).toBe(true) // 落分桶
    expect(canaryRequiresBucket(parse({ percent: 0 }), '3.0.0', STUDENT)).toBe(false)
    expect(canaryRequiresBucket(parse({ percent: 100 }), '3.0.0', STUDENT)).toBe(true)
  })
})

describe('分桶（sha256(installId) % 100）', () => {
  it('installId 归一化：32 位 hex、大小写不敏感、其余非法', () => {
    expect(normalizeGameInstallId(INSTALL_A)).toBe(INSTALL_A)
    expect(normalizeGameInstallId(INSTALL_A.toUpperCase())).toBe(INSTALL_A)
    expect(normalizeGameInstallId('  ' + INSTALL_A + '  ')).toBe(INSTALL_A)
    expect(normalizeGameInstallId('')).toBe('')
    expect(normalizeGameInstallId('abc')).toBe('')
    expect(normalizeGameInstallId('0'.repeat(31))).toBe('')
    expect(normalizeGameInstallId('0'.repeat(33))).toBe('')
    expect(normalizeGameInstallId('g'.repeat(32))).toBe('')
    expect(normalizeGameInstallId(null)).toBe('')
    expect(normalizeGameInstallId({})).toBe('')
  })

  it('分桶稳定：同一 installId 多次调用结果相同，且大小写归一后同桶', () => {
    const first = gameCanaryBucket(INSTALL_A)
    expect(first).not.toBeNull()
    for (let i = 0; i < 20; i += 1) {
      expect(gameCanaryBucket(INSTALL_A)).toBe(first)
    }
    expect(gameCanaryBucket(INSTALL_A.toUpperCase())).toBe(first)
    const repeated = decide({ percent: 100 }, { installId: INSTALL_A })
    expect(repeated.bucket).toBe(first)
  })

  it('分桶值域 0..99，且 bucket < percent 决定纳入', () => {
    const bucket = gameCanaryBucket(INSTALL_A) as number
    expect(bucket).toBeGreaterThanOrEqual(0)
    expect(bucket).toBeLessThanOrEqual(99)
    // 用 bucket+1 与 bucket 两个档位验证边界语义（percent=bucket+1 必纳入，percent=bucket 必不纳入）
    if (bucket + 1 <= 100) {
      expect(decide({ percent: bucket + 1 }).included).toBe(true)
    }
    if (bucket > 0) {
      expect(decide({ percent: bucket }).included).toBe(false)
    }
  })

  it('分布合理：固定种子 1000 个 id 的实测命中数', () => {
    const installIds = Array.from({ length: 1000 }, (_, index) =>
      sha256Hex(`canary-distribution-seed:${index}`).slice(0, 32)
    )
    const bucketHits = (percent: number) =>
      installIds.filter((id) => {
        const bucket = gameCanaryBucket(id) as number
        return bucket < percent
      }).length

    const hits5 = bucketHits(5)
    const hits20 = bucketHits(20)
    const hits50 = bucketHits(50)
    // 确定性输出：实测值 p5=42 / p20=193 / p50=510（2026-09-28，本文件固定种子），
    // 下方区间断言锁定「合理分布」（期望 50 / 200 / 500，±3σ 内）
    expect(bucketHits(0)).toBe(0)
    expect(bucketHits(100)).toBe(1000)
    expect(hits5).toBe(42)
    expect(hits5).toBeGreaterThanOrEqual(25)
    expect(hits5).toBeLessThanOrEqual(75)
    expect(hits20).toBeGreaterThanOrEqual(140)
    expect(hits20).toBeLessThanOrEqual(260)
    expect(hits50).toBeGreaterThanOrEqual(420)
    expect(hits50).toBeLessThanOrEqual(580)
    // 分桶互不重叠：5% 档命中一定是 50% 档命中的子集
    const ids5 = installIds.filter((id) => (gameCanaryBucket(id) as number) < 5)
    expect(ids5.every((id) => (gameCanaryBucket(id) as number) < 50)).toBe(true)
    expect(hits5).toBeLessThan(hits20)
    expect(hits20).toBeLessThan(hits50)
  })
})
