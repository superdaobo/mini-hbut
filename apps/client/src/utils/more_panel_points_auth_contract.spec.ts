/** #1016：总面板积分跨 iframe 安全协议，防止直接读取受保护 API / 把 AT 交给网页。 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const appRoot = process.cwd()
const readHost = () => fs.readFileSync(path.join(appRoot, 'src/components/MoreModuleHostView.vue'), 'utf8')
const readPanel = () =>
  fs.readFileSync(path.join(appRoot, '../../website/modules-src/more_panel/project/src/main.js'), 'utf8')

describe('#1016 面板积分授权边界', () => {
  it('面板只通过受控消息向宿主请求脱敏数据，不直接访问钱包或携带令牌', () => {
    const panel = readPanel()
    const load = panel.slice(panel.indexOf('const loadPoints = async'), panel.indexOf('/** 游戏宫格'))
    expect(load).toContain('HOST_POINTS_REQUEST_TYPE')
    expect(load).toContain('window.parent.postMessage')
    expect(load).toContain('event.source !== window.parent')
    expect(load).toContain('matchesHostOrigin')
    expect(load).not.toContain('fetchJson(')
    expect(load).not.toContain('Authorization')
    expect(panel).toContain('wallet?.coin_balance')
    expect(panel).toContain('tasks.tasks.filter')
  })

  it('宿主校验子框来源、模块路径、在线会话，且切号后丢弃异步响应', () => {
    const host = readHost()
    const bridge = host.slice(
      host.indexOf('const handlePanelPointsRequestMessage'),
      host.indexOf('const handleOpenModuleMessage')
    )
    expect(bridge).toContain("moduleId.value !== 'more_panel'")
    expect(bridge).toContain('event.source !== frameWindow')
    expect(bridge).toContain('event.origin !== expectedOrigin')
    expect(bridge).toContain('isGameFrameOriginAllowed')
    expect(bridge).toContain('sessionVerified.value')
    expect(bridge).toContain('authStore.verifiedStudentId')
    expect(bridge).toContain('frameSrc.value !== currentSrc')
    expect(bridge).toContain('fetchPointsWallet')
    expect(bridge).toContain('fetchPointsDailyTasks')
    expect(bridge).toContain('coin_balance: wallet.coinBalance')
    expect(bridge).not.toContain('Authorization:')
    expect(bridge).not.toContain('accessToken')
    expect(host).toContain("window.removeEventListener('message', handlePanelPointsRequestMessage)")
  })
})
