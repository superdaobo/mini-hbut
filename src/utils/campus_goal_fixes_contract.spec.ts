import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8')

describe('campus goal fixes contracts (#454 #455 #456)', () => {
  it('electricity: rebinds selected room before usage trends (#454)', () => {
    const oneCode = read('src-tauri/src/modules/one_code.rs')
    expect(oneCode).toContain('try_swae_bind_room')
    expect(oneCode).toContain('setbindroom')
    expect(oneCode).toContain('选房即绑定')
    expect(oneCode).toContain('bound_updated')
    // 快照文案不再误导为硬挡
    expect(oneCode).not.toContain('用电快照：当前所选房间（非绑定房）')
    expect(oneCode).toContain('曲线暂无时显示余额/余量')

    const view = read('src/components/ElectricityView.vue')
    expect(view).toContain('electricity_usage_stats')
    expect(view).toContain('bound_updated')
  })

  it('yimatong tid mint uses mobile UA (#455)', () => {
    const elec = read('src-tauri/src/http_client/electricity.rs')
    expect(elec).toContain('mint_one_code_browser_tid')
    expect(elec).toContain('MOBILE_UA')
    expect(elec).toContain('iPhone')
    expect(elec).toContain('手机 UA')
  })

  it('chaoxing: multi-folder courses + flexible outline + video recovery (#456)', () => {
    const ol = read('src-tauri/src/modules/online_learning.rs')
    expect(ol).toContain('getCourseFolders')
    expect(ol).toContain('courseFolderId')
    expect(ol).toContain('getTeacherAjax')
    expect(ol).toContain('parse_warning')
    expect(ol).toContain('全部章节')
    expect(ol).toContain('propagate_chaoxing_key_cookies')
    expect(ol).toContain('ananas/status')

    const hub = read('src/components/ChaoxingHubView.vue')
    expect(hub).toContain('chaoxing_fetch_course_outline')
    expect(hub).toContain('视频播放失败')
  })
})
