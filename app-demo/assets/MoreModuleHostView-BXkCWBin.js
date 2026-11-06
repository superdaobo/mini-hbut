const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./school_website_embed-CiQo9Khf.js","./runtime-bridge-DUXlIKPv.js","./more-modules-db_bOw0h.js","./vue-core-CVT-P0lT.js"])))=>i.map(i=>d[i]);
import { d as invokeNative, p as pushDebugLog, _ as __vitePreload, C as isIOSLike } from "./runtime-bridge-DUXlIKPv.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-DPr8J7w0.js";
import { bL as normalizeGameOrigin, _ as _export_sfc, bM as DEFAULT_GAME_CENTER_FLAGS, u as useAuthStore, o as openExternal, ar as fetchRemoteConfig, bx as DEFAULT_GAME_PLATFORM_API_BASE } from "./app-demo-CodE0ahH.js";
import { T as TEmptyState } from "./TEmptyState-DnVlNmfI.js";
import { e as t, f as canUseLocalModuleBridgePreview, h as isLocalModuleBridgePreviewUrl, M as isLocalModuleContentOrigin, r as resolveModuleHostPreviewSource } from "./more-modules-db_bOw0h.js";
import { i as isGameFrameOriginAllowed, r as resolveEffectiveGameCenterFlags, a as resolveGameFrameAllowedOrigins, b as resolveGameCenterLaunchUrl, G as GAME_CENTER_GAME_IDS } from "./flags-qDAat1FD.js";
import { b as requestGameOpen, f as fetchPointsWallet, d as fetchPointsDailyTasks, e as fetchGameLaunchTicket } from "./pending_open-Bso8hxhl.js";
import { a as appendModuleEnvQueryParams, r as resolveBuildAppVersion } from "./module_context-DDKMBaYO.js";
import { r as ref, x as watch, o as onMounted, p as onBeforeUnmount, a as openBlock, c as createElementBlock, k as createVNode, l as withCtx, b as createBaseVNode, u as unref, n as normalizeClass, d as createCommentVNode, g as createTextVNode, t as toDisplayString, h as computed } from "./vue-core-CVT-P0lT.js";
import "./debug-tools-DWdtdnWE.js";
import "./capture-D1raLrKF.js";
const computeGrantedCapabilities = (previousGranted, requested, options = {}) => {
  const requestedList = Array.isArray(requested) ? Array.from(new Set(requested.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))) : [];
  const previousList = Array.isArray(previousGranted) ? Array.from(new Set(previousGranted.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))) : [];
  const noRecord = previousGranted === null || previousGranted === void 0;
  if (options.firstInstall || noRecord) {
    return { granted: [...requestedList].sort(), needsConsent: [] };
  }
  const previousSet = new Set(previousList);
  const granted = requestedList.filter((item) => previousSet.has(item)).sort();
  const needsConsent = requestedList.filter((item) => !previousSet.has(item)).sort();
  return { granted, needsConsent };
};
const moduleGrantStorageKey = (moduleId) => `hbu_module_grants:${String(moduleId || "").trim()}`;
const readModuleGrant = (moduleId, storage = globalThis?.localStorage) => {
  const key = moduleGrantStorageKey(moduleId);
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item) => typeof item === "string" && item.trim());
  } catch {
    return null;
  }
};
const writeModuleGrant = (moduleId, granted, storage = globalThis?.localStorage) => {
  const key = moduleGrantStorageKey(moduleId);
  try {
    storage?.setItem(key, JSON.stringify(Array.isArray(granted) ? granted : []));
    return true;
  } catch {
    return false;
  }
};
const MODULE_FETCH_REQUEST_TYPE = "hbu-module-fetch";
const MODULE_FETCH_RESPONSE_TYPE = "hbu-module-fetch-result";
const REQUEST_ID_PATTERN = /^[a-z0-9_]{6,64}$/i;
const CAPABILITY_PATTERN = /^[a-z][a-z0-9._]{2,63}$/;
const normalizeParams = (raw) => {
  if (raw === void 0 || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") return null;
    if (key.length > 64 || value.length > 512) return null;
    out[key] = value;
  }
  if (Object.keys(out).length > 16) return null;
  return out;
};
const normalizeModuleFetchMessage = (payload) => {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload;
  if (raw.type !== MODULE_FETCH_REQUEST_TYPE) return null;
  const requestId = typeof raw.request_id === "string" ? raw.request_id.trim() : "";
  if (!REQUEST_ID_PATTERN.test(requestId)) return null;
  const capability = typeof raw.capability === "string" ? raw.capability.trim() : "";
  if (!CAPABILITY_PATTERN.test(capability)) return null;
  const query = normalizeParams(raw.query);
  const form = normalizeParams(raw.form);
  if (query === null || form === null) return null;
  const timeout = typeof raw.timeout_ms === "number" && Number.isFinite(raw.timeout_ms) ? Math.max(1, Math.min(15e3, Math.floor(raw.timeout_ms))) : void 0;
  return {
    request_id: requestId,
    capability,
    query,
    form,
    ...timeout ? { timeout_ms: timeout } : {}
  };
};
const parseModuleFetchError = (raw) => {
  const text = typeof raw === "string" ? raw : String(raw?.message || raw || "");
  const matched = /^(MODULE_[A-Z_]{3,64}):\s*([\s\S]*)$/.exec(text.trim());
  if (matched) {
    return { code: matched[1], message: matched[2].trim() || matched[1] };
  }
  return { code: "MODULE_UPSTREAM_ERROR", message: text.trim() || "请求失败" };
};
const buildModuleFetchResponse = (requestId, outcome) => {
  if (outcome.ok) {
    return {
      type: MODULE_FETCH_RESPONSE_TYPE,
      request_id: requestId,
      ok: true,
      status: outcome.status,
      content_type: outcome.content_type || "",
      body: outcome.body
    };
  }
  return {
    type: MODULE_FETCH_RESPONSE_TYPE,
    request_id: requestId,
    ok: false,
    error: outcome.error
  };
};
const moduleFetchErrorText = (error) => {
  const key = `more.moduleFetch.${error.code}`;
  const text = t(key);
  return text && text !== key ? text : error.message;
};
const HOST_PROTOCOL_VERSION = 1;
const HOST_MESSAGE_TYPES = Object.freeze({
  hello: "mini-hbut:game-sdk:hello",
  welcome: "mini-hbut:game-sdk:welcome",
  ticketRequest: "mini-hbut:game-sdk:request-ticket",
  ticketResponse: "mini-hbut:game-sdk:ticket",
  mode: "mini-hbut:game-sdk:mode"
});
const TICKET_REQUEST_COOLDOWN_MS = 3e3;
const TICKET_REQUEST_MAX_PER_SESSION = 3;
const safeText = (value) => String(value ?? "").trim();
const isPlainObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const createModuleHostBridge = (options) => {
  const moduleId = safeText(options.moduleId);
  const allowedOrigins = (Array.isArray(options.allowedOrigins) ? options.allowedOrigins : []).map((item) => safeText(item)).filter((item) => item && item !== "*");
  const now = options.now || (() => Date.now());
  const features = {
    game_center_enabled: false,
    game_verified_session_enabled: false,
    game_economy_enabled: false,
    drift_bottle_enabled: false,
    ...options.features || {}
  };
  const rejections = [];
  const publishDiag = (entry) => {
    return;
  };
  let disposed = false;
  let ticketGranted = 0;
  let lastTicketAt = 0;
  let ticketInFlight = null;
  let modeReport = null;
  const noteRejection = (reason) => {
    rejections.push({ reason, at: now() });
  };
  const reply = (event, payload) => {
    const target = event.source;
    const origin = safeText(event.origin);
    if (!target || typeof target.postMessage !== "function") return false;
    if (!origin || origin === "*") return false;
    try {
      ;
      target.postMessage(payload, origin);
      return true;
    } catch {
      return false;
    }
  };
  const resolveTicket = async (reason, requestId) => {
    if (!options.requestTicket) return null;
    const stamp = now();
    if (ticketGranted >= TICKET_REQUEST_MAX_PER_SESSION) {
      noteRejection("ticket_quota_exhausted");
      return null;
    }
    if (stamp - lastTicketAt < TICKET_REQUEST_COOLDOWN_MS) {
      noteRejection("ticket_cooldown");
      return null;
    }
    if (ticketInFlight) return ticketInFlight;
    lastTicketAt = stamp;
    ticketGranted += 1;
    ticketInFlight = options.requestTicket({ reason, requestId }).then((grant) => grant && safeText(grant.ticket) ? grant : null).catch(() => null).finally(() => {
      ticketInFlight = null;
    });
    return ticketInFlight;
  };
  const handleMessage = (event) => {
    if (disposed) return;
    const frameWindow = options.frameWindow;
    if (!frameWindow || event.source !== frameWindow) {
      return;
    }
    const origin = safeText(event.origin);
    if (!allowedOrigins.length) {
      noteRejection("origin_allowlist_empty");
      return;
    }
    if (!origin || origin === "*" || !allowedOrigins.includes(origin)) {
      noteRejection("origin_rejected");
      publishDiag({
        allowed_origins: allowedOrigins.slice(0, 4)
      });
      return;
    }
    const payload = event.data;
    if (!isPlainObject(payload)) return;
    const type = safeText(payload.type);
    if (!type) return;
    const requestId = safeText(payload.request_id);
    const payloadGameId = safeText(payload.game_id);
    if (type === HOST_MESSAGE_TYPES.hello) {
      const protocolVersion = Number(payload.protocol_version);
      if (!Number.isInteger(protocolVersion) || protocolVersion !== HOST_PROTOCOL_VERSION) {
        noteRejection("protocol_version_unsupported");
        return;
      }
      if (payloadGameId && moduleId && payloadGameId !== moduleId) {
        noteRejection("game_id_mismatch");
        return;
      }
      reply(event, {
        type: HOST_MESSAGE_TYPES.welcome,
        protocol_version: HOST_PROTOCOL_VERSION,
        game_id: moduleId,
        request_id: requestId,
        features: { ...features },
        // 会话过期时的恢复路径：宿主支持重新签发 ticket（§6.2.3 策略 A）
        capabilities: {
          launch_ticket: features.game_verified_session_enabled && !!options.requestTicket,
          session_recovery: true
        }
      });
      publishDiag({
        launch_ticket: features.game_verified_session_enabled && !!options.requestTicket
      });
      return;
    }
    if (type === HOST_MESSAGE_TYPES.ticketRequest) {
      if (!requestId) {
        noteRejection("request_id_missing");
        return;
      }
      if (payloadGameId && moduleId && payloadGameId !== moduleId) {
        noteRejection("game_id_mismatch");
        return;
      }
      const reason = safeText(payload.reason);
      void resolveTicket(reason, requestId).then((grant) => {
        publishDiag({ granted: !!safeText(grant?.ticket) });
        if (disposed) return;
        reply(event, {
          type: HOST_MESSAGE_TYPES.ticketResponse,
          protocol_version: HOST_PROTOCOL_VERSION,
          game_id: moduleId,
          request_id: requestId,
          ticket: safeText(grant?.ticket),
          ...grant?.expiresAt ? { expires_at: grant.expiresAt } : {}
        });
      });
      return;
    }
    if (type === HOST_MESSAGE_TYPES.mode) {
      modeReport = {
        mode: safeText(payload.mode),
        trustLevel: safeText(payload.trust_level)
      };
      publishDiag({ mode: modeReport.mode, trust_level: modeReport.trustLevel });
      options.onMode?.(modeReport.mode, modeReport.trustLevel);
    }
  };
  return {
    handleMessage,
    isActive: () => !disposed && !!options.frameWindow && allowedOrigins.length > 0,
    rejections: () => rejections.slice(),
    lastMode: () => modeReport,
    dispose: () => {
      disposed = true;
      rejections.length = 0;
      ticketInFlight = null;
    }
  };
};
const GAME_TRUST_REASONS = Object.freeze({
  /** ① 没有可信 Host 握手（浏览器直开 / 桥未就绪 / iframe 未加载） */
  handshakeUntrusted: "host_handshake_untrusted",
  /** ② 握手来源 origin 缺失或不可比较（`'null'` / `'*'` / 非法值） */
  originMissing: "origin_missing",
  /** ② 显式白名单为空（未配置 = 不授予 verified，fail closed） */
  allowlistEmpty: "origin_whitelist_empty",
  /** ② 握手来源 origin 不在显式白名单内 */
  originNotWhitelisted: "origin_not_whitelisted",
  /** ③ 会话未确认（游客态 / 仅缓存身份 / 恢复未完成 / 已登出） */
  sessionUnverified: "session_unverified",
  /** 产品开关未打开 */
  verifiedDisabled: "verified_flag_disabled",
  /** 宿主未接线取票渠道 */
  ticketSourceMissing: "ticket_source_missing"
});
const normalizeVerifiedOrigins = (origins) => {
  const list = Array.isArray(origins) ? origins : [];
  return [...new Set(list.map((item) => normalizeGameOrigin(item)).filter(Boolean))];
};
const resolveGameTrustPolicy = (input) => {
  const origin = normalizeGameOrigin(input.origin);
  const allowlist = normalizeVerifiedOrigins(input.allowedOrigins);
  const reasons = [];
  if (input.handshakeTrusted !== true) reasons.push(GAME_TRUST_REASONS.handshakeUntrusted);
  if (!origin) {
    reasons.push(GAME_TRUST_REASONS.originMissing);
  } else if (!allowlist.length) {
    reasons.push(GAME_TRUST_REASONS.allowlistEmpty);
  } else if (!allowlist.includes(origin)) {
    reasons.push(GAME_TRUST_REASONS.originNotWhitelisted);
  }
  if (input.sessionVerified !== true) reasons.push(GAME_TRUST_REASONS.sessionUnverified);
  if (input.verifiedFeatureEnabled !== true) reasons.push(GAME_TRUST_REASONS.verifiedDisabled);
  const verifiedEligible = reasons.length === 0;
  const base = {
    game_center_enabled: false,
    game_verified_session_enabled: false,
    game_economy_enabled: false,
    drift_bottle_enabled: false,
    ...input.baseFeatures || {}
  };
  return {
    verifiedEligible,
    reasons,
    origin,
    allowlist,
    launchTicketAllowed: verifiedEligible,
    features: {
      // 游玩入口不受 verified 影响（standalone / compatibility 仍可玩）
      game_center_enabled: base.game_center_enabled === true,
      // 以下三项只能经 V2 可信链路交付：判定不通过一律保守 false
      game_verified_session_enabled: verifiedEligible && base.game_verified_session_enabled === true,
      game_economy_enabled: verifiedEligible && base.game_economy_enabled === true,
      drift_bottle_enabled: verifiedEligible && base.drift_bottle_enabled === true
    }
  };
};
const createGatedTicketRequest = (options) => {
  return async (input) => {
    let policy;
    try {
      policy = options.resolvePolicy();
    } catch {
      options.onDenied?.(GAME_TRUST_REASONS.handshakeUntrusted);
      return null;
    }
    if (!policy.verifiedEligible || !policy.launchTicketAllowed) {
      options.onDenied?.(policy.reasons[0] || GAME_TRUST_REASONS.handshakeUntrusted);
      return null;
    }
    return options.requestTicket(input);
  };
};
const _hoisted_1 = { class: "more-module-host-view" };
const _hoisted_2 = ["disabled"];
const _hoisted_3 = { class: "more-module-host-view__body" };
const _hoisted_4 = {
  key: 0,
  class: "module-empty-card"
};
const _hoisted_5 = {
  key: 0,
  class: "module-loading-overlay"
};
const _hoisted_6 = {
  key: 1,
  class: "module-frame-error"
};
const _hoisted_7 = {
  key: 2,
  class: "module-frame-hint"
};
const _hoisted_8 = ["src", "sandbox"];
const PANEL_POINTS_REQUEST_TYPE = "mini-hbut:more-panel:points-request";
const PANEL_POINTS_RESPONSE_TYPE = "mini-hbut:more-panel:points-response";
const _sfc_main = {
  __name: "MoreModuleHostView",
  props: {
    session: {
      type: Object,
      default: () => ({})
    }
  },
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const frameKey = ref(0);
    const frameRef = ref(null);
    const frameContentHeight = ref(0);
    const loading = ref(true);
    const loadError = ref("");
    const externalOpenUrl = ref("");
    const loadHint = ref("");
    const usedCapacitorLocalFallback = ref(false);
    const gameRuntimeMode = ref("");
    let loadingGuardTimer = null;
    let frameSizeHintTimer = null;
    let capacitorFallbackTimer = null;
    let hostBridge = null;
    const hostFlags = ref({ ...DEFAULT_GAME_CENTER_FLAGS });
    const launchTicketOverride = ref("");
    const authStore = useAuthStore();
    const sessionVerified = computed(() => authStore.sessionVerified);
    const loadHostFlags = async () => {
      try {
        hostFlags.value = resolveEffectiveGameCenterFlags(await fetchRemoteConfig({ force: false }));
      } catch {
        hostFlags.value = resolveEffectiveGameCenterFlags(null);
      }
      rebuildHostBridge();
    };
    const safeText2 = (value) => String(value ?? "").trim();
    const moduleName = computed(() => safeText2(props.session?.module_name) || "远程模块");
    const moduleId = computed(() => safeText2(props.session?.module_id));
    const moduleVersion = computed(() => safeText2(props.session?.version));
    const moduleChannel = computed(() => safeText2(props.session?.channel) || "main");
    const invalidReason = computed(() => safeText2(props.session?.invalid_reason || props.session?.invalidReason));
    const resolvedPreviewSource = computed(() => resolveModuleHostPreviewSource(props.session || {}));
    const launchedFromGameCenter = computed(
      () => safeText2(props.session?.launch_surface) === "game_center" && GAME_CENTER_GAME_IDS.includes(moduleId.value)
    );
    const previewMode = computed(() => {
      const resolvedKind = safeText2(resolvedPreviewSource.value?.sourceKind);
      if (resolvedKind && resolvedKind !== "invalid") {
        return resolvedKind;
      }
      const fallbackMode = safeText2(props.session?.preview_mode || props.session?.previewMode);
      if (!canUseLocalModuleBridgePreview() && fallbackMode === "tauri-local") {
        return "";
      }
      return fallbackMode;
    });
    const previewUrl = computed(() => {
      const resolvedUrl = safeText2(resolvedPreviewSource.value?.resolvedPreviewUrl);
      const raw = resolvedUrl || (canUseLocalModuleBridgePreview() ? safeText2(props.session?.preview_url) : "");
      if (isLocalModuleBridgePreviewUrl(raw) && !canUseLocalModuleBridgePreview()) {
        return "";
      }
      return raw;
    });
    const remoteFirstUrl = computed(() => {
      if (!launchedFromGameCenter.value) return "";
      const remote = resolveGameCenterLaunchUrl({
        resolvedPreviewUrl: resolvedPreviewSource.value?.resolvedPreviewUrl,
        preview_url: safeText2(props.session?.preview_url),
        open_url: safeText2(props.session?.open_url),
        candidateUrls: resolvedPreviewSource.value?.candidateUrls
      });
      if (!remote || isLocalModuleBridgePreviewUrl(remote)) return "";
      return remote === previewUrl.value ? "" : remote;
    });
    const remoteFirstActive = ref(true);
    const activePreviewUrl = computed(() => {
      if (usedCapacitorLocalFallback.value) {
        const localUrl = safeText2(resolvedPreviewSource.value?.localPreviewUrl || props.session?.local_preview_url);
        if (localUrl && !isLocalModuleBridgePreviewUrl(localUrl)) return localUrl;
      }
      if (remoteFirstActive.value && remoteFirstUrl.value) return remoteFirstUrl.value;
      return previewUrl.value;
    });
    const capacitorLocalFallbackUrl = computed(() => {
      if (usedCapacitorLocalFallback.value) return "";
      const localUrl = safeText2(resolvedPreviewSource.value?.localPreviewUrl || props.session?.local_preview_url);
      if (!localUrl || localUrl === activePreviewUrl.value) return "";
      if (isLocalModuleBridgePreviewUrl(localUrl)) return "";
      return localUrl;
    });
    const classicFallbackUrl = computed(() => {
      if (!remoteFirstActive.value || !remoteFirstUrl.value) return "";
      return previewUrl.value && previewUrl.value !== activePreviewUrl.value ? previewUrl.value : "";
    });
    const ready = computed(() => !!previewUrl.value);
    const emptyStateMessage = computed(() => {
      if (invalidReason.value === "local-cache-missing" || previewMode.value === "capacitor-local") {
        return "本地模块缓存缺失或入口失效，请返回更多页重新下载模块。";
      }
      if (invalidReason.value === "tauri-bridge-blocked" || isLocalModuleBridgePreviewUrl(safeText2(props.session?.preview_url))) {
        return "当前运行时已禁止桌面本地桥地址，请返回更多页重新进入模块。";
      }
      return "模块预览地址缺失，请返回更多页重新进入。";
    });
    const frameAllowedOrigins = computed(() => {
      const allowOpaque = previewMode.value !== "remote-site";
      return resolveGameFrameAllowedOrigins({
        frameUrl: activePreviewUrl.value || previewUrl.value,
        fallbackUrl: capacitorLocalFallbackUrl.value || classicFallbackUrl.value,
        extraOrigins: hostFlags.value.allowed_game_origins || [],
        allowOpaqueOrigin: allowOpaque
      });
    });
    const withFrameCacheBust = (url, keyParts = []) => {
      const text = safeText2(url);
      if (!text) return "";
      const [basePart, hashPart = ""] = text.split("#", 2);
      if (!basePart) return text;
      const token = keyParts.map((item) => safeText2(item)).filter(Boolean).join("-");
      const params = new URLSearchParams();
      params.set("_host_frame_v", token || `${Date.now()}`);
      const joiner = basePart.includes("?") ? "&" : "?";
      const nextUrl = `${basePart}${joiner}${params.toString()}`;
      return hashPart ? `${nextUrl}#${hashPart}` : nextUrl;
    };
    const withLaunchTicket = (url) => {
      const text = safeText2(url);
      const ticket = safeText2(launchTicketOverride.value);
      if (!text || !ticket) return text;
      try {
        const parsed = new URL(text, window.location.origin);
        parsed.searchParams.set("gpt", ticket);
        return parsed.toString();
      } catch {
        return text;
      }
    };
    const withHostContextParams = (url) => {
      const text = safeText2(url);
      if (!text) return text;
      try {
        const parsed = new URL(text, window.location.origin);
        appendModuleEnvQueryParams(parsed, {
          appVersion: resolveBuildAppVersion(),
          hostOrigin: window.location.origin,
          // G10 兜底：非特殊 scheme（tauri: / capacitor:）下 location.origin === 'null'；
          // 传入 location 对象后由注入层退化为 `${protocol}//${host}`（仍然 fail closed）。
          hostLocation: window.location
        });
        return parsed.toString();
      } catch {
        return text;
      }
    };
    const frameSrc = computed(
      () => withFrameCacheBust(
        withLaunchTicket(withHostContextParams(activePreviewUrl.value)),
        [moduleChannel.value || "main", moduleVersion.value || "unknown", String(frameKey.value)]
      )
    );
    const frameSandbox = computed(() => {
      const src = safeText2(frameSrc.value);
      if (!src) return void 0;
      try {
        return isLocalModuleContentOrigin(new URL(src).origin) ? (
          // 只给「跑脚本 + 保留自身 origin + 表单/弹窗/指针锁/下载」；导航类与弹模态类能力一律不给
          "allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-downloads"
        ) : void 0;
      } catch {
        return void 0;
      }
    });
    const hasEmbeddedFrameHeight = computed(() => frameContentHeight.value > 0);
    const clearLoadingGuardTimer = () => {
      if (loadingGuardTimer) {
        clearTimeout(loadingGuardTimer);
        loadingGuardTimer = null;
      }
    };
    const clearFrameSizeHintTimer = () => {
      if (frameSizeHintTimer) {
        clearTimeout(frameSizeHintTimer);
        frameSizeHintTimer = null;
      }
    };
    const clearCapacitorFallbackTimer = () => {
      if (capacitorFallbackTimer) {
        clearTimeout(capacitorFallbackTimer);
        capacitorFallbackTimer = null;
      }
    };
    const scheduleFrameSizeFallback = () => {
      clearFrameSizeHintTimer();
      frameSizeHintTimer = window.setTimeout(() => {
        if (frameContentHeight.value > 0 || loadError.value) return;
        frameContentHeight.value = 800;
        loading.value = false;
        loadHint.value = "模块页面已加载，使用默认显示高度。";
        pushDebugLog("ModuleHost", `使用默认高度 800px（模块未上报尺寸）`, "info");
        const isIos = isIOSLike();
        if (isIos) {
          window.setTimeout(() => {
            if (frameContentHeight.value === 800 && !loadError.value) {
              const src = frameSrc.value;
              if (src && src.startsWith("http")) {
                externalOpenUrl.value = src;
                loadHint.value = "iOS 设备可能无法嵌入显示，可尝试在浏览器中打开。";
                pushDebugLog("ModuleHost", `iOS 白屏检测触发，提供外部打开`, "warn", { src: src?.slice(0, 100) });
              }
            }
          }, 6e3);
        }
      }, 3500);
    };
    const tryCapacitorLocalFallback = () => {
      const fallbackUrl = capacitorLocalFallbackUrl.value;
      if (!fallbackUrl) return false;
      usedCapacitorLocalFallback.value = true;
      frameKey.value += 1;
      resetFrameState();
      return true;
    };
    const scheduleConnectionRefusedRetry = () => {
      capacitorFallbackTimer = window.setTimeout(() => {
        if (frameContentHeight.value > 0) return;
        if (usedCapacitorLocalFallback.value) return;
        const currentSrc = frameSrc.value;
        if (!currentSrc || !currentSrc.includes("127.0.0.1")) return;
        if (tryCapacitorLocalFallback()) {
          loadHint.value = "本地桥接连接超时，切换到备用地址...";
        }
      }, 3e3);
    };
    const scheduleFrameSizeHint = () => {
      clearFrameSizeHintTimer();
      frameSizeHintTimer = window.setTimeout(() => {
        if (frameContentHeight.value > 0 || loadError.value) return;
        loadHint.value = "模块页面已加载，正在等待模块上报真实高度。";
      }, 1200);
    };
    const resetFrameState = () => {
      clearLoadingGuardTimer();
      clearFrameSizeHintTimer();
      clearCapacitorFallbackTimer();
      frameContentHeight.value = 0;
      loading.value = ready.value;
      loadError.value = "";
      loadHint.value = "";
      externalOpenUrl.value = "";
      pushDebugLog("ModuleHost", `iframe 开始加载`, "info", {
        src: frameSrc.value?.slice(0, 150),
        previewMode: previewMode.value,
        ua: String(globalThis?.navigator?.userAgent || "").slice(0, 80)
      });
      if (!ready.value) return;
      loadingGuardTimer = window.setTimeout(() => {
        if (!loading.value) return;
        loading.value = false;
        loadHint.value = "模块页面已开始渲染，正在等待模块上报真实高度。";
        pushDebugLog("ModuleHost", `加载超时（4.5s），iframe 未触发 load 事件`, "warn", {
          src: frameSrc.value?.slice(0, 120),
          previewMode: previewMode.value
        });
        scheduleConnectionRefusedRetry();
      }, 4500);
    };
    const moduleInstanceId = ref("");
    const moduleInstanceTrusted = ref(false);
    const ensureModuleInstance = () => {
      if (!moduleInstanceId.value) {
        moduleInstanceId.value = `inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      }
      return moduleInstanceId.value;
    };
    const registerModuleInstance = async () => {
      const instanceId = ensureModuleInstance();
      const requested = Array.isArray(props.session?.permissions) ? props.session.permissions.filter((item) => typeof item === "string") : [];
      moduleInstanceTrusted.value = props.session?.trusted === true;
      const previous = readModuleGrant(moduleId.value);
      const { granted, needsConsent } = computeGrantedCapabilities(previous, requested, {
        firstInstall: previous === null
      });
      if (previous === null) writeModuleGrant(moduleId.value, granted);
      if (needsConsent.length) {
        pushDebugLog("ModuleHost", "模块申请了新增能力，等待同意", "warn", { needsConsent });
      }
      try {
        await invokeNative("module_instance_register", {
          request: {
            instanceId,
            accountScope: safeText2(authStore.verifiedStudentId),
            // trusted 只是**声明值**：Rust 会用缓存里已验签的清单重新判定并覆盖它
            //（2026-11-06 真机整改：先前会因为会话归一化丢掉该字段而导致受控请求全被拒）。
            trusted: moduleInstanceTrusted.value,
            capabilities: granted,
            moduleId: moduleId.value,
            channel: safeText2(moduleChannel.value) || "main",
            version: safeText2(moduleVersion.value)
          }
        });
      } catch (error) {
        pushDebugLog("ModuleHost", "模块实例登记失败", "warn", { error: safeText2(error?.message || error) });
      }
    };
    const unregisterModuleInstance = () => {
      const instanceId = moduleInstanceId.value;
      if (!instanceId) return;
      moduleInstanceId.value = "";
      void invokeNative("module_instance_unregister", { instanceId }).catch(() => {
      });
    };
    const handleModuleFetchMessage = async (event) => {
      const frameWindow = frameRef.value?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;
      if (!isGameFrameOriginAllowed(event.origin, frameAllowedOrigins.value)) return;
      const payload = event?.data;
      if (!payload || payload.type !== MODULE_FETCH_REQUEST_TYPE) return;
      const request = normalizeModuleFetchMessage(payload);
      if (!request) {
        pushDebugLog("ModuleHost", "丢弃形状非法的受控请求", "warn", {});
        return;
      }
      const reply = (message) => {
        if (frameRef.value?.contentWindow !== frameWindow) return;
        try {
          frameWindow.postMessage(message, event.origin);
        } catch {
        }
      };
      if (props.session?.trusted === false) {
        const error = parseModuleFetchError("MODULE_NOT_TRUSTED: 模块未通过发布者验签");
        reply(buildModuleFetchResponse(request.request_id, { ok: false, error }));
        return;
      }
      try {
        const result = await invokeNative("module_session_fetch", {
          request: {
            instance_id: ensureModuleInstance(),
            request_id: request.request_id,
            capability: request.capability,
            account_scope: safeText2(authStore.verifiedStudentId),
            query: request.query || {},
            form: request.form || {},
            timeout_ms: request.timeout_ms
          }
        });
        reply(
          buildModuleFetchResponse(request.request_id, {
            ok: true,
            status: Number(result?.status) || 0,
            content_type: safeText2(result?.content_type),
            body: safeText2(result?.body)
          })
        );
      } catch (error) {
        const payloadError = parseModuleFetchError(error);
        pushDebugLog("ModuleHost", "受控请求被拒绝", "warn", { code: payloadError.code });
        reply(buildModuleFetchResponse(request.request_id, { ok: false, error: payloadError }));
        moduleFetchErrorText(payloadError);
      }
    };
    const handleFrameSizeMessage = (event) => {
      const frameWindow = frameRef.value?.contentWindow;
      const payload = event?.data;
      if (!frameWindow || event.source !== frameWindow) return;
      if (!isGameFrameOriginAllowed(event.origin, frameAllowedOrigins.value)) {
        pushDebugLog("ModuleHost", "拒绝来源不在白名单的模块消息", "warn", {
          origin: safeText2(event.origin),
          allowList: frameAllowedOrigins.value.join(",")
        });
        return;
      }
      if (!payload || payload.type !== "mini-hbut:module-size") return;
      const nextModuleId = safeText2(payload.module_id || payload.moduleId);
      const nextVersion = safeText2(payload.version);
      if (moduleId.value && nextModuleId && nextModuleId !== moduleId.value) return;
      if (moduleVersion.value && nextVersion && nextVersion !== moduleVersion.value) return;
      const nextHeight = Math.ceil(Number(payload.height) || 0);
      if (nextHeight <= 0) return;
      clearLoadingGuardTimer();
      clearFrameSizeHintTimer();
      frameContentHeight.value = nextHeight;
      loading.value = false;
      loadHint.value = "";
    };
    const handleHostBridgeMessage = (event) => {
      hostBridge?.handleMessage(event);
    };
    const handlePanelPointsRequestMessage = async (event) => {
      const frameWindow = frameRef.value?.contentWindow;
      const payload = event?.data;
      if (moduleId.value !== "more_panel" || !frameWindow || event.source !== frameWindow) return;
      if (!payload || payload.type !== PANEL_POINTS_REQUEST_TYPE) return;
      const requestId = safeText2(payload.request_id);
      if (!/^panel_[a-z0-9_]{8,70}$/i.test(requestId)) return;
      const currentSrc = frameSrc.value;
      let expectedOrigin = "";
      let isOfficialPanel = false;
      try {
        const url = new URL(currentSrc);
        expectedOrigin = url.origin;
        const validPath = /\/(?:modules|module_bundle\/content)\/[^/]+\/more_panel\/[^/]+\//.test(url.pathname);
        isOfficialPanel = validPath && (expectedOrigin === "https://hbut.6661111.xyz" || // #1165 T04：本机模块内容已迁到独立端口，不能再用写死的 4399
        isLocalModuleContentOrigin(expectedOrigin) && isLocalModuleBridgePreviewUrl(currentSrc));
      } catch {
        return;
      }
      if (!isOfficialPanel || event.origin !== expectedOrigin) return;
      if (!isGameFrameOriginAllowed(event.origin, frameAllowedOrigins.value)) return;
      const initialStudentId = safeText2(authStore.verifiedStudentId);
      const reply = (status, data = {}) => {
        if (frameRef.value?.contentWindow !== frameWindow || frameSrc.value !== currentSrc) return;
        if (safeText2(authStore.verifiedStudentId) !== initialStudentId) return;
        try {
          frameWindow.postMessage({
            type: PANEL_POINTS_RESPONSE_TYPE,
            request_id: requestId,
            status,
            ...data
          }, expectedOrigin);
        } catch {
        }
      };
      if (!sessionVerified.value || !initialStudentId) {
        reply("login_required");
        return;
      }
      const [walletResult, tasksResult] = await Promise.allSettled([
        fetchPointsWallet({ apiBase: DEFAULT_GAME_PLATFORM_API_BASE }),
        fetchPointsDailyTasks({ apiBase: DEFAULT_GAME_PLATFORM_API_BASE })
      ]);
      if (!sessionVerified.value || safeText2(authStore.verifiedStudentId) !== initialStudentId) return;
      if (walletResult.status === "rejected") {
        const error = walletResult.reason;
        const status = Number(error?.httpStatus || 0);
        const code = safeText2(error?.code);
        reply(
          status === 401 || code === "LOCAL_AUTH_MISSING" ? "auth_unavailable" : code === "FEATURE_DISABLED" || status === 404 ? "feature_disabled" : status === 403 ? "auth_unavailable" : "network_error"
        );
        return;
      }
      const wallet = walletResult.value;
      const tasks = tasksResult.status === "fulfilled" ? tasksResult.value.tasks : null;
      reply("ok", {
        wallet: { level: wallet.level, coin_balance: wallet.coinBalance },
        tasks: Array.isArray(tasks) ? { completed: tasks.filter((task) => task.completed === true).length, total: tasks.length } : null
      });
    };
    const handleOpenModuleMessage = (event) => {
      const frameWindow = frameRef.value?.contentWindow;
      const payload = event?.data;
      if (!frameWindow || event.source !== frameWindow) return;
      if (!payload || payload.type !== "mini-hbut:open-module") return;
      if (!isGameFrameOriginAllowed(event.origin, frameAllowedOrigins.value)) {
        pushDebugLog("ModuleHost", "拒绝来源不在白名单的 open-module 请求", "warn", {
          origin: safeText2(event.origin),
          allowList: frameAllowedOrigins.value.join(",")
        });
        return;
      }
      const targetModuleId = safeText2(payload.moduleId || payload.module_id);
      if (!targetModuleId || targetModuleId === moduleId.value) return;
      if (!requestGameOpen(targetModuleId)) return;
      emit("back");
    };
    const evaluateGameTrustPolicy = () => resolveGameTrustPolicy({
      handshakeTrusted: Boolean(frameRef.value?.contentWindow) && frameAllowedOrigins.value.length > 0,
      origin: activePreviewUrl.value || previewUrl.value,
      allowedOrigins: hostFlags.value.allowed_game_origins || [],
      sessionVerified: sessionVerified.value,
      verifiedFeatureEnabled: hostFlags.value.game_verified_session_enabled === true,
      baseFeatures: {
        game_center_enabled: hostFlags.value.game_center_enabled === true,
        game_verified_session_enabled: hostFlags.value.game_verified_session_enabled === true,
        game_economy_enabled: hostFlags.value.game_economy_enabled === true,
        drift_bottle_enabled: hostFlags.value.drift_bottle_enabled === true
      }
    });
    const requestLaunchTicket = async () => {
      const apiBase = hostFlags.value.api_base;
      const result = await fetchGameLaunchTicket({
        gameId: moduleId.value,
        apiBase,
        idempotencyKey: ""
      });
      publishGameDiag({
        ticket_present: !!result.ticket,
        error_code: result.error && result.error.code ? String(result.error.code) : ""
      });
      if (!result.ticket) return null;
      return { ticket: result.ticket, expiresAt: result.expiresAt };
    };
    const publishGameDiag = (entry) => {
      return;
    };
    const rebuildHostBridge = () => {
      hostBridge?.dispose();
      const policy = evaluateGameTrustPolicy();
      publishGameDiag({
        verified_eligible: policy.verifiedEligible,
        reasons: policy.reasons,
        origin: policy.origin,
        allowlist: policy.allowlist,
        config_origins: hostFlags.value.allowed_game_origins,
        verified_flag: hostFlags.value.game_verified_session_enabled === true,
        session_verified: sessionVerified.value
      });
      hostBridge = createModuleHostBridge({
        moduleId: moduleId.value,
        frameWindow: frameRef.value?.contentWindow || null,
        allowedOrigins: frameAllowedOrigins.value,
        // 契约 C：判定不通过 → 声明的 verified / economy / drift 能力一律保守 false，
        // 游戏侧据此前置隐藏入口（不得「先发请求再吞 403」）。
        features: policy.features,
        // 取票唯一入口：判定不通过时零请求直接返回 null（不发 /tickets）；
        // 判定通过才落到真实取票（失败仍按协议 §6.2.3 降级 compatibility/standalone）。
        requestTicket: createGatedTicketRequest({
          resolvePolicy: evaluateGameTrustPolicy,
          requestTicket: requestLaunchTicket,
          // 被闸门拒绝时留痕（此前无 onDenied → 真机上「发过请求但没结果」查不出原因）
          onDenied: (reason) => publishGameDiag()
        }),
        onMode: (mode) => {
          gameRuntimeMode.value = mode;
        }
      });
    };
    const tryClassicFallback = () => {
      if (usedCapacitorLocalFallback.value) return false;
      if (classicFallbackUrl.value) {
        remoteFirstActive.value = false;
        frameKey.value += 1;
        resetFrameState();
        return true;
      }
      return tryCapacitorLocalFallback();
    };
    const reloadFrame = () => {
      if (!ready.value) return;
      unregisterModuleInstance();
      frameKey.value += 1;
      resetFrameState();
    };
    const handleLoad = () => {
      clearLoadingGuardTimer();
      clearCapacitorFallbackTimer();
      loading.value = false;
      loadError.value = "";
      rebuildHostBridge();
      void registerModuleInstance();
      pushDebugLog("ModuleHost", `iframe onload 触发`, "info", {
        src: frameSrc.value?.slice(0, 120),
        hasHeight: frameContentHeight.value > 0
      });
      if (!frameContentHeight.value) {
        scheduleFrameSizeHint();
        scheduleFrameSizeFallback();
      }
    };
    const handleError = () => {
      clearLoadingGuardTimer();
      clearFrameSizeHintTimer();
      clearCapacitorFallbackTimer();
      clearFrameSizeHintTimer();
      pushDebugLog("ModuleHost", `iframe onerror 触发`, "error", {
        src: frameSrc.value?.slice(0, 120),
        previewMode: previewMode.value
      });
      if (classicFallbackUrl.value && tryClassicFallback()) return;
      const currentSrc = frameSrc.value;
      if (currentSrc && currentSrc.includes("127.0.0.1")) {
        if (tryCapacitorLocalFallback()) return;
      }
      if (tryCapacitorLocalFallback()) return;
      loading.value = false;
      frameContentHeight.value = 0;
      const isIos = isIOSLike();
      if (isIos && currentSrc && currentSrc.startsWith("http")) {
        loadError.value = "当前设备不支持嵌入加载，请点击下方按钮在浏览器中打开。";
        externalOpenUrl.value = currentSrc;
      } else {
        loadError.value = previewMode.value === "capacitor-local" ? "本地模块页面加载失败，请返回更多页重新下载后再试。" : "模块页面加载失败，请返回更多页后重试。";
      }
      loadHint.value = "";
    };
    watch(
      () => previewUrl.value,
      (next, previous) => {
        if (previous && next !== previous) unregisterModuleInstance();
        remoteFirstActive.value = true;
        frameKey.value += 1;
        resetFrameState();
      },
      { immediate: true }
    );
    watch(sessionVerified, () => {
      rebuildHostBridge();
    });
    watch(
      () => safeText2(authStore.verifiedStudentId),
      (next, previous) => {
        if (!previous || next === previous) return;
        moduleInstanceTrusted.value = false;
        moduleInstanceId.value = "";
        void invokeNative("module_instances_clear", {}).catch(() => {
        });
      }
    );
    const refreshLaunchTicketForResume = async () => {
      const policy = evaluateGameTrustPolicy();
      if (!policy.verifiedEligible || !policy.launchTicketAllowed) return;
      const result = await fetchGameLaunchTicket({
        gameId: moduleId.value,
        apiBase: hostFlags.value.api_base
      });
      if (result.ticket) launchTicketOverride.value = result.ticket;
    };
    const handleAppEmbedResumeEvent = async (event) => {
      const view = String(event?.detail?.view || "");
      if (view && view !== "more_module_host") return;
      const detail = event?.detail || {};
      const usesLoopback = isLocalModuleBridgePreviewUrl(safeText2(previewUrl.value));
      let bridgeOk = detail.bridgeOk !== false;
      if (usesLoopback && canUseLocalModuleBridgePreview()) {
        try {
          const { recoverSchoolWebsiteBridgeOnResume } = await __vitePreload(async () => {
            const { recoverSchoolWebsiteBridgeOnResume: recoverSchoolWebsiteBridgeOnResume2 } = await import("./school_website_embed-CiQo9Khf.js");
            return { recoverSchoolWebsiteBridgeOnResume: recoverSchoolWebsiteBridgeOnResume2 };
          }, true ? __vite__mapDeps([0,1,2,3]) : void 0, import.meta.url);
          bridgeOk = await recoverSchoolWebsiteBridgeOnResume();
        } catch {
          bridgeOk = false;
        }
      }
      loadError.value = "";
      loadHint.value = "";
      externalOpenUrl.value = "";
      usedCapacitorLocalFallback.value = false;
      remoteFirstActive.value = true;
      if (usesLoopback && !bridgeOk) {
        if (tryCapacitorLocalFallback()) {
          return;
        }
        loading.value = false;
        loadError.value = "模块本地服务暂时不可用。可点右上角重试；或返回更多页重新进入/下载模块。";
        const raw = safeText2(props.session?.open_url || props.session?.preview_url);
        if (raw && raw.startsWith("http") && !isLocalModuleBridgePreviewUrl(raw)) {
          externalOpenUrl.value = raw;
        }
        return;
      }
      try {
        await refreshLaunchTicketForResume();
      } catch {
      }
      reloadFrame();
    };
    onMounted(() => {
      window.addEventListener("message", handleModuleFetchMessage);
      window.addEventListener("message", handleFrameSizeMessage);
      window.addEventListener("message", handleHostBridgeMessage);
      window.addEventListener("message", handleOpenModuleMessage);
      window.addEventListener("message", handlePanelPointsRequestMessage);
      window.addEventListener("hbu-embed-resume", handleAppEmbedResumeEvent);
      void loadHostFlags();
      void registerModuleInstance();
    });
    onBeforeUnmount(() => {
      unregisterModuleInstance();
      clearLoadingGuardTimer();
      clearFrameSizeHintTimer();
      clearCapacitorFallbackTimer();
      hostBridge?.dispose();
      hostBridge = null;
      window.removeEventListener("message", handleModuleFetchMessage);
      window.removeEventListener("message", handleFrameSizeMessage);
      window.removeEventListener("message", handleHostBridgeMessage);
      window.removeEventListener("message", handleOpenModuleMessage);
      window.removeEventListener("message", handlePanelPointsRequestMessage);
      window.removeEventListener("hbu-embed-resume", handleAppEmbedResumeEvent);
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: moduleName.value,
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              class: "icon-btn",
              disabled: !ready.value,
              onClick: reloadFrame
            }, "↻", 8, _hoisted_2)
          ]),
          _: 1
        }, 8, ["title"]),
        createBaseVNode("div", _hoisted_3, [
          !ready.value ? (openBlock(), createElementBlock("div", _hoisted_4, [
            createVNode(unref(TEmptyState), {
              type: "empty",
              message: emptyStateMessage.value
            }, null, 8, ["message"])
          ])) : (openBlock(), createElementBlock("div", {
            key: 1,
            class: normalizeClass(["module-frame-shell", { "module-frame-shell--content": hasEmbeddedFrameHeight.value }])
          }, [
            loading.value ? (openBlock(), createElementBlock("div", _hoisted_5, [
              createVNode(unref(TEmptyState), {
                type: "loading",
                message: "正在加载模块页面..."
              })
            ])) : createCommentVNode("", true),
            loadError.value ? (openBlock(), createElementBlock("div", _hoisted_6, [
              createTextVNode(toDisplayString(loadError.value) + " ", 1),
              createBaseVNode("button", {
                class: "external-open-btn",
                onClick: reloadFrame
              }, "重试"),
              classicFallbackUrl.value || capacitorLocalFallbackUrl.value ? (openBlock(), createElementBlock("button", {
                key: 0,
                class: "external-open-btn",
                onClick: tryClassicFallback
              }, " 以兼容模式打开 ")) : createCommentVNode("", true),
              externalOpenUrl.value ? (openBlock(), createElementBlock("button", {
                key: 1,
                class: "external-open-btn",
                onClick: _cache[1] || (_cache[1] = ($event) => unref(openExternal)(externalOpenUrl.value))
              }, " 在浏览器中打开 ")) : createCommentVNode("", true)
            ])) : loadHint.value ? (openBlock(), createElementBlock("div", _hoisted_7, [
              createTextVNode(toDisplayString(loadHint.value) + " ", 1),
              externalOpenUrl.value ? (openBlock(), createElementBlock("button", {
                key: 0,
                class: "external-open-btn",
                onClick: _cache[2] || (_cache[2] = ($event) => unref(openExternal)(externalOpenUrl.value))
              }, " 在浏览器中打开 ")) : createCommentVNode("", true)
            ])) : createCommentVNode("", true),
            (openBlock(), createElementBlock("iframe", {
              key: frameKey.value,
              ref_key: "frameRef",
              ref: frameRef,
              class: normalizeClass(["module-frame", { "module-frame--content": hasEmbeddedFrameHeight.value }]),
              src: frameSrc.value,
              sandbox: frameSandbox.value,
              allowfullscreen: "",
              allow: "cross-origin-isolated; clipboard-write",
              referrerpolicy: "no-referrer-when-downgrade",
              loading: "eager",
              onLoad: handleLoad,
              onError: handleError
            }, null, 42, _hoisted_8))
          ], 2))
        ])
      ]);
    };
  }
};
const MoreModuleHostView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-d1036d15"]]);
export {
  MoreModuleHostView as default
};
