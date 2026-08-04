import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8')
const exists = (relativePath: string) =>
  fs.existsSync(path.join(root, relativePath))

const lib = read('src-tauri/src/lib.rs')
const httpServer = read('src-tauri/src/http_server.rs')
const ics = read('src-tauri/src/utils/ics.rs')
const utilsMod = read('src-tauri/src/utils/mod.rs')
const runtime = read('src/platform/runtime.ts')
const capacitor = read('src/platform/adapters/capacitor.ts')
const app = read('src/App.vue')
const schedule = read('src/components/ScheduleView.vue')
const utilsReadme = read('src/utils/README.md')

const ICS_FNS = ['sanitize_filename_part', 'escape_ics_text', 'fold_ics_line', 'parse_ics_datetime']

/** 提取 async fn <name>(...) 到下一个顶层 async fn 之前的 handler 体 */
const extractHandler = (src: string, name: string) => {
  const start = src.indexOf(`async fn ${name}(`)
  if (start < 0) return null
  const rest = src.slice(start)
  const next = rest.search(/\nasync fn /)
  return next < 0 ? rest : rest.slice(0, next)
}

describe('Phase 3 architecture convergence', () => {
  it('keeps api.ts as the typed cache entry and server_api.ts as the HTTP client entry', () => {
    expect(exists('src/utils/api.ts')).toBe(true)
    expect(exists('src/utils/server_api.ts')).toBe(true)
    expect(exists('src/utils/api.js')).toBe(false)
    expect(utilsReadme).toContain('api.ts')
    expect(utilsReadme).toContain('server_api.ts')
  })

  it('routes grade sync through grade::service::GradeService in both transports', () => {
    for (const src of [lib, httpServer]) {
      const handler = extractHandler(src, 'sync_grades')
      expect(handler, 'sync_grades handler 必须存在').not.toBeNull()
      expect(handler!).toContain('GradeService::new')
      expect(handler!).toContain('.sync_grades(')
    }
    expect(httpServer).toContain('crate::grade::service::GradeService::new')
    expect(lib).toContain('grade::service::GradeService::new')
    const httpHandler = extractHandler(httpServer, 'sync_grades')!
    expect(httpHandler).toContain('payload: Option<Json<SyncGradesRequest>>')
    expect(httpHandler).toContain('req.current_only.or(req.teacher_current_only)')
    expect(httpHandler).toMatch(/\.sync_grades\(uid\.as_deref\(\),\s*current_only\)/)
    expect(httpHandler).not.toMatch(/\.sync_grades\(uid\.as_deref\(\),\s*false\)/)
    expect(exists('src-tauri/src/modules/grades.rs')).toBe(false)
  })

  it('defines the four ICS helpers only in utils/ics.rs and reuses them via import', () => {
    expect(utilsMod).toContain('pub mod ics;')
    for (const fn of ICS_FNS) {
      expect(ics).toContain(`pub fn ${fn}(`)
      expect(lib).not.toMatch(new RegExp(`fn ${fn}\\b`))
      expect(httpServer).not.toMatch(new RegExp(`fn ${fn}\\b`))
    }
    expect(lib).toContain('use utils::ics::')
    expect(httpServer).toContain('use crate::utils::ics::')
  })

  it('keeps src/platform/runtime.ts the single source of UA platform detection', () => {
    for (const fn of ['isIOSLike', 'isAndroidLike', 'isDesktopLike', 'isMobileLike']) {
      expect(runtime).toContain(`export const ${fn}`)
    }
    // capacitor.ts 收敛：不再内联 iPhone|iPad|iPod UA 正则
    expect(capacitor).toContain("import { isIOSLike } from '../runtime'")
    expect(capacitor).not.toMatch(/\/iPhone\|iPad\|iPod\/i/)
    // App.vue 不再维护本地第二套 UA 正则
    expect(app).not.toMatch(/iPad\|iPhone\|iPod/)
    expect(app).not.toMatch(/navigator\.userAgent.*Android/)
    // 业务特定 Mobile/HarmonyOS 兜底允许保留（非品牌直接判断）
    expect(schedule).toMatch(/Mobile\|HarmonyOS/)
  })
})
