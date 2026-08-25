/**
 * TestFlight 自动化提交脚本（由 .github/workflows/ios-testflight.yml 调用）
 *
 * 职责：IPA 上传到 App Store Connect 后，代替人工完成：
 *  1. 轮询等待构建处理完成（PROCESSING_COMPLETE）
 *  2. 填写「测试说明（What to Test）」：
 *     - 优先使用 workflow 输入 TESTFLIGHT_WHATS_NEW（支持字面 \n 换行）
 *     - 留空则自动生成：最近 git 提交 + src/utils/test_account.js 中的演示测试账号
 *  3. 出口合规（Export Compliance）：auto 模式关联已批准的 App Encryption
 *     Declaration；该 App 尚无声明时按「不包含加密算法」自动创建并关联
 *  4. 把构建加入 beta 测试组：
 *     - TESTFLIGHT_BETA_GROUP 支持逗号分隔多个组名精确匹配；留空自动选第一个
 *       外部组（无外部组回落第一个内部组）
 *     - 内部组 = 自动生效，内部测试员立即可安装
 *     - 任一外部组 = 额外提交 Beta App Review（betaAppReviewSubmissions）
 *
 * 认证：App Store Connect API Key（APPSTORE_KEY_ID / APPSTORE_ISSUER_ID /
 * APPSTORE_PRIVATE_KEY_PATH），与 altool 上传用的是同一把钥匙，无需新增密钥。
 * 依赖：Node 18+（全局 fetch / crypto / base64url），GitHub macOS runner 自带。
 */

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const API_BASE = 'https://api.appstoreconnect.apple.com/v1'
const WHATS_NEW_MAX_LENGTH = 4000
const DEFAULT_TESTFLIGHT_LOCALE = 'zh-Hans'

/* ------------------------------------------------------------------ */
/* 纯函数（可单测）                                                     */
/* ------------------------------------------------------------------ */

/**
 * 生成 App Store Connect API 的 ES256 JWT（aud=appstoreconnect-v1）。
 * @param {{keyId: string, issuerId: string, privateKeyPem: string, now?: number}} params
 * @returns {string} 三段式 JWT
 */
