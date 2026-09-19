import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourcePath = (path: string) => resolve(process.cwd(), path)
const readSource = (path: string) => {
  const resolved = sourcePath(path)
  return existsSync(resolved) ? readFileSync(resolved, 'utf8') : ''
}

const extractFunction = (source: string, name: string) => {
  const start = source.indexOf(`const ${name} =`)
  if (start < 0) return ''
  const next = source.indexOf('\nconst ', start + 1)
  const exportNext = source.indexOf('\nexport ', start + 1)
  const candidates = [next, exportNext].filter((idx) => idx > start)
  const end = candidates.length ? Math.min(...candidates) : source.length
  return source.slice(start, end)
}

const expectSourceContains = (source: string, needle: string, label: string) => {
  expect(source.includes(needle), label).toBe(true)
}

const expectSourceMatches = (source: string, pattern: RegExp, label: string) => {
  expect(pattern.test(source), label).toBe(true)
}

describe('cloud sync auto upload contract', () => {
  const source =
    readSource('src/utils/cloud_sync.ts') +
    '\n' +
    readSource('src/utils/cloud_sync_payload.ts') +
    '\n' +
    readSource('src/utils/cloud_sync_storage.ts') +
    '\n' +
    readSource('src/utils/cloud_sync_snapshot.ts')

  it('builds schema v5 payloads with explicit client version and runtime metadata', () => {
    expectSourceMatches(source, /const\s+SYNC_SCHEMA_VERSION\s*=\s*5\b/, 'schema version should be bumped to 5')
    expectSourceContains(source, "import { getCurrentVersion } from './updater'", 'current app version should be read from updater')
    expectSourceContains(source, "import { detectRuntime } from '../platform/runtime'", 'runtime should be detected through platform/runtime')
    expectSourceContains(source, 'const buildClientSnapshot', 'client snapshot builder should exist')
    expectSourceMatches(source, /payload\.client\s*=\s*clientSnapshot|client:\s*clientSnapshot/, 'payload should include client snapshot')
    expectSourceMatches(source, /version:\s*currentVersion|version:\s*await getCurrentVersion\(\)/, 'client snapshot should include version')
    expectSourceMatches(source, /platform:\s*clientPlatform|platform:\s*detectRuntime\(\)|runtime:\s*detectRuntime\(\)/, 'client snapshot should include platform/runtime')
    expectSourceMatches(source, /client_version:\s*(payload\.client\?\.version|clientSnapshot\.version|toSafeText\(payload\?\.client\?\.version\)|toSafeText\(asRecord\(payload\?\.client\)\.version\))/, 'upload body should expose top-level client_version')
  })

  it('uploads notification snapshots and exam arrangements as first-class payload sections', () => {
    expectSourceContains(source, 'NOTIFY_SNAPSHOT_EVENT', 'cloud sync should listen to notify snapshot updates')
    expectSourceContains(source, 'getLastNotifySnapshot', 'cloud sync should read notification snapshot')
    expectSourceContains(source, 'getNotificationMonitorSettings', 'cloud sync should upload notification settings')
    expectSourceContains(source, 'const buildNotifySnapshot', 'notification snapshot builder should exist')
    expectSourceMatches(source, /payload\.notify\s*=\s*notifySnapshot|notify:\s*notifySnapshot/, 'payload should include notify section')
    expectSourceContains(source, 'const buildExamSnapshot', 'exam snapshot builder should exist')
    expectSourceContains(source, 'exams:${sid}:current', 'exam snapshot should read current exam cache')
    expectSourceMatches(source, /academic\.exams\s*=\s*examSnapshot|exams:\s*examSnapshot/, 'academic payload should include exams')
  })

  it('backs up personal events as a first-class section and keeps explicit empty snapshots', () => {
    expectSourceContains(source, 'fetchAllPersonalEvents', 'personal events should be read for cloud backup')
    expectSourceMatches(source, /payload\.events\s*=\s*personalEvents/, 'payload should include events even when empty')
    expectSourceMatches(source, /events:\s*personalEvents/, 'auto-upload signature should include personal events')
    expectSourceContains(source, 'personal_events: includePersonalEvents === true', 'upload sections should advertise personal events')
  })

  it('backs up schedule visibility and preserves local state for legacy cloud payloads', () => {
    expectSourceContains(source, 'buildScheduleVisibilityCloudSnapshot', 'visibility snapshot should be uploaded')
    expectSourceMatches(source, /schedule_visibility:\s*buildScheduleVisibilityCloudSnapshot\(sid\)|payload\.schedule_visibility\s*=\s*buildScheduleVisibilityCloudSnapshot\(sid\)/, 'payload should include schedule visibility')
    expectSourceContains(source, "hasOwnProperty.call(data || {}, 'schedule_visibility')", 'missing visibility section must be detectable')
    expectSourceContains(source, 'reason=missing-schedule-visibility-section', 'legacy payload should preserve local visibility')
    expectSourceContains(source, 'replaceScheduleVisibilityFromCloud(sid, data.schedule_visibility)', 'explicit visibility section should replace local state')
  })

  it('preserves local events for legacy payloads and replaces only explicit event sections', () => {
    expectSourceContains(source, "hasOwnProperty.call(data || {}, 'events')", 'missing events section must be detectable')
    expectSourceContains(source, 'reason=missing-events-section', 'legacy payload should preserve local events')
    expectSourceContains(source, 'replacePersonalEvents(sid, data.events)', 'explicit events section should restore the snapshot')
    expectSourceContains(source, "detail?.reason === 'cloud-restore'", 'cloud restore signal must not trigger upload loop')
  })

  it('keeps stable course identifiers for grades, custom courses, and schedule courses', () => {
    const gradeBlock = extractFunction(source, 'normalizeGradeItem')
    const customCourseBlock = extractFunction(source, 'normalizeCloudCourse')
    const scheduleBlock = extractFunction(source, 'normalizeSchedulePayload')

    expectSourceMatches(gradeBlock, /course_id:\s*toSafeText\(/, 'grade payload should normalize course_id')
    expectSourceMatches(gradeBlock, /course_code:\s*toSafeText\(/, 'grade payload should keep course_code')
    expectSourceMatches(gradeBlock, /grade_id:\s*toSafeText\(/, 'grade payload should keep grade_id')
    expectSourceMatches(customCourseBlock, /course_id:\s*toSafeText\(/, 'custom course payload should keep course_id')
    expectSourceMatches(customCourseBlock, /source_id:\s*toSafeText\(/, 'custom course payload should keep source_id')
    expectSourceMatches(scheduleBlock, /course_id|source_id|raw_course_id/, 'schedule payload should preserve course identifiers')
  })

  it('does not upload direct personal identity or contact fields', () => {
    const personalInfoBlock = extractFunction(source, 'normalizePersonalInfoPayload')

    expectSourceMatches(personalInfoBlock, /student_id:\s*toSafeText\(/, 'student id should remain available for scoped restore')
    expect(personalInfoBlock.includes('id_number'), 'identity card number should not be uploaded').toBe(false)
    expect(personalInfoBlock.includes('idNumber'), 'camel-case identity card number should not be uploaded').toBe(false)
    expect(personalInfoBlock.includes('id_card'), 'legacy identity card number should not be uploaded').toBe(false)
    expect(personalInfoBlock.includes('phone'), 'phone number should not be uploaded').toBe(false)
    expect(personalInfoBlock.includes('email'), 'email address should not be uploaded').toBe(false)
  })

  it('detects local signature or version changes and reuses in-flight auto upload tasks', () => {
    expectSourceContains(source, 'CLOUD_SYNC_AUTO_UPLOAD_META_PREFIX', 'auto upload metadata key prefix should exist')
    expectSourceContains(source, 'buildAutoUploadSignature', 'auto upload signature builder should exist')
    expectSourceContains(source, 'lastUploadVersion', 'last successful upload version should be persisted')
    expectSourceContains(source, 'lastUploadSignature', 'last successful upload signature should be persisted')
    expectSourceContains(source, 'lastAutoResyncReason', 'recent auto resync reason should be persisted')
    expectSourceMatches(source, /window\.addEventListener\(\s*NOTIFY_SNAPSHOT_EVENT/, 'notify snapshot changes should trigger signature checks')
    expectSourceMatches(source, /reason:\s*'auto-version-change'|reason:\s*'auto-signature-change'|recentReason:\s*'version-change'/, 'version/signature changes should trigger immediate full upload')
    expectSourceMatches(source, /autoCloudSyncInFlight\.promise[\s\S]*return autoCloudSyncInFlight\.promise/, 'in-flight auto upload task should be reused')
  })
})
