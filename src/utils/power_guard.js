const isTauri = () => typeof window !== 'undefined' && '__TAURI__' in window;

async function tryKeepScreenOn(enable) {
  try {
    const mod = await import('tauri-plugin-keep-screen-on-api');
    if (typeof mod.keepScreenOn === 'function') {
      await mod.keepScreenOn(enable);
      return true;
    }
  } catch (_) {
    // plugin may be unavailable on current platform/build
  }
  return false;
}

export async function enableBackgroundPowerLock() {
  if (!isTauri()) {
    return { enabled: false, source: [] };
  }

  const source = [];
  if (await tryKeepScreenOn(true)) source.push('keep-screen-on');

  return {
    enabled: source.length > 0,
    source,
  };
}

export async function disableBackgroundPowerLock() {
  if (!isTauri()) {
    return { disabled: false, source: [] };
  }

  const source = [];
  if (await tryKeepScreenOn(false)) source.push('keep-screen-on');

  return {
    disabled: source.length > 0,
    source,
  };
}
