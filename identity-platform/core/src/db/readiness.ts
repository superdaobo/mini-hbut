/**
 * /readyz 连通性探测。
 *
 * 安全要求：
 * - 探测失败/未配置时只返回通用原因码，绝不泄露连接串、schema、账号；
 * - 超时上限 3 秒，避免函数冷启动被拖死；
 * - 骨架阶段未配置 DB 属于“未就绪”，返回 503（fail closed）。
 */
import type pg from 'pg'

export type ReadinessResult =
  | { ready: true }
  | { ready: false; reason: 'DATABASE_URL_NOT_SET' | 'DB_UNREACHABLE' }

const PROBE_TIMEOUT_MS = 3000

export async function probeReadiness(pool: pg.Pool | null): Promise<ReadinessResult> {
  if (!pool) {
    return { ready: false, reason: 'DATABASE_URL_NOT_SET' }
  }
  try {
    // SELECT 1 是最轻量的连通性探测，不触碰任何业务表
    await Promise.race([
      pool.query<{ '?column?': number }>('SELECT 1'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('db probe timeout')), PROBE_TIMEOUT_MS),
      ),
    ])
    return { ready: true }
  } catch {
    return { ready: false, reason: 'DB_UNREACHABLE' }
  }
}
