import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useScheduleSync } from './useScheduleSync'

const makeHarness = () => {
  const onPersonalEventsChanged = vi.fn(async () => {})
  const data = {
    applyCachedScheduleImmediately: vi.fn(() => true),
    loadCustomCourses: vi.fn(async () => {}),
    fetchSchedule: vi.fn(async () => {}),
    persistScheduleRenderSnapshot: vi.fn()
  }
  const sync = useScheduleSync({
    props: { studentId: '2510231000' },
    data,
    semester: {
      semester: ref('2026-2027-1'),
      semesterDraft: ref('2026-2027-1')
    },
    editor: {
      hasValidLoginSession: () => true,
      promptLoginRequired: vi.fn()
    },
    confirmDialog: {
      askConfirm: vi.fn(async () => true)
    },
    onPersonalEventsChanged
  } as never)
  return { sync, data, onPersonalEventsChanged }
}

describe('useScheduleSync personal-events refresh (#851)', () => {
  it('云下载实际应用个人日程快照后刷新当前周 Event Grid', async () => {
    const { sync, onPersonalEventsChanged } = makeHarness()

    await sync.refreshScheduleAfterCloudDownload({
      personalEventsApplied: { applied: true, replaced: 2 }
    })

    expect(onPersonalEventsChanged).toHaveBeenCalledTimes(1)
  })

  it('旧云 payload 缺 events section 时不做无意义 Event Grid 刷新', async () => {
    const { sync, onPersonalEventsChanged } = makeHarness()

    await sync.refreshScheduleAfterCloudDownload({
      personalEventsApplied: { applied: false, replaced: 0 }
    })

    expect(onPersonalEventsChanged).not.toHaveBeenCalled()
  })
})
