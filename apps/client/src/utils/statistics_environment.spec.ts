import { describe, expect, it } from 'vitest'

import {
  isStatisticsServiceUrlCompatibleForEnvironment,
  resolveStatisticsEnvironment
} from './statistics_environment'

describe('Statistics V2 environment boundary', () => {
  it('maps only release builds to production statistics', () => {
    expect(resolveStatisticsEnvironment('release')).toBe('production')
    expect(resolveStatisticsEnvironment('dev-fast')).toBe('test')
    expect(resolveStatisticsEnvironment('standard')).toBe('test')
    expect(resolveStatisticsEnvironment('')).toBe('test')
  })

  it('prevents known production and test Space endpoints from crossing environments', () => {
    const production = 'https://mini-hbut-ocr-service.hf.space/api/cloud-sync'
    const test = 'https://mini-hbut-testocr1.hf.space/api/cloud-sync'

    expect(isStatisticsServiceUrlCompatibleForEnvironment(production, 'production')).toBe(true)
    expect(isStatisticsServiceUrlCompatibleForEnvironment(test, 'production')).toBe(false)
    expect(isStatisticsServiceUrlCompatibleForEnvironment(test, 'test')).toBe(true)
    expect(isStatisticsServiceUrlCompatibleForEnvironment(production, 'test')).toBe(false)
  })
})
