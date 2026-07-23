import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Monitor,
  Apple,
  Smartphone,
  Download,
  Check,
  AlertCircle,
  Server,
  RefreshCw,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  APP_STORE_LINKS,
  DOWNLOAD_ANDROID_ANCHOR,
  DOWNLOAD_IOS_ANCHOR,
  resolveAppStoreOpenUrl,
} from '@/data/home-content';

gsap.registerPlugin(ScrollTrigger);

interface Platform {
  name: string;
  icon: typeof Monitor;
  formats: string[];
  color: 'cyan' | 'purple' | 'pink' | 'emerald' | 'orange';
  description: string;
  downloadUrl: string;
  downloadCandidates: string[];
  secondaryUrl?: string;
  secondaryLabel?: string;
  secondaryCandidates?: string[];
  /** 稳定锚点：Hero「安卓下载」等可精确定位 */
  anchorId?: string;
  /** 主按钮文案覆盖（如 App Store） */
  primaryLabel?: string;
  /** 是否走外链打开（商店页）而非 IPA 多 CDN 对话框 */
  primaryExternal?: boolean;
}

type LinkPrimaryKey =
  | 'windowsExe'
  | 'windowsMsi'
  | 'macDmg'
  | 'androidApk'
  | 'iosIpa'
  | 'linuxAppImage'
  | 'linuxDeb';

type LinkCandidatesKey = `${LinkPrimaryKey}Candidates`;

type ReleaseLinks = {
  [K in LinkPrimaryKey]?: string;
} & {
  [K in LinkCandidatesKey]?: string[];
};

type ReleaseAsset = {
  name?: string;
  browser_download_url?: string;
  download_count?: number;
};

type LatestRelease = {
  tag_name?: string;
  version?: string;
  assets?: ReleaseAsset[];
  channel?: string;
  source?: 'stable-manifest' | 'github-api';
};

type ReleaseManifest = {
  tag?: string;
  version?: string;
  channel?: string;
  generatedAt?: string;
  downloadDir?: string;
  assets?: Record<string, string>;
};

const REPO = 'superdaobo/mini-hbut';
const releasePage = `https://github.com/${REPO}/releases`;
const latestApi = `https://api.github.com/repos/${REPO}/releases/latest`;

const apiProxyPrefixes = [
  'https://hk.gh-proxy.org/',
  'https://gh-proxy.com/',
  'https://ghfast.top/',
  'https://ghproxy.net/',
] as const;

const downloadProxyPrefixes = [
  'https://ghfast.top/',
  'https://gh-proxy.com/',
  'https://hk.gh-proxy.org/',
  'https://ghproxy.net/',
] as const;

// 腾讯云 EdgeOne Pages CDN 域名；GitHub Pages 作备用；同源 /releases 优先避免 CORS
const EDGEONE_CDN_BASE = 'https://hbut.6661111.xyz';
const GITHUB_PAGES_CDN_BASE = 'https://superdaobo.github.io/mini-hbut';
const STABLE_MANIFEST_CANDIDATES = [
  '/releases/stable-latest.json',
  `${EDGEONE_CDN_BASE}/releases/stable-latest.json`,
  `${GITHUB_PAGES_CDN_BASE}/releases/stable-latest.json`,
] as const;

