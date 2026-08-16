/**
 * PostgreSQL 客户端工厂（骨架占位）。
 * 本 Issue 不实现 schema；只提供连接池构造与关闭，供 /readyz 做连通性探测。
 * 后续 #619 Data 子 Issue 将在此之上实现类型安全 migration 与仓储层。
 */
import pg from 'pg'

/** 创建 pg 连接池；未配置 IDENTITY_DATABASE_URL 时返回 null（readyz 将报未就绪） */
export function createPool(databaseUrl: string | undefined): pg.Pool | null {
  if (!databaseUrl || databaseUrl.trim() === '') {
    return null
  }
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
    // Serverless + Neon 冷启动（compute 休眠唤醒）需要更长建连时间：
    // 3s 在 scale-to-zero 场景经常超时（readyz/首个请求报连接超时），放宽到 15s。
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
  })
}

/** 优雅关闭连接池（本地进程退出时调用） */
export async function closePool(pool: pg.Pool | null): Promise<void> {
  if (pool) {
    await pool.end()
  }
}
