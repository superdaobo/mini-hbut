/**
 * migration CLI（#619）。
 *
 * 用法：
 *   pnpm migrate:up        # 应用全部未执行的 migrations（显式、非 cold start）
 *   pnpm migrate:rollback  # 执行 rollback 脚本（Preview/开发环境人工确认后使用）
 *
 * 连接串来自环境变量 IDENTITY_DATABASE_URL（不写进任何文件）。
 * 生产环境 destructive 操作必须按 AgentDock 风险确认流程单独确认。
 */
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { runMigrations } from '../db/migrate.js'
import { createPgExecutor } from '../db/types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations')

async function main(): Promise<void> {
  const databaseUrl = process.env.IDENTITY_DATABASE_URL
  const action = process.argv[2] ?? 'up'
  if (!databaseUrl) {
    console.error('[migrate] IDENTITY_DATABASE_URL 未配置，退出（fail closed）')
    process.exit(1)
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 })
  try {
    const sql = createPgExecutor(pool)
    if (action === 'up') {
      const applied = await runMigrations(sql, MIGRATIONS_DIR)
      if (applied.length === 0) {
        console.log('[migrate] 无待应用 migration，数据库已是最新')
      } else {
        console.log(`[migrate] 已应用：${applied.join(', ')}`)
      }
    } else if (action === 'rollback') {
      console.warn('[migrate] ⚠️ 危险操作：执行 rollback_0001.sql 将删除全部业务表')
      const body = await readFile(path.join(MIGRATIONS_DIR, 'rollback_0001.sql'), 'utf8')
      await sql.withTransaction(async (tx) => {
        await tx.query(body)
      })
      console.log('[migrate] rollback 完成')
    } else {
      console.error(`[migrate] 未知动作：${action}（支持 up / rollback）`)
      process.exit(2)
    }
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[migrate] 失败：', err instanceof Error ? err.message : err)
  process.exit(1)
})
