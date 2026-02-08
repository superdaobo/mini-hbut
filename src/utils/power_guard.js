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

async function tryNoSleepBlock(enable) {
  try {
    const mod = await import('tauri-plugin-nosleep-api');
    if (enable) {
      if (typeof mod.block === 'function') {
        // Prefer display sleep prevention; fallback to first enum value.
        const mode = mod.NoSleepType?.PreventUserIdleDisplaySleep
          ?? mod.NoSleepType?.PreventUserIdleSystemSleep
          ?? Object.values(mod.NoSleepType || {})[0];
        if (mode !== undefined) {
          await mod.block(mode);
        } else {
          await mod.block();
        }
        return true;
      }
    } else if (typeof mod.unblock === 'function') {
      await mod.unblock();
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
  if (await tryNoSleepBlock(true)) source.push('nosleep');

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
  if (await tryNoSleepBlock(false)) source.push('nosleep');

  return {
    disabled: source.length > 0,
    source,
  };
}