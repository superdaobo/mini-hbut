import { by as normalizeGameOrigin, bf as isSecureGamePlatformUrl } from "./app-demo-BU0DrW_f.js";
const GAME_CENTER_GAME_IDS = Object.freeze([
  "hecheng_hugongda",
  "jump_out_hbut",
  "hbut_2048",
  "clumsy_bird_hbut",
  "hbut_monopoly",
  "hbut_miner",
  "hbut_memory_match",
  "hbut_gomoku",
  "hbut_stack",
  "hbut_parking",
  "hbut_match3"
]);
const LOCAL_BRIDGE_PREVIEW_RE = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/module_bundle\/content\//i;
const isLocalBridgePreviewUrl = (value) => LOCAL_BRIDGE_PREVIEW_RE.test(String(value ?? "").trim());
const extractUrlOrigin = (value) => normalizeGameOrigin(value);
const isRemoteHttpsUrl = (value) => {
  const text = String(value ?? "").trim();
  if (!text || isLocalBridgePreviewUrl(text)) return false;
  try {
    return new URL(text).protocol === "https:";
  } catch {
    return false;
  }
};
const resolveGameCenterLaunchUrl = (session, options = {}) => {
  const raw = session && typeof session === "object" ? session : {};
  const candidates = [
    raw.resolvedPreviewUrl,
    raw.preview_url,
    raw.open_url,
    ...Array.isArray(raw.candidateUrls) ? raw.candidateUrls : [],
    ...Array.isArray(raw.package_urls) ? raw.package_urls : []
  ];
  for (const candidate of candidates) {
    if (isRemoteHttpsUrl(candidate)) return String(candidate).trim();
  }
  if (options.requireHttps) return "";
  return String(raw.resolvedPreviewUrl || raw.localPreviewUrl || raw.local_preview_url || "").trim();
};
const resolveGameFrameAllowedOrigins = (options = {}) => {
  const origins = [];
  const pushOrigin = (value) => {
    const origin = normalizeGameOrigin(extractUrlOrigin(value));
    if (origin && !origins.includes(origin)) origins.push(origin);
  };
  pushOrigin(options.frameUrl);
  pushOrigin(options.fallbackUrl);
  const extra = Array.isArray(options.extraOrigins) ? options.extraOrigins : [];
  for (const item of extra) {
    const origin = normalizeGameOrigin(item);
    if (!origin) continue;
    if (!isSecureGamePlatformUrl(origin)) continue;
    if (!origins.includes(origin)) origins.push(origin);
  }
  if (options.allowOpaqueOrigin === true && !origins.includes("null")) {
    origins.push("null");
  }
  return origins;
};
const isGameFrameOriginAllowed = (origin, allowList) => {
  const value = String(origin ?? "").trim();
  if (!value) return false;
  const list = Array.isArray(allowList) ? allowList : [];
  if (list.length === 0) return false;
  if (list.includes("*")) return false;
  return list.includes(value);
};
export {
  GAME_CENTER_GAME_IDS as G,
  resolveGameCenterLaunchUrl as a,
  isGameFrameOriginAllowed as i,
  resolveGameFrameAllowedOrigins as r
};
