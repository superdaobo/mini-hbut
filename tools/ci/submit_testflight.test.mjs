/**
 * submit_testflight.mjs 纯函数单测（node --test）。
 * 运行：node --test tools/ci/submit_testflight.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildWhatsNew,
  createAppEncryptionDeclarationBody,
  createAppEncryptionDeclarationGetPath,
  createAppEncryptionDeclarationLookupPath,
  createBetaBuildLocalizationBody,
  createBetaGroupsLookupPath,
  createBuildEncryptionDeclarationLinkageBody,
  createBuildExemptionPatchBody,
  createJwt,
  createPrereleaseBuildsPath,
  createPrereleaseLookupPath,
  parseTestAccount,
  selectBetaGroups,
} from './submit_testflight.mjs'

/** 构造 betaGroups 资源对象（与 ASC 响应结构对齐的最小形态）。 */
const group = (id, name, { internal = false, allBuilds = false } = {}) => ({
  id,
  attributes: { name, isInternalGroup: internal, hasAccessToAllBuilds: allBuilds },
})

test('createPrereleaseLookupPath 过滤 App/版本/平台', () => {
  const path = createPrereleaseLookupPath({ appId: '6787857278', versionName: '1.4.7' })
  assert.match(path, /^\/preReleaseVersions\?/)
  assert.match(path, /filter%5Bapp%5D=6787857278/)
  assert.match(path, /filter%5Bversion%5D=1\.4\.7/)
  assert.match(path, /filter%5Bplatform%5D=IOS/)
})

test('createPrereleaseBuildsPath 定位版本下构建', () => {
  const path = createPrereleaseBuildsPath('prv-123')
  assert.equal(path, '/preReleaseVersions/prv-123/builds?fields%5Bbuilds%5D=version%2CprocessingState%2CuploadedDate%2Cexpired&limit=200')
})

test('createAppEncryptionDeclarationLookupPath 含 app 过滤与所需字段', () => {
  const path = createAppEncryptionDeclarationLookupPath({ appId: '6787857278' })
  assert.match(path, /^\/appEncryptionDeclarations\?/)
  assert.match(path, /filter%5Bapp%5D=6787857278/)
  assert.match(path, /appEncryptionDeclarationState/)
  assert.match(path, /usesEncryption/)
  const limited = createAppEncryptionDeclarationLookupPath({ appId: 'a1', limit: 50 })
  assert.match(limited, /limit=50/)
})

test('createAppEncryptionDeclarationBody 声明「无自研加密」（Apple 真实 schema）', () => {
  const body = createAppEncryptionDeclarationBody({ appId: 'app-1' })
  assert.equal(body.data.type, 'appEncryptionDeclarations')
  // usesEncryption 是只读派生字段，CREATE 时携带会被 409 拒绝
  assert.equal('usesEncryption' in body.data.attributes, false)
  // Apple 不允许双 false（iOS 应用必然使用系统级加密）：仅系统加密 = 免税路径
  assert.equal(body.data.attributes.containsProprietaryCryptography, false)
  assert.equal(body.data.attributes.containsThirdPartyCryptography, true)
  assert.equal(body.data.attributes.availableOnFrenchStore, true)
  assert.ok(body.data.attributes.appDescription.length > 0)
  assert.deepEqual(body.data.relationships.app.data, { type: 'apps', id: 'app-1' })
})

test('createAppEncryptionDeclarationGetPath 只取审批状态字段', () => {
  const url = new URL(
    `https://example.test${createAppEncryptionDeclarationGetPath('decl/9')}`,
  )
  assert.equal(url.pathname, '/appEncryptionDeclarations/decl%2F9')
  assert.equal(
    url.searchParams.get('fields[appEncryptionDeclarations]'),
    'appEncryptionDeclarationState',
  )
})

test('createBuildExemptionPatchBody 给 build 打「仅系统加密」豁免标记', () => {
  assert.deepEqual(createBuildExemptionPatchBody({ buildId: 'b-7' }), {
    data: {
      type: 'builds',
      id: 'b-7',
      attributes: { usesNonExemptEncryption: false },
    },
  })
})

