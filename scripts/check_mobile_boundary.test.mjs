// check_mobile_boundary.mjs 单元测试（Issue #595 反向守卫）
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const repoRoot = process.cwd()
const scriptPath = path.join(repoRoot, 'scripts', 'check_mobile_boundary.mjs')

const run = (args) => {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], { cwd: repoRoot, encoding: 'utf8' })
    return { code: 0, stdout }
  } catch (error) {
    return { code: error.status ?? 1, stdout: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

test('排除构建：隐藏模块 chunk 不存在且保留能力存在时通过', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-boundary-'))
  try {
    const dist = path.join(tmp, 'dist', 'assets')
    fs.mkdirSync(dist, { recursive: true })
    fs.writeFileSync(path.join(dist, 'ChaoxingHubView-abc.js'), 'x')
    fs.writeFileSync(path.join(dist, 'index-xyz.js'), 'x')

    const { code, stdout } = run([
      '--dist', path.join(tmp, 'dist'),
      '--expect-excluded', 'ForumView,MoreShuake,OnlineLearning',
      '--expect-kept', 'ChaoxingHubView'
    ])
    assert.equal(code, 0, stdout)
    assert.match(stdout, /守卫全部通过/)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('隐藏模块重新进入 dist 时机械失败', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-boundary-fail-'))
  try {
    const dist = path.join(tmp, 'dist', 'assets')
    fs.mkdirSync(dist, { recursive: true })
    fs.writeFileSync(path.join(dist, 'ForumView-abc.js'), 'x')

    const { code, stdout } = run([
      '--dist', path.join(tmp, 'dist'),
      '--expect-excluded', 'ForumView',
      '--expect-kept', 'ChaoxingHubView'
    ])
    assert.equal(code, 1, '应机械失败')
    assert.match(stdout, /重新进入 dist/)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('保留能力缺失时机械失败', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-boundary-kept-'))
  try {
    const dist = path.join(tmp, 'dist', 'assets')
    fs.mkdirSync(dist, { recursive: true })
    fs.writeFileSync(path.join(dist, 'index-xyz.js'), 'x')

    const { code, stdout } = run([
      '--dist', path.join(tmp, 'dist'),
      '--expect-excluded', 'ForumView',
      '--expect-kept', 'ChaoxingHubView'
    ])
    assert.equal(code, 1)
    assert.match(stdout, /chunk 缺失/)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
