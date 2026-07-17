/**
 * 与 next.config.ts 的 basePath 对齐。
 * GitHub Pages 项目站：/mini-hbut ；自定义域名 / EdgeOne：空。
 *
 * 注意：客户端可读到 NEXT_PUBLIC_BASE_PATH（由 next.config env 注入）。
 */
export const BASE_PATH =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BASE_PATH
    ? process.env.NEXT_PUBLIC_BASE_PATH
    : '';

/** 站内路径加 basePath（已是 http(s) 则原样返回） */
export function withBasePath(path: string): string {
  const raw = String(path || '').trim();
  if (!raw) return BASE_PATH || '/';
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('mailto:') || raw.startsWith('tel:')) {
    return raw;
  }
  // 仅 hash：留给调用方决定（首页内滚动 vs 回首页再跳锚点）
  if (raw.startsWith('#')) {
    return homeWithHash(raw);
  }
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  if (!BASE_PATH) return normalized;
  if (normalized === '/') return BASE_PATH;
  // 避免重复前缀
  if (normalized === BASE_PATH || normalized.startsWith(`${BASE_PATH}/`)) return normalized;
  return `${BASE_PATH}${normalized}`;
}

/**
 * 首页 + 锚点，始终保留 basePath。
 * - basePath=/mini-hbut, hash=#features → /mini-hbut/#features
 * - basePath='', hash=#features → /#features
 */
export function homeWithHash(hash: string): string {
  const h = hash.startsWith('#') ? hash : `#${hash}`;
  if (!BASE_PATH) return `/${h}`;
  return `${BASE_PATH}/${h}`;
}
