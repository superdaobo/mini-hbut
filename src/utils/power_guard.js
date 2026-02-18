import { getRuntime, platformBridge } from '../platform'

const isDesktopTauri = () => getRuntime() === 'tauri'

async function tryKeepScreenOn(enable) {
  return platformBridge.keepScreenOn(enable)
}

export async function enableBackgroundPowerLock() {
  if (getRuntime() === 'web') {
    return { enabled: false, source: [] };
  }

  const source = [];
  if (await tryKeepScreenOn(true)) {
    source.push(isDesktopTauri() ? 'tauri-keep-screen-on' : 'capacitor-wakelock')
  }

  return {
    enabled: source.length > 0,
    source,
  };
}

export async function disableBackgroundPowerLock() {
  if (getRuntime() === 'web') {
    return { disabled: false, source: [] };
  }

  const source = [];
  if (await tryKeepScreenOn(false)) {
    source.push(isDesktopTauri() ? 'tauri-keep-screen-on' : 'capacitor-wakelock')
  }

  return {
    disabled: source.length > 0,
    source,
  };
}
