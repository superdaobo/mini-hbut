/**
 * DEV 验证缝的生产安全边界（#1169 真机验证）。
 *
 * 真机验证票据链路时加了两条**仅 DEV 生效**的缝，身份 v2 联调（P0-7）又新增一条：
 *   1. `utils/identity_access_token.ts`：`__HBUT_IDENTITY_AT_STUB__`（打桩 Identity AT）
 *   2. `utils/remote_config.ts`：`__HBUT_REMOTE_CONFIG_OVERRIDE__`（覆盖 game_platform 配置）
 *   3. `utils/identity_v2_dev_seam.ts`：`__HBUT_IDENTITY_V2_DEV__`（身份 v2 签名自检缝）
 *
 * 它们只用于本地/真机验证（本机设备未在 Identity Core 注册、远端配置未开放游戏灰度），
 * **绝不能在生产构建生效**。本 spec 用源码契约锁住「先判 DEV、再读打桩」的顺序，
 * 并锁住「打桩值不得写进任何存储」。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const read = (relative: string) => readFileSync(path.join(__dirname, relative), 'utf8')

describe('DEV 验证缝的生产边界', () => {
  it('Identity AT 打桩：入口先判 DEV，再读 globalThis', () => {
    const source = read('./identity_access_token.ts')
    const stubReader = source.slice(
      source.indexOf('const readDevAccessTokenStub'),
      source.indexOf('export const getIdentityAccessToken')
    )
    expect(stubReader).toContain('!import.meta.env?.DEV')
    expect(stubReader).toContain('__HBUT_IDENTITY_AT_STUB__')
    // DEV 判定必须出现在读取打桩值之前
    expect(stubReader.indexOf('import.meta.env?.DEV')).toBeLessThan(
      stubReader.indexOf('__HBUT_IDENTITY_AT_STUB__')
    )
    // 不得把打桩值写入任何存储
    for (const forbidden of ['localStorage.setItem', 'sessionStorage.setItem', 'indexedDB']) {
      expect(stubReader).not.toContain(forbidden)
    }
  })

  it('远程配置覆盖：入口先判 DEV，且不写存储', () => {
    const source = read('./remote_config.ts')
    const seam = source.slice(
      source.indexOf('const applyDevRemoteConfigOverride'),
      source.indexOf('export async function fetchRemoteConfig')
    )
    expect(seam).toContain('!import.meta.env?.DEV')
    expect(seam).toContain('__HBUT_REMOTE_CONFIG_OVERRIDE__')
    expect(seam.indexOf('import.meta.env?.DEV')).toBeLessThan(
      seam.indexOf('__HBUT_REMOTE_CONFIG_OVERRIDE__')
    )
    for (const forbidden of ['localStorage.setItem', 'sessionStorage.setItem']) {
      expect(seam).not.toContain(forbidden)
    }
  })

  it('取票链路的 DEV 诊断挂在 DEV 门控之下', () => {
    const source = read('../components/MoreModuleHostView.vue')
    const helper = source.slice(
      source.indexOf('const publishGameDiag'),
      source.indexOf('/** 创建（或重建）宿主桥')
    )
    expect(helper).toContain('if (!import.meta.env.DEV) return')
    expect(helper).toContain('__HBUT_GAME_BRIDGE_DIAG__')
  })

  it('Identity v2 签名自检缝：入口先判 DEV，再读 globalThis，且不写存储', () => {
    const source = read('./identity_v2_dev_seam.ts')
    const reader = source.slice(
      source.indexOf('const isIdentityV2DevSeamEnabled'),
      source.indexOf('export const identityV2DevSignSelfcheck')
    )
    expect(reader).toContain('!import.meta.env?.DEV')
    expect(reader).toContain('__HBUT_IDENTITY_V2_DEV__')
    // DEV 判定必须出现在读取缝开关之前
    expect(reader.indexOf('import.meta.env?.DEV')).toBeLessThan(
      reader.indexOf('__HBUT_IDENTITY_V2_DEV__')
    )
    // 缝不得把任何值写入存储
    for (const forbidden of ['localStorage.setItem', 'sessionStorage.setItem', 'indexedDB']) {
      expect(reader).not.toContain(forbidden)
    }
  })

  it('Identity v2 签名自检缝：先判门禁，后 invoke（门禁关闭不得触达命令）', () => {
    const source = read('./identity_v2_dev_seam.ts')
    const fn = source.slice(source.indexOf('export const identityV2DevSignSelfcheck'))
    const guardIndex = fn.indexOf('isIdentityV2DevSeamEnabled()')
    const invokeIndex = fn.indexOf('invokeNative')
    expect(guardIndex).toBeGreaterThan(-1)
    expect(invokeIndex).toBeGreaterThan(-1)
    // 门禁判定必须出现在任何原生调用之前
    expect(guardIndex).toBeLessThan(invokeIndex)
  })
})