const uniqueUrls = (list: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const url = String(item || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
};

const allProxyPrefixes = uniqueUrls([...apiProxyPrefixes, ...downloadProxyPrefixes]);

const latestApiCandidates = uniqueUrls([
  `${apiProxyPrefixes[0]}${latestApi}`,
  ...apiProxyPrefixes.slice(1).map((prefix) => `${prefix}${latestApi}`),
  latestApi,
]);

const proxiedReleasePage = `${downloadProxyPrefixes[0]}${releasePage}`;

function isGithubApiOrWebUrl(url: string): boolean {
  return /^https:\/\/(?:api\.)?github\.com\//i.test(url);
}

function extractGithubSourceUrl(rawUrl: string): string {
  const raw = String(rawUrl || '').trim();
  if (!raw) return '';

  const candidates = [raw];
  try {
    candidates.push(decodeURIComponent(raw));
  } catch {
    // ignore decode failure
  }

  for (const candidate of candidates) {
    const githubIdx = candidate.indexOf('https://github.com/');
    if (githubIdx >= 0) return candidate.slice(githubIdx);
    const apiIdx = candidate.indexOf('https://api.github.com/');
    if (apiIdx >= 0) return candidate.slice(apiIdx);
  }

  return raw;
}

function isAlreadyProxied(url: string): boolean {
  const value = String(url || '').trim();
  if (!value) return false;
  return allProxyPrefixes.some((prefix) => value.startsWith(prefix));
}

function buildGithubUrlCandidates(
  rawUrl: string,
  proxyOrder: readonly string[] = downloadProxyPrefixes,
  directPosition: 'first' | 'after-first' | 'last' = 'last'
): string[] {
  const normalized = extractGithubSourceUrl(rawUrl);
  if (!normalized) return [];
  if (isAlreadyProxied(normalized)) return [normalized];
  if (!isGithubApiOrWebUrl(normalized)) return [normalized];
  const proxied = proxyOrder.map((prefix) => `${prefix}${normalized}`);
  if (directPosition === 'first') {
    return uniqueUrls([normalized, ...proxied]);
  }
  if (directPosition === 'after-first') {
    const [first = '', ...rest] = proxied;
    return uniqueUrls([first, normalized, ...rest]);
  }
  return uniqueUrls([...proxied, normalized]);
}

function getHostLabel(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.host.replace(/^www\./i, '');
  } catch {
    return 'unknown';
  }
}

function normalizeReleaseChannel(channel?: string): string {
  const value = String(channel || '').trim().toLowerCase();
  if (!value || value === 'stable' || value === 'release') return 'main';
  return value;
}

function assignLink(
  links: ReleaseLinks,
  primaryKey: LinkPrimaryKey,
  candidatesKey: LinkCandidatesKey,
  rawUrl: string
): void {
  const candidates = buildGithubUrlCandidates(rawUrl, downloadProxyPrefixes, 'last');
  
  // 设置主链接
  if (!candidates.length) return;
  links[primaryKey] = candidates[0];

  // 如果 candidates 只有 CDN 链接（非 GitHub），补充代理 + GitHub 源站
  const hasGithubUrl = candidates.some((u) => u.includes('github.com/'));
  if (!hasGithubUrl && candidates[0].startsWith(`${EDGEONE_CDN_BASE}/releases/`)) {
    const cdnUrl = candidates[0];
    const cdnPrefix = `${EDGEONE_CDN_BASE}/releases/`;
    const pathAfterReleases = cdnUrl.slice(cdnPrefix.length); // "v1.3.5/filename.exe"
    const githubUrl = `https://github.com/${REPO}/releases/download/${pathAfterReleases}`;
    const proxiedGithub = downloadProxyPrefixes.map((p) => `${p}${githubUrl}`);
    links[candidatesKey] = uniqueUrls([cdnUrl, ...proxiedGithub, githubUrl]);
  } else {
    links[candidatesKey] = candidates;
  }
}

function applyExpectedAssetFallbacks(links: ReleaseLinks, versionOrTag: string): void {
  const version = String(versionOrTag || '').replace(/^v/i, '').trim();
  if (!version) return;

  const releaseBase = `https://github.com/${REPO}/releases/download/v${version}`;

  if (!links.windowsExe) {
    assignLink(
      links,
      'windowsExe',
      'windowsExeCandidates',
      `${releaseBase}/Mini-HBUT_${version}_x64-setup.exe`
    );
  }
  if (!links.windowsMsi) {
    assignLink(
      links,
      'windowsMsi',
      'windowsMsiCandidates',
      `${releaseBase}/Mini-HBUT_${version}_x64_en-US.msi`
    );
  }
  if (!links.macDmg) {
    assignLink(
      links,
      'macDmg',
      'macDmgCandidates',
      `${releaseBase}/Mini-HBUT_${version}_universal.dmg`
    );
  }
  if (!links.androidApk) {
    assignLink(
      links,
      'androidApk',
      'androidApkCandidates',
      `${releaseBase}/Mini-HBUT_${version}_arm64.apk`
    );
  }
  if (!links.iosIpa) {
    assignLink(
      links,
      'iosIpa',
      'iosIpaCandidates',
      `${releaseBase}/Mini-HBUT_${version}_iOS.ipa`
    );
  }
  if (!links.linuxAppImage) {
    assignLink(
      links,
      'linuxAppImage',
      'linuxAppImageCandidates',
      `${releaseBase}/Mini-HBUT_${version}_amd64.AppImage`
    );
  }
}