export function createJwt({ keyId, issuerId, privateKeyPem, now = Math.floor(Date.now() / 1000) }) {
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' }
  const payload = { iss: issuerId, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' }
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const signingInput = `${encode(header)}.${encode(payload)}`
  const key = crypto.createPrivateKey({ key: privateKeyPem, format: 'pem' })
  // RFC 7515 / JWS requires ES256 signatures as the fixed-width 64-byte R || S
  // representation. Node's ECDSA default is ASN.1 DER, which verifies locally but
  // is rejected by App Store Connect with HTTP 401.
  const signatureBytes = crypto.sign('sha256', Buffer.from(signingInput), {
    key,
    dsaEncoding: 'ieee-p1363',
  })
  if (signatureBytes.length !== 64) {
    throw new Error(`ES256 signature must be 64 bytes, got ${signatureBytes.length}`)
  }
  return `${signingInput}.${signatureBytes.toString('base64url')}`
}

/**
 * 从 src/utils/test_account.js 源码中提取演示测试账号。
 * @param {string} source 源码文本
 * @returns {{username: string, password: string, studentId?: string} | null}
 */
export function parseTestAccount(source) {
  const field = (key) => {
    const match = source.match(new RegExp(`\\b${key}:\\s*'([^']*)'`))
    return match ? match[1] : undefined
  }
  const username = field('username')
  const password = field('password')
  if (!username || !password) return null
  return { username, password, studentId: field('studentId') }
}

/**
 * 组装「测试说明（What to Test）」。
 * 手动填写优先；留空时自动生成：版本信息 + 最近 git 提交 + 演示测试账号。
 * @param {{manual?: string, versionName: string, buildNumber: string,
 *          commits?: string[], account?: {username: string, password: string, studentId?: string}}} params
 * @returns {string}
 */
export function buildWhatsNew({ manual, versionName, buildNumber, commits = [], account }) {
  if (manual && manual.trim()) {
    // workflow_dispatch 输入是单行文本框，支持字面 \n 转义为换行
    const text = manual.replace(/\\n/g, '\n').trim()
    return text.length > WHATS_NEW_MAX_LENGTH ? `${text.slice(0, WHATS_NEW_MAX_LENGTH - 1)}…` : text
  }
  const lines = [`v${versionName}（build ${buildNumber}）`]
  if (commits.length > 0) {
    lines.push('', '本次更新：')
    for (const commit of commits.slice(0, 10)) lines.push(`- ${commit}`)
  }
  if (account) {
    lines.push('', `演示测试账号：${account.username} / ${account.password}${account.studentId ? `（学号 ${account.studentId}）` : ''}`)
  }
  const text = lines.join('\n')
  return text.length > WHATS_NEW_MAX_LENGTH ? `${text.slice(0, WHATS_NEW_MAX_LENGTH - 1)}…` : text
}

/* ------------------------------------------------------------------ */
/* 内部工具                                                             */
/* ------------------------------------------------------------------ */

export async function apiRequest(token, pathname, { method = 'GET', body } = {}, retries = 2) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${pathname}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      const text = await res.text()
      let json = null
      try {
        json = JSON.parse(text)
      } catch {
        /* 非 JSON 响应，保留原文用于报错 */
      }
      if (!res.ok) {
        const detail =
          json?.errors?.map((e) => `${e.code}: ${e.detail || e.title}`).join('; ') ||
          text.slice(0, 500)
        // 服务端瞬时错误（5xx）与限流（429）时重试，客户端错误（4xx）不重试
        if ((res.status >= 500 || res.status === 429) && attempt < retries) {
          await sleep(3_000)
          continue
        }
        throw new Error(`App Store Connect API ${method} ${pathname} 失败（HTTP ${res.status}）：${detail}`)
      }
      return json
    } catch (err) {
      lastError = err
      if (attempt < retries && err instanceof Error && !err.message.includes('HTTP')) {
        // 网络层异常（fetch 失败/超时）时短暂等待后重试
        await sleep(3_000)
        continue
      }
      throw err
    }
  }
  throw lastError
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function createPrereleaseLookupPath({ appId, versionName }) {
  const qs = new URLSearchParams({
    'filter[app]': appId,
    'filter[version]': versionName,
    'filter[platform]': 'IOS',
    'fields[preReleaseVersions]': 'version,platform',
    limit: '1',
  })
  return `/preReleaseVersions?${qs}`
}

export function createPrereleaseBuildsPath(preReleaseVersionId) {
  const qs = new URLSearchParams({
    'fields[builds]': 'version,processingState,uploadedDate,expired',
    limit: '200',
  })
  return `/preReleaseVersions/${encodeURIComponent(preReleaseVersionId)}/builds?${qs}`
}

export function createBetaBuildLocalizationBody({ buildId, locale, whatsNew }) {
  return {
    data: {
      type: 'betaBuildLocalizations',
      attributes: { locale, whatsNew },
      relationships: { build: { data: { type: 'builds', id: buildId } } },
    },
  }
}

/** 查询某 App 的出口合规（App Encryption Declarations）列表。 */
export function createAppEncryptionDeclarationLookupPath({ appId, limit = 200 }) {
  const qs = new URLSearchParams({
    'filter[app]': appId,
    'fields[appEncryptionDeclarations]': 'appEncryptionDeclarationState,usesEncryption',
    limit: String(limit),
  })
  return `/appEncryptionDeclarations?${qs}`
}

/** 查询单个出口合规声明的详情（用于轮询审批状态）。 */
export function createAppEncryptionDeclarationGetPath(declarationId) {
  const qs = new URLSearchParams({
    'fields[appEncryptionDeclarations]': 'appEncryptionDeclarationState',
  })
  return `/appEncryptionDeclarations/${encodeURIComponent(declarationId)}?${qs}`
}

