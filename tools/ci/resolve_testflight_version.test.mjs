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
  nextMarketingVersion,
  parseVersionParts,
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

test('nextMarketingVersion 取最高版本尾段 +1', () => {
  assert.equal(
    nextMarketingVersion(['1.4.6', '1.4.7', '1.3.0'], '9.9.9'),
    '1.4.8',
  )
  // 字符串排序会错判（"10" < "9"），必须数值比较
  assert.equal(nextMarketingVersion(['1.4.10', '1.4.9'], '0.0.1'), '1.4.11')
  // 保持原段数
  assert.equal(nextMarketingVersion(['1.5'], '0.0.1'), '1.6')
  // 非法候选被过滤
  assert.equal(nextMarketingVersion(['1.4.7', 'bad', ''], '1.0.0'), '1.4.8')
})

test('nextMarketingVersion 无候选时回退 fallback 并 +1', () => {
  assert.equal(nextMarketingVersion([], '1.4.6'), '1.4.7')
  assert.equal(nextMarketingVersion(['bad'], '1.4.6'), '1.4.7')
  assert.throws(() => nextMarketingVersion([], ''))
})

test('nextBuildNumber 取最大 build 号 +1', () => {
  assert.equal(nextBuildNumber([25, 27, 12]), 28)
  assert.equal(nextBuildNumber(['27', 9]), 28)
  assert.equal(nextBuildNumber([]), 1)
  assert.equal(nextBuildNumber([null, undefined, 'x']), 1)
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
