import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const readText = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

describe('notification delivery contract', () => {
  it('allows the manual notification check to request system permission', () => {
    const source = readText('src/components/NotificationView.vue')
    const manualCheckBlock = source.match(
      /const runManualCheck = async \(\) => \{[\s\S]*?\n\}/
    )?.[0] || ''

    expect(manualCheckBlock).toContain('allowPermissionPrompt: true')
  })

  it('configures Capacitor local notifications to show while iOS is foregrounded', () => {
    const source = readText('capacitor.config.ts')

    expect(source).toContain('LocalNotifications')
    expect(source).toContain('presentationOptions')
    expect(source).toContain("'badge'")
    expect(source).toContain("'sound'")
    expect(source).toContain("'alert'")
  })

  it('uses a monochrome Android status-bar icon for native notification builders', () => {
    const backgroundFetchSource = readText(
      'android/app/src/main/java/com/hbut/mini/BackgroundFetchHeadlessTask.java'
    )
    const keepAliveSource = readText(
      'android/app/src/main/java/com/hbut/mini/KeepAliveForegroundService.java'
    )

    expect(backgroundFetchSource).toContain('setSmallIcon(R.drawable.ic_stat_mini_hbut)')
    expect(keepAliveSource).toContain('setSmallIcon(R.drawable.ic_stat_mini_hbut)')
    expect(backgroundFetchSource).not.toContain('setSmallIcon(R.mipmap.ic_launcher)')
    expect(keepAliveSource).not.toContain('setSmallIcon(R.mipmap.ic_launcher)')
  })
})
