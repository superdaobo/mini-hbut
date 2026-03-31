const REPO = 'superdaobo/mini-hbut';
const PROXY_PREFIX = 'https://gh-proxy.com/';
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;

function toProxy(url) {
  return url.startsWith(PROXY_PREFIX) ? url : `${PROXY_PREFIX}${url}`;
}

function normalizeVersion(tag) {
  return String(tag || '').replace(/^v/i, '').trim();
}

function fallbackLinks(version) {
  const base = `https://github.com/${REPO}/releases/download/v${version}`;
  return {
    windowsExe: toProxy(`${base}/Mini-HBUT_${version}_x64-setup.exe`),
    windowsMsi: toProxy(`${base}/Mini-HBUT_${version}_x64_en-US.msi`),
    macDmg: toProxy(`${base}/Mini-HBUT_${version}_universal.dmg`),
    androidApk: toProxy(`${base}/Mini-HBUT_${version}_arm64.apk`),
    iosIpa: toProxy(`${base}/Mini-HBUT_${version}_iOS.ipa`),
    linuxAppImage: toProxy(`${base}/Mini-HBUT_${version}_amd64.AppImage`),
    linuxDeb: toProxy(`${base}/Mini-HBUT_${version}_amd64.deb`),
  };
}

function applyAsset(links, asset) {
  const name = String(asset?.name || '').toLowerCase();
  const url = toProxy(String(asset?.browser_download_url || ''));
  if (!name || !url) return;

  if (/^mini-hbut_.*_x64-setup\.exe$/.test(name)) links.windowsExe = url;
  else if (/^mini-hbut_.*_x64_.*\.msi$/.test(name)) links.windowsMsi = url;
  else if (/^mini-hbut_.*_universal\.dmg$/.test(name)) links.macDmg = url;
  else if (/^mini-hbut_.*_arm64\.apk$/.test(name)) links.androidApk = url;
  else if (/^mini-hbut_.*_ios\.ipa$/.test(name)) links.iosIpa = url;
  else if (/^mini-hbut_.*_amd64\.appimage$/.test(name)) links.linuxAppImage = url;
  else if (/^mini-hbut_.*_amd64\.deb$/.test(name)) links.linuxDeb = url;
}

async function fetchLatest() {
  const endpoints = [toProxy(LATEST_API), LATEST_API];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(endpoint, { headers: { Accept: 'application/vnd.github+json' } });
      if (!resp.ok) throw new Error(`${endpoint} => ${resp.status}`);
      return await resp.json();
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('failed to fetch latest release');
}

async function testUrl(name, url) {
  try {
    let resp = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    if (resp.status === 405 || resp.status === 501) {
      resp = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        headers: { Range: 'bytes=0-0' },
      });
    }

    return { name, ok: resp.status >= 200 && resp.status < 400, status: resp.status, url };
  } catch (e) {
    return { name, ok: false, status: -1, url, error: String(e) };
  }
}

async function main() {
  const release = await fetchLatest();
  const version = normalizeVersion(release?.tag_name);
  if (!version) throw new Error('missing latest release tag_name');

  const links = fallbackLinks(version);
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  for (const asset of assets) applyAsset(links, asset);

  const keys = [
    'windowsExe',
    'windowsMsi',
    'macDmg',
    'androidApk',
    'iosIpa',
    'linuxAppImage',
    'linuxDeb',
  ];

  const missing = keys.filter((key) => !links[key]);
  if (missing.length) {
    throw new Error(`missing links: ${missing.join(', ')}`);
  }

  const results = [];
  for (const key of keys) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await testUrl(key, links[key]));
  }

  console.log(`latest version: ${version}`);
  console.table(results.map((item) => ({ name: item.name, ok: item.ok, status: item.status })));

  const failed = results.filter((item) => !item.ok);
  if (failed.length) {
    for (const item of failed) {
      console.error(`${item.name} => ${item.status} ${item.url}`);
      if (item.error) console.error(item.error);
    }
    process.exit(1);
  }

  console.log('all runtime release links are reachable');
}

main().catch((err) => {
  console.error('test-release-links failed:', err);
  process.exit(1);
});
