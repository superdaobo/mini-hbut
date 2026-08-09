import type { AppRuntime, UpdateCoordinator } from '../contracts/runtime'
import {
  checkAppleStoreUpdate,
  getSkippedAppleStoreVersion,
  openAppStoreUpdatePage
} from '../../utils/apple_app_update'
import { checkForUpdates, getCurrentVersion } from '../../utils/updater.js'
import { allowsInAppGithubUpdater } from '../../config/app_store_policy'
import { openExternal } from '../../utils/external_link'
import { isTestAccountSession } from '../../utils/test_account.js'
import { isWebsiteDemoBuild } from '../../utils/website_demo_boot.js'

export const createUpdateCoordinator = (runtime: AppRuntime): UpdateCoordinator => {
  const { state } = runtime

  const handleCheckUpdate = () => {
    state.showUpdateDialog.value = true
  }

  const autoCheckUpdate = async () => {
    if (isWebsiteDemoBuild() || isTestAccountSession()) return
    try {
      const currentVersion = await getCurrentVersion()
      if (!allowsInAppGithubUpdater()) {
        const result = await checkAppleStoreUpdate(currentVersion)
        const skipped = getSkippedAppleStoreVersion()
        if (result?.hasUpdate && result.storeVersion && result.storeVersion !== skipped) {
          state.showUpdateDialog.value = true
        }
        return
      }
      const { getUpdateChannel, getSkippedVersion } = await import('../../utils/updater.js')
      const channel = getUpdateChannel()
      const result = await checkForUpdates(currentVersion, { channel })
      if (result?.hasUpdate && result.latestVersion !== getSkippedVersion(channel)) {
        state.showUpdateDialog.value = true
      }
    } catch (error) {
      console.warn('[Update] 自动检查更新失败:', error)
    }
  }

  const handleForceUpdate = async () => {
    if (!allowsInAppGithubUpdater()) {
      const opened = await openAppStoreUpdatePage({
        trackViewUrl: state.forceUpdateInfo.value?.store_url as string | undefined,
        trackId: state.forceUpdateInfo.value?.apple_app_id as string | undefined
      })
      if (!opened && state.forceUpdateResolvedUrl.value) {
        await openExternal(state.forceUpdateResolvedUrl.value)
      }
      return
    }
    if (state.forceUpdateResolvedUrl.value) {
      await openExternal(state.forceUpdateResolvedUrl.value)
      return
    }
    state.showUpdateDialog.value = true
  }

  return { autoCheckUpdate, handleCheckUpdate, handleForceUpdate }
}
