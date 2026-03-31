import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Tag,
  Calendar,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  AlertCircle,
  RefreshCw,
  Link2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import Navbar from '../components/Navbar';

// ──── 常量 ────

const REPO = 'superdaobo/mini-hbut';
const releasesApi = `https://api.github.com/repos/${REPO}/releases`;

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

// ──── 类型 ────

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  download_count: number;
  size: number;
}

interface Release {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
  assets: ReleaseAsset[];
  html_url: string;
}

// ──── 工具函数 ────

function uniqueUrls(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((u) => {
    const url = u.trim();
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function buildProxiedCandidates(rawUrl: string): string[] {
  if (!rawUrl) return [];
  return uniqueUrls([
    ...downloadProxyPrefixes.map((p) => `${p}${rawUrl}`),
    rawUrl,
  ]);
}

async function fetchReleasesJson(): Promise<Release[]> {
  const candidates = [
    ...apiProxyPrefixes.map((p) => `${p}${releasesApi}`),
    releasesApi,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data)) return data;
    } catch {
      continue;
    }
  }
  throw new Error('所有 API 端点均不可用');
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function getPlatformInfo(name: string): { label: string; icon: string } {
  const lower = name.toLowerCase();
  if (/x64-setup\.exe$/.test(lower)) return { label: 'Windows EXE', icon: '🖥️' };
  if (/\.msi$/.test(lower)) return { label: 'Windows MSI', icon: '🖥️' };
  if (/\.dmg$/.test(lower)) return { label: 'macOS DMG', icon: '🍎' };
  if (/\.apk$/.test(lower)) return { label: 'Android APK', icon: '📱' };
  if (/\.ipa$/i.test(lower)) return { label: 'iOS IPA', icon: '📱' };
  if (/\.appimage$/i.test(lower)) return { label: 'Linux AppImage', icon: '🐧' };
  if (/\.deb$/i.test(lower)) return { label: 'Linux DEB', icon: '🐧' };
  return { label: name, icon: '📦' };
}

function isInstallAsset(name: string): boolean {
  return /\.(exe|msi|dmg|apk|ipa|appimage|deb)$/i.test(name);
}

function getHostLabel(rawUrl: string): string {
  try {
    return new URL(rawUrl).host.replace(/^www\./i, '');
  } catch {
    return 'unknown';
  }
}

// ──── 简易 Markdown 渲染 ────

function renderBody(body: string) {
  if (!body) return null;

  const lines = body.split('\n');
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (!listBuffer.length) return;
    elements.push(
      <ul key={`ul-${elements.length}`} className="list-disc list-inside space-y-1 my-2">
        {listBuffer.map((item, i) => (
          <li key={i} className="text-gray-300 text-sm">{renderInline(item)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 标题
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      flushList();
      const level = headerMatch[1].length;
      const text = headerMatch[2];
      const cls = level === 1
        ? 'text-lg font-bold text-white mt-4 mb-2'
        : level === 2
          ? 'text-base font-bold text-cyan mt-3 mb-1.5'
          : 'text-sm font-semibold text-gray-200 mt-2 mb-1';
      elements.push(<div key={i} className={cls}>{renderInline(text)}</div>);
      continue;
    }

    // 列表项
    const listMatch = line.match(/^\s*[-*]\s+(.+)/);
    if (listMatch) {
      listBuffer.push(listMatch[1]);
      continue;
    }

    // 空行
    if (!line.trim()) {
      flushList();
      continue;
    }

    // 普通段落
    flushList();
    elements.push(
      <p key={i} className="text-gray-300 text-sm my-1">{renderInline(line)}</p>
    );
  }

  flushList();
  return <div className="space-y-1">{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
  // 处理 **粗体**、`代码`、[链接](url)
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      // **粗体**
      parts.push(<strong key={match.index} className="text-white font-semibold">{match[2]}</strong>);
    } else if (match[3]) {
      // `代码`
      parts.push(
        <code key={match.index} className="px-1.5 py-0.5 bg-gray-800 rounded text-cyan text-xs font-mono">
          {match[4]}
        </code>
      );
    } else if (match[5]) {
      // [链接](url)
      parts.push(
        <a
          key={match.index}
          href={match[7]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan hover:underline"
        >
          {match[6]}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// ──── 主组件 ────

export default function Releases() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<ReleaseAsset | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const loadReleases = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchReleasesJson();
      const published = data.filter((r) => !r.draft);
      setReleases(published);
      if (published.length > 0) setExpandedId(published[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReleases();
  }, []);

  // GSAP 入场动画
  useEffect(() => {
    if (!timelineRef.current || loading) return;
    const items = timelineRef.current.querySelectorAll('.release-item');
    gsap.fromTo(
      items,
      { opacity: 0, x: -30 },
      { opacity: 1, x: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out' }
    );
  }, [releases, loading]);

  const openDownloadDialog = (release: Release) => {
    setSelectedRelease(release);
    setSelectedAsset(null);
  };

  const installAssets = (release: Release) =>
    release.assets.filter((a) => isInstallAsset(a.name));

  const totalDownloads = (release: Release) =>
    release.assets.reduce((sum, a) => sum + a.download_count, 0);

  // 当前弹窗中选中的 asset 的代理候选列表
  const selectedAssetCandidates = selectedAsset
    ? buildProxiedCandidates(selectedAsset.browser_download_url)
    : [];

  return (
    <div className="min-h-screen bg-black">
      <Navbar />

      <div className="pt-28 pb-20 max-w-4xl mx-auto px-4 sm:px-6">
        {/* 页面标题 */}
        <div className="text-center mb-16">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-cyan hover:text-cyan-300 transition-colors mb-8 text-sm font-mono"
          >
            <ArrowLeft className="w-4 h-4" />
            返回首页
          </Link>
          <h1 className="font-pixel text-3xl sm:text-4xl mb-4">
            <span className="gradient-text">版本历史</span>
          </h1>
          <p className="text-gray-400 font-mono text-sm">
            所有发布版本 · 来自 GitHub Releases
          </p>
          <div className="mt-4">
            <button
              onClick={loadReleases}
              className="cyber-btn px-3 py-1 text-xs inline-flex items-center gap-2"
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? '加载中' : '刷新'}
            </button>
          </div>
        </div>

        {/* 加载状态 */}
        {loading && (
          <div className="flex flex-col items-center gap-4 py-20">
            <Loader2 className="w-8 h-8 text-cyan animate-spin" />
            <p className="text-gray-400 text-sm font-mono">正在获取版本信息...</p>
          </div>
        )}

        {/* 错误状态 */}
        {!loading && error && (
          <div className="glass rounded-xl p-8 text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-red-400 text-sm mb-4">{error}</p>
            <button
              onClick={loadReleases}
              className="cyber-btn px-4 py-2 text-xs inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              重试
            </button>
          </div>
        )}

        {/* 空状态 */}
        {!loading && !error && releases.length === 0 && (
          <div className="glass rounded-xl p-8 text-center">
            <Tag className="w-8 h-8 text-gray-500 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">暂无发布版本</p>
          </div>
        )}

        {/* 时间线 */}
        {!loading && releases.length > 0 && (
          <div ref={timelineRef} className="relative">
            {/* 竖轴线 */}
            <div className="absolute left-[23px] top-0 bottom-0 w-px bg-gradient-to-b from-cyan/60 via-purple/30 to-transparent" />

            {releases.map((release, index) => {
              const isExpanded = expandedId === release.id;
              const isLatest = index === 0;
              const assets = installAssets(release);
              const downloads = totalDownloads(release);

              return (
                <div key={release.id} className="release-item relative pl-14 pb-10">
                  {/* 时间线节点 */}
                  <div
                    className={`absolute left-3 top-5 w-5 h-5 rounded-full border-2 z-10 transition-all duration-300 ${
                      isLatest
                        ? 'bg-cyan border-cyan shadow-[0_0_12px_rgba(15,240,252,0.6)]'
                        : isExpanded
                          ? 'bg-purple/30 border-purple shadow-[0_0_8px_rgba(255,46,99,0.4)]'
                          : 'bg-cyber-dark border-gray-600 hover:border-gray-400'
                    }`}
                  />

                  {/* 内容卡片 */}
                  <div
                    className={`glass rounded-xl border overflow-hidden transition-all duration-300 ${
                      isLatest
                        ? 'border-cyan/30 shadow-[0_0_15px_rgba(15,240,252,0.1)]'
                        : 'border-gray-700/50 hover:border-gray-600/50'
                    }`}
                  >
                    {/* 卡片头（可点击展开/折叠） */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : release.id)}
                      className="w-full p-5 text-left flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                          <Tag className="w-4 h-4 text-cyan shrink-0" />
                          <span className="font-mono font-bold text-white text-lg">
                            {release.tag_name}
                          </span>
                          {release.name && release.name !== release.tag_name && (
                            <span className="text-gray-400 text-sm truncate">
                              {release.name}
                            </span>
                          )}
                          {isLatest && (
                            <span className="px-2 py-0.5 text-[10px] bg-cyan/20 text-cyan rounded-full border border-cyan/30 font-mono shrink-0">
                              最新
                            </span>
                          )}
                          {release.prerelease && (
                            <span className="px-2 py-0.5 text-[10px] bg-orange-500/20 text-orange-400 rounded-full border border-orange-400/30 font-mono shrink-0">
                              预发布
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(release.published_at)}
                          </span>
                          {downloads > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Download className="w-3 h-3" />
                              {downloads.toLocaleString()} 次下载
                            </span>
                          )}
                          {assets.length > 0 && (
                            <span className="text-gray-600">
                              {assets.length} 个安装包
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 ml-4">
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {/* 展开内容 */}
                    {isExpanded && (
                      <div className="px-5 pb-5 border-t border-gray-700/50">
                        {/* 发布说明 */}
                        {release.body && (
                          <div className="mt-4 p-4 rounded-lg bg-black/30 border border-gray-800/50 overflow-x-auto">
                            {renderBody(release.body)}
                          </div>
                        )}

                        {/* 操作按钮 */}
                        <div className="mt-4 flex flex-wrap gap-3">
                          {assets.length > 0 && (
                            <button
                              onClick={() => openDownloadDialog(release)}
                              className="cyber-btn px-4 py-2 text-xs inline-flex items-center gap-2"
                            >
                              <Download className="w-4 h-4" />
                              下载此版本
                            </button>
                          )}
                          <a
                            href={release.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 text-xs border border-gray-600 rounded-lg text-gray-400 hover:text-white hover:border-white transition-colors inline-flex items-center gap-2"
                          >
                            <ExternalLink className="w-4 h-4" />
                            GitHub Release
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 下载弹窗 */}
      <Dialog open={!!selectedRelease} onOpenChange={() => setSelectedRelease(null)}>
        <DialogContent className="bg-cyber-dark border border-cyan/30 text-white max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-pixel text-lg">
              下载 {selectedRelease?.tag_name}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              选择适合你平台的安装包（通过 GitHub 下载）
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-4">
            {selectedRelease &&
              installAssets(selectedRelease).map((asset) => {
                const { label, icon } = getPlatformInfo(asset.name);
                const isSelected = selectedAsset?.name === asset.name;

                return (
                  <div key={asset.name}>
                    <button
                      onClick={() => setSelectedAsset(isSelected ? null : asset)}
                      className={`w-full p-3 flex items-center justify-between border rounded-lg transition-all ${
                        isSelected
                          ? 'border-cyan/50 bg-cyan/5'
                          : 'border-gray-600 hover:border-gray-400 hover:bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-center gap-3 text-left">
                        <span className="text-lg">{icon}</span>
                        <div>
                          <div className="text-sm text-white font-mono">{label}</div>
                          <div className="text-xs text-gray-500">
                            {asset.name} · {formatSize(asset.size)}
                            {asset.download_count > 0 &&
                              ` · ${asset.download_count} 次下载`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isSelected ? (
                          <ChevronUp className="w-4 h-4 text-cyan" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {/* 展开的下载链接列表 */}
                    {isSelected && (
                      <div className="mt-2 ml-4 space-y-2">
                        {/* GitHub 直连 */}
                        <a
                          href={asset.browser_download_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-2 px-3 flex items-center justify-between gap-2 border border-cyan/40 rounded-lg text-cyan hover:bg-cyan/10 transition-colors font-mono text-xs"
                        >
                          <span className="inline-flex items-center gap-2">
                            <Download className="w-3 h-3" />
                            GitHub 直连
                          </span>
                          <span className="text-gray-500">github.com</span>
                        </a>

                        {/* 代理加速线路 */}
                        {selectedAssetCandidates.slice(0, -1).map((url, idx) => (
                          <a
                            key={`proxy-${idx}`}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-2 px-3 flex items-center justify-between gap-2 border border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-white hover:border-white transition-colors font-mono text-xs"
                          >
                            <span className="inline-flex items-center gap-2">
                              <Link2 className="w-3 h-3" />
                              代理加速 {idx + 1}
                            </span>
                            <span className="text-gray-500">{getHostLabel(url)}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
