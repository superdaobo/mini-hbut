import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const readText = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

describe('grade teacher async enrichment contract', () => {
  it('keeps the Tauri handler thin and delegates synchronization to the shared GradeService', () => {
    const source = readText('src-tauri/src/lib.rs')
    const serviceSource = readText('src-tauri/src/grade/service.rs')
    const syncStart = source.indexOf('async fn sync_grades(')
    const syncEnd = source.indexOf('async fn get_grade_teacher_cache', syncStart)
    const syncBlock = syncStart >= 0 && syncEnd > syncStart ? source.slice(syncStart, syncEnd) : ''

    expect(syncBlock).toContain('grade::service::GradeService::new')
    expect(syncBlock).toContain('service.sync_grades(uid.as_deref(), current_only).await?')
    expect(syncBlock).toContain('service.spawn_enrichment(job)')
    expect(syncBlock).not.toContain('fetch_grades_with_teachers().await')

    expect(serviceSource).toContain('match self.source.fetch_grades().await')
    expect(serviceSource).toContain('merge_cached_grade_teachers')
    expect(serviceSource).toContain('"teacher_enrichment_pending": true')
    expect(serviceSource).toContain('pub fn spawn_enrichment')
  })

  it('limits manual refresh teacher enrichment to the current semester and exposes cached teachers to the frontend', () => {
    const source = readText('src-tauri/src/lib.rs')
    const serviceSource = readText('src-tauri/src/grade/service.rs')
    const appSource = readText('src/App.vue')
    const adapterSource = readText('src/utils/axios_adapter.js')

    expect(source).toContain('async fn get_grade_teacher_cache')
    expect(source).toContain('async fn sync_grade_teachers_current_semester')
    expect(source).toContain('grade::domain::current_grade_semester(&grades)')
    expect(source).toContain('.fetch_course_teachers(&semester)')
    expect(source).toContain('service.save_teacher_cache(&uid, &semester, courses)')
    expect(source).toContain('grade::service::merge_teacher_cache_into_payload')
    expect(source).toContain('get_grade_teacher_cache,')
    expect(source).toContain('sync_grade_teachers_current_semester,')
    expect(serviceSource).toContain('pub fn read_teacher_cache')
    expect(serviceSource).toContain('pub fn save_teacher_cache')
    expect(appSource).toContain('mergeGradeTeacherCache')
    expect(appSource).toContain("invoke('sync_grade_teachers_current_semester')")
    expect(appSource).toContain("invoke('get_grade_teacher_cache')")
    expect(appSource).toContain('void refreshGradeTeacherCache({ currentOnly: true })')
    expect(adapterSource).toContain("if (url.includes('/v2/grade_teacher_cache'))")
  })

  it('keeps manual refresh teacher enrichment scoped to the current semester', () => {
    const source = readText('src-tauri/src/lib.rs')
    const serviceSource = readText('src-tauri/src/grade/service.rs')
    const appSource = readText('src/App.vue')
    const adapterSource = readText('src/utils/axios_adapter.js')

    expect(source).toContain('current_only.unwrap_or(false)')
    expect(serviceSource).toContain('let enrichment = if !current_only')
    expect(appSource).toContain('fetchGradesFromAPI(studentId.value, { force: true, teacherCurrentOnly: true })')
    expect(adapterSource).toContain('currentOnly: !!data?.teacher_current_only')
  })
})
