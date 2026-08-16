/**
 * Pairwise Subject 测试（#619 验收标准 Subject 1-4）。
 *
 *   sub = base64url(HMAC-SHA256(PAIRWISE_KEY, sector_or_client_id || 0x00 || user_id))
 */
import { describe, expect, it } from 'vitest'
import { derivePairwiseSubject } from '../../src/domain/subjects.js'
import { PairwiseKeyNotConfiguredError } from '../../src/domain/errors.js'
import { TEST_PAIRWISE_KEY, TEST_SHORT_KEY } from '../helpers/keys.js'

const USER_ID = '0198a1b2-7c3d-4e5f-8a9b-0c1d2e3f4a5b'
const STUDENT_ID = '2023000042'

describe('Pairwise Subject', () => {
  it('S1. 同一用户 + 同一 client 永远稳定', () => {
    const sub1 = derivePairwiseSubject({
      pairwiseKey: TEST_PAIRWISE_KEY,
      sectorOrClientId: 'cli_alpha',
      userId: USER_ID,
    })
    const sub2 = derivePairwiseSubject({
      pairwiseKey: TEST_PAIRWISE_KEY,
      sectorOrClientId: 'cli_alpha',
      userId: USER_ID,
    })
    expect(sub1).toBe(sub2)
    // base64url 输出（43 字符 = 32 字节 HMAC）
    expect(sub1).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('S2. 不同 client 的 sub 不同', () => {
    const subA = derivePairwiseSubject({
      pairwiseKey: TEST_PAIRWISE_KEY,
      sectorOrClientId: 'cli_alpha',
      userId: USER_ID,
    })
    const subB = derivePairwiseSubject({
      pairwiseKey: TEST_PAIRWISE_KEY,
      sectorOrClientId: 'cli_beta',
      userId: USER_ID,
    })
    expect(subA).not.toBe(subB)
  })

  it('S3. sub 不包含学号 / 内部 user id', () => {
    const sub = derivePairwiseSubject({
      pairwiseKey: TEST_PAIRWISE_KEY,
      sectorOrClientId: 'cli_alpha',
      userId: USER_ID,
    })
    expect(sub).not.toContain(STUDENT_ID)
    expect(sub).not.toContain(USER_ID)
    // 解码后是 32 字节 HMAC，不含学号明文
    const decoded = Buffer.from(sub, 'base64url').toString('utf8')
    expect(decoded).not.toContain(STUDENT_ID)
  })

  it('S4. key 缺失/占位/过短时 fail closed（不临时生成 key）', () => {
    expect(() =>
      derivePairwiseSubject({ pairwiseKey: undefined, sectorOrClientId: 'cli_alpha', userId: USER_ID }),
    ).toThrow(PairwiseKeyNotConfiguredError)
    expect(() =>
      derivePairwiseSubject({ pairwiseKey: '<replace-me>', sectorOrClientId: 'cli_alpha', userId: USER_ID }),
    ).toThrow(PairwiseKeyNotConfiguredError)
    expect(() =>
      derivePairwiseSubject({ pairwiseKey: TEST_SHORT_KEY, sectorOrClientId: 'cli_alpha', userId: USER_ID }),
    ).toThrow(PairwiseKeyNotConfiguredError)
  })

  it('S4b. 同一用户在不同 key 下 sub 不同（轮换 = 断联，语义明确）', () => {
    const sub1 = derivePairwiseSubject({
      pairwiseKey: TEST_PAIRWISE_KEY,
      sectorOrClientId: 'cli_alpha',
      userId: USER_ID,
    })
    const sub2 = derivePairwiseSubject({
      pairwiseKey: 'another-pairwise-key-0123456789abcdef',
      sectorOrClientId: 'cli_alpha',
      userId: USER_ID,
    })
    expect(sub1).not.toBe(sub2)
  })
})
