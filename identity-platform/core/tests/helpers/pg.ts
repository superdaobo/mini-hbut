/**
 * 测试 DB 基础设施（#619）。
 *
 * 环境优先级：
 * 1. 设置了 TEST_DATABASE_URL → 连接真实 PostgreSQL（随机 schema 隔离，跑同一份 SQL）；
 * 2. 未设置 → pg-mem（内存 Postgres 模拟，执行同一份 migration 真 SQL）。
 *
 * 两个后端跑同一套测试代码与 SQL，保证行为一致；
 * 并发/锁语义在 pg-mem 下为顺序执行，真 PG 下为真实并发（条件更新保证幂等）。
 */
import { newDb, DataType } from 'pg-mem'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { createPgExecutor, createPgMemExecutor, type SqlExecutor } from '../../src/db/types.js'
import { runMigrations } from '../../src/db/migrate.js'

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations',
)

/**
 * pg-mem 缺失函数的 polyfill（DDL 保持标准 PostgreSQL 写法，
 * 只在内存模拟层补齐，真 PG 不需要）。
 */
function registerPgMemPolyfills(db: ReturnType<typeof newDb>): void {
  db.public.registerFunction({
    name: 'char_length',
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (value: string) => value.length,
  })
  db.public.registerFunction({
    name: 'length',
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (value: string) => value.length,
  })
  db.public.registerFunction({
    name: 'octet_length',
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (value: string) => Buffer.byteLength(value, 'utf8'),
  })
  // 审核 TOCTOU 使用 PostgreSQL date_trunc('milliseconds', timestamptz)。
  // pg-mem 未内建该函数；JS Date 本身只有毫秒精度，因此测试层按同一语义返回新 Date。
  db.public.registerFunction({
    name: 'date_trunc',
    args: [DataType.text, DataType.timestamptz],
    returns: DataType.timestamptz,
    implementation: (precision: string, value: Date) => {
      if (precision !== 'milliseconds') {
        throw new Error(`pg-mem date_trunc polyfill 仅支持 milliseconds，收到 ${precision}`)
      }
      return new Date(value.getTime())
    },
  })
}

export interface TestDatabase {
  sql: SqlExecutor
  backend: 'pg-mem' | 'postgres'
  cleanup(): Promise<void>
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const dsn = process.env.TEST_DATABASE_URL
  if (dsn && dsn.trim() !== '') {
    // 真 PG：每个测试实例一个随机 schema，DROP 清理
    const schema = `test_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    const pool = new pg.Pool({
      connectionString: dsn,
      options: `-c search_path=${schema}`,
      max: 4,
    })
    const sql = createPgExecutor(pool)
    await sql.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
    await runMigrations(sql, MIGRATIONS_DIR)
    return {
      sql,
      backend: 'postgres',
      async cleanup() {
        try {
          await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        } finally {
          await pool.end()
        }
      },
    }
  }

  // pg-mem：每实例独立内存库
  const db = newDb()
  registerPgMemPolyfills(db)
  const sql = createPgMemExecutor(db)
  await runMigrations(sql, MIGRATIONS_DIR)
  return {
    sql,
    backend: 'pg-mem',
    async cleanup() {
      // 内存库随 GC 释放，无外部资源
    },
  }
}