function applyAssetLink(links: ReleaseLinks, assetNameRaw: string, assetUrlRaw: string): boolean {
  const name = assetNameRaw.toLowerCase();

  if (/^mini-hbut_.*_x64-setup\.exe$/.test(name)) {
    assignLink(links, 'windowsExe', 'windowsExeCandidates', assetUrlRaw);
    return true;
  }
  if (/^mini-hbut_.*_x64_.*\.msi$/.test(name)) {
    assignLink(links, 'windowsMsi', 'windowsMsiCandidates', assetUrlRaw);
    return true;
  }
  if (/^mini-hbut_.*_universal\.dmg$/.test(name)) {
    assignLink(links, 'macDmg', 'macDmgCandidates', assetUrlRaw);
    return true;
  }
  if (/^mini-hbut_.*_arm64\.apk$/.test(name)) {
    assignLink(links, 'androidApk', 'androidApkCandidates', assetUrlRaw);
    return true;
  }
  if (/^mini-hbut_.*_ios\.ipa$/.test(name)) {
    assignLink(links, 'iosIpa', 'iosIpaCandidates', assetUrlRaw);
    return true;
  }
  if (/^mini-hbut_.*_amd64\.appimage$/.test(name)) {
    assignLink(links, 'linuxAppImage', 'linuxAppImageCandidates', assetUrlRaw);
    return true;
  }
  if (/^mini-hbut_.*_amd64\.deb$/.test(name)) {
    assignLink(links, 'linuxDeb', 'linuxDebCandidates', assetUrlRaw);
    return true;
  }
  return false;
}

const colorMap: Record<Platform['color'], { bg: string; border: string; text: string; glow: string }> = {
  cyan: {
    bg: 'bg-cyan/10',
    border: 'border-cyan/40',
    text: 'text-cyan',
    glow: 'shadow-neon',
  },
  purple: {
    bg: 'bg-purple/10',
    border: 'border-purple/40',
    text: 'text-purple',
    glow: 'shadow-neon-purple',
  },
  pink: {
    bg: 'bg-pink/10',
    border: 'border-pink/40',
    text: 'text-pink',
    glow: 'shadow-neon-pink',
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-400/40',
    text: 'text-emerald-400',
    glow: 'shadow-[0_0_25px_rgba(16,185,129,0.4)]',
  },
  orange: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-400/40',
    text: 'text-orange-300',
    glow: 'shadow-[0_0_25px_rgba(251,146,60,0.35)]',
  },
};

