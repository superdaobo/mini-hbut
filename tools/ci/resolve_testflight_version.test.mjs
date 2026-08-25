/**
 * resolve_testflight_version.mjs 纯函数单测（node --test）。
 * 运行：node --test tools/ci/resolve_testflight_version.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compareVersionParts,
  createMaxBuildLookupPath,
  createPrereleaseVersionsPath,
  nextBuildNumber,
  parseVersionParts,
  pickLatestVersion,
} from './resolve_testflight_version.mjs'

test('parseVersionParts 解析 1~3 段数字版本，拒绝非法输入', () => {
  assert.deepEqual(parseVersionParts('1.4.7'), [1, 4, 7])
  assert.deepEqual(parseVersionParts('1.4'), [1, 4])
  assert.deepEqual(parseVersionParts('2'), [2])
  assert.equal(parseVersionParts('1.4.7-beta'), null)
  assert.equal(parseVersionParts('1.4.7+build'), null)
  assert.equal(parseVersionParts(''), null)
  assert.equal(parseVersionParts('a.b'), null)
  assert.equal(parseVersionParts('1.2.3.4'), null)
})

test('compareVersionParts 逐段比较，缺失段视为 0', () => {
  assert.equal(compareVersionParts([1, 4, 7], [1, 4, 6]), 1)
  assert.equal(compareVersionParts([1, 4], [1, 4, 0]), 0)
  assert.equal(compareVersionParts([1, 4], [1, 5]), -1)
  assert.equal(compareVersionParts([2], [1, 9, 9]), 1)
})

test('pickLatestVersion 跟随 ASC 最高版本，不自动开新版本', () => {
  assert.equal(pickLatestVersion(['1.4.6', '1.4.7', '1.3.0'], '9.9.9'), '1.4.7')
  // 字符串排序会错判（"10" < "9"），必须数值比较
  assert.equal(pickLatestVersion(['1.4.10', '1.4.9'], '0.0.1'), '1.4.10')
  // 非法候选被过滤
  assert.equal(pickLatestVersion(['1.4.7', 'bad', ''], '1.0.0'), '1.4.7')
})

test('pickLatestVersion 无候选时原样回退 fallback', () => {
  assert.equal(pickLatestVersion([], '1.4.6'), '1.4.6')
  assert.equal(pickLatestVersion(['bad'], '1.5'), '1.5')
  assert.throws(() => pickLatestVersion([], ''))
})

test('nextBuildNumber 正常序列最大值 +1，忽略异常遗留长串', () => {
  // 真实场景（2026-08-25）：ASC 存在时间戳格式遗留 build 202607071007，
  // 不能让 max+1 被劫持成 202607071008
  const result = nextBuildNumber([22, 24, 25, 26, 27, 28, 202607071007])
  assert.equal(result.value, 29)
  assert.deepEqual(result.ignored, [202607071007])

  // 无异常值时就是简单累加
  assert.deepEqual(nextBuildNumber([27, 28]), { value: 29, ignored: [] })

  // 字符串数字同样处理
  assert.equal(nextBuildNumber(['28']).value, 29)

  // 全部是异常值/空列表 → 从 fallback(0)+1 开始
  assert.equal(nextBuildNumber([202607071007]).value, 1)
  assert.deepEqual(nextBuildNumber([]), { value: 1, ignored: [] })
})

test('createPrereleaseVersionsPath 过滤 App/平台并只取 version 字段', () => {
  const path = createPrereleaseVersionsPath({ appId: '6787857278' })
  assert.match(path, /^\/preReleaseVersions\?/)
  assert.match(path, /filter%5Bapp%5D=6787857278/)
  assert.match(path, /filter%5Bplatform%5D=IOS/)
  const url = new URL(`https://example.test${path}`)
  assert.equal(url.searchParams.get('fields[preReleaseVersions]'), 'version')
  assert.equal(url.searchParams.get('limit'), '200')
})

test('createMaxBuildLookupPath 按 CFBundleVersion 倒序取第一条', () => {
  const path = createMaxBuildLookupPath({ appId: '6787857278' })
  assert.match(path, /^\/builds\?/)
  assert.match(path, /filter%5Bapp%5D=6787857278/)
  assert.match(path, /sort=-version/)
  const url = new URL(`https://example.test${path}`)
  assert.equal(url.searchParams.get('fields[builds]'), 'version')
})
