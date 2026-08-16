/**
 * #622 API 测试辅助：
 * - 生成真实 Ed25519 密钥对（Node crypto）并对 canonical 签名；
 * - 组装只含 app 路由的 Koa app（registerAppRoutes 直挂，不依赖 app.ts 全量组装）；
 * - 创建带 handoff 的 AuthRequest（复用 #619 领域服务 + fixture）；
 * - 构建 enroll / approve 请求体（canonical 与签名与客户端一致）。
 */
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import Koa from 'koa'
import Router from '@koa/router'
import type { SqlExecutor } from '../../src/db/types.js'
import { registerAppRoutes } from '../../src/api/app/index.js'
import { createClientFixture } from '../helpers/fixtures.js'
import { TEST_HANDOFF_HMAC_KEY } from '../helpers/keys.js'
import { createAuthRequest, transitionAuthRequestStatus } from '../../src/domain/auth-requests/service.js'
import {
  buildAuthCanonical,
  buildEnrollCanonical,
  normalizeScopes,
  scopeHash,
  jwkFingerprint,
} from '../../src/api/app/canonical.js'

/** 测试设备密钥：持有私钥能力（仅测试进程内，私钥绝不上传） */
export interface TestDeviceKey {
  jwk: { kty: 'OKP'; crv: 'Ed25519'; x: string }
  /** 对 canonical UTF-8 文本签名，返回 base64url 64 字节签名 */
  sign(canonical: string): string
  fingerprint(): string
}

export function newTestDeviceKey(): TestDeviceKey {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const exported = publicKey.export({ format: 'jwk' }) as { x: string }
  // 只保留协议字段 {kty, crv, x}（与 Rust 客户端 public_jwk 一致；Node 导出可能含 key_ops 等额外字段）
  const jwk: { kty: 'OKP'; crv: 'Ed25519'; x: string } = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: exported.x,
  }
  const priv: KeyObject = privateKey
  return {
    jwk,
    sign(canonical: string): string {
      return sign(null, Buffer.from(canonical, 'utf8'), priv).toString('base64url')
    },
    fingerprint() {
      return jwkFingerprint(jwk)
    },
  }
}

/** 创建带 handoff 的 AuthRequest（CREATED → WAITING_APP），返回审批所需全部字段 */
export async function createHandoffRequest(
  sql: SqlExecutor,
  opts: { scopes?: string[]; ttlSeconds?: number } = {},
): Promise<{
  requestId: string
  handoffSecret: string
  serverChallenge: string
  clientId: string
  scopes: string[]
}> {
  const scopes = opts.scopes ?? ['openid', 'profile']
  const fixture = await createClientFixture(sql, { scopes })
  const request = await createAuthRequest(sql, {
    interactionUid: `iu_${Math.random().toString(36).slice(2, 16)}${Date.now().toString(36)}`,
    clientId: fixture.clientId,
    requestedScopes: scopes,
    handoffHmacKey: TEST_HANDOFF_HMAC_KEY,
    ttlSeconds: opts.ttlSeconds ?? 60,
  })
  await transitionAuthRequestStatus(sql, request.requestId, 'WAITING_APP')
  return {
    requestId: request.requestId,
    handoffSecret: request.handoffSecret,
    serverChallenge: request.serverChallenge,
    clientId: fixture.clientId,
    scopes,
  }
}

/** 组装仅含 app 路由的 Koa app（测试用；生产组装由 app.ts + api/index.ts 完成） */
export function buildApp(sql: SqlExecutor): Koa {
  const app = new Koa()
  const router = new Router()
  registerAppRoutes(router, {
    sql,
    provider: null as never,
    handoffHmacKey: TEST_HANDOFF_HMAC_KEY,
  })
  app.use(router.routes())
  app.use(router.allowedMethods())
  return app
}

export interface ApproveBodyInput {
  key: TestDeviceKey
  requestId: string
  challenge: string
  clientId: string
  scopes: string[]
  /** 已注册的 device_id（enroll 返回值） */
  deviceId: string
  issuedAt?: number
  nonce?: string
  /** 覆盖签名（scope tamper / 篡改测试用） */
  signatureOverride?: string
}

/** 构建 approve body：设备对 MINI-HBUT-AUTH-V1 canonical 签名（与 Rust 客户端一致） */
export function buildApproveBody(input: ApproveBodyInput): {
  device_id: string
  issued_at: number
  nonce: string
  signature: string
} {
  const issuedAt = input.issuedAt ?? Math.floor(Date.now() / 1000)
  const nonce = input.nonce ?? `nonce_${Math.random().toString(36).slice(2, 14)}`
  const canonical = buildAuthCanonical({
    requestId: input.requestId,
    challenge: input.challenge,
    clientId: input.clientId,
    scopeHash: scopeHash(normalizeScopes(input.scopes)),
    deviceId: input.deviceId,
    decision: 'approve',
    issuedAt,
    nonce,
  })
  return {
    device_id: input.deviceId,
    issued_at: issuedAt,
    nonce,
    signature: input.signatureOverride ?? input.key.sign(canonical),
  }
}

export interface EnrollBodyInput {
  key: TestDeviceKey
  challenge: string
  studentId: string
  studentName?: string
  platform?: string
  appVersion?: string
  deviceName?: string
  issuedAt?: number
  nonce?: string
  /** 覆盖签名（invalid signature 测试用） */
  signatureOverride?: string
}

/** 构建 enroll body：新私钥对 MINI-HBUT-ENROLL-V1 canonical 签名 */
export function buildEnrollBody(input: EnrollBodyInput): Record<string, unknown> {
  const issuedAt = input.issuedAt ?? Math.floor(Date.now() / 1000)
  const nonce = input.nonce ?? `nonce_${Math.random().toString(36).slice(2, 14)}`
  const fingerprint = input.key.fingerprint()
  const canonical = buildEnrollCanonical({
    challenge: input.challenge,
    publicKeyFingerprint: fingerprint,
    studentId: input.studentId,
    studentName: input.studentName ?? '',
    issuedAt,
    nonce,
  })
  return {
    public_jwk: input.key.jwk,
    platform: input.platform ?? 'windows',
    app_version: input.appVersion ?? '0.1.0-test',
    device_name: input.deviceName ?? '测试设备',
    challenge: input.challenge,
    student_id: input.studentId,
    student_name: input.studentName ?? '',
    issued_at: issuedAt,
    nonce,
    signature: input.signatureOverride ?? input.key.sign(canonical),
  }
}

/** 发起 POST JSON 请求并返回响应 */
export async function postJson(
  baseUrl: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const parsed = (await res.json()) as Record<string, unknown>
  return { status: res.status, body: parsed }
}
