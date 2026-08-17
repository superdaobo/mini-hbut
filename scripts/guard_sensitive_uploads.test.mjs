/**
 * SecretGuard 单元测试（node --test scripts/guard_sensitive_uploads.test.mjs）
 *
 * 覆盖 #618 + #626 新增的 Identity 敏感值类别：
 * - 正例：Vercel Token / PG 连接串（含密码）/ PEM 私钥 / OIDC 私钥 JWK /
 *         Identity 密钥类环境变量赋值 / 服务令牌 / handoff 样例；
 * - 反例：普通 JSON、占位模板（.env.example 风格）、非敏感 issuer 赋值、
 *         短 handoff 值、无引号 env 赋值不得误报。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  sensitivePatterns,
  scanContent,
  getCommitsForRange,
  scanCommits,
} from './guard_sensitive_uploads.mjs'

const scan = (text) => scanContent('fixtures.txt', text, 'test')

test('sensitivePatterns 覆盖 #618/#626 要求的新类别', () => {
  const names = sensitivePatterns.map((p) => p.name)
  for (const expected of [
    'Vercel Token',
    'PostgreSQL 连接串（含密码）',
    'PEM 私钥块',
    'OIDC 私钥 JWK（kty+d 组合）',
    'Identity 平台密钥类环境变量赋值',
    'Identity handoff/令牌样例赋值',
  ]) {
    assert.ok(names.includes(expected), `缺少类别: ${expected}`)
  }
})

test('正例：Vercel Token 命中', () => {
  const findings = scan('const t = "vercel_abc123ABC456def789GHI012jkl345";')
  assert.ok(findings.some((f) => f.rule === 'Vercel Token'))
})

test('正例：PostgreSQL 连接串（含密码）命中', () => {
  const findings = scan('DATABASE_URL=postgresql://admin:s3cr3t-pass!word@db.neon.tech/mini_hbut')
  assert.ok(findings.some((f) => f.rule === 'PostgreSQL 连接串（含密码）'))
})

test('正例：PEM 私钥块命中', () => {
  const findings = scan('-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFA\n-----END PRIVATE KEY-----')
  assert.ok(findings.some((f) => f.rule === 'PEM 私钥块'))
})

test('正例：OIDC 私钥 JWK（kty+d 组合）命中', () => {
  const jwk = '{"kty":"EC","crv":"P-256","d":"abcdefghijklmnopqrstuvwxyz123456","x":"AA","y":"BB"}'
  const findings = scan(jwk)
  assert.ok(findings.some((f) => f.rule === 'OIDC 私钥 JWK（kty+d 组合）'))
})

test('正例：Identity 密钥类环境变量赋值命中', () => {
  const findings = scan('const env = { IDENTITY_CLIENT_SECRET_KEK: "0123456789abcdef0123456789abcdef" };')
  assert.ok(findings.some((f) => f.rule === 'Identity 平台密钥类环境变量赋值'))
})

test('正例：#626 服务令牌/其他密钥 env 赋值命中', () => {
  const a = scan('process.env.IDENTITY_SERVICE_TOKEN = "svc-token-0123456789abcdef0123456789abcdef";')
  assert.ok(a.some((f) => f.rule === 'Identity 平台密钥类环境变量赋值'))
  const b = scan('const keys = { IDENTITY_COOKIE_KEYS: "cookie-sign-key-0123456789abcdef0123456789abcdef" };')
  assert.ok(b.some((f) => f.rule === 'Identity 平台密钥类环境变量赋值'))
})

test('正例：#626 handoff/服务令牌头样例命中', () => {
  const a = scan('fetch(url, { headers: { "x-identity-handoff": "ho_7hF2kPq9wXyZ4vB6nM1cJ8dL3sA5tR0uE0123" } });')
  assert.ok(a.some((f) => f.rule === 'Identity handoff/令牌样例赋值'))
  const b = scan('const h = { "x-identity-service-token": "svc-token-0123456789abcdef0123456789abcdef" };')
  assert.ok(b.some((f) => f.rule === 'Identity handoff/令牌样例赋值'))
})

test('反例：普通 JSON 不误报', () => {
  const findings = scan('{"name":"张三","scores":[98,87,76],"remark":"d: ok","note":"kty not really"}')
  assert.equal(findings.length, 0)
})

test('反例：短 d 值 JSON（非 JWK）不误报', () => {
  assert.equal(scan('{"kty":"RSA","d":"123"}').length, 0)
})

test('反例：.env.example 占位模板不误报（无引号 + 尖括号）', () => {
  const placeholder = 'IDENTITY_DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>'
  assert.equal(scan(placeholder).length, 0)
})

test('反例：非敏感 issuer 赋值不误报', () => {
  assert.equal(scan('IDENTITY_ISSUER=https://id.xn--vhq74jc2fzpchter27a.com').length, 0)
})

test('反例：无凭据 PG URL 不误报', () => {
  assert.equal(scan('const db = "postgres://localhost:5432/myapp";').length, 0)
})

test('反例：普通文本与短 secret 值不误报', () => {
  assert.equal(scan('今天天气不错，成绩查询应用工作正常。').length, 0)
  assert.equal(scan('{"client_secret":"none"}').length, 0)
})

test('反例：#626 短 handoff 值 / 无引号 env 占位 / 说明文字不误报', () => {
  assert.equal(scan('headers: { "x-identity-handoff": "short" }').length, 0)
  assert.equal(scan('IDENTITY_SERVICE_TOKEN=<your-service-token>').length, 0)
  assert.equal(scan('文档提到 x-identity-handoff header 用于转发凭据，不携带具体值').length, 0)
})

// ---------------------------------------------------------------------------
// #644: commit range 扫描（scan-range 模式）
// 覆盖：root commit / 首次 push（before 全零）/ 删除 / 重命名 /
//       多 commit push / PR base..head / 无效 range 非静默放行
// 单测在临时 git 仓库中运行（chdir），验证后恢复原 cwd。
// ---------------------------------------------------------------------------

const ZERO_SHA = '0'.repeat(40)

function runGitIn(dir, args, opts = {}) {
  const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8', ...opts })
  assert.equal(result.status, 0, `git ${args.join(' ')} 失败: ${result.stderr}`)
  return result.stdout.trim()
}

async function makeTempRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'secretguard-range-'))
  runGitIn(dir, ['init', '-q'])
  runGitIn(dir, ['config', 'user.name', 'SecretGuard Test'])
  runGitIn(dir, ['config', 'user.email', 'secretguard@test.local'])
  return dir
}

async function commitFile(dir, name, content, message) {
  await fs.writeFile(path.join(dir, name), content, 'utf8')
  runGitIn(dir, ['add', name])
  runGitIn(dir, ['commit', '-q', '-m', message])
  return runGitIn(dir, ['rev-parse', 'HEAD'])
}

/** 在临时仓库内执行扫描闭包，结束后恢复进程 cwd */
async function withRepo(fn) {
  const dir = await makeTempRepo()
  const previousCwd = process.cwd()
  process.chdir(dir)
  try {
    return await fn(dir)
  } finally {
    process.chdir(previousCwd)
    await fs.rm(dir, { recursive: true, force: true })
  }
}

