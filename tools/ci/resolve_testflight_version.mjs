/**
 * TestFlight 版本号 / build 号自动递增解析（由 .github/workflows/ios-testflight.yml 调用）
 *
 * 背景：App Store Connect 要求 CFBundleShortVersionString 必须高于该 App「已批准」的
 * 历史 marketing 版本（错误码 90062，且已关闭的版本列车不可复用，见 90186），
 * CFBundleVersion（build 号）必须在 App 内全局唯一且大于同列车历史值。
 * package.json 的版本只反映代码仓库状态、GitHub run number 只反映 workflow 计数，
 * 二者都不代表 ASC 现状，直接回读会撞上述限制（2026-08-24 run 32735810871 即因此失败）。
 *
 * 职责（仅当 workflow_dispatch 对应输入留空时查询 ASC）：
 *  1. version_name 留空 → 查询 ASC 全部 iOS prerelease 版本，取最高版本尾段 +1；
 *     ASC 尚无版本时回退 apps/client/package.json 版本尾段 +1
 *  2. build_number 留空 → 查询 ASC 最大 CFBundleVersion，+1；尚无构建时从 1 开始
 * 手动输入优先级始终最高：填了就不查询、不改写。
 *
 * 认证：与 altool 上传共用同一把 App Store Connect API Key（JWT 复用
 * submit_testflight.mjs 的 createJwt/apiRequest），无需新增密钥。
 */

import { appendFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createJwt, apiRequest } from './submit_testflight.mjs'

/* ------------------------------------------------------------------ */
/* 纯函数（可单测）                                                     */
/* ------------------------------------------------------------------ */

/** 把版本号解析为最多三段的整数数组；非法输入返回 null。 */
export function parseVersionParts(version) {
  const raw = String(version ?? '').trim()
  if (!raw || raw.includes('+') || raw.includes('-')) return null
  const parts = raw.split('.').map((p) => Number.parseInt(p, 10))
  if (parts.length < 1 || parts.length > 3) return null
  if (parts.some((n) => !Number.isInteger(n) || n < 0)) return null
  return parts
}

/** 逐段数值比较，缺失段视为 0（"1.4" === "1.4.0"）。 */
export function compareVersionParts(a, b) {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const diff = (a[i] || 0) - (b[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * 计算下一个 marketing 版本：候选里最高版本的尾段 +1（保持原段数）。
 * 候选全非法/为空时回退 fallback（同样尾段 +1）。
 * @param {string[]} versions ASC 已存在的版本号列表
 * @param {string} fallback 回退基准（如 package.json 版本）
 */
export function nextMarketingVersion(versions, fallback) {
  const parsed = (versions || []).map(parseVersionParts).filter(Boolean)
  const fallbackParts = parseVersionParts(fallback)
  if (!fallbackParts && parsed.length === 0) {
    throw new Error(`无法推导下一版本号：ASC 无历史版本且回退版本非法（${fallback}）`)
  }
  let base =
    parsed.length > 0
      ? parsed.sort(compareVersionParts)[parsed.length - 1]
      : fallbackParts
  const bumped = [...base]
  bumped[bumped.length - 1] += 1
  return bumped.join('.')
}

/**
 * 计算下一个 build 号：已知最大值 +1；列表为空时 fallback +1。
 * @param {Array<number|string>} buildNumbers ASC 已存在的 CFBundleVersion 列表
 * @param {number} fallback 无历史时的起始值（默认 0 → 首个 build 为 1）
 */
export function nextBuildNumber(buildNumbers, fallback = 0) {
  const numbers = (buildNumbers || [])
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 0)
  return Math.max(...numbers, fallback) + 1
}

/** 查询某 App 全部 iOS prerelease 版本（marketing version 维度）。 */
export function createPrereleaseVersionsPath({ appId, limit = 200 }) {
  const qs = new URLSearchParams({
    'filter[app]': appId,
    'filter[platform]': 'IOS',
    'fields[preReleaseVersions]': 'version',
    limit: String(limit),
  })
  return `/preReleaseVersions?${qs}`
}

/** 按 CFBundleVersion 倒序查询某 App 的构建（第一条即最大 build 号）。 */
export function createMaxBuildLookupPath({ appId, limit = 50 }) {
  const qs = new URLSearchParams({
    'filter[app]': appId,
    'fields[builds]': 'version',
    sort: '-version',
    limit: String(limit),
  })
  return `/builds?${qs}`
}

/* ------------------------------------------------------------------ */
/* 主流程                                                               */
/* ------------------------------------------------------------------ */

function readClientPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync('apps/client/package.json', 'utf8'))
    return pkg.version || ''
  } catch {
    return '' // 仓库结构变化时降级：仅当 ASC 也查不到版本才会用到回退值
  }
}

