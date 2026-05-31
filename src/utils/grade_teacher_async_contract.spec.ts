import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const readText = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

describe('grade teacher async enrichment contract', () => {
  it('returns grades immediately and starts teacher enrichment in the background', () => {
    const source = readText('src-tauri/src/lib.rs')
    const syncStart = source.indexOf('async fn sync_grades(')
    const syncEnd = source.indexOf('async fn get_grades_local', syncStart)
    const syncBlock = syncStart >= 0 && syncEnd > syncStart ? source.slice(syncStart, syncEnd) : ''

    expect(syncBlock).toContain('client.fetch_grades().await')
    expect(syncBlock).not.toContain('fetch_grades_with_teachers().await')
    expect(syncBlock).toContain('merge_cached_grade_teachers')
    expect(syncBlock).toContain('spawn_grade_teacher_enrichment')
    expect(syncBlock).toContain('"teacher_enrichment_pending": true')
  })

  it('limits manual refresh teacher enrichment to the current semester and exposes cached teachers to the frontend', () => {
    const source = readText('src-tauri/src/lib.rs')
    const appSource = readText('src/App.vue')
    const adapterSource = readText('src/utils/axios_adapter.js')

    expect(source).toContain('async fn get_grade_teacher_cache')
    expect(source).toContain('sync_grade_teachers_current_semester')
    expect(source).toContain('resolve_current_grade_semester')
    expect(source).toContain('save_grade_teacher_cache')
    expect(source).toContain('merge_grade_teacher_cache_into_payload')
    expect(source).toContain('get_grade_teacher_cache,')
    expect(source).toContain('sync_grade_teachers_current_semester,')
    expect(appSource).toContain('mergeGradeTeacherCache')
    expect(appSource).toContain("invoke('sync_grade_teachers_current_semester')")
    expect(appSource).toContain("invoke('get_grade_teacher_cache')")
    expect(appSource).toContain('void refreshGradeTeacherCache({ currentOnly: true })')
    expect(adapterSource).toContain("if (url.includes('/v2/grade_teacher_cache'))")
  })

  it('keeps manual refresh teacher enrichment scoped to the current semester', () => {
    const source = readText('src-tauri/src/lib.rs')
    const appSource = readText('src/App.vue')
    const adapterSource = readText('src/utils/axios_adapter.js')

    expect(source).toContain('current_only.unwrap_or(false)')
    expect(source).toContain('if !current_only')
    expect(appSource).toContain('fetchGradesFromAPI(studentId.value, { force: true, teacherCurrentOnly: true })')
    expect(adapterSource).toContain('currentOnly: !!data?.teacher_current_only')
  })
})