test('scan-range: root commit（before 全零）含敏感内容必须拒绝', async () => {
  await withRepo(async (dir) => {
    const head = await commitFile(
      dir,
      'leak.txt',
      'DATABASE_URL=postgresql://admin:s3cr3t@db.neon.tech/mini_hbut',
      'root commit with secret',
    )
    const commits = getCommitsForRange(`${ZERO_SHA}..${head}`)
    assert.ok(commits.includes(head), 'root 提交必须被包含')
    const findings = scanCommits(commits)
    assert.ok(findings.some((f) => f.rule === 'PostgreSQL 连接串（含密码）'), '必须命中敏感内容')
  })
})

test('scan-range: root commit 普通内容通过', async () => {
  await withRepo(async (dir) => {
    const head = await commitFile(dir, 'ok.txt', '普通内容 hello', 'root commit')
    const commits = getCommitsForRange(`${ZERO_SHA}..${head}`)
    assert.ok(commits.includes(head))
    assert.equal(scanCommits(commits).length, 0)
  })
})

test('scan-range: 多 commit push 扫描范围内所有新提交', async () => {
  await withRepo(async (dir) => {
    const base = await commitFile(dir, 'a.txt', '普通文件', 'commit 1')
    const head = await commitFile(
      dir,
      'b.txt',
      'const t = "vercel_abc123ABC456def789GHI012jkl345";',
      'commit 2 with vercel token',
    )
    const commits = getCommitsForRange(`${base}..${head}`)
    assert.deepEqual(commits, [head])
    const findings = scanCommits(commits)
    assert.ok(findings.some((f) => f.rule === 'Vercel Token'), '必须命中后续提交的敏感内容')
  })
})

