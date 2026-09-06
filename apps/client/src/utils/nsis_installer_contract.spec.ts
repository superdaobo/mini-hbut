import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// NSIS 安装器模板契约测试
// 固化 issue #800（覆盖升级跳过重装页）与 issue #798（卸载默认保留用户数据 + 文案明确化）
// 的关键行为，防止后续升级 Tauri bundler / 手改模板时意外回退。
const root = process.cwd()
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n?/g, '\n')

const tauriConfig = JSON.parse(read('src-tauri/tauri.conf.json'))
const installer = read('src-tauri/nsis/installer.nsi')

describe('NSIS installer template contract', () => {
  it('tauri.conf.json keeps the customized NSIS template wired in', () => {
    // 模板必须持续指向自定义 installer.nsi，否则所有 #800/#798 行为都会随 bundler 默认模板失效
    expect(tauriConfig.bundle?.windows?.nsis?.template).toBe('./nsis/installer.nsi')
  })

  it('skips the reinstall choice page for existing NSIS installs by enabling update mode (#800)', () => {
    // #800: PageReinstall 开头检测既有 NSIS 安装（非 WiX 迁移）时置 UpdateMode=1，
    // 覆盖安装不再弹出"安装前卸载/请勿卸载"选择页
    expect(installer).toContain('#800')
    expect(installer).toContain('${If} $WixMode <> 1')
    expect(installer).toContain(
      '${IfThen} "$R0$R1" != "" ${|} StrCpy $UpdateMode 1 ${|}',
    )
    // 跳页拦截必须位于页面创建（nsDialogs::Create）之前
    const reinstallFn = installer.slice(
      installer.indexOf('Function PageReinstall'),
      installer.indexOf('Function PageReinstallUpdateSelection'),
    )
    expect(reinstallFn).toContain('StrCpy $UpdateMode 1')
    expect(reinstallFn.indexOf('StrCpy $UpdateMode 1')).toBeLessThan(
      reinstallFn.indexOf('nsDialogs::Create'),
    )
    expect(reinstallFn).toContain('Abort')
  })

  it('preserves the WiX (MSI) migration uninstall path and explicit /UPDATE semantics', () => {
    // WiX 迁移：检测到 MSI 安装时置 WixMode=1 并走原卸载迁移分支，不能被 #800 改动破坏
    expect(installer).toContain('StrCpy $WixMode 1')
    expect(installer).toMatch(/wix_loop:/)
    // PageLeaveReinstall 中 WiX 迁移仍然强制卸载
    const leaveFn = installer.slice(
      installer.indexOf('Function PageLeaveReinstall'),
      installer.indexOf('FunctionEnd', installer.indexOf('Function PageLeaveReinstall')),
    )
    expect(leaveFn).toMatch(/\$\{If\} \$WixMode = 1\s*\n\s*Goto reinst_uninstall/)
    // 命令行显式 /UPDATE 既有语义保留（.onInit 与 un.onInit 各解析一次）
    expect(installer.match(/\$\{GetOptions\} \$CMDLINE "\/UPDATE" \$UpdateMode/g)?.length).toBe(2)
  })

  it('rewrites the uninstaller on覆盖升级 so uninstall.exe always exists', () => {
    // 覆盖升级后 Install section 重写卸载器，uninstall.exe 必须持续存在
    expect(installer).toContain('WriteUninstaller "$INSTDIR\\uninstall.exe"')
    // 卸载 section 也会删除它（自清理闭环）
    expect(installer).toContain('Delete "$INSTDIR\\uninstall.exe"')
  })

  it('makes the uninstall data-clearing wording explicit (#798)', () => {
    // #798: 复选框文案由模糊的 $(deleteAppData) 改为明确的简中内联提示
    // （CreateWindowEx 不得再引用该语言键；注释中的历史引用不受限）
    expect(installer).not.toContain('w "$(deleteAppData)"')
    expect(installer).toContain('删除用户数据（成绩/课表/账号等）——不勾选则保留')
    // 复选框上方新增只读提示标签
    expect(installer).toContain('卸载程序不会删除您的用户数据，除非勾选下方选项')
    // 提示标签使用只读 Static 控件，坐标按 DPI 换算（y=64）
    expect(installer).toContain('IntOp $5 64 * $2')
    expect(installer).toContain('${__NSD_Label_CLASS}')
  })

  it('still deletes app data only under the bundle id and only when opted in (#798 default keep)', () => {
    // #798: 默认保留数据——删除动作必须同时满足"勾选复选框"且"非更新模式"
    expect(installer).toMatch(
      /\$\{If\} \$DeleteAppDataCheckboxState = 1\s*\n\s*\$\{AndIf\} \$UpdateMode <> 1/,
    )
    // 数据目录删除严格限定在 ${BUNDLEID} 下，防止误删其他目录
    expect(installer).toContain('RmDir /r "$APPDATA\\${BUNDLEID}"')
    expect(installer).toContain('RmDir /r "$LOCALAPPDATA\\${BUNDLEID}"')
    expect(installer).not.toMatch(/RmDir \/r "\$(APPDATA|LOCALAPPDATA)\$(?!\\"|\$)/)
  })

  it('keeps the SimpChinese language entry that the inline wording relies on', () => {
    // 模板内联简中文案依赖 tauri.conf.json 的语言数组只装 SimpChinese（bundler 内置语言表）
    const languages = tauriConfig.bundle?.windows?.nsis?.languages
    expect(Array.isArray(languages)).toBe(true)
    expect(languages).toContain('SimpChinese')
    // 模板保留语言注入循环，未被移除
    expect(installer).toContain('{{#each languages}}')
    expect(installer).toContain('!insertmacro MUI_LANGUAGE "{{this}}"')
  })
})
