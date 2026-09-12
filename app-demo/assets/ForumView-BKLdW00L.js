import { i as isTestAccountSession, Q as resolveTestAccountForumResponse } from "./runtime-bridge-Dt57BD2i.js";
import { X as decryptData, Y as encryptData, Z as getIdentityAccessToken, j as showToast, $ as fetchRemoteConfig, _ as _export_sfc, m as useI18n } from "./app-demo-CUOWTnz-.js";
import { r as ref, h as computed, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, F as Fragment, f as renderList, n as normalizeClass, d as createCommentVNode, K as withDirectives, R as vShow, g as createTextVNode, m as withKeys, L as vModelText, w as withModifiers, U as createStaticVNode, P as vModelSelect, e as normalizeStyle, o as onMounted, v as watch } from "./vue-core-Dzs4fLAU.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const DEFAULT_FORUM_ENDPOINT = "https://mini-hbut-testocr1.hf.space/api/forum";
const TOKEN_CACHE_KEY_PREFIX = "hbu_forum_token:";
const PROFILE_CACHE_KEY_PREFIX = "hbu_forum_profile:";
const ADMIN_SECRET_CACHE_KEY_PREFIX = "hbu_forum_admin_secret:";
const toText$2 = (value) => value == null ? "" : String(value);
const encodeCachePart = (value) => encodeURIComponent(toText$2(value).trim());
const normalizeForumEndpoint = (value) => {
  const text = toText$2(value).trim();
  if (!text) return DEFAULT_FORUM_ENDPOINT;
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  const normalized = withProtocol.replace(/\/+$/, "");
  if (/\/api\/forum$/i.test(normalized)) {
    return normalized;
  }
  return `${normalized}/api/forum`;
};
const buildForumApiBase = (forumConfig = {}) => {
  if (forumConfig?.enabled === false) return "";
  return normalizeForumEndpoint(
    forumConfig?.api_base || forumConfig?.apiBase || forumConfig?.endpoint || DEFAULT_FORUM_ENDPOINT
  );
};
const tokenCacheKey = (studentId, apiBase = "") => `${TOKEN_CACHE_KEY_PREFIX}${encodeCachePart(studentId)}:${encodeCachePart(apiBase)}`;
const purgeLegacyTokenCache = (studentId, apiBase = "") => {
  if (!studentId || typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(tokenCacheKey(studentId, apiBase));
    const tokenPrefix = `${TOKEN_CACHE_KEY_PREFIX}${encodeCachePart(studentId)}:`;
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(tokenPrefix)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
  }
};
const readForumProfile = (studentId) => {
  const sid = toText$2(studentId).trim();
  if (!sid || typeof localStorage === "undefined") {
    return { nickname: sid, avatar_url: "", bio: "", admin_secret: "" };
  }
  try {
    const storageKey = `${PROFILE_CACHE_KEY_PREFIX}${sid}`;
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
    const normalized = {
      nickname: toText$2(parsed.nickname || sid).trim() || sid,
      avatar_url: toText$2(parsed.avatar_url || parsed.avatarUrl || "").trim(),
      bio: toText$2(parsed.bio || "").trim()
    };
    if (Object.prototype.hasOwnProperty.call(parsed, "admin_secret")) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(normalized));
      } catch {
      }
    }
    return {
      ...normalized,
      // 管理员口令改由 loadForumAdminSecret 读取；该存储仅降低静态泄露风险，并非 XSS 安全边界。
      admin_secret: ""
    };
  } catch {
    return { nickname: sid, avatar_url: "", bio: "", admin_secret: "" };
  }
};
const writeForumProfile = (studentId, profile = {}) => {
  const sid = toText$2(studentId).trim();
  const normalized = {
    nickname: toText$2(profile.nickname || sid).trim() || sid,
    avatar_url: toText$2(profile.avatar_url || profile.avatarUrl || "").trim(),
    bio: toText$2(profile.bio || "").trim()
    // 不落明文 admin_secret：请使用 saveForumAdminSecret 加密保存
  };
  if (!sid || typeof localStorage === "undefined") return normalized;
  try {
    localStorage.setItem(`${PROFILE_CACHE_KEY_PREFIX}${sid}`, JSON.stringify(normalized));
    const tokenPrefix = `${TOKEN_CACHE_KEY_PREFIX}${encodeCachePart(sid)}:`;
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(tokenPrefix) || key === `${TOKEN_CACHE_KEY_PREFIX}${sid}`) {
        localStorage.removeItem(key);
      }
    }
  } catch {
  }
  return normalized;
};
const saveForumAdminSecret = async (studentId, secret) => {
  const sid = toText$2(studentId).trim();
  if (!sid || typeof localStorage === "undefined") return;
  const key = `${ADMIN_SECRET_CACHE_KEY_PREFIX}${encodeCachePart(sid)}`;
  const value = toText$2(secret).trim();
  try {
    if (!value) {
      localStorage.removeItem(key);
      return;
    }
    const encrypted = await encryptData({ admin_secret: value });
    localStorage.setItem(key, encrypted);
  } catch {
  }
};
const loadForumAdminSecret = async (studentId) => {
  const sid = toText$2(studentId).trim();
  if (!sid || typeof localStorage === "undefined") return "";
  const key = `${ADMIN_SECRET_CACHE_KEY_PREFIX}${encodeCachePart(sid)}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return "";
    const decrypted = await decryptData(raw);
    return toText$2(decrypted?.admin_secret || "").trim();
  } catch {
    return "";
  }
};
const responseHeader = (response, name) => {
  try {
    return response?.headers?.get?.(name) || "";
  } catch {
    return "";
  }
};
const parseJsonResponse = async (response, { includeMeta = false, requestEtag = "" } = {}) => {
  const etag = responseHeader(response, "ETag") || requestEtag || "";
  if (response.status === 304) {
    return includeMeta ? { value: void 0, etag, notModified: true } : { notModified: true };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.detail || data?.message || data?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return includeMeta ? { value: data, etag, notModified: false } : data;
};
const appendQuery = (path, params = {}) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== void 0 && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
};
const createForumApiClient = ({
  apiBase,
  studentId = "",
  nickname = "",
  avatarUrl = "",
  bio = "",
  adminSecret = "",
  fetcher = fetch
} = {}) => {
  const base = normalizeForumEndpoint(apiBase || DEFAULT_FORUM_ENDPOINT);
  const sid = toText$2(studentId).trim();
  let tokenPromise = null;
  let memoryToken = "";
  const request = async (path, { method = "GET", body, auth = false, headers = {}, etag = "", includeMeta = false } = {}) => {
    if (isTestAccountSession()) {
      const payload = resolveTestAccountForumResponse(path, {
        method,
        body
      });
      return includeMeta ? { value: payload, etag: "test-account-forum", notModified: false } : payload;
    }
    const createHeaders = async (forceTokenRefresh = false) => {
      const reqHeaders = { Accept: "application/json", ...headers };
      if (body !== void 0 && !(body instanceof FormData)) {
        reqHeaders["Content-Type"] = "application/json";
      }
      if (etag) {
        reqHeaders["If-None-Match"] = etag;
      }
      if (auth) {
        reqHeaders.Authorization = `Bearer ${await getToken(forceTokenRefresh)}`;
      }
      return reqHeaders;
    };
    const createBody = () => body instanceof FormData ? body : body === void 0 ? void 0 : JSON.stringify(body);
    const fetchRequest = async (forceTokenRefresh = false) => fetcher(`${base}${path}`, {
      method,
      headers: await createHeaders(forceTokenRefresh),
      body: createBody()
    });
    let response = await fetchRequest();
    if (auth && response.status === 401) {
      memoryToken = "";
      purgeLegacyTokenCache(sid, base);
      response = await fetchRequest(true);
    }
    return parseJsonResponse(response, { includeMeta, requestEtag: etag });
  };
  const getToken = async (forceRefresh = false) => {
    if (!forceRefresh && memoryToken) return memoryToken;
    const identityToken = await getIdentityAccessToken(forceRefresh);
    if (identityToken) {
      memoryToken = identityToken;
      return identityToken;
    }
    if (forceRefresh) {
      memoryToken = "";
    }
    if (tokenPromise) return tokenPromise;
    tokenPromise = request("/auth/token", {
      method: "POST",
      body: {
        student_id: sid,
        nickname: nickname || sid,
        avatar_url: avatarUrl,
        bio,
        admin_secret: adminSecret
      },
      auth: false
    }).then((payload) => {
      memoryToken = payload.token;
      return payload.token;
    }).finally(() => {
      tokenPromise = null;
    });
    return tokenPromise;
  };
  return {
    apiBase: base,
    getToken,
    listCategories: (_params = {}, options = {}) => request("/categories", options),
    createCategory: (payload) => request("/categories", { method: "POST", body: payload, auth: true }),
    listThreads: (params = {}, options = {}) => {
      return request(appendQuery("/threads", {
        category_id: params.categoryId || params.category_id,
        limit: params.limit,
        offset: params.offset
      }), options);
    },
    listHotThreads: (limit = 20, options = {}) => request(`/threads/hot?limit=${encodeURIComponent(String(limit))}`, options),
    searchThreads: (params = {}, options = {}) => request(appendQuery("/search", {
      q: params.q || params.query,
      category_id: params.categoryId || params.category_id,
      limit: params.limit,
      offset: params.offset
    }), options),
    getThread: (threadId, options = {}) => request(`/threads/${encodeURIComponent(String(threadId))}`, options),
    createThread: (payload) => request("/threads", { method: "POST", body: payload, auth: true }),
    createReply: (threadId, payload) => request(`/threads/${encodeURIComponent(String(threadId))}/replies`, { method: "POST", body: payload, auth: true }),
    reactToPost: (postId, reaction) => request(`/posts/${encodeURIComponent(String(postId))}/reactions`, { method: "POST", body: { reaction }, auth: true }),
    bookmarkThread: (threadId, active = true) => request(`/threads/${encodeURIComponent(String(threadId))}/bookmark`, { method: "POST", body: { active }, auth: true }),
    listPolls: (params = {}, options = {}) => request(appendQuery("/polls", { limit: params.limit, offset: params.offset }), { ...options, auth: true }),
    createPoll: (payload) => request("/admin/polls", { method: "POST", body: payload, auth: true }),
    votePoll: (pollId, optionId) => request(`/polls/${encodeURIComponent(String(pollId))}/votes`, { method: "POST", body: { option_id: optionId }, auth: true }),
    closePoll: (pollId) => request(`/admin/polls/${encodeURIComponent(String(pollId))}/close`, { method: "POST", auth: true }),
    getMeSummary: (options = {}) => request("/me/summary", { ...options, auth: true }),
    listMyThreads: (params = {}, options = {}) => {
      const normalized = typeof params === "number" ? { limit: params } : params;
      return request(appendQuery("/me/threads", { limit: normalized.limit, offset: normalized.offset }), { ...options, auth: true });
    },
    listMyReplies: (params = {}, options = {}) => {
      const normalized = typeof params === "number" ? { limit: params } : params;
      return request(appendQuery("/me/replies", { limit: normalized.limit, offset: normalized.offset }), { ...options, auth: true });
    },
    listMyBookmarks: (params = {}, options = {}) => {
      const normalized = typeof params === "number" ? { limit: params } : params;
      return request(appendQuery("/me/bookmarks", { limit: normalized.limit, offset: normalized.offset }), { ...options, auth: true });
    },
    getUserProfile: (studentId2, options = {}) => request(`/users/${encodeURIComponent(String(studentId2))}`, options),
    followUser: (targetStudentId, active = true) => request("/follows", { method: "POST", body: { target_student_id: targetStudentId, active }, auth: true }),
    reportContent: (payload) => request("/reports", { method: "POST", body: payload, auth: true }),
    listNotifications: (params = {}, options = {}) => request(appendQuery("/notifications", { limit: params.limit, offset: params.offset }), { ...options, auth: true }),
    listMessages: (params = {}, options = {}) => request(appendQuery("/messages", { limit: params.limit, offset: params.offset }), { ...options, auth: true }),
    sendMessage: (payload) => request("/messages", { method: "POST", body: payload, auth: true }),
    checkIn: () => request("/checkins", { method: "POST", auth: true }),
    listBadges: (options = {}) => request("/badges", { ...options, auth: true }),
    listBackups: (params = {}, options = {}) => request(appendQuery("/backups", { limit: params.limit, offset: params.offset }), options),
    listAdminReports: (params = 50, options = {}) => {
      const normalized = typeof params === "number" ? { limit: params } : params;
      return request(appendQuery("/admin/reports", { limit: normalized.limit, offset: normalized.offset }), { ...options, auth: true });
    },
    listAdminUsers: (params = "", optionsOrLimit, maybeOptions = {}) => {
      const normalized = typeof params === "object" ? params : { query: params, limit: optionsOrLimit };
      const options = typeof params === "object" ? optionsOrLimit || {} : maybeOptions;
      return request(appendQuery("/admin/users", { query: normalized.query, limit: normalized.limit, offset: normalized.offset }), { ...options, auth: true });
    },
    listAdminBackups: (params = 20, options = {}) => {
      const normalized = typeof params === "number" ? { limit: params } : params;
      return request(appendQuery("/admin/backups", { limit: normalized.limit, offset: normalized.offset }), { ...options, auth: true });
    },
    runBackup: () => request("/admin/backups/run", { method: "POST", auth: true }),
    setUserBan: (payload) => request("/admin/bans", { method: "POST", body: payload, auth: true }),
    grantBadge: (payload) => request("/admin/badges", { method: "POST", body: payload, auth: true }),
    getAttachmentUrl: (attachmentIdOrUrl) => {
      const value = toText$2(attachmentIdOrUrl).trim();
      if (!value) return "";
      if (/^https?:\/\//i.test(value)) return value;
      const normalized = value.startsWith("/api/forum/attachments/") ? value.replace(/^\/api\/forum/i, "") : `/attachments/${encodeURIComponent(value)}`;
      return `${base}${normalized}`;
    },
    uploadAttachment: (file) => {
      const form = new FormData();
      form.append("file", file);
      return request("/attachments", { method: "POST", body: form, auth: true });
    }
  };
};
const CACHE_PREFIX = "hbu_forum_cache";
const DEFAULT_TTL_MS = 6e4;
const toText$1 = (value) => value == null ? "" : String(value);
const encodePart = (value) => encodeURIComponent(toText$1(value).trim());
const makeForumCacheKey = ({ studentId = "guest", apiBase = "", scope = "" } = {}) => `${CACHE_PREFIX}:${encodePart(studentId || "guest")}:${encodePart(apiBase)}:${encodePart(scope)}`;
const canUseStorage = () => typeof localStorage !== "undefined";
const listStorageKeys = () => {
  if (!canUseStorage()) return [];
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key) keys.push(key);
  }
  return keys;
};
const createForumCache = ({
  studentId = "guest",
  apiBase = "",
  now = () => Date.now()
} = {}) => {
  const context = {
    studentId: toText$1(studentId).trim() || "guest",
    apiBase: toText$1(apiBase).trim(),
    now
  };
  const keyFor = (scope) => makeForumCacheKey({ ...context, scope });
  const prefixFor = (scopePrefix = "") => makeForumCacheKey({ ...context, scope: scopePrefix });
  return {
    keyFor,
    read(scope) {
      if (!canUseStorage()) return null;
      try {
        const raw = localStorage.getItem(keyFor(scope));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
          value: parsed?.value,
          savedAt: Number(parsed?.savedAt || 0),
          expiresAt: Number(parsed?.expiresAt || 0),
          etag: toText$1(parsed?.etag || "")
        };
      } catch {
        return null;
      }
    },
    write(scope, value, { ttlMs = DEFAULT_TTL_MS, etag = "" } = {}) {
      if (!canUseStorage()) return value;
      const savedAt = Number(context.now());
      try {
        localStorage.setItem(keyFor(scope), JSON.stringify({
          value,
          savedAt,
          expiresAt: savedAt + Math.max(0, Number(ttlMs || DEFAULT_TTL_MS)),
          etag: toText$1(etag)
        }));
      } catch {
      }
      return value;
    },
    remove(scope) {
      if (!canUseStorage()) return;
      try {
        localStorage.removeItem(keyFor(scope));
      } catch {
      }
    },
    clear(scopePrefixes = [""]) {
      if (!canUseStorage()) return;
      const prefixes = (Array.isArray(scopePrefixes) ? scopePrefixes : [scopePrefixes]).map((scope) => prefixFor(scope));
      for (const key of listStorageKeys()) {
        if (prefixes.some((prefix) => key.startsWith(prefix))) {
          try {
            localStorage.removeItem(key);
          } catch {
          }
        }
      }
    },
    isFresh(entry) {
      return !!entry && Number(entry.expiresAt || 0) > Number(context.now());
    }
  };
};
const clearForumCache = (cache, scopePrefixes = [""]) => {
  cache?.clear?.(scopePrefixes);
};
const withForumCache = async (cache, scope, fetcher, { ttlMs = DEFAULT_TTL_MS } = {}) => {
  const cached = cache?.read?.(scope);
  if (cache?.isFresh?.(cached)) {
    return cached.value;
  }
  try {
    const payload = await fetcher({ etag: cached?.etag || "", cached });
    if (payload?.notModified && cached) {
      cache?.write?.(scope, cached.value, { ttlMs, etag: payload.etag || cached.etag || "" });
      return cached.value;
    }
    const hasMeta = payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "value");
    const value = hasMeta ? payload.value : payload;
    cache?.write?.(scope, value, { ttlMs, etag: hasMeta ? payload.etag || cached?.etag || "" : cached?.etag || "" });
    return value;
  } catch (error) {
    if (cached) return cached.value;
    throw error;
  }
};
const createForumPendingActions = ({ notify, onChange } = {}) => {
  const pending = /* @__PURE__ */ new Set();
  const emitChange = () => onChange?.(new Set(pending));
  return {
    isPending(key) {
      return pending.has(toText$1(key));
    },
    async run(key, task, { duplicateMessage = "正在处理，请勿重复点击", duplicateType = "info" } = {}) {
      const normalizedKey = toText$1(key);
      if (pending.has(normalizedKey)) {
        notify?.(duplicateMessage, duplicateType);
        return null;
      }
      pending.add(normalizedKey);
      emitChange();
      try {
        return await task();
      } finally {
        pending.delete(normalizedKey);
        emitChange();
      }
    }
  };
};
const toText = (value) => value == null ? "" : String(value);
const initials = (value) => {
  const text = toText(value).trim();
  return text ? text.slice(0, 2).toUpperCase() : "HB";
};
const authorName = (studentId, currentStudentId = "", nickname = "") => {
  const text = toText(studentId).trim();
  if (!text) return "匿名同学";
  if (text === String(currentStudentId || "").trim()) return toText(nickname).trim() || text;
  return text;
};
const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(toText(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};
const createForumSession = (props, emit) => {
  const studentId = String(props.studentId || "");
  const profile = ref(readForumProfile(studentId));
  loadForumAdminSecret(studentId).then((secret) => {
    if (secret) profile.value.admin_secret = secret;
  });
  const forumEnabled = ref(true);
  const apiBase = ref("");
  const errorMessage = ref("");
  const pendingActions = ref(/* @__PURE__ */ new Set());
  const adminFlag = ref(false);
  const isLoggedIn = computed(() => !!String(studentId || "").trim());
  let client = null;
  let forumCache = null;
  let pendingGuard = null;
  const syncPendingActions = (next) => {
    pendingActions.value = next;
  };
  const ensurePendingGuard = () => {
    if (!pendingGuard) {
      pendingGuard = createForumPendingActions({
        // showToast 的 type 为受限 ToastType，notify 接受 string：适配并归一化非法值
        notify: (message, type) => {
          showToast(message, type || void 0);
        },
        onChange: syncPendingActions
      });
    }
    return pendingGuard;
  };
  const isPending = (key) => {
    ensurePendingGuard();
    return pendingActions.value.has(toText(key));
  };
  const runPending = async (key, task, duplicateMessage = "正在处理，请勿重复点击") => {
    await ensurePendingGuard().run(key, task, { duplicateMessage });
  };
  const requireLogin = () => {
    showToast("请先登录后再使用社区功能", "warning");
    emit("require-login");
    return false;
  };
  const cached = (scope, fetcher, ttlMs = 6e4) => {
    if (!forumCache) return fetcher({});
    return withForumCache(
      forumCache,
      scope,
      fetcher,
      { ttlMs }
    );
  };
  const invalidateForumCache = (scopes = ["feed", "hot", "thread", "me", "notice", "message", "admin", "poll"]) => {
    if (forumCache) clearForumCache(forumCache, scopes);
  };
  const buildClient = async () => {
    const config = await fetchRemoteConfig();
    forumEnabled.value = config?.forum?.enabled !== false;
    apiBase.value = buildForumApiBase(config?.forum);
    client = createForumApiClient({
      apiBase: apiBase.value,
      studentId,
      nickname: profile.value.nickname,
      avatarUrl: profile.value.avatar_url,
      bio: profile.value.bio,
      adminSecret: await loadForumAdminSecret(studentId)
    });
    forumCache = createForumCache({
      studentId: studentId || "guest",
      apiBase: apiBase.value
    });
  };
  const session = {
    studentId,
    emit,
    profile,
    forumEnabled,
    apiBase,
    errorMessage,
    pendingActions,
    isLoggedIn,
    adminFlag,
    get client() {
      return client;
    },
    set client(value) {
      client = value;
    },
    get forumCache() {
      return forumCache;
    },
    set forumCache(value) {
      forumCache = value;
    },
    buildClient,
    cached,
    invalidateForumCache,
    isPending,
    runPending,
    requireLogin,
    toast: showToast
  };
  return session;
};
const normalizePolls = (items = []) => (Array.isArray(items) ? items : []).filter((poll) => poll && typeof poll === "object").map((poll) => {
  const record = poll;
  return {
    id: Number(record.id || 0),
    title: toText(record.title).trim() || "未命名投票",
    description: toText(record.description).trim(),
    // status 归一化到受控字面量，与 ForumPoll.status 类型对齐
    status: record.status === "closed" ? "closed" : "active",
    created_at: toText(record.created_at).trim() || (/* @__PURE__ */ new Date()).toISOString(),
    my_vote_option_id: record.my_vote_option_id == null ? null : Number(record.my_vote_option_id),
    options: Array.isArray(record.options) ? record.options.map((option, index) => {
      const optionRecord = option || {};
      return {
        id: Number(optionRecord.id || 0) || index + 1,
        label: toText(optionRecord.label).trim() || `选项 ${index + 1}`,
        score: Number(optionRecord.score || 0),
        votes: Number(optionRecord.votes || 0)
      };
    }) : []
  };
}).filter((poll) => poll.id > 0 && poll.options.length >= 2);
const pollOptionTotal = (poll) => (poll?.options || []).reduce((total, option) => total + Number(option.votes || 0), 0);
const pollOptionPercent = (poll, option) => {
  const total = pollOptionTotal(poll);
  return total ? Math.round(Number(option?.votes || 0) / total * 100) : 0;
};
const hasVotedInPoll = (poll) => poll?.my_vote_option_id != null;
const parsePollOptions = (draft) => {
  const text = String(draft || "").trim();
  if (!text) return [];
  return text.split(/\n+/).filter((line) => line.trim().length > 0).map((line, index) => {
    const [label, score] = line.split("|").map((part) => toText(part).trim());
    return {
      label: label || `选项 ${index + 1}`,
      score: Math.min(10, Math.max(0, Number(score || 0)))
    };
  }).filter((option) => option.label);
};
const pollAdminSummary = (polls) => {
  const activeCount = polls.filter((poll) => poll.status === "active").length;
  const voteCount = polls.reduce(
    (total, poll) => total + poll.options.reduce((sum, option) => sum + Number(option.votes || 0), 0),
    0
  );
  return {
    total: polls.length,
    active: activeCount,
    closed: Math.max(0, polls.length - activeCount),
    votes: voteCount
  };
};
const useForumPolls = (session, deps) => {
  const adminPolls = ref([]);
  const selectedPoll = ref(null);
  const pollDraft = ref({
    title: "本周学习体验投票",
    description: "由管理员发起，普通用户只在投票打分页参与，不再要求每个帖子评分。",
    options: "很有帮助|10\n比较有帮助|8\n一般|5\n需要改进|2"
  });
  const pollAdminSummary$1 = computed(() => pollAdminSummary(adminPolls.value));
  const loadAdminPolls = async ({ force = false } = {}) => {
    if (!session.isLoggedIn.value) {
      adminPolls.value = [];
      selectedPoll.value = null;
      return;
    }
    if (!session.client) await session.buildClient();
    if (force && session.forumCache) session.invalidateForumCache(["poll"]);
    try {
      const payload = await session.cached("poll:list", ({ etag }) => session.client.listPolls({ limit: 30 }, { includeMeta: true, etag }), 15e3);
      adminPolls.value = normalizePolls(payload?.items);
    } catch (error) {
      adminPolls.value = [];
      selectedPoll.value = null;
      session.toast(error?.message || "投票列表加载失败", "warning");
      return;
    }
    const previousId = Number(selectedPoll.value?.id || 0);
    selectedPoll.value = adminPolls.value.find((poll) => Number(poll.id) === previousId) || adminPolls.value.find((poll) => poll.status === "active") || adminPolls.value[0] || null;
  };
  const selectPoll = (poll) => {
    selectedPoll.value = poll || null;
  };
  const voteInPoll = async (option) => {
    if (!session.isLoggedIn.value) {
      session.requireLogin();
      return;
    }
    const poll = selectedPoll.value;
    if (!poll || poll.status === "closed") {
      session.toast("当前投票已关闭", "warning");
      return;
    }
    if (hasVotedInPoll(poll)) {
      session.toast("你已经参与过这个投票", "info");
      return;
    }
    await session.runPending(`poll:vote:${poll.id}:${option.id}`, async () => {
      const updated = await session.client.votePoll(poll.id, option.id);
      const normalized = normalizePolls([updated])[0];
      adminPolls.value = adminPolls.value.map(
        (item) => Number(item.id) === Number(poll.id) ? normalized : item
      );
      selectedPoll.value = adminPolls.value.find((item) => Number(item.id) === Number(poll.id)) || null;
      session.invalidateForumCache(["poll"]);
      session.toast("投票已记录", "success");
    }, "投票正在提交，请勿重复点击");
  };
  const createAdminPoll = async () => {
    if (!deps.isAdmin.value) return;
    const title = pollDraft.value.title.trim();
    const options = parsePollOptions(pollDraft.value.options);
    if (!title || options.length < 2) {
      session.toast("请填写投票标题，并至少提供两个选项", "warning");
      return;
    }
    await session.runPending("poll:create", async () => {
      const created = await session.client.createPoll({
        title,
        description: pollDraft.value.description.trim(),
        options
      });
      const poll = normalizePolls([created])[0];
      adminPolls.value = [poll, ...adminPolls.value].slice(0, 20);
      selectedPoll.value = poll;
      session.invalidateForumCache(["poll"]);
      pollDraft.value = {
        title: "",
        description: "",
        options: "赞成|10\n中立|5\n反对|1"
      };
      session.toast("发布投票", "success");
    });
  };
  const closeAdminPoll = async (poll) => {
    if (!deps.isAdmin.value || !poll?.id) return;
    await session.runPending(`poll:close:${poll.id}`, async () => {
      const closed = await session.client.closePoll(poll.id);
      const normalized = normalizePolls([closed])[0];
      adminPolls.value = adminPolls.value.map(
        (item) => Number(item.id) === Number(poll.id) ? normalized : item
      );
      selectedPoll.value = adminPolls.value.find((item) => Number(item.id) === Number(poll.id)) || selectedPoll.value;
      session.invalidateForumCache(["poll"]);
      session.toast("关闭投票", "success");
    });
  };
  return {
    adminPolls,
    selectedPoll,
    pollDraft,
    pollAdminSummary: pollAdminSummary$1,
    loadAdminPolls,
    selectPoll,
    voteInPoll,
    createAdminPoll,
    closeAdminPoll,
    pollOptionTotal,
    pollOptionPercent,
    hasVotedInPoll
  };
};
const useForumAdmin = (session, deps) => {
  const adminReports = ref([]);
  const adminUsers = ref([]);
  const adminBackups = ref([]);
  const adminSearch = ref("");
  const banDraft = ref({ student_id: "", reason: "" });
  const badgeDraft = ref({ student_id: "", badge_key: "helper", display_name: "热心同学" });
  const adminSummary = computed(() => ({
    reportCount: adminReports.value.length,
    userCount: adminUsers.value.length,
    bannedCount: adminUsers.value.filter((user) => Number(user.is_banned || 0)).length,
    backupCount: adminBackups.value.length,
    pollCount: deps.pollCount.value.total
  }));
  const latestBackup = computed(() => adminBackups.value[0] || null);
  const loadAdmin = async ({ force = false } = {}) => {
    if (!session.client || !session.isLoggedIn.value || !session.adminFlag.value) return;
    if (force) session.invalidateForumCache(["admin"]);
    const settled = await Promise.allSettled([
      session.cached("admin:reports", ({ etag }) => session.client.listAdminReports({ limit: 50 }, { includeMeta: true, etag }), 2e4),
      session.cached(`admin:users:${adminSearch.value}`, ({ etag }) => session.client.listAdminUsers({ query: adminSearch.value }, { includeMeta: true, etag }), 2e4),
      session.cached("admin:backups", ({ etag }) => session.client.listAdminBackups({ limit: 20 }, { includeMeta: true, etag }), 3e4)
    ]);
    const itemsOf = (value, fallback = []) => Array.isArray(value) ? value : fallback;
    if (settled[0].status === "fulfilled") adminReports.value = itemsOf(settled[0].value?.items);
    if (settled[1].status === "fulfilled") adminUsers.value = itemsOf(settled[1].value?.items);
    if (settled[2].status === "fulfilled") adminBackups.value = itemsOf(settled[2].value?.items);
  };
  const searchAdminUsers = async () => {
    await loadAdmin({ force: true });
  };
  const setUserBan = async (banned) => {
    const studentId = banDraft.value.student_id.trim();
    if (!studentId) {
      session.toast("请填写学号", "warning");
      return;
    }
    if (session.isPending(`admin:ban:${studentId}:${banned}`)) return;
    await session.runPending(`admin:ban:${studentId}:${banned}`, async () => {
      await session.client.setUserBan({ student_id: studentId, banned, reason: banDraft.value.reason.trim() });
      session.invalidateForumCache(["admin"]);
      session.toast(banned ? "已封禁用户" : "已解除封禁", "success");
      await loadAdmin({ force: true });
    });
  };
  const grantBadge = async () => {
    const payload = {
      student_id: badgeDraft.value.student_id.trim(),
      badge_key: badgeDraft.value.badge_key.trim(),
      display_name: badgeDraft.value.display_name.trim()
    };
    if (!payload.student_id || !payload.badge_key || !payload.display_name) {
      session.toast("请填写完整徽章信息", "warning");
      return;
    }
    if (session.isPending(`admin:badge:${payload.student_id}:${payload.badge_key}`)) return;
    await session.runPending(`admin:badge:${payload.student_id}:${payload.badge_key}`, async () => {
      await session.client.grantBadge(payload);
      session.invalidateForumCache(["admin"]);
      session.toast("徽章已发放", "success");
    });
  };
  const runBackup = async () => {
    if (!session.adminFlag.value) return;
    await session.runPending("admin:backup", async () => {
      await session.client.runBackup();
      session.invalidateForumCache(["admin"]);
      session.toast("备份任务已触发", "success");
      await loadAdmin({ force: true });
    });
  };
  return {
    adminReports,
    adminUsers,
    adminBackups,
    adminSearch,
    banDraft,
    badgeDraft,
    adminSummary,
    latestBackup,
    loadAdmin,
    searchAdminUsers,
    setUserBan,
    grantBadge,
    runBackup
  };
};
const useForumMe = (session, deps) => {
  const meSummary = ref(null);
  const myThreads = ref([]);
  const myReplies = ref([]);
  const myBookmarks = ref([]);
  const badges = ref([]);
  const notifications = ref([]);
  const messages = ref([]);
  const meStats = computed(() => meSummary.value?.stats || {});
  const profileCompletion = computed(() => {
    const checks = [
      session.profile.value.nickname?.trim(),
      session.profile.value.avatar_url?.trim(),
      session.profile.value.bio?.trim(),
      Number(meStats.value.checkin_count || 0) > 0
    ];
    const completed = checks.filter(Boolean).length;
    return Math.round(completed / checks.length * 100);
  });
  const bookmarkedIds = computed(() => new Set(myBookmarks.value.map((thread) => Number(thread.id))));
  const isAdmin = computed(() => session.adminFlag.value);
  const loadMe = async ({ force = false } = {}) => {
    if (!session.client || !session.isLoggedIn.value) return;
    if (force) session.invalidateForumCache(["me", "notice", "message", "admin"]);
    const settled = await Promise.allSettled([
      session.cached("me:summary", ({ etag }) => session.client.getMeSummary({ includeMeta: true, etag }), 3e4),
      session.cached("me:threads", ({ etag }) => session.client.listMyThreads({ limit: 30 }, { includeMeta: true, etag }), 3e4),
      session.cached("me:replies", ({ etag }) => session.client.listMyReplies({ limit: 30 }, { includeMeta: true, etag }), 3e4),
      session.cached("me:bookmarks", ({ etag }) => session.client.listMyBookmarks({ limit: 50 }, { includeMeta: true, etag }), 3e4),
      session.cached("notice:list", ({ etag }) => session.client.listNotifications({}, { includeMeta: true, etag }), 2e4),
      session.cached("message:list", ({ etag }) => session.client.listMessages({}, { includeMeta: true, etag }), 15e3),
      session.cached("me:badges", ({ etag }) => session.client.listBadges({ includeMeta: true, etag }), 6e4)
    ]);
    const itemsOf = (value, fallback = []) => Array.isArray(value) ? value : fallback;
    if (settled[0].status === "fulfilled") meSummary.value = settled[0].value;
    if (settled[1].status === "fulfilled") myThreads.value = itemsOf(settled[1].value?.items);
    if (settled[2].status === "fulfilled") myReplies.value = itemsOf(settled[2].value?.items);
    if (settled[3].status === "fulfilled") myBookmarks.value = itemsOf(settled[3].value?.items);
    if (settled[4].status === "fulfilled") notifications.value = itemsOf(settled[4].value?.items);
    if (settled[5].status === "fulfilled") messages.value = itemsOf(settled[5].value?.items);
    if (settled[6].status === "fulfilled") badges.value = itemsOf(settled[6].value?.items);
    const profileValue = meSummary.value?.profile || {};
    session.adminFlag.value = profileValue.is_admin === true || Number(profileValue.is_admin || 0) === 1;
    if (session.adminFlag.value) await deps.loadAdmin({ force });
  };
  const saveProfile = async () => {
    await saveForumAdminSecret(session.studentId, session.profile.value.admin_secret || "");
    session.profile.value = writeForumProfile(session.studentId, session.profile.value);
    session.client = null;
    session.forumCache = null;
    session.toast("社区资料已保存", "success");
    await session.buildClient();
    await loadMe({ force: true });
    await deps.loadAdminPolls({ force: true });
  };
  const checkIn = async () => {
    if (!session.isLoggedIn.value) {
      session.requireLogin();
      return;
    }
    if (!session.client) await session.buildClient();
    await session.runPending("checkin", async () => {
      await session.client.checkIn();
      session.invalidateForumCache(["me"]);
      session.toast("签到成功", "success");
      await loadMe({ force: true });
    });
  };
  return {
    meSummary,
    myThreads,
    myReplies,
    myBookmarks,
    badges,
    notifications,
    messages,
    meStats,
    profileCompletion,
    bookmarkedIds,
    isAdmin,
    loadMe,
    saveProfile,
    checkIn
  };
};
const fallbackCategories = [
  { id: 1, slug: "campus", name: "校园广场", description: "校园日常、资讯和闲聊" },
  { id: 2, slug: "study", name: "学习互助", description: "课程、考试、资料和选课交流" },
  { id: 3, slug: "life", name: "生活服务", description: "宿舍、食堂、二手和校园生活" },
  { id: 4, slug: "help", name: "软件反馈", description: "Mini-HBUT 使用反馈和建议" }
];
const useForumFeed = (session, deps) => {
  const categories = ref([]);
  const threads = ref([]);
  const hotThreads = ref([]);
  const selectedCategoryId = ref(0);
  const searchQuery = ref("");
  const loading = ref(false);
  const refreshing = ref(false);
  const hasRemoteCategories = computed(() => categories.value.length > 0);
  const visibleCategories = computed(() => categories.value.length ? categories.value : fallbackCategories);
  const selectedCategory = computed(
    () => visibleCategories.value.find((item) => Number(item.id) === Number(selectedCategoryId.value)) || visibleCategories.value[0]
  );
  const displayThreads = computed(() => threads.value.length ? threads.value : hotThreads.value);
  const feedReplyCount = computed(() => displayThreads.value.reduce((total, thread) => total + Number(thread.reply_count || 0), 0));
  const feedAttachmentCount = computed(
    () => displayThreads.value.reduce((total, thread) => total + Number(thread.attachment_ids?.length || 0), 0)
  );
  const categoryName = (categoryId) => visibleCategories.value.find((item) => Number(item.id) === Number(categoryId))?.name || "社区";
  const seedDefaultCategories = async () => {
    if (!session.client || !session.isLoggedIn.value) return;
    for (const category of fallbackCategories) {
      try {
        await session.client.createCategory({
          slug: category.slug,
          name: category.name,
          description: category.description
        });
      } catch {
        return;
      }
    }
  };
  const loadThreads = async ({ force = false } = {}) => {
    if (!session.client || !session.forumEnabled.value) return;
    if (force) session.invalidateForumCache(["feed", "hot"]);
    const categoryId = hasRemoteCategories.value ? selectedCategoryId.value || selectedCategory.value?.id : 0;
    const query = searchQuery.value.trim();
    const scope = query ? `feed:search:${categoryId}:${query}` : `feed:${categoryId || "all"}`;
    try {
      const payload = await session.cached(scope, ({ etag }) => {
        if (query) return session.client.searchThreads({ q: query, categoryId, limit: 40 }, { includeMeta: true, etag });
        return session.client.listThreads({ categoryId, limit: 40 }, { includeMeta: true, etag });
      }, 45e3);
      threads.value = Array.isArray(payload?.items) ? payload.items : [];
    } catch (error) {
      session.errorMessage.value = error?.message || "帖子列表加载失败";
    }
  };
  const loadForumData = async ({ force = false } = {}) => {
    if (!session.forumEnabled.value && session.client) return;
    loading.value = !force;
    refreshing.value = force;
    session.errorMessage.value = "";
    try {
      if (!session.client) await session.buildClient();
      if (force) session.invalidateForumCache();
      const [categoryPayload, hotPayload] = await Promise.all([
        session.cached("categories", ({ etag }) => session.client.listCategories({}, { includeMeta: true, etag }), 12e4),
        session.cached("hot:threads", ({ etag }) => session.client.listHotThreads(20, { includeMeta: true, etag }), 3e4)
      ]);
      categories.value = Array.isArray(categoryPayload?.items) ? categoryPayload.items : [];
      if (!categories.value.length) {
        await seedDefaultCategories();
        const seededPayload = await session.client.listCategories();
        categories.value = Array.isArray(seededPayload?.items) ? seededPayload.items : [];
      }
      hotThreads.value = Array.isArray(hotPayload?.items) ? hotPayload.items : [];
      if (!selectedCategoryId.value && visibleCategories.value[0]) {
        selectedCategoryId.value = Number(visibleCategories.value[0].id);
      }
      await Promise.all([loadThreads({ force }), deps.loadMe({ force })]);
    } catch (error) {
      session.errorMessage.value = error?.message || "论坛加载失败";
    } finally {
      loading.value = false;
      refreshing.value = false;
    }
  };
  const chooseCategory = async (category) => {
    selectedCategoryId.value = Number(category?.id || 0);
    await loadThreads();
  };
  const runSearch = async () => {
    await loadThreads({ force: true });
  };
  return {
    categories,
    threads,
    hotThreads,
    selectedCategoryId,
    searchQuery,
    loading,
    refreshing,
    hasRemoteCategories,
    visibleCategories,
    selectedCategory,
    displayThreads,
    feedReplyCount,
    feedAttachmentCount,
    categoryName,
    loadForumData,
    loadThreads,
    chooseCategory,
    runSearch
  };
};
const fileLabel = (file) => toText(file?.name).trim() || "附件";
const fileSizeLabel = (file) => {
  const size = Number(file?.size || 0);
  if (!Number.isFinite(size) || size <= 0) return "待上传";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};
const uploadStatusText = (status) => ({
  queued: "等待上传",
  uploading: "上传中",
  success: "已上传",
  failed: "上传失败"
})[status] || "等待上传";
const uploadScopeLabel = (scope) => ({
  thread: "发帖附件",
  reply: "回复附件",
  avatar: "头像图片",
  retry: "重试上传"
})[scope] || "图床文件";
const fileQueueKey = (file, scope = "thread") => `${scope}:${fileLabel(file)}:${Number(file?.size || 0)}:${Number(file?.lastModified || 0)}`;
const useForumMedia = (session) => {
  const uploadQueue = ref([]);
  const profileAvatarInput = ref(null);
  const avatarUploadStatus = ref("");
  const fileLabel$1 = (file) => fileLabel(file);
  const fileSizeLabel$1 = (file) => fileSizeLabel(file);
  const attachmentUrl = (attachmentId) => session.client?.getAttachmentUrl?.(toText(attachmentId)) || "";
  const attachmentProxyUrl = (payloadOrId) => {
    const record = payloadOrId && typeof payloadOrId === "object" ? payloadOrId : {};
    const directUrl = toText(record.url).trim();
    if (/^https?:\/\//i.test(directUrl)) return directUrl;
    const attachmentId = toText(record.attachment_id).trim();
    const rawValue = typeof payloadOrId === "object" && payloadOrId !== null ? "" : toText(payloadOrId).trim();
    const attachmentAddress = directUrl || attachmentId || rawValue;
    return attachmentAddress ? session.client?.getAttachmentUrl?.(attachmentAddress) || "" : "";
  };
  const resolveAvatarAttachmentUrl = (payload) => {
    const record = payload && typeof payload === "object" ? payload : {};
    const directUrl = toText(record.url).trim();
    if (/^https?:\/\//i.test(directUrl)) return directUrl;
    const attachmentAddress = directUrl || toText(record.attachment_id).trim();
    return attachmentAddress ? attachmentProxyUrl(attachmentAddress) : "";
  };
  const rememberUploadResult = (file, scope = "thread", patch = {}) => {
    const key = patch.key || fileQueueKey(file, scope);
    const current = uploadQueue.value.find((item) => item.key === key);
    const nextItem = {
      key,
      scope,
      file,
      name: fileLabel$1(file),
      sizeLabel: fileSizeLabel$1(file),
      status: "queued",
      progress: 0,
      attachmentId: "",
      proxyUrl: "",
      error: "",
      updatedAt: Date.now(),
      ...current || {},
      ...patch
    };
    uploadQueue.value = [
      ...uploadQueue.value.filter((item) => item.key !== key),
      nextItem
    ].slice(-12);
    return nextItem;
  };
  const syncUploadQueueForScope = (files, scope) => {
    const keys = new Set((files || []).map((file) => fileQueueKey(file, scope)));
    uploadQueue.value = uploadQueue.value.filter((item) => item.scope !== scope || keys.has(item.key));
    for (const file of files || []) rememberUploadResult(file, scope);
  };
  const uploadFiles = async (files, scope = "thread") => {
    const uploaded = [];
    for (const file of files || []) {
      try {
        rememberUploadResult(file, scope, { status: "uploading", progress: 45, error: "" });
        const payload = await session.client.uploadAttachment(file);
        const proxyUrl = attachmentProxyUrl(payload);
        rememberUploadResult(file, scope, {
          status: "success",
          progress: 100,
          attachmentId: toText(payload?.attachment_id).trim(),
          proxyUrl,
          error: ""
        });
        if (payload?.attachment_id) uploaded.push(payload.attachment_id);
      } catch (error) {
        rememberUploadResult(file, scope, {
          status: "failed",
          progress: 100,
          error: error?.message || "上传失败，点击重试"
        });
        throw error;
      }
    }
    return uploaded;
  };
  const retryUploadFile = async (item) => {
    const file = item.file;
    if (!file) return;
    if (!session.isLoggedIn.value) {
      session.requireLogin();
      return;
    }
    if (!session.client) await session.buildClient();
    await session.runPending(`upload:retry:${item.key}`, async () => {
      rememberUploadResult(file, item.scope || "retry", { key: item.key, status: "uploading", progress: 45, error: "" });
      try {
        const payload = await session.client.uploadAttachment(file);
        rememberUploadResult(file, item.scope || "retry", {
          key: item.key,
          status: "success",
          progress: 100,
          attachmentId: toText(payload?.attachment_id).trim(),
          proxyUrl: attachmentProxyUrl(payload),
          error: ""
        });
        session.toast("附件已重新上传到图床", "success");
      } catch (error) {
        rememberUploadResult(file, item.scope || "retry", {
          key: item.key,
          status: "failed",
          progress: 100,
          error: error?.message || "上传失败，点击重试"
        });
        throw error;
      }
    }, "附件正在重试上传，请勿重复点击");
  };
  const copyAttachmentUrl = async (value) => {
    const url = toText(value).trim();
    if (!url) {
      session.toast("暂无可复制的代理 URL", "warning");
      return;
    }
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(url);
      session.toast("代理 URL 已复制", "success");
    } catch {
      session.toast("当前环境不支持自动复制，请手动复制代理 URL", "warning");
    }
  };
  const openAvatarFilePicker = () => {
    if (session.isPending("profile:avatar-upload")) return;
    if (!session.isLoggedIn.value) {
      session.requireLogin();
      return;
    }
    profileAvatarInput.value?.click?.();
  };
  const uploadAvatarImage = async (event) => {
    const input = event?.target;
    const file = Array.from(input?.files || [])[0];
    if (!file) return;
    if (!session.isLoggedIn.value) {
      if (input) input.value = "";
      session.requireLogin();
      return;
    }
    if (!session.client) await session.buildClient();
    try {
      await session.runPending("profile:avatar-upload", async () => {
        avatarUploadStatus.value = "正在上传头像到图床";
        rememberUploadResult(file, "avatar", { status: "uploading", progress: 45, error: "" });
        const payload = await session.client.uploadAttachment(file);
        const avatarUrl = resolveAvatarAttachmentUrl(payload);
        if (!avatarUrl) throw new Error("图床未返回头像地址");
        session.profile.value.avatar_url = avatarUrl;
        rememberUploadResult(file, "avatar", {
          status: "success",
          progress: 100,
          attachmentId: toText(payload?.attachment_id).trim(),
          proxyUrl: avatarUrl,
          error: ""
        });
        avatarUploadStatus.value = "已回填图床地址，请保存资料";
        session.toast("头像已上传到图床，请保存资料", "success");
      }, "头像图床上传中，请勿重复选择");
    } catch (error) {
      rememberUploadResult(file, "avatar", { status: "failed", progress: 100, error: error?.message || "头像上传失败" });
      avatarUploadStatus.value = "头像上传失败，可重试或使用手动 URL";
      session.toast(error?.message || "头像上传失败", "error");
    } finally {
      if (input) input.value = "";
    }
  };
  return {
    uploadQueue,
    profileAvatarInput,
    avatarUploadStatus,
    uploadFiles,
    retryUploadFile,
    copyAttachmentUrl,
    attachmentUrl,
    attachmentProxyUrl,
    resolveAvatarAttachmentUrl,
    rememberUploadResult,
    syncUploadQueueForScope,
    openAvatarFilePicker,
    uploadAvatarImage,
    fileLabel: fileLabel$1,
    fileSizeLabel: fileSizeLabel$1,
    uploadStatusText,
    uploadScopeLabel
  };
};
const useForumDetail = (session, deps) => {
  const selectedThread = ref(null);
  const threadDetail = ref(null);
  const detailLoading = ref(false);
  const replyContent = ref("");
  const replyFiles = ref([]);
  const currentThread = computed(() => threadDetail.value?.thread || selectedThread.value || null);
  const threadAttachments = computed(() => currentThread.value?.attachment_ids || []);
  const replyPendingKey = computed(
    () => selectedThread.value?.id ? `reply:${selectedThread.value.id}:${replyContent.value.trim().slice(0, 80)}` : "reply:none"
  );
  const threadActionKey = (thread, action) => {
    const normalizedAction = toText(action).trim();
    if (normalizedAction === "follow") {
      return `follow:${toText(thread?.author_student_id).trim() || "unknown"}`;
    }
    return `${normalizedAction}:${thread?.id || "unknown"}`;
  };
  const openThread = async (thread) => {
    if (!session.client || !thread?.id) return;
    selectedThread.value = thread;
    threadDetail.value = null;
    detailLoading.value = true;
    try {
      const detail = await session.cached(`thread:${thread.id}`, ({ etag }) => session.client.getThread(thread.id, { includeMeta: true, etag }), 2e4);
      threadDetail.value = detail;
      selectedThread.value = detail?.thread || thread;
    } catch (error) {
      session.errorMessage.value = error?.message || "帖子详情加载失败";
    } finally {
      detailLoading.value = false;
    }
  };
  const resetDetail = () => {
    selectedThread.value = null;
    threadDetail.value = null;
  };
  const closeThread = () => {
    resetDetail();
    replyContent.value = "";
    replyFiles.value = [];
  };
  const submitReply = async () => {
    if (!session.isLoggedIn.value) {
      session.requireLogin();
      return;
    }
    if (!selectedThread.value?.id) return;
    const content = replyContent.value.trim();
    if (!content) {
      session.toast("回复内容不能为空", "warning");
      return;
    }
    await session.runPending(replyPendingKey.value, async () => {
      const attachmentIds = await deps.uploadFiles(replyFiles.value, "reply");
      await session.client.createReply(selectedThread.value.id, {
        content_md: content,
        attachment_ids: attachmentIds
      });
      replyContent.value = "";
      replyFiles.value = [];
      session.invalidateForumCache(["thread", "feed", "hot", "me"]);
      session.toast("回复已发送", "success");
      await openThread(selectedThread.value);
    });
  };
  const reactToReply = async (reply, reaction) => {
    if (!session.isLoggedIn.value) {
      session.requireLogin();
      return;
    }
    await session.runPending(`react:${reply.id}:${reaction}`, async () => {
      await session.client.reactToPost(reply.id, reaction);
      session.invalidateForumCache(["thread"]);
      session.toast("操作成功", "success");
      if (selectedThread.value) await openThread(selectedThread.value);
    });
  };
  const toggleBookmark = async (thread) => {
    if (!session.isLoggedIn.value) {
      session.requireLogin();
      return;
    }
    const active = !deps.bookmarkedIds.value.has(Number(thread.id));
    await session.runPending(`bookmark:${thread.id}`, async () => {
      await session.client.bookmarkThread(thread.id, active);
      session.invalidateForumCache(["me"]);
      session.toast(active ? "已收藏" : "已取消收藏", "success");
      await deps.loadMe({ force: true });
    });
  };
  const followAuthor = async (studentId) => {
    if (!session.isLoggedIn.value) {
      session.requireLogin();
      return;
    }
    const target = toText(studentId).trim();
    if (!target || target === String(session.studentId || "").trim()) return;
    await session.runPending(`follow:${target}`, async () => {
      await session.client.followUser(target, true);
      session.invalidateForumCache(["me"]);
      session.toast("已关注作者", "success");
      await deps.loadMe({ force: true });
    });
  };
  const reportThread = async (thread) => {
    if (!session.isLoggedIn.value) {
      session.requireLogin();
      return;
    }
    if (!thread?.id) return;
    await session.runPending(`report:${thread.id}`, async () => {
      await session.client.reportContent({
        target_type: "thread",
        target_id: thread.id,
        reason: "用户从客户端举报"
      });
      session.invalidateForumCache(["admin"]);
      session.toast("举报已提交", "success");
    });
  };
  const setReplyFiles = (event) => {
    const files = Array.from(event?.target?.files || []).slice(0, 4);
    replyFiles.value = files;
    deps.syncUploadQueueForScope(files, "reply");
  };
  const removeReplyFile = (index) => {
    const files = replyFiles.value.filter((_, fileIndex) => fileIndex !== index);
    replyFiles.value = files;
    deps.syncUploadQueueForScope(files, "reply");
  };
  return {
    selectedThread,
    threadDetail,
    detailLoading,
    replyContent,
    replyFiles,
    currentThread,
    threadAttachments,
    replyPendingKey,
    threadActionKey,
    openThread,
    closeThread,
    resetDetail,
    submitReply,
    reactToReply,
    toggleBookmark,
    followAuthor,
    reportThread,
    setReplyFiles,
    removeReplyFile
  };
};
const useForumComposer = (session, deps) => {
  const newThread = ref({ title: "", content_md: "" });
  const threadFiles = ref([]);
  const threadUploadInput = ref(null);
  const threadPendingKey = computed(
    () => `thread:${deps.selectedCategoryId.value}:${newThread.value.title.trim()}:${newThread.value.content_md.trim()}`.slice(0, 180)
  );
  const canPublishThread = computed(() => session.forumEnabled.value && session.isLoggedIn.value && deps.hasRemoteCategories.value);
  const composerHint = computed(() => {
    if (!session.forumEnabled.value) return "论坛暂未开放";
    if (!session.isLoggedIn.value) return "登录后可以发帖、收藏和回复";
    if (!deps.hasRemoteCategories.value) return "版块初始化中，请稍后刷新";
    return "";
  });
  const submitThread = async () => {
    if (!session.isLoggedIn.value) {
      session.requireLogin();
      return;
    }
    if (!session.client) await session.buildClient();
    const title = newThread.value.title.trim();
    const content = newThread.value.content_md.trim();
    if (!title || !content) {
      session.toast("标题和内容不能为空", "warning");
      return;
    }
    if (!canPublishThread.value) {
      session.toast(composerHint.value || "暂时无法发布", "warning");
      return;
    }
    await session.runPending(threadPendingKey.value, async () => {
      const attachmentIds = await deps.uploadFiles(threadFiles.value, "thread");
      const created = await session.client.createThread({
        category_id: deps.selectedCategoryId.value || deps.selectedCategory.value?.id,
        title,
        content_md: content,
        attachment_ids: attachmentIds
      });
      newThread.value = { title: "", content_md: "" };
      threadFiles.value = [];
      session.invalidateForumCache(["feed", "hot", "me"]);
      session.toast("发布成功", "success");
      await deps.loadForumData({ force: true });
      await deps.openThread(created);
    });
  };
  const setThreadFiles = (event) => {
    const files = Array.from(event?.target?.files || []).slice(0, 6);
    threadFiles.value = files;
    deps.syncUploadQueueForScope(files, "thread");
  };
  const removeThreadFile = (index) => {
    const files = threadFiles.value.filter((_, fileIndex) => fileIndex !== index);
    threadFiles.value = files;
    deps.syncUploadQueueForScope(files, "thread");
  };
  const openThreadFilePicker = () => {
    if (!session.isLoggedIn.value) {
      session.requireLogin();
      return;
    }
    threadUploadInput.value?.click?.();
  };
  return {
    newThread,
    threadFiles,
    threadUploadInput,
    threadPendingKey,
    canPublishThread,
    composerHint,
    submitThread,
    setThreadFiles,
    removeThreadFile,
    openThreadFilePicker
  };
};
const useForumNotice = (session, deps) => {
  const messageDraft = ref({ receiver_student_id: "", content: "" });
  const messagePendingKey = computed(() => {
    const receiver = messageDraft.value.receiver_student_id.trim();
    const content = messageDraft.value.content.trim();
    return `message:${receiver}:${content.slice(0, 40)}`;
  });
  const unreadCount = computed(() => deps.notifications.value.filter((item) => !Number(item.is_read || 0)).length);
  const sendMessage = async () => {
    if (!session.isLoggedIn.value) {
      session.requireLogin();
      return;
    }
    const receiver = messageDraft.value.receiver_student_id.trim();
    const content = messageDraft.value.content.trim();
    if (!receiver || !content) {
      session.toast("请填写收件人和内容", "warning");
      return;
    }
    await session.runPending(messagePendingKey.value, async () => {
      await session.client.sendMessage({ receiver_student_id: receiver, content });
      messageDraft.value = { receiver_student_id: "", content: "" };
      session.invalidateForumCache(["message"]);
      session.toast("私信已发送", "success");
      await deps.loadMe({ force: true });
    });
  };
  return {
    messageDraft,
    messagePendingKey,
    unreadCount,
    sendMessage
  };
};
const useForumUserProfile = (session, deps) => {
  const viewedUserProfile = ref(null);
  const viewedProfileLoading = ref(false);
  const viewedProfileInfo = computed(() => viewedUserProfile.value?.profile || {});
  const viewedProfileStats = computed(() => viewedUserProfile.value?.stats || {});
  const userProfileThreads = computed(() => {
    const target = toText(viewedProfileInfo.value.student_id).trim();
    if (!target) return [];
    return deps.displayThreads.value.filter((thread) => toText(thread.author_student_id).trim() === target).slice(0, 3);
  });
  const userProfileBadges = computed(() => {
    const items = viewedUserProfile.value?.badges || viewedUserProfile.value?.profile?.badges || [];
    return Array.isArray(items) ? items : [];
  });
  const openUserProfile = async (studentId) => {
    const target = toText(studentId).trim();
    if (!target) return;
    if (!session.client) await session.buildClient();
    viewedProfileLoading.value = true;
    viewedUserProfile.value = null;
    try {
      viewedUserProfile.value = await session.cached(`user-profile:${target}`, ({ etag }) => session.client.getUserProfile(target, { includeMeta: true, etag }), 3e4);
    } catch (error) {
      session.errorMessage.value = error?.message || "用户主页加载失败";
    } finally {
      viewedProfileLoading.value = false;
    }
  };
  return {
    viewedUserProfile,
    viewedProfileLoading,
    viewedProfileInfo,
    viewedProfileStats,
    userProfileThreads,
    userProfileBadges,
    openUserProfile
  };
};
const _hoisted_1 = {
  class: "forum-view",
  "data-stitch-design": "Campus Vitality"
};
const _hoisted_2 = { class: "forum-phone-shell" };
const _hoisted_3 = { class: "forum-shell-inner" };
const _hoisted_4 = { class: "forum-topbar" };
const _hoisted_5 = ["disabled", "title"];
const _hoisted_6 = ["aria-label"];
const _hoisted_7 = ["onClick"];
const _hoisted_8 = { class: "forum-canvas" };
const _hoisted_9 = {
  key: 0,
  class: "system-banner"
};
const _hoisted_10 = ["aria-label"];
const _hoisted_11 = ["onClick"];
const _hoisted_12 = { class: "material-symbols-outlined" };
const _hoisted_13 = { key: 0 };
const _hoisted_14 = {
  class: "page-stack",
  "data-forum-page": "feed"
};
const _hoisted_15 = { class: "forum-hero-card" };
const _hoisted_16 = ["disabled"];
const _hoisted_17 = { class: "search-card" };
const _hoisted_18 = ["placeholder"];
const _hoisted_19 = ["aria-label"];
const _hoisted_20 = ["aria-label"];
const _hoisted_21 = ["onClick"];
const _hoisted_22 = { class: "section-heading" };
const _hoisted_23 = { class: "eyebrow" };
const _hoisted_24 = ["aria-label"];
const _hoisted_25 = {
  key: 2,
  class: "empty-card"
};
const _hoisted_26 = ["onClick"];
const _hoisted_27 = { class: "post-author" };
const _hoisted_28 = ["onClick"];
const _hoisted_29 = { class: "category-badge" };
const _hoisted_30 = {
  key: 0,
  class: "media-preview"
};
const _hoisted_31 = ["aria-label"];
const _hoisted_32 = ["onClick"];
const _hoisted_33 = ["disabled", "onClick"];
const _hoisted_34 = { class: "material-symbols-outlined" };
const _hoisted_35 = {
  key: 1,
  class: "page-stack",
  "data-forum-page": "detail"
};
const _hoisted_36 = { class: "detail-topbar" };
const _hoisted_37 = ["title"];
const _hoisted_38 = ["title", "disabled"];
const _hoisted_39 = ["aria-label"];
const _hoisted_40 = {
  key: 1,
  class: "detail-card"
};
const _hoisted_41 = { class: "post-author large" };
const _hoisted_42 = { class: "category-badge" };
const _hoisted_43 = { class: "detail-content" };
const _hoisted_44 = { class: "detail-action-bar" };
const _hoisted_45 = ["disabled"];
const _hoisted_46 = ["disabled"];
const _hoisted_47 = ["disabled"];
const _hoisted_48 = {
  key: 0,
  class: "image-grid attachment-preview-list"
};
const _hoisted_49 = ["href"];
const _hoisted_50 = ["src", "alt"];
const _hoisted_51 = { class: "comment-panel" };
const _hoisted_52 = { class: "section-heading compact" };
const _hoisted_53 = { class: "reply-composer" };
const _hoisted_54 = { class: "icon-button tinted file-trigger" };
const _hoisted_55 = ["disabled"];
const _hoisted_56 = { class: "send-label" };
const _hoisted_57 = {
  key: 0,
  class: "reply-attachment-list"
};
const _hoisted_58 = { class: "attachment-preview-list" };
const _hoisted_59 = ["title", "onClick"];
const _hoisted_60 = ["onClick"];
const _hoisted_61 = { class: "comment-bubble" };
const _hoisted_62 = {
  key: 0,
  class: "inline-links"
};
const _hoisted_63 = ["href"];
const _hoisted_64 = { class: "comment-actions" };
const _hoisted_65 = ["onClick"];
const _hoisted_66 = ["onClick"];
const _hoisted_67 = {
  key: 1,
  class: "empty-card compact"
};
const _hoisted_68 = {
  key: 2,
  class: "compose-page",
  "data-forum-page": "compose"
};
const _hoisted_69 = { class: "compose-topbar" };
const _hoisted_70 = ["disabled"];
const _hoisted_71 = { class: "compose-guidance" };
const _hoisted_72 = { class: "editor-card" };
const _hoisted_73 = ["value"];
const _hoisted_74 = { class: "attachment-bar" };
const _hoisted_75 = ["title"];
const _hoisted_76 = { class: "attachment-copy" };
const _hoisted_77 = { class: "char-count" };
const _hoisted_78 = {
  key: 0,
  class: "attachment-preview-list"
};
const _hoisted_79 = ["title", "onClick"];
const _hoisted_80 = {
  key: 1,
  class: "form-hint"
};
const _hoisted_81 = {
  key: 2,
  class: "form-hint warning"
};
const _hoisted_82 = {
  key: 3,
  class: "poll-score-page",
  "data-forum-page": "polls"
};
const _hoisted_83 = { class: "poll-score-hero" };
const _hoisted_84 = { class: "poll-score-summary" };
const _hoisted_85 = { class: "poll-score-grid" };
const _hoisted_86 = { class: "poll-score-card poll-list-card" };
const _hoisted_87 = { class: "section-heading compact" };
const _hoisted_88 = ["onClick"];
const _hoisted_89 = {
  key: 0,
  class: "poll-score-card"
};
const _hoisted_90 = { class: "section-heading compact" };
const _hoisted_91 = { class: "poll-option-list" };
const _hoisted_92 = ["disabled", "onClick"];
const _hoisted_93 = { class: "form-hint" };
const _hoisted_94 = {
  key: 1,
  class: "empty-card compact"
};
const _hoisted_95 = {
  key: 4,
  class: "page-stack",
  "data-forum-page": "notice"
};
const _hoisted_96 = { class: "section-heading tall" };
const _hoisted_97 = { class: "notice-summary-strip" };
const _hoisted_98 = { class: "notification-list" };
const _hoisted_99 = {
  key: 0,
  class: "empty-card compact"
};
const _hoisted_100 = { class: "section-heading compact" };
const _hoisted_101 = { class: "message-composer-card" };
const _hoisted_102 = { class: "message-form" };
const _hoisted_103 = ["placeholder"];
const _hoisted_104 = ["placeholder"];
const _hoisted_105 = ["disabled"];
const _hoisted_106 = { class: "message-thread-list" };
const _hoisted_107 = {
  key: 0,
  class: "empty-card compact"
};
const _hoisted_108 = {
  key: 5,
  class: "page-stack",
  "data-forum-page": "me"
};
const _hoisted_109 = { class: "profile-dashboard-card" };
const _hoisted_110 = { class: "profile-body" };
const _hoisted_111 = ["disabled", "title"];
const _hoisted_112 = ["src", "alt"];
const _hoisted_113 = { key: 1 };
const _hoisted_114 = { class: "avatar-upload-overlay" };
const _hoisted_115 = ["disabled"];
const _hoisted_116 = { class: "tag-row" };
const _hoisted_117 = { class: "profile-stat-strip" };
const _hoisted_118 = { class: "edit-card" };
const _hoisted_119 = { class: "avatar-setting-card" };
const _hoisted_120 = ["aria-label"];
const _hoisted_121 = ["src", "alt"];
const _hoisted_122 = { key: 1 };
const _hoisted_123 = { class: "avatar-setting-actions" };
const _hoisted_124 = { class: "avatar-upload-title" };
const _hoisted_125 = { class: "form-hint" };
const _hoisted_126 = { class: "avatar-upload-field" };
const _hoisted_127 = ["disabled"];
const _hoisted_128 = {
  key: 0,
  class: "avatar-upload-status"
};
const _hoisted_129 = { class: "form-hint" };
const _hoisted_130 = { class: "avatar-manual-fallback" };
const _hoisted_131 = ["placeholder"];
const _hoisted_132 = ["placeholder"];
const _hoisted_133 = { class: "admin-secret-field" };
const _hoisted_134 = ["placeholder"];
const _hoisted_135 = { class: "profile-list-grid" };
const _hoisted_136 = { class: "profile-list-card" };
const _hoisted_137 = ["onClick"];
const _hoisted_138 = {
  key: 0,
  class: "empty-card compact"
};
const _hoisted_139 = { class: "profile-list-card" };
const _hoisted_140 = ["onClick"];
const _hoisted_141 = {
  key: 0,
  class: "empty-card compact"
};
const _hoisted_142 = { class: "profile-list-card" };
const _hoisted_143 = ["onClick"];
const _hoisted_144 = {
  key: 0,
  class: "empty-card compact"
};
const _hoisted_145 = { class: "badge-cloud" };
const _hoisted_146 = { key: 0 };
const _hoisted_147 = {
  key: 6,
  class: "page-stack",
  "data-forum-page": "user-profile"
};
const _hoisted_148 = { class: "detail-topbar" };
const _hoisted_149 = ["aria-label"];
const _hoisted_150 = {
  key: 1,
  class: "user-profile-hero"
};
const _hoisted_151 = { class: "profile-body" };
const _hoisted_152 = { class: "profile-avatar" };
const _hoisted_153 = ["src", "alt"];
const _hoisted_154 = { key: 1 };
const _hoisted_155 = { class: "user-profile-actions" };
const _hoisted_156 = ["disabled"];
const _hoisted_157 = { class: "user-profile-stat-strip" };
const _hoisted_158 = { class: "user-profile-badges" };
const _hoisted_159 = { key: 0 };
const _hoisted_160 = { class: "user-profile-content-grid" };
const _hoisted_161 = { class: "profile-list-card" };
const _hoisted_162 = ["onClick"];
const _hoisted_163 = {
  key: 0,
  class: "empty-card compact"
};
const _hoisted_164 = {
  key: 7,
  class: "page-stack",
  "data-forum-page": "admin"
};
const _hoisted_165 = { class: "admin-hero-card" };
const _hoisted_166 = ["disabled"];
const _hoisted_167 = { class: "admin-summary-strip" };
const _hoisted_168 = { class: "admin-grid" };
const _hoisted_169 = { class: "admin-card admin-section-card reports" };
const _hoisted_170 = { class: "section-heading compact" };
const _hoisted_171 = { class: "admin-report-actions" };
const _hoisted_172 = {
  class: "ghost-pill",
  type: "button"
};
const _hoisted_173 = {
  key: 0,
  class: "empty-card compact"
};
const _hoisted_174 = { class: "admin-card admin-section-card users" };
const _hoisted_175 = { class: "section-heading compact" };
const _hoisted_176 = { class: "inline-form" };
const _hoisted_177 = ["placeholder"];
const _hoisted_178 = { class: "admin-user-actions" };
const _hoisted_179 = ["onClick"];
const _hoisted_180 = { class: "admin-card admin-section-card moderation" };
const _hoisted_181 = ["placeholder"];
const _hoisted_182 = ["placeholder"];
const _hoisted_183 = { class: "button-row" };
const _hoisted_184 = ["disabled"];
const _hoisted_185 = ["disabled"];
const _hoisted_186 = { class: "admin-card admin-section-card badge-issuer" };
const _hoisted_187 = ["placeholder"];
const _hoisted_188 = ["placeholder"];
const _hoisted_189 = ["disabled"];
const _hoisted_190 = { class: "admin-card admin-section-card poll-admin span-2" };
const _hoisted_191 = { class: "section-heading compact" };
const _hoisted_192 = { class: "poll-admin-form" };
const _hoisted_193 = ["placeholder"];
const _hoisted_194 = ["placeholder"];
const _hoisted_195 = ["placeholder"];
const _hoisted_196 = ["disabled"];
const _hoisted_197 = { class: "backup-record-list" };
const _hoisted_198 = ["disabled", "onClick"];
const _hoisted_199 = { class: "admin-card admin-section-card backup-panel span-2" };
const _hoisted_200 = { class: "section-heading compact" };
const _hoisted_201 = { class: "backup-status-card" };
const _hoisted_202 = { class: "backup-record-list" };
const _hoisted_203 = { class: "admin-path-chip" };
const _hoisted_204 = { class: "admin-path-chip" };
const _hoisted_205 = {
  key: 0,
  class: "empty-card compact"
};
const _hoisted_206 = ["aria-label"];
const _hoisted_207 = { class: "upload-drop-card" };
const _hoisted_208 = { class: "upload-progress-list" };
const _hoisted_209 = {
  class: "upload-progress-bar",
  "aria-hidden": "true"
};
const _hoisted_210 = ["onClick"];
const _hoisted_211 = {
  key: 1,
  class: "form-hint warning"
};
const _hoisted_212 = { class: "upload-progress-actions" };
const _hoisted_213 = { class: "upload-status-pill" };
const _hoisted_214 = ["disabled", "onClick"];
function render(_ctx, _cache, $props, $setup, $data, $options) {
  return openBlock(), createElementBlock("section", _hoisted_1, [
    createBaseVNode("div", _hoisted_2, [
      createBaseVNode("div", _hoisted_3, [
        createBaseVNode("header", _hoisted_4, [
          createBaseVNode("button", {
            class: "avatar-button",
            type: "button",
            onClick: _cache[0] || (_cache[0] = ($event) => $setup.switchTab("me"))
          }, [
            createBaseVNode("span", null, toDisplayString($setup.initials($setup.profile.nickname || $props.studentId)), 1)
          ]),
          _cache[55] || (_cache[55] = createBaseVNode("h1", null, "HBUT Forum", -1)),
          createBaseVNode("button", {
            class: "icon-button",
            type: "button",
            disabled: $setup.refreshing,
            title: $setup.t("forum.title.refresh"),
            onClick: _cache[1] || (_cache[1] = ($event) => $setup.loadForumData({ force: true }))
          }, [..._cache[54] || (_cache[54] = [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "refresh", -1)
          ])], 8, _hoisted_5)
        ]),
        createBaseVNode("nav", {
          class: "category-nav",
          "aria-label": $setup.t("forum.nav.categories")
        }, [
          (openBlock(true), createElementBlock(Fragment, null, renderList($setup.visibleCategories, (category) => {
            return openBlock(), createElementBlock("button", {
              key: category.slug || category.id,
              type: "button",
              class: normalizeClass({ active: Number($setup.selectedCategoryId) === Number(category.id) }),
              onClick: ($event) => $setup.chooseCategory(category)
            }, toDisplayString(category.name), 11, _hoisted_7);
          }), 128))
        ], 8, _hoisted_6),
        createBaseVNode("main", _hoisted_8, [
          $setup.errorMessage ? (openBlock(), createElementBlock("section", _hoisted_9, [
            _cache[56] || (_cache[56] = createBaseVNode("span", { class: "material-symbols-outlined" }, "info", -1)),
            createBaseVNode("span", null, toDisplayString($setup.errorMessage), 1)
          ])) : createCommentVNode("", true),
          createBaseVNode("section", {
            class: "quick-tabs",
            "aria-label": $setup.t("forum.nav.pages")
          }, [
            (openBlock(true), createElementBlock(Fragment, null, renderList($setup.visibleTabs, (tab) => {
              return openBlock(), createElementBlock("button", {
                key: tab.key,
                type: "button",
                class: normalizeClass({ active: $setup.activeTab === tab.key }),
                onClick: ($event) => $setup.switchTab(tab.key)
              }, [
                createBaseVNode("span", _hoisted_12, toDisplayString(tab.icon), 1),
                createBaseVNode("span", null, toDisplayString(tab.label), 1),
                tab.key === "notice" && $setup.unreadCount ? (openBlock(), createElementBlock("em", _hoisted_13, toDisplayString($setup.unreadCount), 1)) : createCommentVNode("", true)
              ], 10, _hoisted_11);
            }), 128))
          ], 8, _hoisted_10),
          withDirectives(createBaseVNode("section", _hoisted_14, [
            createBaseVNode("div", _hoisted_15, [
              createBaseVNode("div", null, [
                _cache[57] || (_cache[57] = createBaseVNode("span", { class: "eyebrow" }, "Mini-HBUT Community", -1)),
                createBaseVNode("h2", null, toDisplayString($setup.t("forum.hero.title")), 1),
                createBaseVNode("p", null, toDisplayString($setup.isLoggedIn ? _ctx.tf("forum.hero.welcome", { name: $setup.profile.nickname || $props.studentId }) : $setup.t("forum.hero.loginHint")), 1)
              ]),
              createBaseVNode("button", {
                class: "primary-pill",
                type: "button",
                disabled: !$setup.isLoggedIn,
                onClick: _cache[2] || (_cache[2] = ($event) => $setup.switchTab("compose"))
              }, [
                _cache[58] || (_cache[58] = createBaseVNode("span", { class: "material-symbols-outlined" }, "edit_square", -1)),
                createTextVNode(" " + toDisplayString($setup.t("forum.hero.publish")), 1)
              ], 8, _hoisted_16)
            ]),
            createBaseVNode("div", _hoisted_17, [
              createBaseVNode("label", null, [
                _cache[59] || (_cache[59] = createBaseVNode("span", { class: "material-symbols-outlined" }, "search", -1)),
                withDirectives(createBaseVNode("input", {
                  id: "forum-search",
                  "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => $setup.searchQuery = $event),
                  name: "forum-search",
                  placeholder: $setup.t("forum.search.placeholder"),
                  onKeyup: withKeys($setup.runSearch, ["enter"])
                }, null, 40, _hoisted_18), [
                  [vModelText, $setup.searchQuery]
                ])
              ]),
              createBaseVNode("button", {
                class: "icon-button tinted",
                type: "button",
                onClick: $setup.runSearch
              }, [..._cache[60] || (_cache[60] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "travel_explore", -1)
              ])])
            ]),
            createBaseVNode("div", {
              class: "feed-meta-strip",
              "aria-label": $setup.t("forum.meta.overview")
            }, [
              createBaseVNode("div", null, [
                createBaseVNode("strong", null, toDisplayString($setup.displayThreads.length), 1),
                createBaseVNode("span", null, toDisplayString($setup.t("forum.meta.threads")), 1)
              ]),
              createBaseVNode("div", null, [
                createBaseVNode("strong", null, toDisplayString($setup.pollAdminSummary.active), 1),
                createBaseVNode("span", null, toDisplayString($setup.t("forum.meta.polls")), 1)
              ]),
              createBaseVNode("div", null, [
                createBaseVNode("strong", null, toDisplayString($setup.feedReplyCount), 1),
                createBaseVNode("span", null, toDisplayString($setup.t("forum.meta.replies")), 1)
              ]),
              createBaseVNode("div", null, [
                createBaseVNode("strong", null, toDisplayString($setup.feedAttachmentCount), 1),
                createBaseVNode("span", null, toDisplayString($setup.t("forum.meta.attachments")), 1)
              ])
            ], 8, _hoisted_19),
            $setup.hotThreads.length ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "hot-thread-strip",
              "aria-label": $setup.t("forum.meta.hotThreads")
            }, [
              (openBlock(true), createElementBlock(Fragment, null, renderList($setup.hotThreads.slice(0, 4), (hotThread) => {
                return openBlock(), createElementBlock("button", {
                  key: hotThread.id,
                  type: "button",
                  onClick: ($event) => $setup.openThread(hotThread)
                }, [
                  _cache[61] || (_cache[61] = createBaseVNode("span", { class: "material-symbols-outlined" }, "local_fire_department", -1)),
                  createBaseVNode("span", null, toDisplayString(hotThread.title), 1)
                ], 8, _hoisted_21);
              }), 128))
            ], 8, _hoisted_20)) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_22, [
              createBaseVNode("div", null, [
                createBaseVNode("span", _hoisted_23, toDisplayString($setup.searchQuery.trim() ? "Search Results" : $setup.selectedCategory?.name || $setup.t("forum.feed.hot")), 1),
                createBaseVNode("h3", null, toDisplayString($setup.searchQuery.trim() || $setup.selectedCategory?.description || $setup.t("forum.feed.defaultDescription")), 1)
              ]),
              createBaseVNode("span", null, toDisplayString(_ctx.tf("forum.feed.countSuffix", { n: $setup.displayThreads.length })), 1)
            ]),
            $setup.loading ? (openBlock(), createElementBlock("div", {
              key: 1,
              class: "forum-skeleton-list",
              "aria-label": $setup.t("forum.feed.loading")
            }, [
              (openBlock(), createElementBlock(Fragment, null, renderList(3, (item) => {
                return createBaseVNode("article", {
                  key: item,
                  class: "skeleton-card",
                  "aria-hidden": "true"
                }, [..._cache[62] || (_cache[62] = [
                  createBaseVNode("span", { class: "skeleton-pill" }, null, -1),
                  createBaseVNode("span", { class: "skeleton-line wide" }, null, -1),
                  createBaseVNode("span", { class: "skeleton-line" }, null, -1),
                  createBaseVNode("span", { class: "skeleton-line short" }, null, -1)
                ])]);
              }), 64))
            ], 8, _hoisted_24)) : !$setup.displayThreads.length ? (openBlock(), createElementBlock("div", _hoisted_25, [
              _cache[63] || (_cache[63] = createBaseVNode("span", { class: "material-symbols-outlined" }, "forum", -1)),
              createBaseVNode("strong", null, toDisplayString($setup.t("forum.feed.emptyTitle")), 1),
              createBaseVNode("p", null, toDisplayString($setup.t("forum.feed.emptyDesc")), 1)
            ])) : (openBlock(true), createElementBlock(Fragment, { key: 3 }, renderList($setup.displayThreads, (thread) => {
              return openBlock(), createElementBlock("article", {
                key: thread.id,
                class: normalizeClass(["post-card", { active: $setup.selectedThread?.id === thread.id }]),
                onClick: ($event) => $setup.openThread(thread)
              }, [
                createBaseVNode("div", _hoisted_27, [
                  createBaseVNode("button", {
                    class: "mini-avatar",
                    type: "button",
                    onClick: withModifiers(($event) => $setup.openUserProfile(thread.author_student_id), ["stop"])
                  }, toDisplayString($setup.initials($setup.authorName(thread.author_student_id))), 9, _hoisted_28),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString($setup.authorName(thread.author_student_id)), 1),
                    createBaseVNode("small", null, toDisplayString($setup.formatTime(thread.updated_at || thread.created_at)), 1)
                  ]),
                  createBaseVNode("span", _hoisted_29, toDisplayString($setup.categoryName(thread.category_id)), 1)
                ]),
                createBaseVNode("h3", null, toDisplayString(thread.title), 1),
                createBaseVNode("p", null, toDisplayString(thread.content_md), 1),
                thread.attachment_ids?.length ? (openBlock(), createElementBlock("div", _hoisted_30, [
                  _cache[64] || (_cache[64] = createBaseVNode("span", { class: "material-symbols-outlined" }, "image", -1)),
                  createTextVNode(" " + toDisplayString(_ctx.tf("forum.compose.attachmentCount", { n: thread.attachment_ids.length })), 1)
                ])) : createCommentVNode("", true),
                createBaseVNode("div", {
                  class: "thread-stat-grid",
                  "aria-label": $setup.t("forum.feed.heat")
                }, [
                  createBaseVNode("span", null, [
                    createBaseVNode("strong", null, toDisplayString(Number(thread.reply_count || 0) + Number(thread.attachment_ids?.length || 0)), 1),
                    createTextVNode(toDisplayString($setup.t("forum.feed.heat")), 1)
                  ]),
                  createBaseVNode("span", null, [
                    createBaseVNode("strong", null, toDisplayString(thread.reply_count || 0), 1),
                    createTextVNode(toDisplayString($setup.t("forum.meta.replies")), 1)
                  ]),
                  createBaseVNode("span", null, [
                    createBaseVNode("strong", null, toDisplayString(thread.attachment_ids?.length || 0), 1),
                    createTextVNode(toDisplayString($setup.t("forum.meta.attachments")), 1)
                  ])
                ], 8, _hoisted_31),
                createBaseVNode("div", {
                  class: "post-actions",
                  onClick: _cache[4] || (_cache[4] = withModifiers(() => {
                  }, ["stop"]))
                }, [
                  createBaseVNode("button", {
                    class: "thread-action-button",
                    type: "button",
                    onClick: ($event) => $setup.openThread(thread)
                  }, [
                    _cache[65] || (_cache[65] = createBaseVNode("span", { class: "material-symbols-outlined" }, "comment", -1)),
                    createTextVNode(" " + toDisplayString(thread.reply_count || 0), 1)
                  ], 8, _hoisted_32),
                  createBaseVNode("button", {
                    class: "thread-action-button",
                    type: "button",
                    disabled: $setup.isPending($setup.threadActionKey(thread, "bookmark")),
                    onClick: ($event) => $setup.toggleBookmark(thread)
                  }, [
                    createBaseVNode("span", _hoisted_34, toDisplayString($setup.bookmarkedIds.has(Number(thread.id)) ? "bookmark" : "bookmark_add"), 1),
                    createTextVNode(" " + toDisplayString($setup.isPending($setup.threadActionKey(thread, "bookmark")) ? $setup.t("forum.feed.bookmarking") : $setup.bookmarkedIds.has(Number(thread.id)) ? $setup.t("forum.feed.bookmarked") : $setup.t("forum.feed.bookmark")), 1)
                  ], 8, _hoisted_33)
                ])
              ], 10, _hoisted_26);
            }), 128))
          ], 512), [
            [vShow, $setup.activeTab === "feed"]
          ]),
          $setup.activeTab === "detail" ? (openBlock(), createElementBlock("section", _hoisted_35, [
            createBaseVNode("div", _hoisted_36, [
              createBaseVNode("button", {
                class: "icon-button",
                type: "button",
                title: $setup.t("forum.detail.backToList"),
                onClick: $setup.closeThread
              }, [..._cache[66] || (_cache[66] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)
              ])], 8, _hoisted_37),
              createBaseVNode("h2", null, toDisplayString($setup.currentThread?.title || $setup.t("forum.detail.defaultTitle")), 1),
              createBaseVNode("button", {
                class: "icon-button",
                type: "button",
                title: $setup.t("forum.detail.report"),
                disabled: !$setup.currentThread || $setup.isPending($setup.threadActionKey($setup.currentThread, "report")),
                onClick: _cache[5] || (_cache[5] = ($event) => $setup.reportThread($setup.currentThread))
              }, [..._cache[67] || (_cache[67] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "flag", -1)
              ])], 8, _hoisted_38)
            ]),
            $setup.detailLoading ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "forum-skeleton-list",
              "aria-label": $setup.t("forum.detail.loading")
            }, [..._cache[68] || (_cache[68] = [
              createStaticVNode('<article class="skeleton-card detail" aria-hidden="true" data-v-d0167b19><span class="skeleton-pill" data-v-d0167b19></span><span class="skeleton-line wide" data-v-d0167b19></span><span class="skeleton-line" data-v-d0167b19></span><span class="skeleton-line" data-v-d0167b19></span><span class="skeleton-line short" data-v-d0167b19></span></article>', 1)
            ])], 8, _hoisted_39)) : $setup.currentThread ? (openBlock(), createElementBlock("article", _hoisted_40, [
              createBaseVNode("div", _hoisted_41, [
                createBaseVNode("button", {
                  class: "mini-avatar large",
                  type: "button",
                  onClick: _cache[6] || (_cache[6] = ($event) => $setup.openUserProfile($setup.currentThread.author_student_id))
                }, toDisplayString($setup.initials($setup.authorName($setup.currentThread.author_student_id))), 1),
                createBaseVNode("div", null, [
                  createBaseVNode("strong", null, toDisplayString($setup.authorName($setup.currentThread.author_student_id)), 1),
                  createBaseVNode("small", null, toDisplayString($setup.formatTime($setup.currentThread.created_at)) + " · " + toDisplayString($setup.categoryName($setup.currentThread.category_id)), 1)
                ]),
                createBaseVNode("span", _hoisted_42, toDisplayString($setup.threadAttachments.length || 0) + " " + toDisplayString($setup.t("forum.meta.attachments")), 1)
              ]),
              createBaseVNode("h2", null, toDisplayString($setup.currentThread.title), 1),
              createBaseVNode("p", _hoisted_43, toDisplayString($setup.currentThread.content_md), 1),
              createBaseVNode("div", _hoisted_44, [
                createBaseVNode("button", {
                  class: "ghost-pill",
                  type: "button",
                  disabled: $setup.isPending($setup.threadActionKey($setup.currentThread, "follow")),
                  onClick: _cache[7] || (_cache[7] = ($event) => $setup.followAuthor($setup.currentThread.author_student_id))
                }, [
                  _cache[69] || (_cache[69] = createBaseVNode("span", { class: "material-symbols-outlined" }, "person_add", -1)),
                  createTextVNode(" " + toDisplayString($setup.isPending($setup.threadActionKey($setup.currentThread, "follow")) ? $setup.t("forum.detail.following") : $setup.t("forum.detail.followAuthor")), 1)
                ], 8, _hoisted_45),
                createBaseVNode("button", {
                  class: "ghost-pill",
                  type: "button",
                  disabled: $setup.isPending($setup.threadActionKey($setup.currentThread, "bookmark")),
                  onClick: _cache[8] || (_cache[8] = ($event) => $setup.toggleBookmark($setup.currentThread))
                }, [
                  _cache[70] || (_cache[70] = createBaseVNode("span", { class: "material-symbols-outlined" }, "bookmark", -1)),
                  createTextVNode(" " + toDisplayString($setup.isPending($setup.threadActionKey($setup.currentThread, "bookmark")) ? $setup.t("forum.feed.bookmarking") : $setup.t("forum.feed.bookmark")), 1)
                ], 8, _hoisted_46),
                createBaseVNode("button", {
                  class: "danger-pill",
                  type: "button",
                  disabled: $setup.isPending($setup.threadActionKey($setup.currentThread, "report")),
                  onClick: _cache[9] || (_cache[9] = ($event) => $setup.reportThread($setup.currentThread))
                }, [
                  _cache[71] || (_cache[71] = createBaseVNode("span", { class: "material-symbols-outlined" }, "flag", -1)),
                  createTextVNode(" " + toDisplayString($setup.isPending($setup.threadActionKey($setup.currentThread, "report")) ? $setup.t("forum.detail.reporting") : $setup.t("forum.detail.report")), 1)
                ], 8, _hoisted_47)
              ]),
              $setup.threadAttachments.length ? (openBlock(), createElementBlock("div", _hoisted_48, [
                (openBlock(true), createElementBlock(Fragment, null, renderList($setup.threadAttachments, (attachment) => {
                  return openBlock(), createElementBlock("a", {
                    key: attachment,
                    href: $setup.attachmentUrl(attachment),
                    target: "_blank",
                    rel: "noreferrer"
                  }, [
                    createBaseVNode("img", {
                      src: $setup.attachmentUrl(attachment),
                      alt: $setup.t("forum.detail.attachmentAlt"),
                      onError: _cache[10] || (_cache[10] = ($event) => $event.target.classList.add("broken"))
                    }, null, 40, _hoisted_50),
                    createBaseVNode("span", null, toDisplayString($setup.t("forum.detail.viewAttachment")), 1)
                  ], 8, _hoisted_49);
                }), 128))
              ])) : createCommentVNode("", true)
            ])) : createCommentVNode("", true),
            createBaseVNode("section", _hoisted_51, [
              createBaseVNode("div", _hoisted_52, [
                createBaseVNode("h3", null, "Comments (" + toDisplayString($setup.threadDetail?.replies?.length || 0) + ")", 1)
              ]),
              createBaseVNode("div", _hoisted_53, [
                withDirectives(createBaseVNode("textarea", {
                  id: "forum-reply-content",
                  "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => $setup.replyContent = $event),
                  name: "forum-reply-content",
                  rows: "2",
                  placeholder: "Add a comment..."
                }, null, 512), [
                  [vModelText, $setup.replyContent]
                ]),
                createBaseVNode("label", _hoisted_54, [
                  _cache[72] || (_cache[72] = createBaseVNode("span", { class: "material-symbols-outlined" }, "image", -1)),
                  createBaseVNode("input", {
                    type: "file",
                    multiple: "",
                    accept: "image/*,.pdf,.txt,.zip",
                    onChange: _cache[12] || (_cache[12] = (...args) => $setup.setReplyFiles && $setup.setReplyFiles(...args))
                  }, null, 32)
                ]),
                createBaseVNode("button", {
                  class: "primary-icon reply-send-button",
                  type: "button",
                  disabled: !$setup.currentThread || $setup.isPending($setup.replyPendingKey),
                  onClick: _cache[13] || (_cache[13] = (...args) => $setup.submitReply && $setup.submitReply(...args))
                }, [
                  _cache[73] || (_cache[73] = createBaseVNode("span", { class: "material-symbols-outlined" }, "send", -1)),
                  createBaseVNode("span", _hoisted_56, toDisplayString($setup.isPending($setup.replyPendingKey) ? $setup.t("forum.detail.replying") : $setup.t("forum.detail.send")), 1)
                ], 8, _hoisted_55)
              ]),
              $setup.replyFiles.length ? (openBlock(), createElementBlock("div", _hoisted_57, [
                createBaseVNode("div", _hoisted_58, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList($setup.replyFiles, (file, index) => {
                    return openBlock(), createElementBlock("article", {
                      key: `${$setup.fileLabel(file)}-${index}`,
                      class: "attachment-preview-item"
                    }, [
                      _cache[75] || (_cache[75] = createBaseVNode("span", { class: "material-symbols-outlined" }, "attach_file", -1)),
                      createBaseVNode("div", null, [
                        createBaseVNode("strong", null, toDisplayString($setup.fileLabel(file)), 1),
                        createBaseVNode("small", null, toDisplayString($setup.fileSizeLabel(file)), 1)
                      ]),
                      createBaseVNode("button", {
                        type: "button",
                        title: $setup.t("forum.detail.removeReplyAttachment"),
                        onClick: ($event) => $setup.removeReplyFile(index)
                      }, [..._cache[74] || (_cache[74] = [
                        createBaseVNode("span", { class: "material-symbols-outlined" }, "close", -1)
                      ])], 8, _hoisted_59)
                    ]);
                  }), 128))
                ])
              ])) : createCommentVNode("", true),
              (openBlock(true), createElementBlock(Fragment, null, renderList($setup.threadDetail?.replies || [], (reply) => {
                return openBlock(), createElementBlock("article", {
                  key: reply.id,
                  class: "comment-card"
                }, [
                  createBaseVNode("button", {
                    class: "mini-avatar",
                    type: "button",
                    onClick: ($event) => $setup.openUserProfile(reply.author_student_id)
                  }, toDisplayString($setup.initials($setup.authorName(reply.author_student_id))), 9, _hoisted_60),
                  createBaseVNode("div", null, [
                    createBaseVNode("div", _hoisted_61, [
                      createBaseVNode("strong", null, toDisplayString($setup.authorName(reply.author_student_id)), 1),
                      createBaseVNode("small", null, toDisplayString($setup.formatTime(reply.created_at)), 1),
                      createBaseVNode("p", null, toDisplayString(reply.content_md), 1),
                      reply.attachment_ids?.length ? (openBlock(), createElementBlock("div", _hoisted_62, [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(reply.attachment_ids, (attachment) => {
                          return openBlock(), createElementBlock("a", {
                            key: attachment,
                            href: $setup.attachmentUrl(attachment),
                            target: "_blank",
                            rel: "noreferrer"
                          }, toDisplayString($setup.t("forum.detail.viewAttachment")), 9, _hoisted_63);
                        }), 128))
                      ])) : createCommentVNode("", true)
                    ]),
                    createBaseVNode("div", _hoisted_64, [
                      createBaseVNode("button", {
                        type: "button",
                        onClick: ($event) => $setup.reactToReply(reply, "up")
                      }, [
                        _cache[76] || (_cache[76] = createBaseVNode("span", { class: "material-symbols-outlined" }, "thumb_up", -1)),
                        createTextVNode(" " + toDisplayString(reply.up_count || 0), 1)
                      ], 8, _hoisted_65),
                      createBaseVNode("button", {
                        type: "button",
                        onClick: ($event) => $setup.reactToReply(reply, "down")
                      }, [
                        _cache[77] || (_cache[77] = createBaseVNode("span", { class: "material-symbols-outlined" }, "thumb_down", -1)),
                        createTextVNode(" " + toDisplayString(reply.down_count || 0), 1)
                      ], 8, _hoisted_66)
                    ])
                  ])
                ]);
              }), 128)),
              $setup.threadDetail && !$setup.threadDetail.replies?.length ? (openBlock(), createElementBlock("div", _hoisted_67, toDisplayString($setup.t("forum.detail.noReplies")), 1)) : createCommentVNode("", true)
            ])
          ])) : createCommentVNode("", true),
          $setup.activeTab === "compose" ? (openBlock(), createElementBlock("section", _hoisted_68, [
            createBaseVNode("div", _hoisted_69, [
              createBaseVNode("button", {
                class: "ghost-pill",
                type: "button",
                onClick: _cache[14] || (_cache[14] = ($event) => $setup.switchTab("feed"))
              }, "Cancel"),
              _cache[78] || (_cache[78] = createBaseVNode("h2", null, "Create Post", -1)),
              createBaseVNode("button", {
                class: "primary-pill",
                type: "button",
                disabled: !$setup.canPublishThread || $setup.isPending($setup.threadPendingKey),
                onClick: _cache[15] || (_cache[15] = (...args) => $setup.submitThread && $setup.submitThread(...args))
              }, toDisplayString($setup.isPending($setup.threadPendingKey) ? $setup.t("forum.compose.publishing") : "Publish"), 9, _hoisted_70)
            ]),
            createBaseVNode("div", _hoisted_71, [
              _cache[79] || (_cache[79] = createBaseVNode("span", { class: "material-symbols-outlined" }, "cloud_upload", -1)),
              createBaseVNode("div", null, [
                createBaseVNode("strong", null, toDisplayString($setup.t("forum.compose.attachmentHint")), 1),
                createBaseVNode("p", null, toDisplayString($setup.t("forum.compose.attachmentDesc")), 1)
              ])
            ]),
            createBaseVNode("div", _hoisted_72, [
              withDirectives(createBaseVNode("select", {
                "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => $setup.selectedCategoryId = $event),
                class: "category-select"
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList($setup.visibleCategories, (category) => {
                  return openBlock(), createElementBlock("option", {
                    key: category.id,
                    value: Number(category.id)
                  }, toDisplayString(category.name), 9, _hoisted_73);
                }), 128))
              ], 512), [
                [
                  vModelSelect,
                  $setup.selectedCategoryId,
                  void 0,
                  { number: true }
                ]
              ]),
              withDirectives(createBaseVNode("input", {
                id: "forum-thread-title",
                "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => $setup.newThread.title = $event),
                name: "forum-thread-title",
                maxlength: "160",
                class: "title-input",
                placeholder: "An engaging title..."
              }, null, 512), [
                [vModelText, $setup.newThread.title]
              ]),
              withDirectives(createBaseVNode("textarea", {
                id: "forum-thread-content",
                "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => $setup.newThread.content_md = $event),
                name: "forum-thread-content",
                maxlength: "20000",
                placeholder: "What do you want to share with the campus?"
              }, null, 512), [
                [vModelText, $setup.newThread.content_md]
              ])
            ]),
            createBaseVNode("div", _hoisted_74, [
              createBaseVNode("button", {
                class: "tool-button",
                type: "button",
                title: $setup.t("forum.compose.uploadTitle"),
                onClick: _cache[19] || (_cache[19] = (...args) => $setup.openThreadFilePicker && $setup.openThreadFilePicker(...args))
              }, [..._cache[80] || (_cache[80] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "image", -1)
              ])], 8, _hoisted_75),
              createBaseVNode("input", {
                ref: "threadUploadInput",
                class: "visually-hidden-file",
                type: "file",
                multiple: "",
                accept: "image/*,.pdf,.txt,.zip",
                "aria-hidden": "true",
                tabindex: "-1",
                onChange: _cache[20] || (_cache[20] = (...args) => $setup.setThreadFiles && $setup.setThreadFiles(...args))
              }, null, 544),
              createBaseVNode("span", _hoisted_76, toDisplayString($setup.t("forum.compose.attachmentCopy")), 1),
              createBaseVNode("span", _hoisted_77, toDisplayString($setup.newThread.content_md.length) + "/20000", 1)
            ]),
            $setup.threadFiles.length ? (openBlock(), createElementBlock("div", _hoisted_78, [
              (openBlock(true), createElementBlock(Fragment, null, renderList($setup.threadFiles, (file, index) => {
                return openBlock(), createElementBlock("article", {
                  key: `${$setup.fileLabel(file)}-${index}`,
                  class: "attachment-preview-item"
                }, [
                  _cache[82] || (_cache[82] = createBaseVNode("span", { class: "material-symbols-outlined" }, "attach_file", -1)),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString($setup.fileLabel(file)), 1),
                    createBaseVNode("small", null, toDisplayString($setup.fileSizeLabel(file)), 1)
                  ]),
                  createBaseVNode("button", {
                    type: "button",
                    title: $setup.t("forum.compose.removeThreadAttachment"),
                    onClick: ($event) => $setup.removeThreadFile(index)
                  }, [..._cache[81] || (_cache[81] = [
                    createBaseVNode("span", { class: "material-symbols-outlined" }, "close", -1)
                  ])], 8, _hoisted_79)
                ]);
              }), 128))
            ])) : createCommentVNode("", true),
            $setup.threadFiles.length ? (openBlock(), createElementBlock("p", _hoisted_80, toDisplayString(_ctx.tf("forum.compose.attachmentCount", { n: $setup.threadFiles.length })), 1)) : createCommentVNode("", true),
            $setup.composerHint ? (openBlock(), createElementBlock("p", _hoisted_81, toDisplayString($setup.composerHint), 1)) : createCommentVNode("", true)
          ])) : createCommentVNode("", true),
          $setup.activeTab === "polls" ? (openBlock(), createElementBlock("section", _hoisted_82, [
            createBaseVNode("div", _hoisted_83, [
              createBaseVNode("div", null, [
                _cache[83] || (_cache[83] = createBaseVNode("span", { class: "eyebrow" }, "Managed Vote", -1)),
                createBaseVNode("h2", null, toDisplayString($setup.t("forum.tab.polls")), 1),
                createBaseVNode("p", null, toDisplayString($setup.t("forum.polls.voteHint")), 1)
              ]),
              createBaseVNode("div", _hoisted_84, [
                createBaseVNode("strong", null, toDisplayString($setup.pollAdminSummary.votes), 1),
                createBaseVNode("span", null, toDisplayString($setup.t("forum.polls.totalVotes")), 1)
              ])
            ]),
            createBaseVNode("div", _hoisted_85, [
              createBaseVNode("aside", _hoisted_86, [
                createBaseVNode("div", _hoisted_87, [
                  createBaseVNode("h3", null, toDisplayString($setup.t("forum.polls.list")), 1),
                  createBaseVNode("span", null, toDisplayString(_ctx.tf("forum.polls.active", { n: $setup.pollAdminSummary.active })), 1)
                ]),
                (openBlock(true), createElementBlock(Fragment, null, renderList($setup.adminPolls, (poll) => {
                  return openBlock(), createElementBlock("button", {
                    key: poll.id,
                    class: normalizeClass(["poll-list-item", { active: $setup.selectedPoll?.id === poll.id }]),
                    type: "button",
                    onClick: ($event) => $setup.selectPoll(poll)
                  }, [
                    createBaseVNode("strong", null, toDisplayString(poll.title), 1),
                    createBaseVNode("span", null, toDisplayString(poll.status === "closed" ? $setup.t("forum.polls.closed") : $setup.t("forum.polls.ongoing")) + " · " + toDisplayString(_ctx.tf("forum.polls.voteCount", { n: $setup.pollOptionTotal(poll) })), 1)
                  ], 10, _hoisted_88);
                }), 128))
              ]),
              $setup.selectedPoll ? (openBlock(), createElementBlock("article", _hoisted_89, [
                createBaseVNode("div", _hoisted_90, [
                  createBaseVNode("h3", null, toDisplayString($setup.selectedPoll.title), 1),
                  createBaseVNode("span", null, toDisplayString($setup.selectedPoll.status === "closed" ? $setup.t("forum.polls.closed") : $setup.t("forum.polls.ongoing")), 1)
                ]),
                createBaseVNode("p", null, toDisplayString($setup.selectedPoll.description || $setup.t("forum.polls.noDescription")), 1),
                createBaseVNode("div", _hoisted_91, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList($setup.selectedPoll.options, (option) => {
                    return openBlock(), createElementBlock("button", {
                      key: option.id,
                      class: "poll-score-option",
                      type: "button",
                      disabled: $setup.selectedPoll.status === "closed" || $setup.hasVotedInPoll($setup.selectedPoll) || $setup.isPending(`poll:vote:${$setup.selectedPoll?.id}:${option.id}`),
                      onClick: ($event) => $setup.voteInPoll(option)
                    }, [
                      createBaseVNode("span", null, [
                        createBaseVNode("strong", null, toDisplayString(option.label), 1),
                        createBaseVNode("small", null, toDisplayString(_ctx.tf("forum.polls.scoreUnit", { n: option.score })) + " · " + toDisplayString(_ctx.tf("forum.polls.voteCount", { n: option.votes || 0 })), 1)
                      ]),
                      createBaseVNode("em", null, toDisplayString($setup.pollOptionPercent($setup.selectedPoll, option)) + "%", 1),
                      createBaseVNode("i", {
                        style: normalizeStyle({ width: `${$setup.pollOptionPercent($setup.selectedPoll, option)}%` })
                      }, null, 4)
                    ], 8, _hoisted_92);
                  }), 128))
                ]),
                createBaseVNode("p", _hoisted_93, toDisplayString($setup.hasVotedInPoll($setup.selectedPoll) ? $setup.t("forum.polls.voted") : $setup.t("forum.polls.voteHint")), 1)
              ])) : (openBlock(), createElementBlock("div", _hoisted_94, toDisplayString($setup.t("forum.polls.none")), 1))
            ])
          ])) : createCommentVNode("", true),
          $setup.activeTab === "notice" ? (openBlock(), createElementBlock("section", _hoisted_95, [
            createBaseVNode("div", _hoisted_96, [
              createBaseVNode("div", null, [
                _cache[84] || (_cache[84] = createBaseVNode("span", { class: "eyebrow" }, "Forum Activity", -1)),
                createBaseVNode("h2", null, toDisplayString($setup.t("forum.notice.title")), 1)
              ]),
              createBaseVNode("span", null, toDisplayString(_ctx.tf("forum.notice.unreadCount", { n: $setup.unreadCount })), 1)
            ]),
            createBaseVNode("div", _hoisted_97, [
              createBaseVNode("div", null, [
                createBaseVNode("strong", null, toDisplayString($setup.unreadCount), 1),
                createBaseVNode("span", null, toDisplayString($setup.t("forum.notice.unread")), 1)
              ]),
              createBaseVNode("div", null, [
                createBaseVNode("strong", null, toDisplayString($setup.notifications.length), 1),
                createBaseVNode("span", null, toDisplayString($setup.t("forum.notice.notification")), 1)
              ]),
              createBaseVNode("div", null, [
                createBaseVNode("strong", null, toDisplayString($setup.messages.length), 1),
                createBaseVNode("span", null, toDisplayString($setup.t("forum.notice.message")), 1)
              ])
            ]),
            _cache[88] || (_cache[88] = createStaticVNode('<div class="filter-pills" data-v-d0167b19><button type="button" class="active" data-v-d0167b19>All Activity</button><button type="button" data-v-d0167b19>Comments</button><button type="button" data-v-d0167b19>Likes</button><button type="button" data-v-d0167b19>System</button></div>', 1)),
            createBaseVNode("div", _hoisted_98, [
              (openBlock(true), createElementBlock(Fragment, null, renderList($setup.notifications, (notice) => {
                return openBlock(), createElementBlock("article", {
                  key: notice.id,
                  class: normalizeClass(["notification-card", { unread: !Number(notice.is_read || 0) }])
                }, [
                  _cache[85] || (_cache[85] = createBaseVNode("span", { class: "material-symbols-outlined" }, "notifications", -1)),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString(notice.title), 1),
                    createBaseVNode("p", null, toDisplayString(notice.content), 1),
                    createBaseVNode("small", null, toDisplayString($setup.formatTime(notice.created_at)), 1)
                  ])
                ], 2);
              }), 128)),
              !$setup.notifications.length ? (openBlock(), createElementBlock("div", _hoisted_99, toDisplayString($setup.t("forum.notice.noNotifications")), 1)) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_100, [
              createBaseVNode("h3", null, toDisplayString($setup.t("forum.notice.message")), 1),
              createBaseVNode("span", null, toDisplayString($setup.messages.length), 1)
            ]),
            createBaseVNode("div", _hoisted_101, [
              createBaseVNode("div", _hoisted_102, [
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[21] || (_cache[21] = ($event) => $setup.messageDraft.receiver_student_id = $event),
                  placeholder: $setup.t("forum.notice.receiverPlaceholder")
                }, null, 8, _hoisted_103), [
                  [vModelText, $setup.messageDraft.receiver_student_id]
                ]),
                withDirectives(createBaseVNode("textarea", {
                  "onUpdate:modelValue": _cache[22] || (_cache[22] = ($event) => $setup.messageDraft.content = $event),
                  rows: "3",
                  placeholder: $setup.t("forum.notice.messagePlaceholder")
                }, null, 8, _hoisted_104), [
                  [vModelText, $setup.messageDraft.content]
                ]),
                createBaseVNode("button", {
                  class: "primary-pill wide",
                  type: "button",
                  disabled: $setup.isPending($setup.messagePendingKey),
                  onClick: _cache[23] || (_cache[23] = (...args) => $setup.sendMessage && $setup.sendMessage(...args))
                }, [
                  _cache[86] || (_cache[86] = createBaseVNode("span", { class: "material-symbols-outlined" }, "send", -1)),
                  createTextVNode(" " + toDisplayString($setup.isPending($setup.messagePendingKey) ? $setup.t("forum.notice.sending") : $setup.t("forum.notice.sendMessage")), 1)
                ], 8, _hoisted_105)
              ])
            ]),
            createBaseVNode("div", _hoisted_106, [
              (openBlock(true), createElementBlock(Fragment, null, renderList($setup.messages, (message) => {
                return openBlock(), createElementBlock("article", {
                  key: message.id,
                  class: "notification-card"
                }, [
                  _cache[87] || (_cache[87] = createBaseVNode("span", { class: "material-symbols-outlined" }, "mail", -1)),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString(message.sender_student_id) + " -> " + toDisplayString(message.receiver_student_id), 1),
                    createBaseVNode("p", null, toDisplayString(message.content), 1),
                    createBaseVNode("small", null, toDisplayString($setup.formatTime(message.created_at)), 1)
                  ])
                ]);
              }), 128)),
              !$setup.messages.length ? (openBlock(), createElementBlock("div", _hoisted_107, toDisplayString($setup.t("forum.notice.noMessages")), 1)) : createCommentVNode("", true)
            ])
          ])) : createCommentVNode("", true),
          $setup.activeTab === "me" ? (openBlock(), createElementBlock("section", _hoisted_108, [
            createBaseVNode("div", _hoisted_109, [
              _cache[95] || (_cache[95] = createBaseVNode("div", { class: "cover-gradient" }, null, -1)),
              createBaseVNode("div", _hoisted_110, [
                createBaseVNode("button", {
                  class: "profile-avatar uploadable-avatar",
                  type: "button",
                  disabled: $setup.isPending("profile:avatar-upload"),
                  title: $setup.t("forum.me.changeAvatar"),
                  onClick: _cache[24] || (_cache[24] = (...args) => $setup.openAvatarFilePicker && $setup.openAvatarFilePicker(...args)),
                  onKeydown: [
                    _cache[25] || (_cache[25] = withKeys(withModifiers((...args) => $setup.openAvatarFilePicker && $setup.openAvatarFilePicker(...args), ["prevent"]), ["enter"])),
                    _cache[26] || (_cache[26] = withKeys(withModifiers((...args) => $setup.openAvatarFilePicker && $setup.openAvatarFilePicker(...args), ["prevent"]), ["space"]))
                  ]
                }, [
                  $setup.profile.avatar_url ? (openBlock(), createElementBlock("img", {
                    key: 0,
                    src: $setup.profile.avatar_url,
                    alt: $setup.t("forum.me.avatarAlt")
                  }, null, 8, _hoisted_112)) : (openBlock(), createElementBlock("span", _hoisted_113, toDisplayString($setup.initials($setup.profile.nickname || $props.studentId)), 1)),
                  createBaseVNode("span", _hoisted_114, [
                    _cache[89] || (_cache[89] = createBaseVNode("span", { class: "material-symbols-outlined" }, "photo_camera", -1)),
                    createTextVNode(" " + toDisplayString($setup.t("forum.me.changeAvatar")), 1)
                  ])
                ], 40, _hoisted_111),
                createBaseVNode("button", {
                  class: "primary-pill",
                  type: "button",
                  disabled: $setup.isPending("checkin"),
                  onClick: _cache[27] || (_cache[27] = (...args) => $setup.checkIn && $setup.checkIn(...args))
                }, toDisplayString($setup.isPending("checkin") ? $setup.t("forum.me.checkingIn") : $setup.t("forum.me.checkIn")), 9, _hoisted_115),
                createBaseVNode("h2", null, toDisplayString($setup.profile.nickname || $props.studentId || $setup.t("forum.me.guest")), 1),
                createBaseVNode("p", null, toDisplayString($setup.meSummary?.profile?.bio || $setup.profile.bio || $setup.t("forum.me.bioEmpty")), 1),
                createBaseVNode("div", _hoisted_116, [
                  _cache[90] || (_cache[90] = createBaseVNode("span", null, "HBUT Student", -1)),
                  createBaseVNode("span", null, "Lv. " + toDisplayString($setup.meStats.checkin_count || 0), 1),
                  createBaseVNode("span", null, toDisplayString(_ctx.tf("forum.me.profileCompletion", { n: $setup.profileCompletion })), 1)
                ]),
                createBaseVNode("div", _hoisted_117, [
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString($setup.meStats.thread_count || 0), 1),
                    _cache[91] || (_cache[91] = createBaseVNode("span", null, "Posts", -1))
                  ]),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString($setup.meStats.reply_count || 0), 1),
                    _cache[92] || (_cache[92] = createBaseVNode("span", null, "Replies", -1))
                  ]),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString($setup.meStats.bookmark_count || 0), 1),
                    _cache[93] || (_cache[93] = createBaseVNode("span", null, "Collections", -1))
                  ]),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString($setup.meStats.checkin_count || 0), 1),
                    _cache[94] || (_cache[94] = createBaseVNode("span", null, "Check-ins", -1))
                  ])
                ])
              ])
            ]),
            createBaseVNode("div", _hoisted_118, [
              createBaseVNode("label", null, [
                createBaseVNode("span", null, toDisplayString($setup.t("forum.me.nickname")), 1),
                withDirectives(createBaseVNode("input", {
                  id: "forum-profile-nickname",
                  "onUpdate:modelValue": _cache[28] || (_cache[28] = ($event) => $setup.profile.nickname = $event),
                  name: "forum-profile-nickname",
                  maxlength: "80"
                }, null, 512), [
                  [vModelText, $setup.profile.nickname]
                ])
              ]),
              createBaseVNode("div", _hoisted_119, [
                createBaseVNode("div", {
                  class: "avatar-setting-preview",
                  "aria-label": $setup.t("forum.me.avatarPreview")
                }, [
                  $setup.profile.avatar_url ? (openBlock(), createElementBlock("img", {
                    key: 0,
                    src: $setup.profile.avatar_url,
                    alt: $setup.t("forum.me.avatarPreviewAlt")
                  }, null, 8, _hoisted_121)) : (openBlock(), createElementBlock("span", _hoisted_122, toDisplayString($setup.initials($setup.profile.nickname || $props.studentId)), 1))
                ], 8, _hoisted_120),
                createBaseVNode("div", _hoisted_123, [
                  createBaseVNode("strong", null, toDisplayString($setup.t("forum.me.setAvatar")), 1),
                  createBaseVNode("span", _hoisted_124, toDisplayString($setup.t("forum.me.avatarUploadTitle")), 1),
                  createBaseVNode("p", _hoisted_125, toDisplayString($setup.t("forum.me.avatarUploadHint")), 1),
                  createBaseVNode("div", _hoisted_126, [
                    createBaseVNode("input", {
                      id: "forum-profile-avatar-file",
                      ref: "profileAvatarInput",
                      type: "file",
                      accept: "image/*",
                      disabled: $setup.isPending("profile:avatar-upload"),
                      onChange: _cache[29] || (_cache[29] = (...args) => $setup.uploadAvatarImage && $setup.uploadAvatarImage(...args))
                    }, null, 40, _hoisted_127),
                    createBaseVNode("label", {
                      class: "ghost-pill avatar-upload-button",
                      for: "forum-profile-avatar-file",
                      tabindex: "0",
                      onKeydown: [
                        _cache[30] || (_cache[30] = withKeys(withModifiers((...args) => $setup.openAvatarFilePicker && $setup.openAvatarFilePicker(...args), ["prevent"]), ["enter"])),
                        _cache[31] || (_cache[31] = withKeys(withModifiers((...args) => $setup.openAvatarFilePicker && $setup.openAvatarFilePicker(...args), ["prevent"]), ["space"]))
                      ]
                    }, [
                      _cache[96] || (_cache[96] = createBaseVNode("span", { class: "material-symbols-outlined" }, "upload", -1)),
                      createBaseVNode("span", null, toDisplayString($setup.isPending("profile:avatar-upload") ? $setup.t("forum.me.avatarUploading") : $setup.t("forum.me.avatarUpload")), 1)
                    ], 32)
                  ]),
                  $setup.avatarUploadStatus ? (openBlock(), createElementBlock("p", _hoisted_128, toDisplayString($setup.avatarUploadStatus), 1)) : createCommentVNode("", true),
                  createBaseVNode("p", _hoisted_129, toDisplayString($setup.t("forum.me.avatarFallbackHint")), 1)
                ])
              ]),
              createBaseVNode("label", _hoisted_130, [
                createBaseVNode("span", null, toDisplayString($setup.t("forum.me.manualUrl")), 1),
                withDirectives(createBaseVNode("input", {
                  id: "forum-profile-avatar",
                  "onUpdate:modelValue": _cache[32] || (_cache[32] = ($event) => $setup.profile.avatar_url = $event),
                  name: "forum-profile-avatar",
                  maxlength: "500",
                  placeholder: $setup.t("forum.me.manualUrlPlaceholder")
                }, null, 8, _hoisted_131), [
                  [vModelText, $setup.profile.avatar_url]
                ])
              ]),
              createBaseVNode("label", null, [
                createBaseVNode("span", null, toDisplayString($setup.t("forum.me.bio")), 1),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[33] || (_cache[33] = ($event) => $setup.profile.bio = $event),
                  maxlength: "300",
                  placeholder: $setup.t("forum.me.bioPlaceholder")
                }, null, 8, _hoisted_132), [
                  [vModelText, $setup.profile.bio]
                ])
              ]),
              createBaseVNode("label", _hoisted_133, [
                createBaseVNode("span", null, toDisplayString($setup.t("forum.me.adminSecret")), 1),
                withDirectives(createBaseVNode("input", {
                  id: "forum-profile-admin-secret",
                  "onUpdate:modelValue": _cache[34] || (_cache[34] = ($event) => $setup.profile.admin_secret = $event),
                  name: "forum-profile-admin-secret",
                  type: "password",
                  maxlength: "300",
                  autocomplete: "current-password",
                  placeholder: $setup.t("forum.me.adminSecretPlaceholder")
                }, null, 8, _hoisted_134), [
                  [vModelText, $setup.profile.admin_secret]
                ])
              ]),
              createBaseVNode("button", {
                class: "primary-pill wide",
                type: "button",
                onClick: _cache[35] || (_cache[35] = (...args) => $setup.saveProfile && $setup.saveProfile(...args))
              }, toDisplayString($setup.t("forum.me.saveProfile")), 1)
            ]),
            _cache[97] || (_cache[97] = createBaseVNode("div", { class: "profile-content-tabs" }, [
              createBaseVNode("button", {
                type: "button",
                class: "active"
              }, "Posts"),
              createBaseVNode("button", { type: "button" }, "Replies"),
              createBaseVNode("button", { type: "button" }, "Collections")
            ], -1)),
            createBaseVNode("div", _hoisted_135, [
              createBaseVNode("div", _hoisted_136, [
                createBaseVNode("h3", null, toDisplayString($setup.t("forum.me.myThreads")), 1),
                (openBlock(true), createElementBlock(Fragment, null, renderList($setup.myThreads, (thread) => {
                  return openBlock(), createElementBlock("button", {
                    key: thread.id,
                    type: "button",
                    onClick: ($event) => $setup.openThread(thread)
                  }, toDisplayString(thread.title), 9, _hoisted_137);
                }), 128)),
                !$setup.myThreads.length ? (openBlock(), createElementBlock("div", _hoisted_138, toDisplayString($setup.t("forum.me.noThreads")), 1)) : createCommentVNode("", true)
              ]),
              createBaseVNode("div", _hoisted_139, [
                createBaseVNode("h3", null, toDisplayString($setup.t("forum.me.myReplies")), 1),
                (openBlock(true), createElementBlock(Fragment, null, renderList($setup.myReplies, (reply) => {
                  return openBlock(), createElementBlock("button", {
                    key: reply.id,
                    type: "button",
                    onClick: ($event) => $setup.openThread({ id: reply.thread_id, title: reply.thread_title })
                  }, toDisplayString(reply.thread_title || reply.content_md || _ctx.tf("forum.me.replyPrefix", { id: reply.id })), 9, _hoisted_140);
                }), 128)),
                !$setup.myReplies.length ? (openBlock(), createElementBlock("div", _hoisted_141, toDisplayString($setup.t("forum.me.noReplies")), 1)) : createCommentVNode("", true)
              ]),
              createBaseVNode("div", _hoisted_142, [
                createBaseVNode("h3", null, toDisplayString($setup.t("forum.me.myBookmarks")), 1),
                (openBlock(true), createElementBlock(Fragment, null, renderList($setup.myBookmarks, (thread) => {
                  return openBlock(), createElementBlock("button", {
                    key: thread.id,
                    type: "button",
                    onClick: ($event) => $setup.openThread(thread)
                  }, toDisplayString(thread.title), 9, _hoisted_143);
                }), 128)),
                !$setup.myBookmarks.length ? (openBlock(), createElementBlock("div", _hoisted_144, toDisplayString($setup.t("forum.me.noBookmarks")), 1)) : createCommentVNode("", true)
              ])
            ]),
            createBaseVNode("div", _hoisted_145, [
              (openBlock(true), createElementBlock(Fragment, null, renderList($setup.badges, (badge) => {
                return openBlock(), createElementBlock("span", {
                  key: badge.badge_key
                }, toDisplayString(badge.display_name), 1);
              }), 128)),
              !$setup.badges.length ? (openBlock(), createElementBlock("span", _hoisted_146, toDisplayString($setup.t("forum.me.noBadges")), 1)) : createCommentVNode("", true)
            ])
          ])) : createCommentVNode("", true),
          $setup.activeTab === "user-profile" ? (openBlock(), createElementBlock("section", _hoisted_147, [
            createBaseVNode("div", _hoisted_148, [
              createBaseVNode("button", {
                class: "icon-button",
                type: "button",
                onClick: _cache[36] || (_cache[36] = ($event) => $setup.switchTab("feed"))
              }, [..._cache[98] || (_cache[98] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)
              ])]),
              createBaseVNode("h2", null, toDisplayString($setup.t("forum.user.title")), 1)
            ]),
            $setup.viewedProfileLoading ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "forum-skeleton-list",
              "aria-label": $setup.t("forum.user.loading")
            }, [..._cache[99] || (_cache[99] = [
              createBaseVNode("article", {
                class: "skeleton-card profile",
                "aria-hidden": "true"
              }, [
                createBaseVNode("span", { class: "skeleton-pill avatar" }),
                createBaseVNode("span", { class: "skeleton-line wide" }),
                createBaseVNode("span", { class: "skeleton-line short" })
              ], -1)
            ])], 8, _hoisted_149)) : (openBlock(), createElementBlock("div", _hoisted_150, [
              _cache[103] || (_cache[103] = createBaseVNode("div", { class: "cover-gradient" }, null, -1)),
              createBaseVNode("div", _hoisted_151, [
                createBaseVNode("div", _hoisted_152, [
                  $setup.viewedProfileInfo.avatar_url ? (openBlock(), createElementBlock("img", {
                    key: 0,
                    src: $setup.viewedProfileInfo.avatar_url,
                    alt: $setup.t("forum.user.avatarAlt")
                  }, null, 8, _hoisted_153)) : (openBlock(), createElementBlock("span", _hoisted_154, toDisplayString($setup.initials($setup.viewedProfileInfo.nickname || $setup.viewedProfileInfo.student_id)), 1))
                ]),
                createBaseVNode("div", _hoisted_155, [
                  createBaseVNode("button", {
                    class: "primary-pill",
                    type: "button",
                    disabled: !$setup.viewedProfileInfo.student_id || $setup.isPending(`follow:${$setup.viewedProfileInfo.student_id}`),
                    onClick: _cache[37] || (_cache[37] = ($event) => $setup.followAuthor($setup.viewedProfileInfo.student_id))
                  }, toDisplayString($setup.isPending(`follow:${$setup.viewedProfileInfo.student_id}`) ? $setup.t("forum.user.following") : $setup.t("forum.user.follow")), 9, _hoisted_156)
                ]),
                createBaseVNode("h2", null, toDisplayString($setup.viewedProfileInfo.nickname || $setup.viewedProfileInfo.student_id || $setup.t("forum.user.defaultName")), 1),
                createBaseVNode("p", null, toDisplayString($setup.viewedProfileInfo.bio || $setup.t("forum.user.bioEmpty")), 1),
                createBaseVNode("div", _hoisted_157, [
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString($setup.viewedProfileStats.thread_count || 0), 1),
                    _cache[100] || (_cache[100] = createBaseVNode("span", null, "Posts", -1))
                  ]),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString($setup.viewedProfileStats.reply_count || 0), 1),
                    _cache[101] || (_cache[101] = createBaseVNode("span", null, "Replies", -1))
                  ]),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString($setup.viewedProfileStats.follower_count || 0), 1),
                    _cache[102] || (_cache[102] = createBaseVNode("span", null, "Followers", -1))
                  ])
                ]),
                createBaseVNode("div", _hoisted_158, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList($setup.userProfileBadges, (badge) => {
                    return openBlock(), createElementBlock("span", {
                      key: badge.badge_key
                    }, toDisplayString(badge.display_name), 1);
                  }), 128)),
                  !$setup.userProfileBadges.length ? (openBlock(), createElementBlock("span", _hoisted_159, toDisplayString($setup.t("forum.user.noBadges")), 1)) : createCommentVNode("", true)
                ])
              ])
            ])),
            createBaseVNode("div", _hoisted_160, [
              createBaseVNode("div", _hoisted_161, [
                createBaseVNode("h3", null, toDisplayString($setup.t("forum.user.activities")), 1),
                (openBlock(true), createElementBlock(Fragment, null, renderList($setup.userProfileThreads, (thread) => {
                  return openBlock(), createElementBlock("button", {
                    key: thread.id,
                    type: "button",
                    onClick: ($event) => $setup.openThread(thread)
                  }, toDisplayString(thread.title), 9, _hoisted_162);
                }), 128)),
                !$setup.userProfileThreads.length ? (openBlock(), createElementBlock("div", _hoisted_163, toDisplayString($setup.t("forum.user.noThreads")), 1)) : createCommentVNode("", true)
              ])
            ])
          ])) : createCommentVNode("", true),
          $setup.activeTab === "admin" && $setup.isAdmin ? (openBlock(), createElementBlock("section", _hoisted_164, [
            createBaseVNode("div", _hoisted_165, [
              createBaseVNode("div", null, [
                _cache[104] || (_cache[104] = createBaseVNode("span", { class: "eyebrow" }, "Admin Center", -1)),
                createBaseVNode("h2", null, toDisplayString($setup.t("forum.admin.title")), 1),
                createBaseVNode("p", null, toDisplayString($setup.t("forum.admin.desc")), 1)
              ]),
              createBaseVNode("button", {
                class: "primary-pill",
                type: "button",
                disabled: $setup.isPending("admin:backup"),
                onClick: _cache[38] || (_cache[38] = (...args) => $setup.runBackup && $setup.runBackup(...args))
              }, [
                _cache[105] || (_cache[105] = createBaseVNode("span", { class: "material-symbols-outlined" }, "backup", -1)),
                createTextVNode(" " + toDisplayString($setup.isPending("admin:backup") ? $setup.t("forum.admin.backuping") : $setup.t("forum.admin.triggerBackup")), 1)
              ], 8, _hoisted_166)
            ]),
            createBaseVNode("div", _hoisted_167, [
              createBaseVNode("div", null, [
                createBaseVNode("strong", null, toDisplayString($setup.adminSummary.reportCount), 1),
                createBaseVNode("span", null, toDisplayString($setup.t("forum.admin.reportQueue")), 1)
              ]),
              createBaseVNode("div", null, [
                createBaseVNode("strong", null, toDisplayString($setup.adminSummary.userCount), 1),
                createBaseVNode("span", null, toDisplayString($setup.t("forum.admin.userGovernance")), 1)
              ]),
              createBaseVNode("div", null, [
                createBaseVNode("strong", null, toDisplayString($setup.adminSummary.bannedCount), 1),
                createBaseVNode("span", null, toDisplayString($setup.t("forum.admin.banned")), 1)
              ]),
              createBaseVNode("div", null, [
                createBaseVNode("strong", null, toDisplayString($setup.adminSummary.pollCount), 1),
                createBaseVNode("span", null, toDisplayString($setup.t("forum.admin.pollSummary")), 1)
              ]),
              createBaseVNode("div", null, [
                createBaseVNode("strong", null, toDisplayString($setup.adminSummary.backupCount), 1),
                createBaseVNode("span", null, toDisplayString($setup.t("forum.admin.backupRecords")), 1)
              ])
            ]),
            createBaseVNode("div", _hoisted_168, [
              createBaseVNode("div", _hoisted_169, [
                createBaseVNode("div", _hoisted_170, [
                  createBaseVNode("h3", null, toDisplayString($setup.t("forum.admin.reportQueue")), 1),
                  createBaseVNode("span", null, toDisplayString($setup.adminReports.length), 1)
                ]),
                (openBlock(true), createElementBlock(Fragment, null, renderList($setup.adminReports, (report) => {
                  return openBlock(), createElementBlock("article", {
                    key: report.id,
                    class: "admin-row"
                  }, [
                    _cache[106] || (_cache[106] = createBaseVNode("span", { class: "material-symbols-outlined" }, "flag", -1)),
                    createBaseVNode("div", null, [
                      createBaseVNode("strong", null, toDisplayString(report.target_type) + " #" + toDisplayString(report.target_id), 1),
                      createBaseVNode("p", null, toDisplayString(report.reason), 1),
                      createBaseVNode("small", null, toDisplayString(report.reporter_student_id) + " · " + toDisplayString($setup.formatTime(report.created_at)), 1)
                    ]),
                    createBaseVNode("div", _hoisted_171, [
                      createBaseVNode("button", _hoisted_172, toDisplayString($setup.t("forum.admin.viewTarget")), 1)
                    ])
                  ]);
                }), 128)),
                !$setup.adminReports.length ? (openBlock(), createElementBlock("div", _hoisted_173, toDisplayString($setup.t("forum.admin.noReports")), 1)) : createCommentVNode("", true)
              ]),
              createBaseVNode("div", _hoisted_174, [
                createBaseVNode("div", _hoisted_175, [
                  createBaseVNode("h3", null, toDisplayString($setup.t("forum.admin.userGovernance")), 1),
                  createBaseVNode("span", null, toDisplayString($setup.adminUsers.length), 1)
                ]),
                createBaseVNode("div", _hoisted_176, [
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[39] || (_cache[39] = ($event) => $setup.adminSearch = $event),
                    placeholder: $setup.t("forum.admin.searchPlaceholder"),
                    onKeyup: _cache[40] || (_cache[40] = withKeys((...args) => $setup.searchAdminUsers && $setup.searchAdminUsers(...args), ["enter"]))
                  }, null, 40, _hoisted_177), [
                    [vModelText, $setup.adminSearch]
                  ]),
                  createBaseVNode("button", {
                    class: "ghost-pill",
                    type: "button",
                    onClick: _cache[41] || (_cache[41] = (...args) => $setup.searchAdminUsers && $setup.searchAdminUsers(...args))
                  }, toDisplayString($setup.t("forum.admin.search")), 1)
                ]),
                (openBlock(true), createElementBlock(Fragment, null, renderList($setup.adminUsers, (user) => {
                  return openBlock(), createElementBlock("article", {
                    key: user.student_id,
                    class: "admin-row"
                  }, [
                    _cache[107] || (_cache[107] = createBaseVNode("span", { class: "material-symbols-outlined" }, "person", -1)),
                    createBaseVNode("div", null, [
                      createBaseVNode("strong", null, toDisplayString(user.nickname || user.student_id), 1),
                      createBaseVNode("p", null, toDisplayString(user.student_id) + " · " + toDisplayString(Number(user.is_banned || 0) ? $setup.t("forum.admin.banned") : $setup.t("forum.admin.normal")), 1)
                    ]),
                    createBaseVNode("div", _hoisted_178, [
                      createBaseVNode("button", {
                        class: "ghost-pill",
                        type: "button",
                        onClick: ($event) => $setup.banDraft.student_id = user.student_id
                      }, toDisplayString($setup.t("forum.admin.fillIn")), 9, _hoisted_179)
                    ])
                  ]);
                }), 128))
              ]),
              createBaseVNode("div", _hoisted_180, [
                createBaseVNode("h3", null, toDisplayString($setup.t("forum.admin.banSection")), 1),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[42] || (_cache[42] = ($event) => $setup.banDraft.student_id = $event),
                  placeholder: $setup.t("forum.admin.banTargetPlaceholder")
                }, null, 8, _hoisted_181), [
                  [vModelText, $setup.banDraft.student_id]
                ]),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[43] || (_cache[43] = ($event) => $setup.banDraft.reason = $event),
                  placeholder: $setup.t("forum.admin.banReasonPlaceholder")
                }, null, 8, _hoisted_182), [
                  [vModelText, $setup.banDraft.reason]
                ]),
                createBaseVNode("div", _hoisted_183, [
                  createBaseVNode("button", {
                    class: "danger-pill",
                    type: "button",
                    disabled: $setup.isPending(`admin:ban:${$setup.banDraft.student_id.trim()}:true`),
                    onClick: _cache[44] || (_cache[44] = ($event) => $setup.setUserBan(true))
                  }, toDisplayString($setup.isPending(`admin:ban:${$setup.banDraft.student_id.trim()}:true`) ? $setup.t("forum.admin.banning") : $setup.t("forum.admin.ban")), 9, _hoisted_184),
                  createBaseVNode("button", {
                    class: "ghost-pill",
                    type: "button",
                    disabled: $setup.isPending(`admin:ban:${$setup.banDraft.student_id.trim()}:false`),
                    onClick: _cache[45] || (_cache[45] = ($event) => $setup.setUserBan(false))
                  }, toDisplayString($setup.isPending(`admin:ban:${$setup.banDraft.student_id.trim()}:false`) ? $setup.t("forum.admin.unbanning") : $setup.t("forum.admin.unban")), 9, _hoisted_185)
                ])
              ]),
              createBaseVNode("div", _hoisted_186, [
                createBaseVNode("h3", null, toDisplayString($setup.t("forum.admin.badgeSection")), 1),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[46] || (_cache[46] = ($event) => $setup.badgeDraft.student_id = $event),
                  placeholder: $setup.t("forum.admin.banTargetPlaceholder")
                }, null, 8, _hoisted_187), [
                  [vModelText, $setup.badgeDraft.student_id]
                ]),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[47] || (_cache[47] = ($event) => $setup.badgeDraft.badge_key = $event),
                  placeholder: "badge_key"
                }, null, 512), [
                  [vModelText, $setup.badgeDraft.badge_key]
                ]),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[48] || (_cache[48] = ($event) => $setup.badgeDraft.display_name = $event),
                  placeholder: $setup.t("forum.admin.badgeDisplayNamePlaceholder")
                }, null, 8, _hoisted_188), [
                  [vModelText, $setup.badgeDraft.display_name]
                ]),
                createBaseVNode("button", {
                  class: "primary-pill wide",
                  type: "button",
                  disabled: $setup.isPending(`admin:badge:${$setup.badgeDraft.student_id.trim()}:${$setup.badgeDraft.badge_key.trim()}`),
                  onClick: _cache[49] || (_cache[49] = (...args) => $setup.grantBadge && $setup.grantBadge(...args))
                }, toDisplayString($setup.isPending(`admin:badge:${$setup.badgeDraft.student_id.trim()}:${$setup.badgeDraft.badge_key.trim()}`) ? $setup.t("forum.admin.granting") : $setup.t("forum.admin.grantBadge")), 9, _hoisted_189)
              ]),
              createBaseVNode("div", _hoisted_190, [
                createBaseVNode("div", _hoisted_191, [
                  createBaseVNode("h3", null, toDisplayString($setup.t("forum.admin.createPoll")), 1),
                  createBaseVNode("span", null, toDisplayString(_ctx.tf("forum.admin.pollCount", { n: $setup.pollAdminSummary.total })), 1)
                ]),
                createBaseVNode("div", _hoisted_192, [
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[50] || (_cache[50] = ($event) => $setup.pollDraft.title = $event),
                    placeholder: $setup.t("forum.admin.pollTitlePlaceholder")
                  }, null, 8, _hoisted_193), [
                    [vModelText, $setup.pollDraft.title]
                  ]),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[51] || (_cache[51] = ($event) => $setup.pollDraft.description = $event),
                    placeholder: $setup.t("forum.admin.pollDescPlaceholder")
                  }, null, 8, _hoisted_194), [
                    [vModelText, $setup.pollDraft.description]
                  ]),
                  withDirectives(createBaseVNode("textarea", {
                    "onUpdate:modelValue": _cache[52] || (_cache[52] = ($event) => $setup.pollDraft.options = $event),
                    rows: "4",
                    placeholder: $setup.t("forum.admin.pollOptionsPlaceholder")
                  }, null, 8, _hoisted_195), [
                    [vModelText, $setup.pollDraft.options]
                  ]),
                  createBaseVNode("button", {
                    class: "primary-pill wide",
                    type: "button",
                    disabled: $setup.isPending("poll:create"),
                    onClick: _cache[53] || (_cache[53] = (...args) => $setup.createAdminPoll && $setup.createAdminPoll(...args))
                  }, toDisplayString($setup.isPending("poll:create") ? $setup.t("forum.compose.publishing") : $setup.t("forum.admin.publishPoll")), 9, _hoisted_196)
                ]),
                createBaseVNode("div", _hoisted_197, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList($setup.adminPolls, (poll) => {
                    return openBlock(), createElementBlock("article", {
                      key: poll.id,
                      class: "admin-row"
                    }, [
                      _cache[108] || (_cache[108] = createBaseVNode("span", { class: "material-symbols-outlined" }, "how_to_vote", -1)),
                      createBaseVNode("div", null, [
                        createBaseVNode("strong", null, toDisplayString(poll.title), 1),
                        createBaseVNode("p", null, toDisplayString(poll.status === "closed" ? $setup.t("forum.polls.closed") : $setup.t("forum.polls.ongoing")) + " · " + toDisplayString(_ctx.tf("forum.polls.voteCount", { n: $setup.pollOptionTotal(poll) })), 1),
                        createBaseVNode("small", null, toDisplayString($setup.formatTime(poll.created_at)), 1)
                      ]),
                      createBaseVNode("button", {
                        class: "ghost-pill",
                        type: "button",
                        disabled: poll.status === "closed" || $setup.isPending(`poll:close:${poll.id}`),
                        onClick: ($event) => $setup.closeAdminPoll(poll)
                      }, toDisplayString(poll.status === "closed" ? $setup.t("forum.polls.closed") : $setup.t("forum.admin.closePoll")), 9, _hoisted_198)
                    ]);
                  }), 128))
                ])
              ]),
              createBaseVNode("div", _hoisted_199, [
                createBaseVNode("div", _hoisted_200, [
                  createBaseVNode("h3", null, toDisplayString($setup.t("forum.admin.backupRecords")), 1),
                  createBaseVNode("span", null, toDisplayString($setup.adminBackups.length), 1)
                ]),
                createBaseVNode("div", _hoisted_201, [
                  _cache[109] || (_cache[109] = createBaseVNode("span", { class: "material-symbols-outlined" }, "cloud_sync", -1)),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString($setup.latestBackup ? _ctx.tf("forum.admin.lastBackup", { time: $setup.formatTime($setup.latestBackup.created_at) }) : $setup.t("forum.admin.waitingFirstBackup")), 1),
                    createBaseVNode("p", null, "HF Bucket：" + toDisplayString($setup.latestBackup?.hf_path || $setup.t("forum.admin.noPathReturned")), 1),
                    createBaseVNode("p", null, "OneDrive：" + toDisplayString($setup.latestBackup?.onedrive_path || $setup.latestBackup?.onedrive_status || $setup.t("forum.admin.notSynced")), 1)
                  ])
                ]),
                createBaseVNode("div", _hoisted_202, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList($setup.adminBackups, (backup) => {
                    return openBlock(), createElementBlock("article", {
                      key: backup.id,
                      class: "admin-row"
                    }, [
                      _cache[110] || (_cache[110] = createBaseVNode("span", { class: "material-symbols-outlined" }, "database", -1)),
                      createBaseVNode("div", null, [
                        createBaseVNode("strong", null, toDisplayString(backup.kind) + " · " + toDisplayString($setup.formatTime(backup.created_at)), 1),
                        createBaseVNode("p", _hoisted_203, "HF Bucket " + toDisplayString(backup.hf_path || $setup.t("forum.admin.noPathReturned")), 1),
                        createBaseVNode("p", _hoisted_204, "OneDrive " + toDisplayString(backup.onedrive_path || backup.onedrive_status || $setup.t("forum.admin.notSynced")), 1),
                        createBaseVNode("small", null, toDisplayString(backup.sqlite_path || $setup.t("forum.admin.localArchivePending")), 1)
                      ])
                    ]);
                  }), 128))
                ]),
                !$setup.adminBackups.length ? (openBlock(), createElementBlock("div", _hoisted_205, toDisplayString($setup.t("forum.admin.noBackups")), 1)) : createCommentVNode("", true)
              ])
            ])
          ])) : createCommentVNode("", true),
          $setup.uploadQueue.length ? (openBlock(), createElementBlock("section", {
            key: 8,
            class: "upload-experience-panel",
            "aria-label": $setup.t("forum.upload.queue")
          }, [
            createBaseVNode("div", _hoisted_207, [
              _cache[111] || (_cache[111] = createBaseVNode("span", { class: "material-symbols-outlined" }, "cloud_upload", -1)),
              createBaseVNode("div", null, [
                createBaseVNode("strong", null, toDisplayString($setup.t("forum.upload.title")), 1),
                createBaseVNode("p", null, toDisplayString($setup.t("forum.upload.desc")), 1)
              ])
            ]),
            createBaseVNode("div", _hoisted_208, [
              (openBlock(true), createElementBlock(Fragment, null, renderList($setup.uploadQueue, (item) => {
                return openBlock(), createElementBlock("article", {
                  key: item.key,
                  class: normalizeClass(["upload-progress-item", item.status])
                }, [
                  _cache[112] || (_cache[112] = createBaseVNode("span", { class: "material-symbols-outlined" }, "upload_file", -1)),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString(item.name), 1),
                    createBaseVNode("small", null, toDisplayString($setup.uploadScopeLabel(item.scope)) + " · " + toDisplayString(item.sizeLabel), 1),
                    createBaseVNode("div", _hoisted_209, [
                      createBaseVNode("span", {
                        style: normalizeStyle({ width: `${item.progress || 0}%` })
                      }, null, 4)
                    ]),
                    item.proxyUrl ? (openBlock(), createElementBlock("button", {
                      key: 0,
                      class: "attachment-url-chip",
                      type: "button",
                      onClick: ($event) => $setup.copyAttachmentUrl(item.proxyUrl)
                    }, toDisplayString($setup.t("forum.upload.copyProxyUrl")), 9, _hoisted_210)) : createCommentVNode("", true),
                    item.status === "failed" ? (openBlock(), createElementBlock("p", _hoisted_211, toDisplayString(item.error || $setup.t("forum.upload.failed")), 1)) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("div", _hoisted_212, [
                    createBaseVNode("span", _hoisted_213, toDisplayString($setup.uploadStatusText(item.status)), 1),
                    item.status === "failed" ? (openBlock(), createElementBlock("button", {
                      key: 0,
                      class: "upload-retry-button",
                      type: "button",
                      disabled: $setup.isPending(`upload:retry:${item.key}`),
                      onClick: ($event) => $setup.retryUploadFile(item)
                    }, toDisplayString($setup.isPending(`upload:retry:${item.key}`) ? $setup.t("forum.upload.retrying") : $setup.t("forum.upload.failed")), 9, _hoisted_214)) : createCommentVNode("", true)
                  ])
                ], 2);
              }), 128))
            ])
          ], 8, _hoisted_206)) : createCommentVNode("", true)
        ]),
        _cache[113] || (_cache[113] = createBaseVNode("div", {
          class: "forum-bottom-safe-spacer",
          "aria-hidden": "true"
        }, null, -1))
      ])
    ])
  ]);
}
const _sfc_main = {
  __name: "ForumView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back", "require-login"],
  setup(__props, { expose: __expose, emit: __emit }) {
    __expose();
    const props = __props;
    const { t } = useI18n();
    const emit = __emit;
    const session = createForumSession(props, emit);
    const polls = useForumPolls(session, { isAdmin: session.adminFlag });
    const admin = useForumAdmin(session, { pollCount: polls.pollAdminSummary });
    const me = useForumMe(session, { loadAdmin: admin.loadAdmin, loadAdminPolls: polls.loadAdminPolls });
    const feed = useForumFeed(session, { loadMe: me.loadMe });
    const media = useForumMedia(session);
    const detail = useForumDetail(session, {
      bookmarkedIds: me.bookmarkedIds,
      loadMe: me.loadMe,
      uploadFiles: media.uploadFiles,
      syncUploadQueueForScope: media.syncUploadQueueForScope
    });
    const composer = useForumComposer(session, {
      selectedCategoryId: feed.selectedCategoryId,
      selectedCategory: feed.selectedCategory,
      hasRemoteCategories: feed.hasRemoteCategories,
      loadForumData: feed.loadForumData,
      openThread: detail.openThread,
      uploadFiles: media.uploadFiles,
      syncUploadQueueForScope: media.syncUploadQueueForScope
    });
    const notice = useForumNotice(session, { notifications: me.notifications, messages: me.messages, loadMe: me.loadMe });
    const userProfile = useForumUserProfile(session, { displayThreads: feed.displayThreads });
    const tabs = computed(() => [
      { key: "feed", label: t("forum.tab.feed"), icon: "forum" },
      { key: "compose", label: t("forum.tab.compose"), icon: "edit_square" },
      { key: "polls", label: t("forum.tab.polls"), icon: "how_to_vote" },
      { key: "notice", label: t("forum.tab.notice"), icon: "notifications" },
      { key: "me", label: t("forum.tab.me"), icon: "person" },
      { key: "admin", label: t("forum.tab.admin"), icon: "admin_panel_settings" }
    ]);
    const activeTab = ref("feed");
    const visibleTabs = computed(() => tabs.value.filter((tab) => tab.key !== "admin" || me.isAdmin.value));
    const { profile, forumEnabled, errorMessage, isLoggedIn, isPending } = session;
    const buildClient = () => session.buildClient();
    const switchTab = async (tab) => {
      if (tab === "compose" && !isLoggedIn.value) return session.requireLogin();
      if ((tab === "notice" || tab === "me") && !isLoggedIn.value) return session.requireLogin();
      if (tab === "admin" && !me.isAdmin.value) return;
      activeTab.value = tab;
      if (tab === "notice" || tab === "me") await me.loadMe();
      if (tab === "polls") await polls.loadAdminPolls();
      if (tab === "admin") await admin.loadAdmin();
    };
    const chooseCategory = async (category) => {
      activeTab.value = "feed";
      detail.resetDetail();
      await feed.chooseCategory(category);
    };
    const runSearch = async () => {
      activeTab.value = "feed";
      await feed.runSearch();
    };
    const openThread = async (thread) => {
      activeTab.value = "detail";
      await detail.openThread(thread);
    };
    const closeThread = () => {
      detail.closeThread();
      activeTab.value = "feed";
    };
    const openUserProfile = async (studentId) => {
      activeTab.value = "user-profile";
      await userProfile.openUserProfile(studentId);
    };
    onMounted(async () => {
      await buildClient();
      await polls.loadAdminPolls();
      await feed.loadForumData();
    });
    watch(
      () => props.studentId,
      async (nextStudentId, previousStudentId) => {
        if (String(nextStudentId || "").trim() === String(previousStudentId || "").trim()) return;
        profile.value = readForumProfile(props.studentId);
        loadForumAdminSecret(props.studentId).then((secret) => {
          if (secret) profile.value.admin_secret = secret;
        });
        media.avatarUploadStatus.value = "";
        session.client = null;
        session.forumCache = null;
        detail.selectedThread.value = null;
        detail.threadDetail.value = null;
        detail.replyContent.value = "";
        detail.replyFiles.value = [];
        composer.threadFiles.value = [];
        me.meSummary.value = null;
        userProfile.viewedUserProfile.value = null;
        userProfile.viewedProfileLoading.value = false;
        polls.adminPolls.value = [];
        polls.selectedPoll.value = null;
        activeTab.value = "feed";
        await buildClient();
        await polls.loadAdminPolls();
        await feed.loadForumData({ force: true });
      }
    );
    const {
      selectedCategoryId,
      searchQuery,
      loading,
      refreshing,
      visibleCategories,
      selectedCategory,
      displayThreads,
      feedReplyCount,
      feedAttachmentCount,
      hotThreads,
      categoryName,
      loadForumData
    } = feed;
    const {
      selectedThread,
      threadDetail,
      detailLoading,
      replyContent,
      replyFiles,
      currentThread,
      threadAttachments,
      replyPendingKey,
      threadActionKey,
      submitReply,
      reactToReply,
      toggleBookmark,
      followAuthor,
      reportThread,
      setReplyFiles,
      removeReplyFile
    } = detail;
    const {
      newThread,
      threadFiles,
      threadUploadInput,
      threadPendingKey,
      canPublishThread,
      composerHint,
      submitThread,
      setThreadFiles,
      removeThreadFile,
      openThreadFilePicker
    } = composer;
    const {
      uploadQueue,
      profileAvatarInput,
      avatarUploadStatus,
      retryUploadFile,
      copyAttachmentUrl,
      attachmentUrl,
      uploadStatusText: uploadStatusText2,
      uploadScopeLabel: uploadScopeLabel2,
      fileLabel: fileLabel2,
      fileSizeLabel: fileSizeLabel2,
      openAvatarFilePicker,
      uploadAvatarImage
    } = media;
    const {
      adminPolls,
      selectedPoll,
      pollDraft,
      pollAdminSummary: pollAdminSummary2,
      selectPoll,
      voteInPoll,
      createAdminPoll,
      closeAdminPoll,
      pollOptionTotal: pollOptionTotal2,
      pollOptionPercent: pollOptionPercent2,
      hasVotedInPoll: hasVotedInPoll2
    } = polls;
    const { messageDraft, messagePendingKey, unreadCount, sendMessage } = notice;
    const {
      meSummary,
      meStats,
      profileCompletion,
      myThreads,
      myReplies,
      myBookmarks,
      badges,
      bookmarkedIds,
      isAdmin,
      notifications,
      messages,
      loadMe,
      saveProfile,
      checkIn
    } = me;
    const {
      adminReports,
      adminUsers,
      adminBackups,
      adminSearch,
      banDraft,
      badgeDraft,
      adminSummary,
      latestBackup,
      searchAdminUsers,
      setUserBan,
      grantBadge,
      runBackup
    } = admin;
    const { viewedProfileLoading, viewedProfileInfo, viewedProfileStats, userProfileBadges, userProfileThreads } = userProfile;
    const __returned__ = { props, t, emit, session, polls, admin, me, feed, media, detail, composer, notice, userProfile, tabs, activeTab, visibleTabs, profile, forumEnabled, errorMessage, isLoggedIn, isPending, buildClient, switchTab, chooseCategory, runSearch, openThread, closeThread, openUserProfile, selectedCategoryId, searchQuery, loading, refreshing, visibleCategories, selectedCategory, displayThreads, feedReplyCount, feedAttachmentCount, hotThreads, categoryName, loadForumData, selectedThread, threadDetail, detailLoading, replyContent, replyFiles, currentThread, threadAttachments, replyPendingKey, threadActionKey, submitReply, reactToReply, toggleBookmark, followAuthor, reportThread, setReplyFiles, removeReplyFile, newThread, threadFiles, threadUploadInput, threadPendingKey, canPublishThread, composerHint, submitThread, setThreadFiles, removeThreadFile, openThreadFilePicker, uploadQueue, profileAvatarInput, avatarUploadStatus, retryUploadFile, copyAttachmentUrl, attachmentUrl, uploadStatusText: uploadStatusText2, uploadScopeLabel: uploadScopeLabel2, fileLabel: fileLabel2, fileSizeLabel: fileSizeLabel2, openAvatarFilePicker, uploadAvatarImage, adminPolls, selectedPoll, pollDraft, pollAdminSummary: pollAdminSummary2, selectPoll, voteInPoll, createAdminPoll, closeAdminPoll, pollOptionTotal: pollOptionTotal2, pollOptionPercent: pollOptionPercent2, hasVotedInPoll: hasVotedInPoll2, messageDraft, messagePendingKey, unreadCount, sendMessage, meSummary, meStats, profileCompletion, myThreads, myReplies, myBookmarks, badges, bookmarkedIds, isAdmin, notifications, messages, loadMe, saveProfile, checkIn, adminReports, adminUsers, adminBackups, adminSearch, banDraft, badgeDraft, adminSummary, latestBackup, searchAdminUsers, setUserBan, grantBadge, runBackup, viewedProfileLoading, viewedProfileInfo, viewedProfileStats, userProfileBadges, userProfileThreads, computed, onMounted, ref, watch, get loadForumAdminSecret() {
      return loadForumAdminSecret;
    }, get readForumProfile() {
      return readForumProfile;
    }, get createForumSession() {
      return createForumSession;
    }, get useForumPolls() {
      return useForumPolls;
    }, get useForumAdmin() {
      return useForumAdmin;
    }, get useForumMe() {
      return useForumMe;
    }, get useForumFeed() {
      return useForumFeed;
    }, get useForumMedia() {
      return useForumMedia;
    }, get useForumDetail() {
      return useForumDetail;
    }, get useForumComposer() {
      return useForumComposer;
    }, get useForumNotice() {
      return useForumNotice;
    }, get useForumUserProfile() {
      return useForumUserProfile;
    }, get authorName() {
      return authorName;
    }, get formatTime() {
      return formatTime;
    }, get initials() {
      return initials;
    }, get useI18n() {
      return useI18n;
    } };
    Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
    return __returned__;
  }
};
const ForumView = /* @__PURE__ */ _export_sfc(_sfc_main, [["render", render], ["__scopeId", "data-v-d0167b19"]]);
export {
  ForumView as default
};
