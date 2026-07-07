import { describe, expect, it } from 'vitest'
import { buildWisdomSign, serializeWisdomParams } from './sign'

describe('campus guide wisdom sign', () => {
  it('serializes params with sorted keys and skips empty values', () => {
    const serialized = serializeWisdomParams({
      scenic_id: '48770',
      empty: '',
      zero: 0,
      skip: false,
      field: ['basic', 'ticket_info', 'aoi', 'bus_road_list']
    })
    expect(serialized).toBe(
      'field=["basic","ticket_info","aoi","bus_road_list"]&scenic_id=48770&zero=0'
    )
  })

  it('builds deterministic md5 sign for fixed timestamp', () => {
    const sign = buildWisdomSign({ scenic_id: '48770' }, 1_700_000_000)
    expect(sign).toMatch(/^[a-f0-9]{32}$/)
    expect(sign).toBe(buildWisdomSign({ scenic_id: '48770' }, 1_700_000_000))
  })
})