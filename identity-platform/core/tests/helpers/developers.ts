/**
 * developers 表测试插入（fixture 用）。
 */
import type { SqlExecutor } from '../../src/db/types.js'

export async function insertDeveloper(sql: SqlExecutor, developer: {
  id: string
  userId: string
  displayName: string
  contactEmail?: string
}): Promise<void> {
  await sql.query(
    `INSERT INTO developers (id, user_id, display_name, contact_email)
     VALUES ($1, $2, $3, $4)`,
    [developer.id, developer.userId, developer.displayName, developer.contactEmail ?? null],
  )
}
