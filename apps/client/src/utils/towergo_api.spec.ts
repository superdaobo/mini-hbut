import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TOWERGO_CONFIG,
  buildTowerGoRequestInit,
  createTowerGoStorage,
  normalizeTowerGoResult,
  redactForLog
} from './towergo_api'

describe('towergo api contract', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  it('uses an isolated towergo proxy path instead of the main bridge api path', () => {
    expect(TOWERGO_CONFIG.baseUrl).toBe('/towergo')
    expect(TOWERGO_CONFIG.realBaseUrl).toBe('https://ebike-oper.chinatowercom.cn')
    expect(TOWERGO_CONFIG.appId).toBe('wx278283883c249e3e')
    expect(TOWERGO_CONFIG.qqMapKey).toBe('LQBBZ-Y42ER-STHWC-WORES-QFUQS-SKFFV')
  })

  it('builds signed mini-program compatible JSON request headers', async () => {
    vi.setSystemTime(new Date('2026-06-09T08:00:00.000Z'))
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789)
    const storage = createTowerGoStorage('towergo_spec_')
    storage.set('deviceId', 'device-1')
    storage.set('loginInfo', { accessToken: 'access-token-1' })
    storage.set('channelInfo', { cityAreaCode: '420100', provinceDeptCode: '420000' })

    const init = await buildTowerGoRequestInit('POST', '/client/rent/getCarInfo', { carId: 'HBUT001' }, { storage })
    const headers = init.headers as Record<string, string>
    const body = JSON.parse(String(init.body))

    expect(body).toMatchObject({
      carId: 'HBUT001',
      platform: 'wechat',
      tenantId: '1',
      appId: 'wx278283883c249e3e',
      deviceId: 'device-1',
      cityAreaCode: '420100',
      provinceDeptCode: '420000'
    })
    expect(headers.Authorization).toBe('Bearer access-token-1')
    expect(headers['x-miniprogram-appid']).toBe('wx278283883c249e3e')
    expect(headers['x-client-platform']).toBe('mini-hbut-tauri')
    expect(headers._t).toBe('1780992000000')
    expect(headers._s).toMatch(/^[a-f0-9]{64}$/)
  })

  it('uses basic authorization for oauth token requests and redacts sensitive logs', async () => {
    vi.setSystemTime(new Date('2026-06-09T08:00:00.000Z'))
    const init = await buildTowerGoRequestInit('POST', '/oauth/token', { phone: '+86-13812345678' })
    const headers = init.headers as Record<string, string>

    expect(headers.Authorization).toBe('Basic MTp6aHVveWluZ3RlY2g=')
    expect(redactForLog({
      Authorization: 'Bearer abc.def.ghi',
      access_token: 'eyJ123456789012345678901234567890',
      phone: '+86-13812345678'
    })).toEqual({
      Authorization: '[redacted]',
      access_token: '[redacted]',
      phone: '[redacted]'
    })
  })

  it('normalizes common success and auth-expired response shapes', () => {
    expect(normalizeTowerGoResult({ code: '00000', data: { ok: 1 } }, 200)).toMatchObject({
      ok: true,
      code: '00000',
      data: { ok: 1 },
      httpStatus: 200
    })
    expect(normalizeTowerGoResult({ code: '00005', msg: '登录过期' }, 200)).toMatchObject({
      ok: false,
      authExpired: true,
      msg: '登录过期'
    })
  })

  it('keeps http status when upstream returns a non-json body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 502,
      text: async () => '<html>bad gateway</html>'
    })))

    const { towerGoRequest } = await import('./towergo_api')
    const result = await towerGoRequest('GET', '/client/test/non-json')

    expect(result).toMatchObject({
      ok: false,
      code: 'INVALID_JSON',
      httpStatus: 502
    })
  })
})