test('scan-range: 删除提交不误报（D 不进入扫描）', async () => {
  await withRepo(async (dir) => {
    const c1 = await commitFile(
      dir,
      'secret.txt',
      'IDENTITY_SIGNING_KEY: "0123456789abcdef0123456789abcdef"',
      'add secret file',
    )
    await fs.rm(path.join(dir, 'secret.txt'))
    runGitIn(dir, ['add', '-A'])
    runGitIn(dir, ['commit', '-q', '-m', 'remove secret file'])
    const c2 = runGitIn(dir, ['rev-parse', 'HEAD'])
    // 删除不会把敏感内容重新引入仓库；range c1..c2 扫描新提交（只含删除）应通过
    const commits = getCommitsForRange(`${c1}..${c2}`)
    assert.deepEqual(commits, [c2])
    assert.equal(scanCommits(commits).length, 0)
  })
})

test('scan-range: 重命名提交扫描新 blob（普通内容通过）', async () => {
  await withRepo(async (dir) => {
    const c1 = await commitFile(dir, 'old.txt', 'rename me 普通内容', 'add old')
    runGitIn(dir, ['mv', 'old.txt', 'new.txt'])
    runGitIn(dir, ['commit', '-q', '-m', 'rename to new'])
    const c2 = runGitIn(dir, ['rev-parse', 'HEAD'])
    const commits = getCommitsForRange(`${c1}..${c2}`)
    assert.deepEqual(commits, [c2])
    assert.equal(scanCommits(commits).length, 0)
  })
})

test('scan-range: 重命名提交扫描新 blob（新内容敏感则拒绝）', async () => {
  await withRepo(async (dir) => {
    const c1 = await commitFile(dir, 'old.txt', '普通内容', 'add old')
    await fs.writeFile(path.join(dir, 'new.txt'), 'IDENTITY_SERVICE_TOKEN: "svc-secret-0123456789abcdef"', 'utf8')
    runGitIn(dir, ['rm', '-q', 'old.txt'])
    runGitIn(dir, ['add', 'new.txt'])
    runGitIn(dir, ['commit', '-q', '-m', 'rename with secret content'])
    const c2 = runGitIn(dir, ['rev-parse', 'HEAD'])
    const commits = getCommitsForRange(`${c1}..${c2}`)
    assert.ok(scanCommits(commits).some((f) => f.rule === 'Identity 平台密钥类环境变量赋值'))
  })
})

test('scan-range: PR base..head 与 push before..after 等价（同一 range 语义）', async () => {
  await withRepo(async (dir) => {
    const base = await commitFile(dir, 'a.txt', '普通文件', 'base')
    const mid = await commitFile(dir, 'b.txt', '普通文件 2', 'mid')
    const head = await commitFile(dir, 'c.txt', '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----', 'head leak')
    // rev-list 输出新提交在前；PR 场景：base..head 覆盖 mid、head 两个提交
    const prCommits = getCommitsForRange(`${base}..${head}`)
    assert.deepEqual(prCommits, [head, mid])
    assert.ok(scanCommits(prCommits).some((f) => f.rule === 'PEM 私钥块'))
    // push 场景：before..after 只扫新提交
    const pushCommits = getCommitsForRange(`${mid}..${head}`)
    assert.deepEqual(pushCommits, [head])
  })
})

test('scan-range: 无效 range 必须抛错（不能静默放行）', async () => {
  await withRepo(async () => {
    assert.throws(() => getCommitsForRange(''), /无效的 commit range/)
    assert.throws(() => getCommitsForRange('HEAD'), /无效的 commit range/)
    assert.throws(() => getCommitsForRange('abc..'), /无效的 commit range/)
    assert.throws(() => getCommitsForRange('..'), /无效的 commit range/)
    // after 无法解析为提交时 rev-list 失败 → 抛错（非静默放行）
    assert.throws(() => getCommitsForRange('0000000..ffffffffffffffffffffffffffffffffffffffff'), /失败/)
  })
})

test('scan-range: 合法空 range（无新提交）通过', async () => {
  await withRepo(async (dir) => {
    const head = await commitFile(dir, 'a.txt', '普通内容', 'only commit')
    const commits = getCommitsForRange(`${head}..${head}`)
    assert.deepEqual(commits, [])
    assert.equal(scanCommits(commits).length, 0)
  })
})