async function main() {
  const {
    APPLE_APP_ID,
    APPSTORE_KEY_ID,
    APPSTORE_ISSUER_ID,
    APPSTORE_PRIVATE_KEY_PATH,
    INPUT_VERSION_NAME = '',
    INPUT_BUILD_NUMBER = '',
    GITHUB_OUTPUT,
  } = process.env

  let versionName = String(INPUT_VERSION_NAME).trim()
  let buildNumber = String(INPUT_BUILD_NUMBER).trim()

  // 任一输入留空才需要访问 ASC；手动输入优先，不做任何改写
  if (!versionName || !buildNumber) {
    for (const [name, value] of Object.entries({
      APPLE_APP_ID,
      APPSTORE_KEY_ID,
      APPSTORE_ISSUER_ID,
      APPSTORE_PRIVATE_KEY_PATH,
    })) {
      if (!value) throw new Error(`缺少环境变量 ${name}`)
    }
    const privateKeyPem = readFileSync(APPSTORE_PRIVATE_KEY_PATH, 'utf8')
    const token = createJwt({ keyId: APPSTORE_KEY_ID, issuerId: APPSTORE_ISSUER_ID, privateKeyPem })

    if (!versionName) {
      const data = await apiRequest(token, createPrereleaseVersionsPath({ appId: APPLE_APP_ID }))
      const versions = (data.data || [])
        .map((item) => item.attributes?.version)
        .filter(Boolean)
      versionName = nextMarketingVersion(versions, readClientPackageVersion())
      console.log(
        versions.length > 0
          ? `📈 ASC 现存最高版本之上自动递增（历史 ${versions.length} 个版本）`
          : '📈 ASC 无历史版本，按 package.json 版本递增',
      )
    }

    if (!buildNumber) {
      const data = await apiRequest(token, createMaxBuildLookupPath({ appId: APPLE_APP_ID }))
      const buildNumbers = (data.data || [])
        .map((item) => item.attributes?.version)
        .filter((v) => v != null)
      buildNumber = String(nextBuildNumber(buildNumbers))
      console.log('🔢 以 ASC 最大 build 号之上自动递增')
    }
  }

  // 与旧行内校验一致：最终结果必须是合法的三段以内数字版本号 / 纯数字 build 号
  if (!/^[0-9]+(\.[0-9]+){0,2}$/.test(versionName)) {
    throw new Error(`version_name must look like 1, 1.2, or 1.2.3; got '${versionName}'`)
  }
  if (!/^[0-9]+$/.test(buildNumber)) {
    throw new Error(`build_number must be numeric; got '${buildNumber}'`)
  }

  console.log(`VERSION_NAME=${versionName}`)
  console.log(`BUILD_NUMBER=${buildNumber}`)
  if (GITHUB_OUTPUT) {
    appendFileSync(GITHUB_OUTPUT, `version_name=${versionName}\nbuild_number=${buildNumber}\n`)
  }
}

/* 直接运行时才执行主流程；node --test import 纯函数时不执行。 */
const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  main().catch((err) => {
    console.error(`❌ ${err.message}`)
    process.exit(1)
  })
}
