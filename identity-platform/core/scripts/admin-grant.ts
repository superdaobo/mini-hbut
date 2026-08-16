#!/usr/bin/env node
/**
 * Admin 角色 Bootstrap 脚本（issue #625，out-of-band）。
 *
 * 用途：第一位管理员必须通过本地执行本脚本赋权（不接受「知道学号即 admin」）。
 * 执行：
 *   pnpm admin:grant --user usr_xxx [--role identity_admin|identity_reviewer] [--revoke] [--yes]
 *
 * 安全约束：
 * - 必须配置 IDENTITY_DATABASE_URL；
 * - 只接受内部 user id（必须是 users 表已存在用户）；
 * - production 环境必须显式 --yes（高危险写操作，AgentDock/人工确认）；
 * - 执行成功写审计 ADMIN_ROLE_GRANTED / ADMIN_ROLE_REVOKED（actor=system）；
 * - 不提供公开 HTTP bootstrap 端点（本脚本仅本地执行一次）。
 */
import { parseArgs } from 'node:util'
import pg from 'pg'
import { createPgExecutor } from '../src/db/types.js'
import { grantAdminRole, revokeAdminRole } from '../src/api/admin/roles-service.js'
import { AdminInvalidInputError, RoleNotFoundError } from '../src/api/admin/errors.js'
import { ADMIN_ROLES, type AdminRole } from '../src/api/admin/rbac.js'

function fail(message: string): never {
  console.error(`[admin:grant] 错误：${message}`)
  process.exit(1)
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      user: { type: 'string' },
      role: { type: 'string', default: 'identity_admin' },
      revoke: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  })

  const userId = values.user?.trim()
  if (!userId) {
    fail('缺少 --user <内部 user id>（如 usr_xxx，必须是 users 表已有用户）')
  }
  const role = values.role as string
  if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
    fail(`role 必须是 ${ADMIN_ROLES.join(' / ')}（当前：${role}）`)
  }

  const environment = (process.env.IDENTITY_ENVIRONMENT ?? 'development').trim().toLowerCase()
  if (environment === 'production' && !values.yes) {
    fail('生产环境必须显式 --yes 确认（高危险写操作，请人工/AgentDock 确认后执行）')
  }

  const dsn = process.env.IDENTITY_DATABASE_URL?.trim()
  if (!dsn) {
    fail('必须配置 IDENTITY_DATABASE_URL')
  }

  const pool = new pg.Pool({ connectionString: dsn, max: 1 })
  const sql = createPgExecutor(pool)
  try {
    if (values.revoke) {
      await revokeAdminRole(sql, { userId, role: role as AdminRole })
      console.log(`[admin:grant] 已撤销 ${role}：${userId}（审计 ADMIN_ROLE_REVOKED 已写入）`)
    } else {
      const { created } = await grantAdminRole(sql, { userId, role: role as AdminRole })
      console.log(
        created
          ? `[admin:grant] 已授予 ${role}：${userId}（审计 ADMIN_ROLE_GRANTED 已写入）`
          : `[admin:grant] ${userId} 已拥有 ${role}，无需重复授予（幂等）`,
      )
    }
  } catch (err) {
    if (err instanceof RoleNotFoundError || err instanceof AdminInvalidInputError) {
      fail(err.message)
    }
    throw err
  } finally {
    await pool.end()
  }
}

void main().catch((err) => {
  console.error('[admin:grant] 未预期错误：', (err as Error).message)
  process.exit(1)
})
