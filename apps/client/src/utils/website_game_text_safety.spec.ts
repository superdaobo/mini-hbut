import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

// CodeQL js/xss-through-exception：leaderboard 错误提示先写空 div，异常文本只经 textContent 写入
const LEADERBOARD_GAME_MODULES = [
  '../../website/modules-src/hbut_2048/project/src/main.js',
  '../../website/modules-src/hbut_match3/project/src/main.js',
  '../../website/modules-src/hbut_memory_match/project/src/main.js',
  '../../website/modules-src/hbut_miner/project/src/main.js',
  '../../website/modules-src/hbut_monopoly/project/src/main.js',
  '../../website/modules-src/hbut_parking/project/src/main.js',
  '../../website/modules-src/hbut_stack/project/src/main.js'
]

describe('website 游戏异常文本安全（xss-through-exception）', () => {
  it.each(LEADERBOARD_GAME_MODULES)('leaderboard 错误文本不再拼接进 innerHTML：%s', (path) => {
    const source = readSource(path)

    // 旧模式：innerHTML 模板中直接插值异常文本 —— 必须不存在
    expect(source).not.toContain('<div class="leaderboard-error">加载失败: ${')
    // 新模式：先写空容器，再经 textContent 写入异常文本
    expect(source).toContain("content.innerHTML = '<div class=\"leaderboard-error\"></div>'")
    expect(source).toContain('errorBox.textContent')
  })

  it('gomoku 状态标题/详情模板插值一律经 escapeHtml 转义', () => {
    const source = readSource('../../website/modules-src/hbut_gomoku/project/src/main.js')

    expect(source).toContain('function escapeHtml(value)')
    expect(source).toContain('${escapeHtml(statusTitle())}')
    expect(source).toContain('${escapeHtml(statusDetail())}')
  })
})

describe('安全随机（insecure-randomness）', () => {
  it('gomoku 房间码默认随机源为 crypto.getRandomValues（行为测试见 online.test.js）', () => {
    const source = readSource('../../website/modules-src/hbut_gomoku/project/src/game/online.js')

    expect(source).toContain('secureRandom')
    expect(source).toContain('crypto.getRandomValues')
    expect(source).toContain('export const createRoomCode = (random = secureRandom)')
  })

  it('usage_tracker 会话/事件/设备标识使用 crypto 安全随机十六进制', () => {
    const source = readSource('src/utils/usage_tracker.js')

    expect(source).toContain('randomHex')
    expect(source).toContain('crypto.getRandomValues')
    expect(source).toMatch(/id = `device-\$\{Date\.now\(\)\}-\$\{randomHex\(8\)\}`/)
    expect(source).toMatch(/return `evt-\$\{Date\.now\(\)\}-\$\{randomHex\(8\)\}`/)
    expect(source).toMatch(/return `sess-\$\{Date\.now\(\)\}-\$\{randomHex\(8\)\}`/)
  })
})
