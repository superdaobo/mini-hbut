/**
 * 显式 migration 执行器（#619）。
 *
 * 铁律（docs/issues/619.json）：
 * - migration 只能在【显式命令 / CI 门禁】执行；
 * - 禁止在 Function cold start 自动执行（Vercel 无状态环境不得自改 schema）；
 * - 每个 migration 在独立事务中执行并记入 schema_migrations；
 * - 已应用过的 migration 自动跳过（可重复环境部署）。
 *
 * 执行：
 *   pnpm migrate:up            # 应用全部未执行的 migrations
 *   pnpm migrate:rollback      # 执行 rollback 脚本（人工确认后使用）
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { SqlExecutor } from './types.js'

export interface MigrationRecord {
  name: string
  appliedAt: Date
}

/**
 * 应用指定目录下所有未执行的 migration（文件名排序）。
 * 返回本次新应用的文件名列表。
 */
export async function runMigrations(
  sql: SqlExecutor,
  migrationsDir: string,
): Promise<string[]> {
  // 迁移执行器自建记账表（不属于 0001 的业务表）
  await sql.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name       TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  )

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql') && !f.startsWith('rollback_'))
    .sort()

  const applied = await sql.query<{ name: string }>(
    'SELECT name FROM schema_migrations',
  )
  const appliedSet = new Set(applied.rows.map((r) => r.name))

  const newlyApplied: string[] = []
  for (const file of files) {
    if (appliedSet.has(file)) {
      continue
    }
    const body = await readFile(path.join(migrationsDir, file), 'utf8')
    await sql.withTransaction(async (tx) => {
      // 无参数多语句执行（migration 禁止带参数占位符）
      await tx.query(body)
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
    })
    newlyApplied.push(file)
  }
  return newlyApplied
}

/** 读取全部已应用的 migration（供状态查询） */
export async function listAppliedMigrations(
  sql: SqlExecutor,
): Promise<MigrationRecord[]> {
  const result = await sql.query<{ name: string; applied_at: Date }>(
    'SELECT name, applied_at FROM schema_migrations ORDER BY applied_at',
  )
  return result.rows.map((r) => ({ name: r.name, appliedAt: r.applied_at }))
}
