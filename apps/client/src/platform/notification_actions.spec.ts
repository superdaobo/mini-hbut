import { describe, expect, it } from 'vitest'
import { resolveNotificationActionTarget } from './notification_actions'

describe('resolveNotificationActionTarget', () => {
  it('routes plain notification taps to the notification center by default', () => {
    expect(resolveNotificationActionTarget({})).toEqual({ view: 'notifications' })
  })

  it('reads Capacitor LocalNotifications extra data', () => {
    expect(
      resolveNotificationActionTarget({
        notification: {
          extra: {
            view: 'exams'
          }
        }
      })
    ).toEqual({ view: 'exams' })
  })

  it('rejects unknown or unsafe targets', () => {
    expect(
      resolveNotificationActionTarget({
        notification: {
          extra: {
            view: 'https://example.com'
          }
        }
      })
    ).toEqual({ view: 'notifications' })
  })
})
