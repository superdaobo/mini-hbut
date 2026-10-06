/**
 * T8/T11 两域模型默认值契约测试（契约 docs/architecture/backend-endpoints-contract.md §9/§10）。
 *
 * 守护：本地默认锁定 mini.hbut.site（主）+ hf 生产域（唯一兜底）；
 * 历史域名（superdaobo / 1.94.167.18）不得回到默认位；Rust 侧常量与遥测头白名单同步收敛。
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_BACKEND_GROUPS,
  FALLBACK_BACKEND_ORIGIN,
  PRIMARY_BACKEND_ORIGIN
} from './backend_endpoints'
import {
  DEFAULT_FORUM_ENDPOINT,
  DEFAULT_LOCAL_OCR_FALLBACK_ENDPOINTS,
  DEFAULT_OCR_ENDPOINT
} from './remote_config_defaults'
import { DEFAULT_CLOUD_SYNC_ENDPOINT } from './app_settings'

const read = (relative: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8')

describe('两域模型（契约 §9）', () => {
  it('主域 = mini.hbut.site，唯一兜底 = hf 生产域', () => {
    expect(PRIMARY_BACKEND_ORIGIN).toBe('https://mini.hbut.site')
    expect(FALLBACK_BACKEND_ORIGIN).toBe('https://mini-hbut-ocr-service.hf.space')
    expect(DEFAULT_BACKEND_GROUPS.map((group) => group.base)).toEqual([
      PRIMARY_BACKEND_ORIGIN,
      FALLBACK_BACKEND_ORIGIN
    ])
  })

  it('前端默认端点：主域 + 兜底域（不含历史域名）', () => {
    expect(DEFAULT_OCR_ENDPOINT).toBe(`${PRIMARY_BACKEND_ORIGIN}/api/ocr/recognize`)
    expect(DEFAULT_LOCAL_OCR_FALLBACK_ENDPOINTS).toEqual([
      `${FALLBACK_BACKEND_ORIGIN}/api/ocr/recognize`
    ])
    expect(DEFAULT_FORUM_ENDPOINT).toBe(`${PRIMARY_BACKEND_ORIGIN}/api/forum`)
    expect(DEFAULT_CLOUD_SYNC_ENDPOINT).toBe(`${PRIMARY_BACKEND_ORIGIN}/api/cloud-sync`)
    const serialized = JSON.stringify({
      DEFAULT_OCR_ENDPOINT,
      DEFAULT_LOCAL_OCR_FALLBACK_ENDPOINTS,
      DEFAULT_FORUM_ENDPOINT,
      DEFAULT_CLOUD_SYNC_ENDPOINT
    })
    expect(serialized).not.toContain('superdaobo')
    expect(serialized).not.toContain('1.94.167.18')
  })

  it('打包兜底配置：主域 + backend 端点组 + 无历史域名', () => {
    for (const relative of ['public/remote_config.json', 'remote_config.json']) {
      const raw = read(relative)
      expect(raw, `${relative} 应含 backend 端点组`).toContain('"backend"')
      expect(raw).toContain('https://mini.hbut.site/api/cloud-sync')
      expect(raw).toContain('https://mini-hbut-ocr-service.hf.space/api/cloud-sync')
      expect(raw, `${relative} 不得残留历史域名`).not.toContain('1.94.167.18')
      expect(raw).not.toContain('superdaobo-ocr-service')
    }
  })

  it('Rust 侧：OCR 主域/兜底、temp upload 主域、遥测头白名单（两域 + 测试域）', () => {
    const rustHttp = read('src-tauri/src/http_client/mod.rs')
    expect(rustHttp).toContain('"https://mini.hbut.site/api/ocr/recognize"')
    expect(rustHttp).toContain('FALLBACK_OCR_ENDPOINT')
    expect(rustHttp).toContain('&[PRODUCTION_OCR_ENDPOINT, FALLBACK_OCR_ENDPOINT]')
    expect(rustHttp).not.toContain('1.94.167.18')
    expect(rustHttp).not.toContain('superdaobo-ocr-service')

    const rustAuth = read('src-tauri/src/http_client/auth.rs')
    expect(rustAuth).toContain('"https://mini.hbut.site/"')
    expect(rustAuth).toContain('"https://mini-hbut-ocr-service.hf.space/"')
    expect(rustAuth).not.toContain('superdaobo-ocr-service')

    const rustUpload = read('src-tauri/src/transport/tauri/config.rs')
    expect(rustUpload).toContain('"https://mini.hbut.site/api/temp/upload"')

    const rustSchedule = read('src-tauri/src/http_server/routes/schedule.rs')
    expect(rustSchedule).toContain('"https://mini.hbut.site/api/temp/upload"')
  })

  it('游戏 SDK 默认源与五子棋 relay 同步切到主域', () => {
    const sdkVersion = read('../../website/modules-src/_sdk/src/version.js')
    expect(sdkVersion).toContain("DEFAULT_SERVICE_ORIGIN = 'https://mini.hbut.site'")
    const gomokuOnline = read('../../website/modules-src/hbut_gomoku/project/src/game/online.js')
    expect(gomokuOnline).toContain("'https://mini.hbut.site/api/gomoku-relay'")
    // 回归护栏：SDK 不得出现测试域（P1-5）
    expect(sdkVersion).not.toContain('mini-hbut-testocr1')
  })

  it('后端基址统一为主域；已下线的测试域只作为「拒绝清单」保留', () => {
    const source = read('src/utils/statistics_environment.ts')
    expect(source).toContain('PRIMARY_BACKEND_ORIGIN')
    // 2026-10-06 起所有档位统一走生产主域；测试域常量仍须存在（用于拒绝存量配置），
    // 但不得再作为任何档位的基址
    expect(source).toContain('RETIRED_TEST_HOSTS')
    expect(source).toContain("'mini-hbut-testocr1.hf.space'")
    expect(source).not.toContain('superdaobo')
  })

  it('server_api.ts（自建机死代码）已删除', () => {
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/utils/server_api.ts'))).toBe(false)
  })
})
