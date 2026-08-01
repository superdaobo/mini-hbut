#!/usr/bin/env node
/**
 * TestFlight 自动化提交脚本（由 .github/workflows/ios-testflight.yml 调用）
 *
 * 职责：IPA 上传到 App Store Connect 后，代替人工完成：
 *  1. 轮询等待构建处理完成（PROCESSING_COMPLETE）
 *  2. 填写「测试说明（What to Test）」：
 *     - 优先使用 workflow 输入 TESTFLIGHT_WHATS_NEW（支持字面 \n 换行）
 *     - 留空则自动生成：最近 git 提交 + src/utils/test_account.js 中的演示测试账号
 *  3. 把构建加入 beta 测试组：
 *     - 指定 TESTFLIGHT_BETA_GROUP 按名字匹配；留空选第一个内部测试组
 *     - 内部组 = 自动提交，内部测试员立即可安装
 *     - 外部组 = 额外提交 Beta App Review（betaAppReviewSubmissions）
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
  const signature = crypto.sign('sha256', Buffer.from(signingInput), key).toString('base64url')
  return `${signingInput}.${signature}`
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

async function apiRequest(token, pathname, { method = 'GET', body } = {}, retries = 2) {
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
    return parseTestAccount(readFileSync('src/utils/test_account.js', 'utf8'))
  } catch {
    return null // 仓库结构变化时降级，测试说明不含账号段
  }
}

/* ------------------------------------------------------------------ */
/* 主流程                                                               */
/* ------------------------------------------------------------------ */

async function waitForBuild(token, { appId, versionName, buildNumber }) {
  // 上传后构建需要几分钟处理，轮询最多 30 次 × 20 秒 = 10 分钟
  const MAX_ATTEMPTS = 30
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const qs = new URLSearchParams({
      'filter[app]': appId,
      'filter[version]': versionName,
      'filter[buildNumber]': buildNumber,
      'fields[builds]': 'processingState',
      limit: '1',
    })
    const data = await apiRequest(token, `/builds?${qs}`)
    const build = data.data?.[0]
    if (build) {
      const state = build.attributes?.processingState
      if (state === 'PROCESSING_COMPLETE') {
        console.log(`✅ 构建 ${versionName} (${buildNumber}) 处理完成，build id=${build.id}`)
        return build
      }
      if (state === 'PROCESSING_FAILED' || state === 'VALIDATION_FAILED') {
        throw new Error(`构建处理失败（processingState=${state}），请到 App Store Connect 查看原因`)
      }
      console.log(`⏳ 构建处理中（${state}），第 ${attempt}/${MAX_ATTEMPTS} 次轮询，20 秒后重试…`)
    } else {
      console.log(`⏳ 构建记录尚未可见（第 ${attempt}/${MAX_ATTEMPTS} 次轮询），20 秒后重试…`)
    }
    await sleep(20_000)
  }
  throw new Error('等待构建处理完成超时（10 分钟）。可稍后手动到 App Store Connect 查看，或重试本 workflow')
}

async function findBetaGroup(token, { appId, groupName }) {
  const qs = new URLSearchParams({
    'filter[app]': appId,
    'fields[betaGroups]': 'name,isInternalGroup',
    limit: '200',
  })
  const data = await apiRequest(token, `/betaGroups?${qs}`)
  const groups = data.data || []
  if (groupName) {
    const group = groups.find((g) => g.attributes?.name === groupName)
    if (!group) {
      const names = groups.map((g) => g.attributes?.name).join('、') || '（无可用测试组）'
      throw new Error(`找不到测试组「${groupName}」。App Store Connect 中该 App 的可用测试组：${names}`)
    }
    console.log(`✅ 使用指定测试组「${groupName}」${group.attributes?.isInternalGroup ? '（内部组）' : '（外部组）'}`)
    return group
  }
  const internal = groups.find((g) => g.attributes?.isInternalGroup === true)
  if (!internal) {
    throw new Error('未指定测试组名，且该 App 没有内部测试组。请先在 App Store Connect 创建内部测试组，或填写 beta_group 输入')
  }
  console.log(`✅ 自动选择第一个内部测试组「${internal.attributes?.name}」`)
  return internal
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
  // 日志只打印不含测试账号的版本（凭据不落 workflow 日志，PATCH 内容不受影响）
  const logSafe = buildWhatsNew({
    manual: TESTFLIGHT_WHATS_NEW,
    versionName: VERSION_NAME,
    buildNumber: BUILD_NUMBER,
    commits,
    account: null,
  })
  console.log('📝 测试说明（What to Test）：')
  console.log(logSafe.split('\n').map((line) => `   ${line}`).join('\n'))
  console.log('   （演示测试账号已自动附于说明中，详见 TestFlight）')
  await apiRequest(token, `/builds/${buildId}`, {
    method: 'PATCH',
    body: { data: { type: 'builds', id: buildId, attributes: { whatsNew } } },
  })
  console.log('✅ 测试说明已填写')

  // 3) 加入测试组（内部组 = 自动提交；外部组需要 Beta App Review）
  const group = await findBetaGroup(token, { appId: APPLE_APP_ID, groupName: TESTFLIGHT_BETA_GROUP })
  await apiRequest(token, `/builds/${buildId}/relationships/betaGroups`, {
    method: 'POST',
    body: { data: [{ type: 'betaGroups', id: group.id }] },
  })
  console.log(`✅ 构建已加入测试组「${group.attributes?.name}」`)

  if (group.attributes?.isInternalGroup === false) {
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