/**
 * 创建「不包含任何（自研）加密算法」的出口合规声明请求体。
 * 对应 TestFlight 网页上 Export Compliance 问卷回答 No（标准免税声明）。
 * Apple 数据模型（实测 2026-08-25 run 32794289891 两次 409 校准）：
 *  - CREATE 不接受 usesEncryption（只读派生字段）；
 *  - 不允许 containsProprietaryCryptography 与 containsThirdPartyCryptography
 *    同时为 false（iOS 应用必然使用系统级加密，归入 third-party 一类）；
 *  - 「无自研加密」的正确表达 = 仅系统加密（third-party=true）+ 法国可分发，
 *    即美国/欧盟出口豁免（exemption）路径，无需逐次人工回答问卷。
 */
export function createAppEncryptionDeclarationBody({ appId }) {
  return {
    data: {
      type: 'appEncryptionDeclarations',
      attributes: {
        appDescription:
          'This app does not implement any proprietary encryption algorithms; it only uses the standard iOS system cryptography libraries (e.g. HTTPS/TLS).',
        availableOnFrenchStore: true,
        containsProprietaryCryptography: false,
        containsThirdPartyCryptography: true,
      },
      relationships: { app: { data: { type: 'apps', id: appId } } },
    },
  }
}

/** 把 build 关联到出口合规声明的 linkage 请求体。 */
export function createBuildEncryptionDeclarationLinkageBody(declarationId) {
  return {
    data: { type: 'appEncryptionDeclarations', id: declarationId },
  }
}