function buildPlatforms(links: ReleaseLinks): Platform[] {
  return [
    {
      name: 'Windows',
      icon: Monitor,
      formats: ['EXE', 'MSI'],
      color: 'cyan',
      description: 'Windows 10/11',
      downloadUrl: links.windowsExe || '',
      downloadCandidates: links.windowsExeCandidates || [],
      secondaryUrl: links.windowsMsi,
      secondaryLabel: 'MSI 安装包',
      secondaryCandidates: links.windowsMsiCandidates || [],
    },
    {
      name: 'macOS',
      icon: Apple,
      formats: ['DMG'],
      color: 'purple',
      description: 'macOS 11+',
      downloadUrl: links.macDmg || '',
      downloadCandidates: links.macDmgCandidates || [],
    },
    {
      name: 'Android',
      icon: Smartphone,
      formats: ['APK'],
      color: 'pink',
      description: 'Android 8+',
      downloadUrl: links.androidApk || '',
      downloadCandidates: links.androidApkCandidates || [],
      anchorId: DOWNLOAD_ANDROID_ANCHOR,
    },
    {
      name: 'iOS',
      icon: Smartphone,
      formats: ['App Store'],
      color: 'orange',
      description: '使用 App Store 下载（正式上架）',
      // 主路径：App Store 网页；侧载 IPA 降为 secondary
      downloadUrl: APP_STORE_LINKS.https,
      downloadCandidates: [APP_STORE_LINKS.https],
      primaryLabel: 'App Store 下载',
      primaryExternal: true,
      secondaryUrl: links.iosIpa || '',
      secondaryLabel: links.iosIpa ? 'IPA 侧载（进阶）' : undefined,
      secondaryCandidates: links.iosIpaCandidates || [],
      anchorId: DOWNLOAD_IOS_ANCHOR,
    },
    {
      name: 'Linux',
      icon: Server,
      formats: ['AppImage', 'DEB'],
      color: 'emerald',
      description: 'Ubuntu / Debian / 通用 Linux',
      downloadUrl: links.linuxAppImage || '',
      downloadCandidates: links.linuxAppImageCandidates || [],
      secondaryUrl: links.linuxDeb,
      secondaryLabel: 'DEB 包',
      secondaryCandidates: links.linuxDebCandidates || [],
    },
  ];
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 12000): Promise<T> {
  let timer = 0;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = window.setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

async function fetchLatestReleaseJson(): Promise<LatestRelease> {
  // 首页下载入口只允许稳定版；同源 → EdgeOne → GitHub Pages → GitHub API
  for (const manifestUrl of STABLE_MANIFEST_CANDIDATES) {
    try {
      const resp = await withTimeout(fetch(manifestUrl, { cache: 'no-store' }), 8000);
      if (!resp.ok) continue;
      const manifest = (await resp.json()) as ReleaseManifest;
      if (!manifest?.tag || !manifest?.assets) continue;
      const tag = manifest.tag;
      const downloadDir = String(manifest.downloadDir || tag).trim() || tag;
      const assetBase = manifestUrl.startsWith('http')
        ? manifestUrl.replace(/\/releases\/stable-latest\.json$/i, '')
        : EDGEONE_CDN_BASE;
      const assets: ReleaseAsset[] = Object.values(manifest.assets)
        .filter(Boolean)
        .map((filename) => ({
          name: filename as string,
          browser_download_url: `${assetBase}/releases/${downloadDir}/${filename}`,
          download_count: 0,
        }));
      return {
        tag_name: tag,
        version: manifest.version,
        channel: normalizeReleaseChannel(manifest.channel),
        source: 'stable-manifest',
        assets,
      };
    } catch {
      // try next candidate
    }
  }

  let lastError: unknown = null;

  for (const endpoint of latestApiCandidates) {
    try {
      const resp = await withTimeout(
        fetch(endpoint, {
          headers: { Accept: 'application/vnd.github+json' },
          cache: 'no-store',
        }),
        12000
      );
      if (!resp.ok) throw new Error(`${endpoint} => ${resp.status}`);
      return {
        ...((await resp.json()) as LatestRelease),
        source: 'github-api',
      };
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('latest release fetch failed');
}

export default function DownloadSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>(buildPlatforms({}));
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [version, setVersion] = useState<string>('');
  const [channel, setChannel] = useState<string>('');

  const loadLinks = async () => {
    setLoading(true);
    setError('');

    try {
      const release = await fetchLatestReleaseJson();
      const tag = release.tag_name || '';
      setVersion(String(release.version || tag));
      setChannel(normalizeReleaseChannel(release.channel));

      const assets = Array.isArray(release.assets) ? release.assets : [];
      if (!assets.length) throw new Error('release assets empty');


      const links: ReleaseLinks = {};
      let mappedCount = 0;

      assets.forEach((asset) => {
        if (!asset?.name || !asset?.browser_download_url) return;
        if (applyAssetLink(links, asset.name, asset.browser_download_url)) {
          mappedCount += 1;
        }
      });

      if (!mappedCount) {
        throw new Error('no known asset matched');
      }

      // CDN manifest 可能因单文件大小限制缺少大包，此时回退到 GitHub Release 正式版直链。
      applyExpectedAssetFallbacks(links, release.version || tag);

      setPlatforms(buildPlatforms(links));
    } catch (e) {
      console.error('[download] failed to fetch latest links', e);
      setPlatforms(buildPlatforms({}));
      setError('无法获取最新版本下载链接，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLinks();
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (titleRef.current) {
        gsap.fromTo(
          titleRef.current,
          { opacity: 0, y: 50 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: titleRef.current,
              start: 'top 80%',
              toggleActions: 'play none none reverse',
            },
          }
        );
      }

      cardsRef.current.forEach((card, i) => {
        if (!card) return;
        gsap.fromTo(
          card,
          { opacity: 0, y: 30, scale: 0.9 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.6,
            delay: i * 0.08,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: card,
              start: 'top 85%',
              toggleActions: 'play none none reverse',
            },
          }
        );
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const getSourceLabel = (url: string): string => {
    if (url.includes('hbut.6661111.xyz')) return '本站下载';
    if (url.includes('hk.gh-proxy.org')) return '代理下载 1';
    if (url.includes('ghfast.top')) return '代理下载 2';
    if (url.includes('gh-proxy.com')) return '代理下载 3';
    if (url.includes('ghproxy.net')) return '代理下载 4';
    if (url.includes('mirror.ghproxy.com')) return '代理下载 4';
    if (url.includes('github.com')) return 'GitHub 源站';
    return `线路 ${url.slice(0, 20)}`;
  };

  const getSourceIcon = (url: string): string => {
    if (url.includes('hbut.6661111.xyz')) return '⚡';
    if (url.includes('github.com')) return '🐙';
    return '🔗';
  };

  const renderDownloadSources = (urls: string[] | undefined) => {
    const allUrls = uniqueUrls(urls || []);
    if (!allUrls.length) return null;
    return (
      <div className="space-y-2">
        {allUrls.map((url, idx) => {
          const label = getSourceLabel(url);
          const icon = getSourceIcon(url);
          const isCdn = url.includes('hbut.6661111.xyz');
          return (
            <a
              key={`source-${url}-${idx}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={`w-full py-2.5 px-3 flex items-center justify-between gap-2 border rounded-lg transition-colors font-mono text-xs ${
                isCdn
                  ? 'border-cyan/40 text-cyan hover:bg-cyan/10'
                  : 'border-dashed border-gray-600 text-gray-400 hover:text-white hover:border-white'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <span>{icon}</span>
                <Download className="w-3 h-3" />
                {label}
              </span>
              <span className="text-gray-500">{getHostLabel(url)}</span>
            </a>
          );
        })}
      </div>
    );
  };

  return (
    <section ref={sectionRef} id="download" className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="section-divider mb-16" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 ref={titleRef} className="font-pixel text-2xl sm:text-3xl md:text-4xl mb-4">
            <span className="gradient-text">下载安装</span>
          </h2>
          <p className="text-gray-400 font-mono text-sm max-w-2xl mx-auto">
            {EDGEONE_CDN_BASE
              ? '腾讯云 EdgeOne CDN 加速优先，GitHub 多线路代理回退，自动降级直连兜底。'
              : '实时请求 GitHub Release API，多线路 CDN 加速，自动回退备用节点。'}
          </p>

          {version && (
            <div className="mt-3 flex items-center justify-center gap-4 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan/10 border border-cyan/30 text-cyan text-xs font-mono">
                当前版本：{version}
              </span>
              {channel && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/15 text-gray-300 text-xs font-mono">
                  当前渠道：{channel}
                </span>
              )}

            </div>
          )}

          <div className="mt-4 flex justify-center">
            <button
              onClick={loadLinks}
              className="cyber-btn px-3 py-1 text-xs inline-flex items-center gap-2"
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? '获取中' : '刷新下载链接'}
            </button>
          </div>

          {error && <p className="mt-3 text-red-400 text-sm">{error}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {platforms.map((platform, i) => {
            const colors = colorMap[platform.color];
            const Icon = platform.icon;
            const canDownload = !!platform.downloadUrl;

            return (
              <div
                key={platform.name}
                id={platform.anchorId}
                ref={(el) => {
                  cardsRef.current[i] = el;
                }}
                className={`group relative p-6 rounded-xl border-2 ${colors.border} ${colors.bg} backdrop-blur-sm transition-all duration-300 ${canDownload ? `cursor-pointer hover:scale-105 hover:${colors.glow}` : 'opacity-70 cursor-not-allowed'}`}
                onClick={() => {
                  if (!canDownload) return;
                  if (platform.primaryExternal) {
                    window.location.href = resolveAppStoreOpenUrl(
                      typeof navigator !== 'undefined' ? navigator.userAgent : '',
                    );
                    return;
                  }
                  setSelectedPlatform(platform);
                }}
              >
                <div className="absolute top-4 right-4">
                  <span className={`flex items-center gap-1 text-xs ${canDownload ? 'text-green-400' : 'text-gray-400'}`}>
                    <Check className="w-3 h-3" />
                    {canDownload ? '可用' : '未就绪'}
                  </span>
                </div>

                <div className={`w-16 h-16 rounded-xl ${colors.bg} border-2 ${colors.border} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className={`w-8 h-8 ${colors.text}`} />
                </div>

                <h3 className={`text-xl font-mono font-bold ${colors.text} mb-1`}>{platform.name}</h3>
                <p className="text-gray-500 text-sm mb-3">{platform.description}</p>

                <div className="flex flex-wrap gap-2">
                  {platform.formats.map((format) => (
                    <span key={format} className={`px-2 py-1 rounded text-xs font-mono ${colors.bg} ${colors.border} border ${colors.text}`}>
                      {format}
                    </span>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-2">
                  <button
                    type="button"
                    className={`w-full py-2 rounded-lg flex items-center justify-center gap-2 ${colors.bg} ${colors.text} border ${colors.border} hover:bg-opacity-20 transition-all duration-300 text-sm font-mono ${!canDownload ? 'opacity-60' : ''}`}
                  >
                    <Download className="w-4 h-4" />
                    {canDownload
                      ? platform.primaryLabel || '立即下载'
                      : '链接未就绪'}
                  </button>
                  {platform.name === 'iOS' && platform.secondaryUrl ? (
                    <button
                      type="button"
                      className="w-full py-1.5 rounded-lg text-[11px] font-mono text-gray-400 border border-dashed border-gray-600 hover:text-white hover:border-white/40"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlatform({
                          ...platform,
                          downloadUrl: platform.secondaryUrl || '',
                          downloadCandidates: platform.secondaryCandidates || [],
                          primaryExternal: false,
                          primaryLabel: 'IPA 侧载',
                        });
                      }}
                    >
                      {platform.secondaryLabel || 'IPA 侧载（进阶）'}
                    </button>
                  ) : null}
                  {platform.name === 'iOS' ? (
                    <a
                      href={APP_STORE_LINKS.testFlight}
                      onClick={(e) => e.stopPropagation()}
                      className="block text-center text-[11px] font-mono text-gray-500 hover:text-gray-300"
                    >
                      TestFlight（次要）
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="glass rounded-2xl p-6 md:p-8">
          <h3 className="font-mono text-lg text-cyan mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            下载链路说明
          </h3>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-white font-mono mb-2">下载链路策略</h4>
              <p className="text-gray-400 text-sm mb-3">
                {EDGEONE_CDN_BASE
                  ? `下载优先使用腾讯云 EdgeOne CDN（${EDGEONE_CDN_BASE}），回退至 GitHub 多线路代理加速（ghfast.top / gh-proxy.com / hk.gh-proxy.org），最终兜底为 GitHub 直连。`
                  : '页面加载实时请求 GitHub latest API，按资产名映射多平台安装包。API 使用 hk.gh-proxy.org 优先 + 多线路代理 + 官方 API 兜底，下载地址使用 ghfast.top 优先 + 多线路回退 + 直连兜底。'}
              </p>
            </div>
            <div>
              <h4 className="text-white font-mono mb-2">{EDGEONE_CDN_BASE ? 'CDN 加速（推荐）' : '发布页（首选代理）'}</h4>
              <code className="block bg-black/50 rounded-lg p-3 text-xs text-cyan font-mono break-all">
                {EDGEONE_CDN_BASE || proxiedReleasePage}
              </code>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!selectedPlatform} onOpenChange={() => setSelectedPlatform(null)}>
        <DialogContent className="bg-cyber-dark border border-cyan/30 text-white max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-pixel text-lg">下载 {selectedPlatform?.name}{version ? ` — ${version}` : ''}</DialogTitle>
            <DialogDescription className="text-gray-400">多 CDN 加速节点，主链默认使用最快线路，可切换备用</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {selectedPlatform?.downloadUrl ? (
              <a
                href={selectedPlatform.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cyber-btn w-full py-3 flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                {selectedPlatform.name === 'Windows' ? '下载 EXE（推荐）' : '下载主安装包'}
              </a>
            ) : (
              <div className="w-full py-3 rounded border border-red-400/40 text-red-300 text-center text-sm">
                当前无法获取实时下载链接
              </div>
            )}

            {renderDownloadSources(selectedPlatform?.downloadCandidates)}

            {selectedPlatform?.secondaryUrl && (
              <>
                <div className="border-t border-gray-700/50 pt-3 mt-3">
                  <p className="text-xs text-gray-500 mb-2">备用安装包（{selectedPlatform.secondaryLabel || '备用包'}）</p>
                </div>
                <a
                  href={selectedPlatform.secondaryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 flex items-center justify-center gap-2 border border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-white hover:border-white transition-colors font-mono text-sm"
                >
                  <Download className="w-4 h-4" />
                  下载 {selectedPlatform.secondaryLabel || '备用包'}
                </a>
                {renderDownloadSources(selectedPlatform?.secondaryCandidates)}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