test('createBetaGroupsLookupPath 过滤 App 并携带内外部标记字段', () => {
  const url = new URL(
    `https://example.test${createBetaGroupsLookupPath({ appId: 'app-1' })}`,
  )
  assert.equal(url.pathname, '/betaGroups')
  assert.equal(url.searchParams.get('filter[app]'), 'app-1')
  assert.equal(
    url.searchParams.get('fields[betaGroups]'),
    'name,isInternalGroup,hasAccessToAllBuilds',
  )
})

test('selectBetaGroups 指定名字精确匹配，支持逗号分隔多个', () => {
  const groups = [group('g1', '内部组', { internal: true }), group('g2', '外部组'), group('g3', '公测')]
  const picked = selectBetaGroups(groups, '外部组, 公测')
  assert.deepEqual(picked.map((g) => g.id), ['g2', 'g3'])
  assert.throws(() => selectBetaGroups(groups, '不存在的组'), /找不到测试组/)
})

test('selectBetaGroups 留空时外部组优先，无外部组回落内部组', () => {
  const withExternal = [group('i1', '内部组', { internal: true }), group('e1', '外部组')]
  assert.deepEqual(selectBetaGroups(withExternal, '').map((g) => g.id), ['e1'])
  // 外部组排在后面也要被选中
  assert.deepEqual(selectBetaGroups(withExternal.slice().reverse(), '').map((g) => g.id), ['e1'])

  const internalOnly = [group('i1', '内部组', { internal: true })]
  assert.deepEqual(selectBetaGroups(internalOnly, '').map((g) => g.id), ['i1'])

  assert.throws(() => selectBetaGroups([], ''), /没有任何测试组/)
})

test('createBuildEncryptionDeclarationLinkageBody 结构正确', () => {
  const body = createBuildEncryptionDeclarationLinkageBody('decl-9')
  assert.deepEqual(body, {
    data: { type: 'appEncryptionDeclarations', id: 'decl-9' },
  })
})

test('createBetaBuildLocalizationBody 结构正确', () => {
  const body = createBetaBuildLocalizationBody({ buildId: 'b1', locale: 'zh-Hans', whatsNew: 'hello' })
  assert.equal(body.data.type, 'betaBuildLocalizations')
  assert.equal(body.data.attributes.whatsNew, 'hello')
  assert.equal(body.data.relationships.build.data.id, 'b1')
})

test('createJwt 非 PEM 输入报错（结构校验）', () => {
  // 不使用真实密钥材料：仅验证非法 PM 时抛错，且不触碰 secret-guard 扫描
  assert.throws(() => createJwt({ keyId: 'k1', issuerId: 'i1', privateKeyPem: 'not-a-pem' }))
})

test('buildWhatsNew 手动输入优先并支持字面 \\n', () => {
  const text = buildWhatsNew({ manual: '行一\\n行二', versionName: '1.4.7', buildNumber: '28' })
  assert.equal(text, '行一\n行二')
})

test('buildWhatsNew 自动生成包含版本与 commit、不含账号明文校验', () => {
  const text = buildWhatsNew({
    manual: '',
    versionName: '1.4.7',
    buildNumber: '28',
    commits: ['abc123 修复A'],
    account: { username: 'demo-user', password: 'demo-pwd' },
  })
  assert.ok(text.includes('v1.4.7（build 28）'))
  assert.ok(text.includes('- abc123 修复A'))
  assert.ok(text.includes('演示测试账号：demo-user / demo-pwd'))
})

test('buildWhatsNew 超过 4000 字符截断', () => {
  const text = buildWhatsNew({ manual: 'x'.repeat(4200), versionName: '1', buildNumber: '1' })
  assert.ok(text.length <= 4000)
})

test('parseTestAccount 从源码提取账号', () => {
  const source = "export const TEST_ACCOUNT = { username: 'u1', password: 'p1', studentId: '123' }"
  const acc = parseTestAccount(source)
  assert.equal(acc.username, 'u1')
  assert.equal(acc.password, 'p1')
  assert.equal(acc.studentId, '123')
})

test('parseTestAccount 缺字段返回 null', () => {
  assert.equal(parseTestAccount('export const X = { username: "a" }'), null)
  assert.equal(parseTestAccount(''), null)
})