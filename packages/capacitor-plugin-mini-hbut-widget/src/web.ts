import { WebPlugin } from '@capacitor/core'
import type { MiniHbutWidgetPlugin, WidgetCapabilities } from './definitions'

/**
 * Web 平台兜底实现 — 所有方法 reject UNAVAILABLE。
 * 完整实现见 Task 4.2。
 */
export class MiniHbutWidgetWeb extends WebPlugin implements MiniHbutWidgetPlugin {
  async writeSnapshot(): Promise<void> {
    throw this.unavailable('writeSnapshot is not available on web')
  }

  async clearSnapshot(): Promise<void> {
    throw this.unavailable('clearSnapshot is not available on web')
  }

  async requestRefresh(): Promise<void> {
    throw this.unavailable('requestRefresh is not available on web')
  }

  async getCapabilities(): Promise<WidgetCapabilities> {
    return { platform: 'unavailable', pinned: false }
  }
}
