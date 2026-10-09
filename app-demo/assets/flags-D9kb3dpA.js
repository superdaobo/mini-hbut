import { bG as normalizeGameOrigin, bt as isSecureGamePlatformUrl, bI as normalizeGameInstallId, bJ as normalizeGamePlatformConfig, bK as GAME_CENTER_FLAG_KEYS, bL as toFlagBoolean, bH as DEFAULT_GAME_CENTER_FLAGS, bM as canaryRequiresBucket, bN as evaluateGamePlatformCanary, bs as DEFAULT_GAME_PLATFORM_API_BASE } from "./app-demo-DztvWo2z.js";
import { h as getFeaturePolicy } from "./more-modules-yxgAg-Rh.js";
import { ab as normalizeStudentId } from "./runtime-bridge-gQMtwwk6.js";
import { r as resolveGamePlatformApiBase } from "./pending_open-CJJALk6R.js";
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
const GAME_PLATFORM_INSTALL_ID_KEY = "hbu_game_install_id";
const readStoredInstallId = () => {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return { available: false, value: "" };
    const raw = storage.getItem(GAME_PLATFORM_INSTALL_ID_KEY);
    if (raw === null) return { available: true, value: "" };
    const normalized = normalizeGameInstallId(raw);
    return normalized ? { available: true, value: normalized } : { available: false, value: "" };
  } catch {
    return { available: false, value: "" };
  }
};
const persistInstallId = (id) => {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(GAME_PLATFORM_INSTALL_ID_KEY, id);
    return normalizeGameInstallId(storage.getItem(GAME_PLATFORM_INSTALL_ID_KEY)) === id;
  } catch {
    return false;
  }
};
const generateInstallId = () => {
  try {
    const cryptoObj = globalThis.crypto;
    if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      cryptoObj.getRandomValues(bytes);
      return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
  } catch {
  }
  let hex = "";
  while (hex.length < 32) {
    hex += Math.floor(Math.random() * 4294967296).toString(16).padStart(8, "0");
  }
  return hex.slice(0, 32);
};
const getOrCreateGameInstallId = () => {
  const stored = readStoredInstallId();
  if (!stored.available) return "";
  if (stored.value) return stored.value;
  const generated = generateInstallId();
  if (!normalizeGameInstallId(generated)) return "";
  if (!persistInstallId(generated)) return "";
  return generated;
};
const readGameClientVersion = () => {
  try {
    return String("1.4.12").trim().replace(/^v/i, "");
  } catch {
    return "";
  }
};
const readCurrentCanaryStudentId = () => {
  try {
    return normalizeStudentId(globalThis.localStorage?.getItem("hbu_username"));
  } catch {
    return "";
  }
};
const resolveGameCenterFlags = (config, canaryContext) => {
  const block = normalizeGamePlatformConfig(config?.game_platform);
  const flags = {};
  for (const key of GAME_CENTER_FLAG_KEYS) {
    flags[key] = toFlagBoolean(block.flags[key], DEFAULT_GAME_CENTER_FLAGS[key]);
  }
  const canary = block.canary;
  const appVersion = canary !== null ? readGameClientVersion() : "";
  const studentId = canary !== null ? readCurrentCanaryStudentId() : "";
  const installId = canary !== null && canaryRequiresBucket(canary, appVersion, studentId) ? getOrCreateGameInstallId() : "";
  const canaryDecision = evaluateGamePlatformCanary({ canary, appVersion, studentId, installId });
  const effectiveEnabled = block.enabled && canaryDecision.included;
  if (block.canary_typo_keys.length > 0) {
    flags.canary_typo_keys = [...block.canary_typo_keys];
  }
  flags.api_base = resolveGamePlatformApiBase(block.api_base) || DEFAULT_GAME_PLATFORM_API_BASE;
  flags.allowed_game_origins = effectiveEnabled ? [...block.allowed_game_origins] : [];
  if (!effectiveEnabled) {
    flags.game_center_enabled = false;
    flags.game_verified_session_enabled = false;
    flags.game_economy_enabled = false;
    flags.drift_bottle_enabled = false;
    flags.game_daily_tasks_enabled = false;
    flags.gomoku_competitive_enabled = false;
    flags.verified_reward_enabled = false;
  }
  return flags;
};
const applyGameCenterPolicyClamp = (flags, policy = getFeaturePolicy()) => {
  const next = { ...flags };
  const remoteModulesAllowed = policy.remoteCode || policy.remoteModules;
  if (!remoteModulesAllowed) {
    next.game_center_enabled = false;
    next.game_verified_session_enabled = false;
    next.classic_game_entries_visible = false;
    next.gomoku_competitive_enabled = false;
    next.game_daily_tasks_enabled = false;
    next.verified_reward_enabled = false;
  }
  if (!policy.userGeneratedContent) {
    next.drift_bottle_enabled = false;
  }
  if (!policy.ranking) {
    next.game_verified_session_enabled = false;
    next.gomoku_competitive_enabled = false;
  }
  if (!remoteModulesAllowed || !policy.userGeneratedContent || !policy.ranking) {
    next.game_economy_enabled = false;
    next.game_daily_tasks_enabled = false;
    next.verified_reward_enabled = false;
  }
  return next;
};
const resolveEffectiveGameCenterFlags = (config, policy = getFeaturePolicy(), canaryContext) => applyGameCenterPolicyClamp(resolveGameCenterFlags(config), policy);
export {
  GAME_CENTER_GAME_IDS as G,
  resolveGameFrameAllowedOrigins as a,
  resolveGameCenterLaunchUrl as b,
  isGameFrameOriginAllowed as i,
  resolveEffectiveGameCenterFlags as r
};
