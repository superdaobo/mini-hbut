var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { br as LOCAL_ERROR_CODES, bs as DEFAULT_GAME_PLATFORM_API_BASE, bt as isSecureGamePlatformUrl, ak as getIdentityAccessToken, bu as GAME_PLATFORM_PROTOCOL_VERSION, bv as GAME_PLATFORM_REQUEST_TIMEOUT_MS, bw as isStatisticsServiceUrlCompatible, bx as orderCandidatesById, by as markGroupSucceeded, bz as markGroupFailed, aZ as getCloudSyncRuntimeConfig, bA as resolveGameBackendCandidates, bB as normalizeBackendFailover, bC as REMOTE_CONFIG_SNAPSHOT_KEY, bD as DEFAULT_GAME_RANK_API, bE as LEGACY_GAME_RANK_NAMESPACE, bF as GAME_RANK_REQUEST_TIMEOUT_MS } from "./app-demo-DztvWo2z.js";
const UNKNOWN_PLAYER_NAME = "湖工学子";
const safeText$2 = (value) => String(value ?? "").trim();
const safeNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};
const firstText = (...values) => {
  for (const value of values) {
    const text = safeText$2(value);
    if (text) return text;
  }
  return "";
};
const resolveEntryKey = (raw, rank) => {
  const ref = safeText$2(raw.player_ref || raw.playerRef);
  if (ref) return ref;
  const name = safeText$2(raw.player_name || raw.playerName);
  return name ? `n:${name}:${rank}` : `rank:${rank}`;
};
const normalizeEntry = (raw, rank, options = {}) => {
  if (!raw || typeof raw !== "object") return null;
  const item = raw;
  const score = safeNumber(item.score ?? item.best_score ?? item.bestScore);
  const maxLevel = safeNumber(item.max_level ?? item.maxLevel ?? item.best_max_level);
  const selfStudentId = safeText$2(options.selfStudentId);
  const rawStudentId = safeText$2(item.student_id || item.studentId);
  const isSelf = item.is_self === true || item.isSelf === true || !!selfStudentId && !!rawStudentId && rawStudentId === selfStudentId;
  const playerName = firstText(item.player_name, item.playerName, isSelf ? options.selfPlayerName : "") || UNKNOWN_PLAYER_NAME;
  return {
    key: resolveEntryKey(item, rank),
    rank: safeNumber(item.rank) || rank,
    playerRef: safeText$2(item.player_ref || item.playerRef),
    playerName,
    score,
    maxLevel,
    metricLabel: firstText(item.metric_label, item.metricLabel),
    isSelf,
    updatedAt: firstText(item.updated_at, item.updatedAt, item.refreshed_at, item.refreshedAt)
  };
};
const sanitizeLeaderboardEntries = (rawEntries, options = {}) => {
  const list = Array.isArray(rawEntries) ? rawEntries : [];
  const output = [];
  list.forEach((item, index) => {
    const entry = normalizeEntry(item, index + 1, options);
    if (entry) output.push(entry);
  });
  return output;
};
const normalizeLegacyLeaderboard = (payload, options = {}) => {
  const body = payload && typeof payload === "object" ? payload : {};
  const entries = sanitizeLeaderboardEntries(body.leaderboard, options);
  const selfEntry = normalizeEntry(body.player, 0, options);
  const player = body.player && typeof body.player === "object" ? body.player : {};
  return {
    board: "classic",
    gameId: firstText(body.game_id, options.gameId),
    scopeApplied: firstText(body.scope, "class"),
    entries,
    self: selfEntry ? {
      ...selfEntry,
      rank: selfEntry.rank || 0,
      classRank: safeNumber(player.class_rank),
      schoolRank: safeNumber(player.school_rank)
    } : null,
    metricLabel: firstText(player.metric_label),
    refreshedAt: firstText(body.refreshed_at)
  };
};
const normalizeGamePlatformLeaderboard = (payload, options = {}) => {
  const body = payload && typeof payload === "object" ? payload : {};
  const metric = body.metric && typeof body.metric === "object" ? body.metric : {};
  const entries = sanitizeLeaderboardEntries(body.entries, options).map((entry, index) => ({
    ...entry,
    rank: entry.rank || index + 1
  }));
  return {
    board: options.board || "classic",
    gameId: firstText(body.game_id, options.gameId),
    scopeApplied: firstText(body.scope_applied, body.scope),
    entries,
    self: null,
    metricLabel: firstText(metric.label),
    refreshedAt: firstText(body.generated_at),
    nextCursor: safeText$2(body.next_cursor)
  };
};
const FEATURE_DISABLED_CODE = "FEATURE_DISABLED";
const GLOBAL_XP_BOARD = "global_xp";
const LEDGER_DEFAULT_LIMIT = 20;
const GLOBAL_RANK_DEFAULT_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;
const safeText$1 = (value) => String(value ?? "").trim();
const safeInt = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : 0;
};
const safeNonNegativeInt = (value) => Math.max(0, safeInt(value));
const safeNullableInt = (value) => {
  if (value === null || value === void 0 || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : null;
};
const clampPageLimit = (value, fallback) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    const fallbackNum = Number(fallback);
    if (!Number.isFinite(fallbackNum) || fallbackNum <= 0) return LEDGER_DEFAULT_LIMIT;
    return Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.trunc(fallbackNum)));
  }
  return Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.trunc(num)));
};
const requirePointsBase = (override) => {
  const base = pickEnvironmentCompatibleBase([safeText$1(override), DEFAULT_GAME_PLATFORM_API_BASE]);
  if (!base || !isSecureGamePlatformUrl(base)) {
    throw new GamePlatformError(LOCAL_ERROR_CODES.configMissing, "积分服务地址未配置（无环境兼容的 API 地址）", {
      retryable: false
    });
  }
  return base;
};
const resolveAccessToken = async () => {
  try {
    return safeText$1(await getIdentityAccessToken());
  } catch {
    return "";
  }
};
const pointsHeaders = (accessToken) => {
  const headers = {
    "X-Game-Platform-Protocol": String(GAME_PLATFORM_PROTOCOL_VERSION)
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
};
const authorizedPointsGet = async (path, options = {}) => {
  const base = requirePointsBase(options.apiBase);
  const accessToken = await resolveAccessToken();
  if (!accessToken) {
    throw new GamePlatformError(LOCAL_ERROR_CODES.authMissing, "当前未登录，无法读取积分数据", {
      retryable: false
    });
  }
  return requestGamePlatformJson(`${base}${path}`, {
    headers: pointsHeaders(accessToken),
    timeoutMs: options.timeoutMs
  });
};
const publicPointsGet = async (path, options = {}) => {
  const base = requirePointsBase(options.apiBase);
  const accessToken = await resolveAccessToken();
  return requestGamePlatformJson(`${base}${path}`, {
    headers: pointsHeaders(accessToken),
    timeoutMs: options.timeoutMs
  });
};
const unwrapBody = (payload, keys = []) => {
  const body = payload && typeof payload === "object" ? payload : {};
  for (const key of keys) {
    const candidate = body[key];
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return candidate;
    }
  }
  const data = body.data;
  if (data && typeof data === "object" && !Array.isArray(data)) return data;
  return body;
};
const pickRecord = (value) => value && typeof value === "object" ? value : {};
const normalizePointsWallet = (payload) => {
  const body = unwrapBody(payload, ["wallet"]);
  const curve = pickRecord(body.level_curve ?? body.levelCurve);
  const today = pickRecord(body.today);
  const dailyCaps = pickRecord(body.daily_caps ?? body.dailyCaps);
  return {
    playerRef: safeText$1(body.player_ref ?? body.playerRef),
    xpTotal: safeNonNegativeInt(body.xp_total ?? body.xpTotal ?? body.xp),
    level: safeNonNegativeInt(body.level ?? curve.level),
    levelCurve: {
      xpIntoLevel: safeNonNegativeInt(curve.xp_into_level ?? curve.xpIntoLevel),
      xpForNext: safeNonNegativeInt(curve.xp_for_next ?? curve.xpForNext),
      xpSpan: safeNonNegativeInt(curve.xp_span ?? curve.xpSpan)
    },
    coinBalance: safeNonNegativeInt(body.coin_balance ?? body.coinBalance ?? body.coins),
    today: {
      date: safeText$1(today.date),
      xpGained: safeNonNegativeInt(today.xp_gained ?? today.xpGained),
      coinGained: safeNonNegativeInt(today.coin_gained ?? today.coinGained),
      runCount: safeNonNegativeInt(today.run_count ?? today.runCount)
    },
    dailyCaps: {
      xpCap: safeNullableInt(dailyCaps.xp_cap ?? dailyCaps.xpCap),
      coinCap: safeNullableInt(dailyCaps.coin_cap ?? dailyCaps.coinCap),
      runCap: safeNullableInt(dailyCaps.run_cap ?? dailyCaps.runCap)
    },
    ruleVersion: safeText$1(body.rule_version ?? body.ruleVersion),
    economyEnabled: body.economy_enabled === true || body.economyEnabled === true
  };
};
const levelProgressPercent = (curve) => {
  const span = safeNonNegativeInt(curve?.xpSpan);
  if (span <= 0) return 0;
  const into = safeNonNegativeInt(curve?.xpIntoLevel);
  return Math.min(100, Math.max(0, Math.round(into / span * 100)));
};
const taskProgressPercent = (progress, target) => {
  const targetNum = safeNonNegativeInt(target);
  if (targetNum <= 0) return 0;
  const progressNum = safeNonNegativeInt(progress);
  return Math.min(100, Math.max(0, Math.round(progressNum / targetNum * 100)));
};
const normalizePointsDailyTasks = (payload) => {
  const body = unwrapBody(payload, ["daily_tasks"]);
  const rawTasks = Array.isArray(body.tasks) ? body.tasks : [];
  const tasks = [];
  for (const raw of rawTasks) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw;
    const taskId = safeText$1(item.task_id ?? item.taskId);
    if (!taskId) continue;
    tasks.push({
      taskId,
      title: safeText$1(item.title),
      target: safeNonNegativeInt(item.target),
      progress: safeNonNegativeInt(item.progress),
      completed: item.completed === true,
      rewardXp: safeNonNegativeInt(item.reward_xp ?? item.rewardXp),
      rewardCoin: safeNonNegativeInt(item.reward_coin ?? item.rewardCoin),
      rewardStatus: safeText$1(item.reward_status ?? item.rewardStatus)
    });
  }
  return {
    date: safeText$1(body.date),
    tasks,
    ruleVersion: safeText$1(body.rule_version ?? body.ruleVersion),
    everydayResetAt: safeText$1(body.everyday_reset_at ?? body.everydayResetAt)
  };
};
const ledgerEntryKey = (item, index) => {
  const entryId = safeText$1(item.entry_id ?? item.entryId);
  if (entryId) return entryId;
  const reason = safeText$1(item.reason_code ?? item.reasonCode) || "entry";
  const createdAt = safeText$1(item.created_at ?? item.createdAt) || "unknown";
  return `seq:${reason}:${createdAt}:${index}`;
};
const normalizePointsLedger = (payload) => {
  const body = unwrapBody(payload, ["ledger"]);
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = [];
  rawItems.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const item = raw;
    items.push({
      key: ledgerEntryKey(item, index),
      entryType: safeText$1(item.entry_type ?? item.entryType),
      reasonCode: safeText$1(item.reason_code ?? item.reasonCode),
      xpDelta: safeInt(item.xp_delta ?? item.xpDelta),
      coinDelta: safeInt(item.coin_delta ?? item.coinDelta),
      createdAt: safeText$1(item.created_at ?? item.createdAt)
    });
  });
  return {
    items,
    nextCursor: safeText$1(body.next_cursor ?? body.nextCursor),
    ruleVersion: safeText$1(body.rule_version ?? body.ruleVersion)
  };
};
const normalizeRankRow = (raw, fallbackRank, selfRef) => {
  if (!raw || typeof raw !== "object") return null;
  const item = raw;
  const playerRef = safeText$1(item.player_ref ?? item.playerRef);
  const displayName = safeText$1(item.display_name ?? item.displayName) || UNKNOWN_PLAYER_NAME;
  return {
    rank: safeNonNegativeInt(item.rank) || safeNonNegativeInt(fallbackRank),
    playerRef,
    displayName,
    xpTotal: safeNonNegativeInt(item.xp_total ?? item.xpTotal),
    level: safeNonNegativeInt(item.level),
    isSelf: !!selfRef && !!playerRef && playerRef === selfRef
  };
};
const normalizeGlobalXpBoard = (payload) => {
  const body = unwrapBody(payload, ["leaderboard"]);
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const rawMe = body.me ?? null;
  const meShape = rawMe && typeof rawMe === "object" ? rawMe : null;
  const selfRef = meShape ? safeText$1(meShape.player_ref ?? meShape.playerRef) : "";
  const items = [];
  rawItems.forEach((raw, index) => {
    const row = normalizeRankRow(raw, index + 1, selfRef);
    if (row) items.push(row);
  });
  return {
    board: safeText$1(body.board) || GLOBAL_XP_BOARD,
    seasonId: safeText$1(body.season_id ?? body.seasonId),
    items,
    me: normalizeRankRow(rawMe, 0, selfRef),
    nextCursor: safeText$1(body.next_cursor ?? body.nextCursor),
    ruleVersion: safeText$1(body.rule_version ?? body.ruleVersion),
    generatedAt: safeText$1(body.generated_at ?? body.generatedAt)
  };
};
const mergeGlobalRankRows = (existing, incoming) => {
  const seen = /* @__PURE__ */ new Set();
  const output = [];
  for (const row of [...existing, ...incoming]) {
    const key = row.playerRef || `rank:${row.rank}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(row);
  }
  return output;
};
const mergeLedgerEntries = (existing, incoming) => {
  const seen = /* @__PURE__ */ new Set();
  const output = [];
  for (const entry of [...existing, ...incoming]) {
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    output.push(entry);
  }
  return output;
};
const LEDGER_REASON_I18N_KEYS = Object.freeze({
  run_settled: "gameCenter.points.reason.runSettled",
  daily_cap_applied: "gameCenter.points.reason.dailyCapApplied",
  reward_disabled: "gameCenter.points.reason.rewardDisabled",
  bottle_create: "gameCenter.points.reason.bottleCreate",
  bottle_claim: "gameCenter.points.reason.bottleClaim",
  bottle_expired: "gameCenter.points.reason.bottleExpired",
  bottle_self_claim_rejected: "gameCenter.points.reason.bottleSelfClaimRejected",
  season_finalized: "gameCenter.points.reason.seasonFinalized",
  admin_manual: "gameCenter.points.reason.adminManual"
});
const LEDGER_ENTRY_TYPE_I18N_KEYS = Object.freeze({
  reward: "gameCenter.points.entryType.reward",
  quest_reward: "gameCenter.points.entryType.questReward",
  season_reward: "gameCenter.points.entryType.seasonReward",
  escrow_hold: "gameCenter.points.entryType.escrowHold",
  escrow_release: "gameCenter.points.entryType.escrowRelease",
  escrow_refund: "gameCenter.points.entryType.escrowRefund",
  penalty: "gameCenter.points.entryType.penalty",
  admin_adjust: "gameCenter.points.entryType.adminAdjust"
});
const DAILY_TASK_TITLE_I18N_KEYS = Object.freeze({
  daily_play_1: "gameCenter.points.task.dailyPlay1",
  daily_play_3: "gameCenter.points.task.dailyPlay3",
  daily_play_distinct_3: "gameCenter.points.task.dailyDistinct3"
});
const REWARD_STATUS_I18N_KEYS = Object.freeze({
  granted: "gameCenter.points.rewardGranted",
  capped: "gameCenter.points.rewardCapped",
  disabled: "gameCenter.points.rewardDisabled",
  none: "gameCenter.points.rewardNone",
  zero: "gameCenter.points.rewardZero"
});
const POINTS_AUTH_ERROR_CODES = Object.freeze([
  LOCAL_ERROR_CODES.authMissing,
  "AUTH_REQUIRED",
  "GAME_SESSION_EXPIRED",
  "UNAUTHORIZED"
]);
const isPointsAuthError = (error) => POINTS_AUTH_ERROR_CODES.includes(safeText$1(error?.code));
const isPointsFeatureDisabled = (error) => safeText$1(error?.code) === FEATURE_DISABLED_CODE;
const i18nKeyFor = (table, code) => table[safeText$1(code)] || "";
const ledgerReasonI18nKey = (reasonCode) => i18nKeyFor(LEDGER_REASON_I18N_KEYS, reasonCode);
const ledgerEntryTypeI18nKey = (entryType) => i18nKeyFor(LEDGER_ENTRY_TYPE_I18N_KEYS, entryType);
const dailyTaskTitleI18nKey = (taskId) => i18nKeyFor(DAILY_TASK_TITLE_I18N_KEYS, taskId);
const rewardStatusI18nKey = (rewardStatus) => i18nKeyFor(REWARD_STATUS_I18N_KEYS, rewardStatus);
const formatPointsTimestamp = (value) => {
  const text = safeText$1(value);
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const formatDelta = (value) => {
  const num = safeInt(value);
  return num > 0 ? `+${num}` : String(num);
};
const fetchPointsWallet = async (options = {}) => normalizePointsWallet(await authorizedPointsGet("/me/wallet", options));
const fetchPointsDailyTasks = async (options = {}) => normalizePointsDailyTasks(await authorizedPointsGet("/me/daily-tasks", options));
const fetchPointsLedger = async (options = {}) => {
  const params = new URLSearchParams();
  params.set("limit", String(clampPageLimit(options.limit, LEDGER_DEFAULT_LIMIT)));
  const cursor = safeText$1(options.cursor);
  if (cursor) params.set("cursor", cursor);
  return normalizePointsLedger(
    await authorizedPointsGet(`/me/wallet/ledger?${params.toString()}`, options)
  );
};
const fetchGlobalXpLeaderboard = async (options = {}) => {
  const params = new URLSearchParams();
  params.set("board", GLOBAL_XP_BOARD);
  params.set("limit", String(clampPageLimit(options.limit, GLOBAL_RANK_DEFAULT_LIMIT)));
  const cursor = safeText$1(options.cursor);
  if (cursor) params.set("cursor", cursor);
  return normalizeGlobalXpBoard(
    await publicPointsGet(`/leaderboards?${params.toString()}`, options)
  );
};
class GamePlatformError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    __publicField(this, "code");
    __publicField(this, "retryable");
    __publicField(this, "httpStatus");
    __publicField(this, "requestId");
    /**
     * S2：服务端顶层 `error.code`（大类）。当细粒度机器码 `error.details.error_code`
     * 存在时 `code` 取细粒度码，本字段保留顶层码供诊断（不丢信息）。
     */
    __publicField(this, "envelopeCode");
    this.name = "GamePlatformError";
    this.code = code;
    this.retryable = options.retryable === true;
    this.httpStatus = Number(options.httpStatus || 0);
    this.requestId = String(options.requestId || "");
    this.envelopeCode = String(options.envelopeCode || "");
  }
}
const safeText = (value) => String(value ?? "").trim();
const REQUEST_ID_HEADER = "X-Request-Id";
const createRequestId = () => {
  const bytes = new Uint8Array(16);
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.getRandomValues === "function") {
    cryptoRef.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return `req_${hex}`;
};
const readProvidedRequestId = (headers) => {
  if (!headers) return "";
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === "x-request-id") return safeText(headers[key]);
  }
  return "";
};
const pickEnvironmentCompatibleBase = (candidates) => {
  for (const candidate of candidates) {
    const text = safeText(candidate).replace(/\/+$/, "");
    if (!text) continue;
    if (!isSecureGamePlatformUrl(text)) continue;
    if (!isStatisticsServiceUrlCompatible(text)) continue;
    return text;
  }
  return "";
};
const readRemoteConfigSnapshotSafe = () => {
  try {
    const raw = localStorage.getItem(REMOTE_CONFIG_SNAPSHOT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};
const resolveGameBackendCandidateList = (gamePlatformApiBaseOverride) => {
  const snapshot = readRemoteConfigSnapshotSafe();
  const gamePlatformBlock = snapshot?.game_platform && typeof snapshot.game_platform === "object" ? snapshot.game_platform : {};
  let runtime = null;
  try {
    runtime = getCloudSyncRuntimeConfig();
  } catch {
    runtime = null;
  }
  const explicit = safeText(gamePlatformApiBaseOverride);
  return resolveGameBackendCandidates({
    backend: snapshot?.backend,
    gamePlatformApiBase: explicit || gamePlatformBlock?.api_base || gamePlatformBlock?.apiBase,
    includeGroups: runtime?.useRemoteConfig !== false,
    cloudSyncEndpoint: runtime?.proxyEndpoint || runtime?.endpoint
  });
};
const resolveGamePlatformApiBase = (override) => {
  const candidates = resolveGameBackendCandidateList(override);
  return candidates[0]?.apiBase || pickEnvironmentCompatibleBase([DEFAULT_GAME_PLATFORM_API_BASE]);
};
const deriveLegacyRankBaseFromCloudSync = (endpoint) => {
  const text = safeText(endpoint).replace(/\/+$/, "");
  if (!text) return "";
  const stripped = text.replace(/\/api\/cloud-sync$/i, "").replace(/\/cloud-sync$/i, "");
  return `${stripped}${LEGACY_GAME_RANK_NAMESPACE}`;
};
const resolveGameRankApiBase = () => {
  const candidates = resolveGameBackendCandidateList();
  const fromGroups = candidates[0]?.rankApi;
  if (fromGroups) return fromGroups;
  const legacyCandidates = [];
  try {
    const runtime = getCloudSyncRuntimeConfig();
    const endpoint = safeText(runtime?.proxyEndpoint || runtime?.endpoint);
    if (endpoint) legacyCandidates.push(deriveLegacyRankBaseFromCloudSync(endpoint));
  } catch {
  }
  legacyCandidates.push(DEFAULT_GAME_RANK_API);
  return pickEnvironmentCompatibleBase(legacyCandidates);
};
const isGameFailoverWorthy = (error) => {
  if (!(error instanceof GamePlatformError)) return false;
  if (error.httpStatus >= 400) return error.httpStatus >= 500;
  return error.code === LOCAL_ERROR_CODES.transportFailed;
};
const resolveGameFailoverConfig = () => {
  const snapshot = readRemoteConfigSnapshotSafe();
  const backend = snapshot?.backend && typeof snapshot.backend === "object" ? snapshot.backend : void 0;
  return normalizeBackendFailover(backend?.failover);
};
const withGameCandidateFailover = async (run, apiBaseOverride) => {
  const candidates = resolveGameBackendCandidateList(apiBaseOverride);
  if (candidates.length === 0) {
    throw new GamePlatformError(
      LOCAL_ERROR_CODES.configMissing,
      "游戏服务未配置（无环境兼容的 API 地址）",
      { retryable: false }
    );
  }
  const failover = resolveGameFailoverConfig();
  const order = orderCandidatesById(candidates, (candidate) => candidate.failoverKey, failover);
  let lastError = null;
  for (const candidate of order) {
    try {
      const result = await run(candidate);
      markGroupSucceeded(candidate.failoverKey);
      return result;
    } catch (error) {
      if (!isGameFailoverWorthy(error)) throw error;
      markGroupFailed(candidate.failoverKey, failover);
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new GamePlatformError(LOCAL_ERROR_CODES.transportFailed, "游戏服务不可用", {
    retryable: true
  });
};
const buildTimeoutSignal = (timeoutMs) => {
  if (typeof AbortController !== "function") return { signal: void 0, clear: () => {
  } };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
};
const parseEnvelopeError = (payload, httpStatus) => {
  const body = payload && typeof payload === "object" ? payload : {};
  const error = body.error;
  if (error && typeof error === "object") {
    const shaped = error;
    const details = shaped.details && typeof shaped.details === "object" ? shaped.details : {};
    const envelopeCode = safeText(shaped.code);
    const detailCode = typeof details.error_code === "string" ? safeText(details.error_code) : "";
    const code = detailCode || envelopeCode;
    if (code) {
      return {
        code,
        message: safeText(shaped.message) || "游戏服务暂时不可用",
        retryable: shaped.retryable === true,
        request_id: safeText(shaped.request_id),
        envelope_code: envelopeCode
      };
    }
  }
  if (typeof error === "string" && error) {
    return { code: `HTTP_${httpStatus}`, message: error, retryable: httpStatus >= 500 };
  }
  return null;
};
const requestGamePlatformJson = async (url, options = {}) => {
  const target = safeText(url);
  if (!isSecureGamePlatformUrl(target)) {
    throw new GamePlatformError(LOCAL_ERROR_CODES.transportInsecure, "游戏服务地址不安全，已拒绝连接", {
      retryable: false
    });
  }
  const providedRequestId = readProvidedRequestId(options.headers);
  const clientRequestId = providedRequestId || createRequestId();
  const { signal, clear } = buildTimeoutSignal(options.timeoutMs || GAME_PLATFORM_REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(target, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        ...options.body !== void 0 ? { "Content-Type": "application/json" } : {},
        ...options.headers || {},
        // 仅在调用方未提供时注入（展开顺序保证调用方的同名头不被覆盖）
        ...providedRequestId ? {} : { [REQUEST_ID_HEADER]: clientRequestId }
      },
      body: options.body !== void 0 ? JSON.stringify(options.body) : void 0,
      cache: "no-store",
      signal
    });
  } catch (error) {
    const aborted = error?.name === "AbortError";
    throw new GamePlatformError(
      LOCAL_ERROR_CODES.transportFailed,
      aborted ? "游戏服务请求超时，请稍后重试" : "游戏服务连接失败，请检查网络",
      { retryable: true, requestId: clientRequestId }
    );
  } finally {
    clear();
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const shapedError = parseEnvelopeError(payload, response.status);
  if (shapedError) {
    throw new GamePlatformError(shapedError.code, shapedError.message, {
      retryable: shapedError.retryable,
      httpStatus: response.status,
      // 服务端返回值优先（复用模式下与客户端发送值相同），回退客户端生成值
      requestId: shapedError.request_id || clientRequestId,
      envelopeCode: shapedError.envelope_code
    });
  }
  if (!response.ok) {
    throw new GamePlatformError(`HTTP_${response.status}`, "游戏服务暂时不可用", {
      retryable: response.status >= 500,
      httpStatus: response.status,
      requestId: clientRequestId
    });
  }
  if (!payload || typeof payload !== "object") {
    throw new GamePlatformError(LOCAL_ERROR_CODES.responseInvalid, "游戏服务返回内容异常", {
      retryable: false,
      httpStatus: response.status,
      requestId: clientRequestId
    });
  }
  return payload;
};
const gamePlatformHeaders = (extra = {}) => ({
  "X-Game-Platform-Protocol": String(GAME_PLATFORM_PROTOCOL_VERSION),
  ...extra
});
const GAME_PLATFORM_CAPABILITY_KEYS = Object.freeze([
  /** V2 榜读取端点 `GET /leaderboards`（Verified 赛季榜） */
  "leaderboards",
  /** `GET /me/wallet` 钱包流水（等级 / XP / 湖工币） */
  "wallet",
  /** 每日任务（对应 flag `game_daily_tasks_enabled`） */
  "daily_tasks",
  /** 五子棋竞技（对应 flag `gomoku_competitive_enabled`） */
  "gomoku_match",
  /** 漂流瓶 UGC（对应 flag `drift_bottle_enabled`） */
  "drift_bottle",
  /** 可信结算发奖（对应 flag `verified_reward_enabled`） */
  "verified_reward"
]);
const EMPTY_GAME_PLATFORM_CAPABILITIES = Object.freeze({
  leaderboards: false,
  wallet: false,
  daily_tasks: false,
  gomoku_match: false,
  drift_bottle: false,
  verified_reward: false
});
const GAME_PLATFORM_CAPABILITY_ALIASES = Object.freeze({
  leaderboards: ["leaderboards", "leaderboard", "leaderboards_enabled"],
  wallet: ["wallet", "me_wallet", "wallet_enabled"],
  daily_tasks: ["daily_tasks", "dailyTasks", "daily_tasks_enabled", "game_daily_tasks"],
  gomoku_match: [
    "gomoku_match",
    "gomokuMatch",
    "gomoku_competitive",
    "gomokuCompetitive",
    "gomoku_competitive_enabled",
    "competitive_gomoku"
  ],
  drift_bottle: ["drift_bottle", "driftBottle", "drift_bottle_enabled"],
  verified_reward: ["verified_reward", "verifiedReward", "verified_rewards", "verified_reward_enabled"]
});
const toCapabilityBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  if (typeof value === "string") {
    const text = safeText(value).toLowerCase();
    if (["true", "on", "enabled", "yes", "available", "implemented"].includes(text)) return true;
    if (["false", "off", "disabled", "no", "unavailable", "not_implemented", "missing"].includes(text)) {
      return false;
    }
  }
  return null;
};
const readGamePlatformCapabilities = (meta) => {
  const payload = meta && typeof meta === "object" ? meta : {};
  const scope = payload.capabilities && typeof payload.capabilities === "object" ? payload.capabilities : null;
  const values = { ...EMPTY_GAME_PLATFORM_CAPABILITIES };
  const declared = [];
  if (!scope) return { values, declared };
  for (const key of GAME_PLATFORM_CAPABILITY_KEYS) {
    for (const alias of GAME_PLATFORM_CAPABILITY_ALIASES[key]) {
      if (!Object.prototype.hasOwnProperty.call(scope, alias)) continue;
      const parsed = toCapabilityBoolean(scope[alias]);
      if (parsed === null) continue;
      values[key] = parsed;
      declared.push(key);
      break;
    }
  }
  return { values, declared };
};
const fetchGamePlatformMeta = async (apiBase, timeoutMs = GAME_PLATFORM_REQUEST_TIMEOUT_MS) => {
  const payload = await withGameCandidateFailover(
    (candidate) => requestGamePlatformJson(`${candidate.apiBase}/meta`, {
      headers: gamePlatformHeaders(),
      timeoutMs
    }),
    apiBase
  );
  const range = payload.protocol_version && typeof payload.protocol_version === "object" ? payload.protocol_version : null;
  const registry = payload.registry && typeof payload.registry === "object" ? payload.registry : null;
  const capabilities = readGamePlatformCapabilities(payload);
  return {
    protocolVersion: range ? { min: Number(range.min) || 0, max: Number(range.max) || 0 } : null,
    serverVersion: safeText(payload.server_version),
    features: payload.features && typeof payload.features === "object" ? payload.features : {},
    capabilities: capabilities.values,
    capabilitiesDeclared: capabilities.declared,
    registryGames: Number(registry?.games) || 0,
    raw: payload
  };
};
const fetchGameLaunchTicket = async (options) => {
  const accessToken = await getIdentityAccessToken();
  if (!accessToken) {
    return {
      ticket: "",
      expiresAt: "",
      error: new GamePlatformError(LOCAL_ERROR_CODES.authMissing, "当前未登录，无法领取游戏凭据", {
        retryable: false
      })
    };
  }
  const idempotencyKey = safeText(options.idempotencyKey) || createIdempotencyKey();
  try {
    const payload = await withGameCandidateFailover(
      (candidate) => requestGamePlatformJson(`${candidate.apiBase}/tickets`, {
        method: "POST",
        headers: gamePlatformHeaders({
          Authorization: `Bearer ${accessToken}`,
          "Idempotency-Key": idempotencyKey
        }),
        body: {
          protocol_version: GAME_PLATFORM_PROTOCOL_VERSION,
          game_id: safeText(options.gameId)
        },
        timeoutMs: options.timeoutMs
      }),
      options.apiBase
    );
    return {
      ticket: safeText(payload.ticket),
      expiresAt: safeText(payload.expires_at)
    };
  } catch (error) {
    return {
      ticket: "",
      expiresAt: "",
      error: error instanceof GamePlatformError ? error : new GamePlatformError(LOCAL_ERROR_CODES.transportFailed, "游戏凭据领取失败", {
        retryable: true
      })
    };
  }
};
const createIdempotencyKey = () => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(24);
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.getRandomValues === "function") {
    cryptoRef.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  let output = "";
  for (const byte of bytes) output += alphabet[byte % alphabet.length];
  return `idem-${Date.now().toString(36)}-${output}`;
};
const authorizedGet = async (path, apiBase, timeoutMs = GAME_PLATFORM_REQUEST_TIMEOUT_MS) => {
  const accessToken = await getIdentityAccessToken();
  if (!accessToken) {
    throw new GamePlatformError(LOCAL_ERROR_CODES.authMissing, "当前未登录，无法读取游戏数据", {
      retryable: false
    });
  }
  return withGameCandidateFailover(
    (candidate) => requestGamePlatformJson(`${candidate.apiBase}${path}`, {
      headers: gamePlatformHeaders({ Authorization: `Bearer ${accessToken}` }),
      timeoutMs
    }),
    apiBase
  );
};
const fetchGamePlayerWallet = async (apiBase) => authorizedGet("/me/wallet", apiBase);
const fetchGameLeaderboards = async (query) => {
  const params = new URLSearchParams();
  params.set("game_id", safeText(query.gameId));
  params.set("board", safeText(query.board));
  params.set("scope", safeText(query.scope));
  params.set("limit", String(Math.min(Math.max(Number(query.limit) || 20, 1), 100)));
  if (safeText(query.cursor)) params.set("cursor", safeText(query.cursor));
  return withGameCandidateFailover(
    (candidate) => requestGamePlatformJson(
      `${candidate.apiBase}/leaderboards?${params.toString()}`,
      {
        headers: gamePlatformHeaders(),
        timeoutMs: GAME_PLATFORM_REQUEST_TIMEOUT_MS
      }
    ),
    query.apiBase
  );
};
const fetchClassicLeaderboard = async (query) => {
  const params = new URLSearchParams({
    game_id: safeText(query.gameId),
    scope: safeText(query.scope) || "class",
    limit: String(Math.min(Math.max(Number(query.limit) || 20, 1), 100))
  });
  const studentId = safeText(query.studentId);
  const className = safeText(query.className);
  const schoolName = safeText(query.schoolName);
  if (studentId) params.set("student_id", studentId);
  if (className) params.set("class_name", className);
  if (schoolName) params.set("school_name", schoolName);
  const runOnBase = (base) => requestGamePlatformJson(`${base}/leaderboard?${params.toString()}`, {
    timeoutMs: GAME_RANK_REQUEST_TIMEOUT_MS
  });
  const explicitRank = safeText(query.apiBase).replace(/\/+$/, "");
  const candidates = resolveGameBackendCandidateList();
  const mirrored = !!explicitRank && candidates.some((candidate) => candidate.rankApi === explicitRank);
  if (explicitRank && !mirrored) {
    if (!isSecureGamePlatformUrl(explicitRank) || !isStatisticsServiceUrlCompatible(explicitRank)) {
      throw new GamePlatformError(
        LOCAL_ERROR_CODES.transportInsecure,
        "经典排行榜服务地址不安全或与环境不兼容，已拒绝连接",
        { retryable: false }
      );
    }
    return runOnBase(explicitRank);
  }
  return withGameCandidateFailover((candidate) => runOnBase(candidate.rankApi));
};
let pendingModuleId = "";
const requestGameOpen = (moduleId) => {
  const id = String(moduleId ?? "").trim();
  if (!id) return false;
  pendingModuleId = id;
  return true;
};
const consumeGameOpen = () => {
  const id = pendingModuleId;
  pendingModuleId = "";
  return id;
};
const peekGameOpen = () => pendingModuleId;
export {
  fetchGamePlatformMeta as A,
  fetchClassicLeaderboard as B,
  normalizeLegacyLeaderboard as C,
  fetchGameLeaderboards as D,
  EMPTY_GAME_PLATFORM_CAPABILITIES as E,
  normalizeGamePlatformLeaderboard as F,
  GamePlatformError as G,
  LEDGER_DEFAULT_LIMIT as L,
  resolveGameRankApiBase as a,
  requestGameOpen as b,
  consumeGameOpen as c,
  fetchPointsDailyTasks as d,
  fetchGameLaunchTicket as e,
  fetchPointsWallet as f,
  createIdempotencyKey as g,
  requestGamePlatformJson as h,
  isPointsFeatureDisabled as i,
  isPointsAuthError as j,
  dailyTaskTitleI18nKey as k,
  GLOBAL_RANK_DEFAULT_LIMIT as l,
  fetchGlobalXpLeaderboard as m,
  mergeGlobalRankRows as n,
  formatPointsTimestamp as o,
  peekGameOpen as p,
  formatDelta as q,
  resolveGamePlatformApiBase as r,
  fetchPointsLedger as s,
  taskProgressPercent as t,
  levelProgressPercent as u,
  rewardStatusI18nKey as v,
  ledgerReasonI18nKey as w,
  ledgerEntryTypeI18nKey as x,
  mergeLedgerEntries as y,
  fetchGamePlayerWallet as z
};
