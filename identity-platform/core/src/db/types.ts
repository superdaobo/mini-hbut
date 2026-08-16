/**
 * 数据库访问抽象层（#619）。
 *
 * 统一暴露一个最小 SQL 执行接口 `SqlExecutor`：
 * - 生产环境：pg.Pool（Neon PostgreSQL，IDENTITY_DATABASE_URL）
 * - 测试环境：pg-mem（内存 Postgres 模拟，跑同一份真 SQL）
 *   或通过 TEST_DATABASE_URL 指向真实 PostgreSQL（同套测试代码切换）
 *
 * 业务代码只依赖本接口，不直接 import pg，保证两种环境行为一致。
 */
import type pg from 'pg'

export interface QueryResultRow {
  [column: string]: unknown
}

/** 最小 SQL 执行接口（rows 与 rowCount 对齐 pg 驱动返回形态） */
export interface SqlExecutor {
  query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>
  /** 事务：回调内所有查询在同一事务中，抛错自动回滚 */
  withTransaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>
}

/** pg 驱动实现的 executor（生产 / TEST_DATABASE_URL 真 PG 测试） */
export function createPgExecutor(pool: pg.Pool): SqlExecutor {
  return {
    async query<T extends QueryResultRow>(text: string, values?: readonly unknown[]) {
      return pool.query<T>(text, values as unknown[])
    },
    async withTransaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const tx: SqlExecutor = {
          async query<T2 extends QueryResultRow>(text: string, values?: readonly unknown[]) {
            return client.query<T2>(text, values as unknown[])
          },
          async withTransaction<T2>(inner: (t: SqlExecutor) => Promise<T2>): Promise<T2> {
            // 嵌套事务：直接复用当前连接（PG 无嵌套事务，避免死锁）
            return inner(tx)
          },
        }
        const result = await fn(tx)
        await client.query('COMMIT')
        return result
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    },
  }
}

/** pg-mem 实现的 executor（本地无 PostgreSQL 时的真 SQL 测试环境） */
export function createPgMemExecutor(db: {
  adapters: { createPg(): { Pool: new () => pg.Pool } }
}): SqlExecutor {
  const Pool = db.adapters.createPg().Pool
  const pool = new Pool()
  return {
    async query<T extends QueryResultRow>(text: string, values?: readonly unknown[]) {
      return pool.query<T>(text, values as unknown[])
    },
    async withTransaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      await pool.query('BEGIN')
      try {
        const result = await fn(this)
        await pool.query('COMMIT')
        return result
      } catch (err) {
        await pool.query('ROLLBACK')
        throw err
      }
    },
  }
}

/** JSONB 列的读取：两种驱动返回形态（对象 或 字符串）统一成对象 */
export function parseJsonb<T>(value: unknown): T {
  if (typeof value === 'string') {
    return JSON.parse(value) as T
  }
  return value as T
}
