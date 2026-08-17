import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const readText = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

describe('exam realtime refresh contract', () => {
  it('loads exams with remote-first semantics instead of immediately showing stale offline cache', () => {
    const source = readText('src/components/ExamView.vue')
    const fetchExamsBlock = source.match(/const fetchExams = async \(options = \{\}\) => \{[\s\S]*?const handleSemesterChange/s)?.[0] || ''

    expect(fetchExamsBlock).toContain('offline.value = false')
    expect(fetchExamsBlock).toContain('syncTime.value = \'\'')
    expect(fetchExamsBlock).toContain('const staleApplied = applyStaleExamSnapshot(cacheKey)')
    expect(fetchExamsBlock).toContain('if (!staleApplied || !options.keepOfflineBanner)')
    expect(fetchExamsBlock).toContain('forceRemote: true')
    expect(fetchExamsBlock).not.toContain('staleWhileRevalidate: true')
  })

  it('refreshes the selected semester immediately when the user changes semesters', () => {
    const source = readText('src/components/ExamView.vue')

    expect(source).toContain('const handleSemesterChange = () => {')
    expect(source).toContain('fetchExams()')
    expect(source).toContain('loading.value = exams.value.length === 0')
    expect(source).toContain('refreshing.value = true')
  })

  it('keeps the refresh action spinning while cached exam data is being replaced by realtime data', () => {
    const source = readText('src/components/ExamView.vue')

    expect(source).toContain('const refreshing = ref(false)')
    expect(source).toContain('const displayedExamCacheKey = ref(\'\')')
    expect(source).toContain('const isInitialLoading = computed(() => loading.value && exams.value.length === 0)')
    expect(source).toContain('const resolveExamSyncTime = (data) =>')
    expect(source).toContain('const applyStaleExamSnapshot = (cacheKey) =>')
    expect(source).toContain('getStaleCachedData(cacheKey)')
    expect(source).toContain('displayedExamCacheKey.value = cacheKey')
    expect(source).toContain('exams.value = []')
    expect(source).toContain('refreshing.value = true')
    expect(source).toContain('refreshing.value = false')
    expect(source).toContain('class="exam-refresh-btn"')
    expect(source).toContain(':class="{ spinning: refreshing || loading || offline }"')
    expect(source).toContain('@click="fetchExams"')
    expect(source).not.toContain(':disabled="loading"')
    expect(source).toContain('v-if="isInitialLoading"')
    expect(source).toContain('class="exam-updated-at"')
    expect(source).toContain('最新更新时间')
    expect(source).toContain('EXAM_CACHE_REFRESH_RETRY_MS')
    expect(source).toContain('scheduleExamRealtimeRetry')
  })

  it('retries after semesters resolve when the first exam request used the current-semester placeholder', () => {
    const source = readText('src/components/ExamView.vue')

    expect(source).toContain('const previousSemester = selectedSemester.value')
    expect(source).toContain('const shouldRefetchResolvedSemester = !previousSemester && selectedSemester.value')
    expect(source).toContain('if (shouldRefetchResolvedSemester) {')
    expect(source).toContain('fetchExams({ keepOfflineBanner: true })')
  })
})