function recentCommits(max = 8) {
  try {
    const out = execFileSync('git', ['log', '--no-merges', '--pretty=format:%h %s', '-n', String(max)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.split('\n').filter(Boolean)
  } catch {
    return [] // checkout 未带完整历史时静默降级，测试说明仅含版本与账号
  }
}

function loadTestAccount() {
  try {
    // workflow 以仓库根为 cwd 调用本脚本，客户端已迁移至 apps/client/
    return parseTestAccount(readFileSync('apps/client/src/utils/test_account.js', 'utf8'))
  } catch {
    return null // 仓库结构变化时降级，测试说明不含账号段
  }
}

/* ------------------------------------------------------------------ */
/* 主流程                                                               */
/* ------------------------------------------------------------------ */

async function waitForBuild(token, { appId, versionName, buildNumber }) {
  // Apple models the marketing version as preReleaseVersions.version and the
  // CFBundleVersion/build number as builds.version. Uploaded builds can take
  // several minutes to appear and transition from PROCESSING to VALID.
  const MAX_ATTEMPTS = 30
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const prereleaseData = await apiRequest(
      token,
      createPrereleaseLookupPath({ appId, versionName }),
    )
    const prereleaseVersion = prereleaseData.data?.[0]
    let build
    if (prereleaseVersion) {
      const buildsData = await apiRequest(
        token,
        createPrereleaseBuildsPath(prereleaseVersion.id),
      )
      build = (buildsData.data || []).find(
        (item) => String(item.attributes?.version || '') === String(buildNumber),
      )
    }

    if (build) {
      const state = build.attributes?.processingState
      if (state === 'VALID' || state === 'PROCESSING_COMPLETE') {
        console.log(`✅ 构建 ${versionName} (${buildNumber}) 处理完成，build id=${build.id}`)
        return build
      }
      if (
        state === 'FAILED' ||
        state === 'INVALID' ||
        state === 'PROCESSING_FAILED' ||
        state === 'VALIDATION_FAILED'
      ) {
        throw new Error(`构建处理失败（processingState=${state}），请到 App Store Connect 查看原因`)
      }
      console.log(`⏳ 构建处理中（${state || 'UNKNOWN'}），第 ${attempt}/${MAX_ATTEMPTS} 次轮询，20 秒后重试…`)
    } else {
      console.log(`⏳ 构建记录尚未可见（第 ${attempt}/${MAX_ATTEMPTS} 次轮询），20 秒后重试…`)
    }
    await sleep(20_000)
  }
  throw new Error('等待构建处理完成超时（10 分钟）。可稍后重试仅后处理 workflow')
}

async function upsertBetaBuildLocalization(token, { buildId, locale, whatsNew }) {
  const qs = new URLSearchParams({
    'fields[betaBuildLocalizations]': 'locale,whatsNew',
    limit: '200',
  })
  const existingData = await apiRequest(
    token,
    `/builds/${encodeURIComponent(buildId)}/betaBuildLocalizations?${qs}`,
  )
  const existing = (existingData.data || []).find(
    (item) => item.attributes?.locale === locale,
  )

  if (existing) {
    await apiRequest(token, `/betaBuildLocalizations/${encodeURIComponent(existing.id)}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'betaBuildLocalizations',
          id: existing.id,
          attributes: { whatsNew },
        },
      },
    })
    console.log(`✅ 已更新 ${locale} 测试说明`)
    return existing.id
  }

  const created = await apiRequest(token, '/betaBuildLocalizations', {
    method: 'POST',
    body: createBetaBuildLocalizationBody({ buildId, locale, whatsNew }),
  })
  console.log(`✅ 已创建 ${locale} 测试说明`)
  return created?.data?.id
}

/** 查询某 App 全部 beta 测试组（含内/外部与全构建访问标记）。 */
export function createBetaGroupsLookupPath({ appId, limit = 200 }) {
  const qs = new URLSearchParams({
    'filter[app]': appId,
    'fields[betaGroups]': 'name,isInternalGroup,hasAccessToAllBuilds',
    limit: String(limit),
  })
  return `/betaGroups?${qs}`
}

/**
 * 解析测试组选择输入：按名字精确匹配（可逗号分隔多个）；留空 = 自动模式。
 * 自动模式优先选第一个「外部」测试组（面向公众测试者，配合自动提交 Beta App
 * Review 实现全自动外发），没有外部组时回落第一个内部组。
 */
export function selectBetaGroups(groups, groupNameInput) {
  const names = String(groupNameInput || '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean)
  if (names.length > 0) {
    const picked = names.map((name) => {
      const group = groups.find((g) => g.attributes?.name === name)
      if (!group) {
        const available = groups.map((g) => g.attributes?.name).join('、') || '（无可用测试组）'
        throw new Error(`找不到测试组「${name}」。App Store Connect 中该 App 的可用测试组：${available}`)
      }
      return group
    })
    console.log(
      `✅ 使用指定测试组：${picked.map((g) => `「${g.attributes?.name}」${g.attributes?.isInternalGroup ? '（内部）' : '（外部）'}`).join('、')}`,
    )
    return picked
  }

  const external = groups.find((g) => g.attributes?.isInternalGroup === false)
  if (external) {
    console.log(`✅ 自动选择第一个外部测试组「${external.attributes?.name}」（将自动提交 Beta App Review）`)
    return [external]
  }
  const internal = groups.find((g) => g.attributes?.isInternalGroup === true)
  if (!internal) {
    throw new Error('未指定测试组名，且该 App 没有任何测试组。请先在 App Store Connect 创建测试组，或填写 beta_group 输入')
  }
  console.log(`✅ 无外部测试组，自动选择第一个内部测试组「${internal.attributes?.name}」`)
  return [internal]
}

/**
 * 自动出口合规（"允许出口"）：把构建关联到 App 已批准的 App Encryption Declaration。
 * mode: 'auto'（默认）/ 'off'（跳过）/ 其它值视为显式声明 id。
 * auto 模式下若该 App 尚无任何声明，自动按「不包含加密算法」创建新声明并关联，
 * 全程无需打开 App Store Connect 网页。
 */
async function assignExportCompliance(token, { appId, buildId, mode }) {
  const normalized = String(mode || 'auto').trim().toLowerCase()
  if (normalized === 'off') {
    console.log('⏭️ 已跳过出口合规（export_compliance=off）')
    return
  }
  let declarationId = ''
  if (normalized !== 'auto') {
    declarationId = normalized // 视为显式声明 id
  } else {
    const data = await apiRequest(token, createAppEncryptionDeclarationLookupPath({ appId }))
    const list = data.data || []
    const approved = list.find(
      (item) => item.attributes?.appEncryptionDeclarationState === 'APPROVED',
    )
    declarationId = (approved || list[0])?.id || ''
    if (!declarationId) {
      // 首次上传：App 还没有加密合规声明。按「不包含加密算法」（usesEncryption=false）
      // 自动创建并关联，等价于在网页上回答 Export Compliance = No。
      console.log('🆕 该 App 尚无出口合规声明，自动创建「不包含加密算法」声明…')
      const created = await apiRequest(token, '/appEncryptionDeclarations', {
        method: 'POST',
        body: createAppEncryptionDeclarationBody({ appId }),
      })
      declarationId = created?.data?.id || ''
      const state = created?.data?.attributes?.appEncryptionDeclarationState
      console.log(
        `🆕 已自动创建「不包含加密算法」出口合规声明（id=${declarationId}，state=${state || 'UNKNOWN'}）`,
      )
      // 新建声明的可分配状态在 Apple 侧有秒级同步延迟，稍等再关联
      await sleep(5_000)
    }
  }
  if (!declarationId) {
    console.warn('⚠️ 出口合规声明创建/查找失败，跳过关联（不影响测试组投递）')
    return
  }

  // Apple 对标准豁免声明自动审批：新建声明初始为 CREATED，需等它进入
  // APPROVED 后 build 才满足「可分配外部组」状态（实测 2026-08-25 run 32796747072）
  for (let attempt = 1; attempt <= 18; attempt++) {
    const detail = await apiRequest(token, createAppEncryptionDeclarationGetPath(declarationId))
    const state = detail?.data?.attributes?.appEncryptionDeclarationState
    if (state === 'APPROVED') {
      console.log(`✅ 出口合规声明已生效（APPROVED，第 ${attempt} 次查询）`)
      break
    }
    if (attempt === 18) {
      console.warn(`⚠️ 声明状态仍为 ${state || 'UNKNOWN'}（等待超时），仍将尝试关联`)
      break
    }
    console.log(`⏳ 出口合规声明状态 ${state || 'UNKNOWN'}，10 秒后重查（${attempt}/18）…`)
    await sleep(10_000)
  }

  await apiRequest(
    token,
    `/builds/${encodeURIComponent(buildId)}/relationships/appEncryptionDeclaration`,
    {
      method: 'PATCH',
      body: createBuildEncryptionDeclarationLinkageBody(declarationId),
    },
  )
  console.log(`✅ 已关联出口合规声明（声明 id=${declarationId}）`)
}

/**
 * 把构建加入测试组。Apple 侧「可分配外部组」状态依赖出口合规声明生效，
 * 存在秒级同步延迟：422 not externally assignable 时延迟重试一次。
 */
async function addBuildToBetaGroup(token, { buildId, group }) {
  const join = () =>
    apiRequest(token, `/builds/${encodeURIComponent(buildId)}/relationships/betaGroups`, {
      method: 'POST',
      body: { data: [{ type: 'betaGroups', id: group.id }] },
    })
  try {
    await join()
  } catch (err) {
    if (!/not in an externally assignable state/i.test(err.message)) throw err
    console.log('⏳ 构建暂不可分配外部组（出口合规声明可能仍在生效中），15 秒后重试一次…')
    await sleep(15_000)
    await join()
  }
}

async function main() {
  const {
    APPSTORE_KEY_ID,
    APPSTORE_ISSUER_ID,
    APPSTORE_PRIVATE_KEY_PATH,
    APPLE_APP_ID,
    VERSION_NAME,
    BUILD_NUMBER,
    TESTFLIGHT_WHATS_NEW = '',
    TESTFLIGHT_BETA_GROUP = '',
    TESTFLIGHT_LOCALE = DEFAULT_TESTFLIGHT_LOCALE,
    TESTFLIGHT_EXPORT_COMPLIANCE = 'auto',
  } = process.env

  for (const [name, value] of Object.entries({
    APPSTORE_KEY_ID,
    APPSTORE_ISSUER_ID,
    APPSTORE_PRIVATE_KEY_PATH,
    APPLE_APP_ID,
    VERSION_NAME,
    BUILD_NUMBER,
  })) {
    if (!value) throw new Error(`缺少环境变量 ${name}`)
  }

  const privateKeyPem = readFileSync(APPSTORE_PRIVATE_KEY_PATH, 'utf8')
  const token = createJwt({ keyId: APPSTORE_KEY_ID, issuerId: APPSTORE_ISSUER_ID, privateKeyPem })
  console.log(`🔑 JWT 已生成（kid=${APPSTORE_KEY_ID}），目标 App ${APPLE_APP_ID}，版本 ${VERSION_NAME} (${BUILD_NUMBER})`)

  // 1) 等待构建处理完成
  const build = await waitForBuild(token, { appId: APPLE_APP_ID, versionName: VERSION_NAME, buildNumber: BUILD_NUMBER })
  const buildId = build.id

  // 2) 组装并填写测试说明
  const commits = recentCommits()
  const account = loadTestAccount()
  const whatsNew = buildWhatsNew({
    manual: TESTFLIGHT_WHATS_NEW,
    versionName: VERSION_NAME,
    buildNumber: BUILD_NUMBER,
    commits,
    account,
  })
  // 日志打印不含测试账号的版本（凭据不落 workflow 日志；说明全文见 TestFlight）
  const logLines = [`v${VERSION_NAME}（build ${BUILD_NUMBER}）`]
  if (commits.length > 0) {
    logLines.push('', '本次更新：')
    for (const commit of commits.slice(0, 10)) logLines.push(`- ${commit}`)
  }
  console.log('📝 测试说明（What to Test）：')
  console.log(logLines.map((line) => `   ${line}`).join('\n'))
  console.log('   （演示测试账号已自动附于说明中，详见 TestFlight）')
  await upsertBetaBuildLocalization(token, {
    buildId,
    locale: TESTFLIGHT_LOCALE,
    whatsNew,
  })
  console.log('✅ 测试说明已填写')

  // 2.5) 出口合规（"允许出口"）关联；失败不中断测试组投递
  try {
    await assignExportCompliance(token, {
      appId: APPLE_APP_ID,
      buildId,
      mode: TESTFLIGHT_EXPORT_COMPLIANCE,
    })
  } catch (err) {
    console.warn(`⚠️ 出口合规关联失败（不影响测试组投递）：${err.message}`)
  }

  // 3) 加入测试组（内部组 = 自动生效；外部组额外提交 Beta App Review）
  const groupsData = await apiRequest(token, createBetaGroupsLookupPath({ appId: APPLE_APP_ID }))
  const pickedGroups = selectBetaGroups(groupsData.data || [], TESTFLIGHT_BETA_GROUP)
  let needsBetaReview = false
  for (const group of pickedGroups) {
    if (group.attributes?.hasAccessToAllBuilds === true) {
      console.log(`✅ 测试组「${group.attributes?.name}」已配置自动访问所有构建，无需重复关联`)
    } else {
      await addBuildToBetaGroup(token, { buildId, group })
      console.log(`✅ 构建已加入测试组「${group.attributes?.name}」`)
    }
    if (group.attributes?.isInternalGroup === false) needsBetaReview = true
  }

  if (needsBetaReview) {
    try {
      await apiRequest(token, '/betaAppReviewSubmissions', {
        method: 'POST',
        body: {
          data: {
            type: 'betaAppReviewSubmissions',
            relationships: { build: { data: { type: 'builds', id: buildId } } },
          },
        },
      })
      console.log('✅ 已提交 Beta App Review，等待审核通过后外部测试员可见')
    } catch (err) {
      // 常见原因：Beta 测试信息（联系邮箱/隐私政策）未配置完整，或已有待审核提交
      console.warn(`⚠️ 提交 Beta App Review 失败（不影响内部测试）：${err.message}`)
    }
  } else {
    console.log('🚀 内部测试已自动提交：测试员现在即可在 TestFlight 中安装此构建')
  }
}

/* 直接运行（node tools/ci/submit_testflight.mjs）时才执行主流程；
   vitest import 本文件做纯函数单测时不执行。 */
const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  main().catch((err) => {
    console.error(`❌ ${err.message}`)
    process.exit(1)
  })
}
