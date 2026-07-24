import { a as ref, o as onMounted, w as watch, c as createElementBlock, b as openBlock, d as createBaseVNode, t as toDisplayString, F as Fragment, i as renderList, n as normalizeClass, e as computed, f as createCommentVNode, C as withDirectives, I as vShow, g as createTextVNode, p as withKeys, D as vModelText, j as withModifiers, y as createStaticVNode, K as vModelSelect, h as normalizeStyle } from "./vue-core-DdLVj9yW.js";
import { j as fetchRemoteConfig } from "./more-modules-CsUTdMqs.js";
import { i as isTestAccountSession, E as resolveTestAccountForumResponse } from "./runtime-bridge-apFQ0nCw.js";
import { _ as _export_sfc, s as showToast } from "./app-demo-CxKBY5JQ.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const DEFAULT_FORUM_ENDPOINT = "https://mini-hbut-testocr1.hf.space/api/forum";
const TOKEN_CACHE_KEY_PREFIX = "hbu_forum_token:";
const PROFILE_CACHE_KEY_PREFIX = "hbu_forum_profile:";
const toText$1 = (value) => value == null ? "" : String(value);
const encodeCachePart = (value) => encodeURIComponent(toText$1(value).trim());
const normalizeForumEndpoint = (value) => {
  const text = toText$1(value).trim();
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
const readCachedToken = (studentId, apiBase = "") => {
  if (!studentId || typeof localStorage === "undefined") return "";
  try {
    const raw = localStorage.getItem(tokenCacheKey(studentId, apiBase));
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    if (!parsed?.token) return "";
    if (Number(parsed.expires_at || 0) * 1e3 < Date.now() + 30 * 1e3) return "";
    return parsed.token;
  } catch {
    return "";
  }
};
const writeCachedToken = (studentId, apiBase, payload) => {
  if (!studentId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(tokenCacheKey(studentId, apiBase), JSON.stringify(payload || {}));
  } catch {
  }
};
const clearCachedToken = (studentId, apiBase = "") => {
  if (!studentId || typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(tokenCacheKey(studentId, apiBase));
  } catch {
  }
};
const readForumProfile = (studentId) => {
  const sid = toText$1(studentId).trim();
  if (!sid || typeof localStorage === "undefined") {
    return { nickname: sid, avatar_url: "", bio: "", admin_secret: "" };
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(`${PROFILE_CACHE_KEY_PREFIX}${sid}`) || "{}");
    return {
      nickname: toText$1(parsed.nickname || sid).trim() || sid,
      avatar_url: toText$1(parsed.avatar_url || parsed.avatarUrl || "").trim(),
      bio: toText$1(parsed.bio || "").trim(),
      admin_secret: toText$1(parsed.admin_secret || parsed.adminSecret || "").trim()
    };
  } catch {
    return { nickname: sid, avatar_url: "", bio: "", admin_secret: "" };
  }
};
const writeForumProfile = (studentId, profile = {}) => {
  const sid = toText$1(studentId).trim();
  const normalized = {
    nickname: toText$1(profile.nickname || sid).trim() || sid,
    avatar_url: toText$1(profile.avatar_url || profile.avatarUrl || "").trim(),
    bio: toText$1(profile.bio || "").trim(),
    admin_secret: toText$1(profile.admin_secret || profile.adminSecret || "").trim()
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
  const sid = toText$1(studentId).trim();
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
      clearCachedToken(sid, base);
      response = await fetchRequest(true);
    }
    return parseJsonResponse(response, { includeMeta, requestEtag: etag });
  };
  const getToken = async (forceRefresh = false) => {
    if (!forceRefresh && memoryToken) return memoryToken;
    if (!forceRefresh) {
      const cached = readCachedToken(sid, base);
      if (cached) {
        memoryToken = cached;
        return cached;
      }
    }
    if (forceRefresh) {
      memoryToken = "";
      clearCachedToken(sid, base);
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
      writeCachedToken(sid, base, payload);
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
      const value = toText$1(attachmentIdOrUrl).trim();
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
const toText = (value) => value == null ? "" : String(value);
const encodePart = (value) => encodeURIComponent(toText(value).trim());
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
    studentId: toText(studentId).trim() || "guest",
    apiBase: toText(apiBase).trim(),
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
          etag: toText(parsed?.etag || "")
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
          etag: toText(etag)
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
      return pending.has(toText(key));
    },
    async run(key, task, { duplicateMessage = "正在处理，请勿重复点击", duplicateType = "info" } = {}) {
      const normalizedKey = toText(key);
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
const _hoisted_1 = {
  class: "forum-view",
  "data-stitch-design": "Campus Vitality"
};
const _hoisted_2 = { class: "forum-phone-shell" };
const _hoisted_3 = { class: "forum-shell-inner" };
const _hoisted_4 = { class: "forum-topbar" };
const _hoisted_5 = ["disabled"];
const _hoisted_6 = {
  class: "category-nav",
  "aria-label": "论坛版块"
};
const _hoisted_7 = ["onClick"];
const _hoisted_8 = { class: "forum-canvas" };
const _hoisted_9 = {
  key: 0,
  class: "system-banner"
};
const _hoisted_10 = {
  class: "quick-tabs",
  "aria-label": "论坛页面"
};
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
const _hoisted_18 = {
  class: "feed-meta-strip",
  "aria-label": "广场概览"
};
const _hoisted_19 = {
  key: 0,
  class: "hot-thread-strip",
  "aria-label": "热帖"
};
const _hoisted_20 = ["onClick"];
const _hoisted_21 = { class: "section-heading" };
const _hoisted_22 = { class: "eyebrow" };
const _hoisted_23 = {
  key: 1,
  class: "forum-skeleton-list",
  "aria-label": "论坛内容加载中"
};
const _hoisted_24 = {
  key: 2,
  class: "empty-card"
};
const _hoisted_25 = ["onClick"];
const _hoisted_26 = { class: "post-author" };
const _hoisted_27 = ["onClick"];
const _hoisted_28 = { class: "category-badge" };
const _hoisted_29 = {
  key: 0,
  class: "media-preview"
};
const _hoisted_30 = {
  class: "thread-stat-grid",
  "aria-label": "帖子状态"
};
const _hoisted_31 = ["onClick"];
const _hoisted_32 = ["disabled", "onClick"];
const _hoisted_33 = { class: "material-symbols-outlined" };
const _hoisted_34 = {
  key: 1,
  class: "page-stack",
  "data-forum-page": "detail"
};
const _hoisted_35 = { class: "detail-topbar" };
const _hoisted_36 = ["disabled"];
const _hoisted_37 = {
  key: 0,
  class: "forum-skeleton-list",
  "aria-label": "帖子详情加载中"
};
const _hoisted_38 = {
  key: 1,
  class: "detail-card"
};
const _hoisted_39 = { class: "post-author large" };
const _hoisted_40 = { class: "category-badge" };
const _hoisted_41 = { class: "detail-content" };
const _hoisted_42 = { class: "detail-action-bar" };
const _hoisted_43 = ["disabled"];
const _hoisted_44 = ["disabled"];
const _hoisted_45 = ["disabled"];
const _hoisted_46 = {
  key: 0,
  class: "image-grid attachment-preview-list"
};
const _hoisted_47 = ["href"];
const _hoisted_48 = ["src"];
const _hoisted_49 = { class: "comment-panel" };
const _hoisted_50 = { class: "section-heading compact" };
const _hoisted_51 = { class: "reply-composer" };
const _hoisted_52 = { class: "icon-button tinted file-trigger" };
const _hoisted_53 = ["disabled"];
const _hoisted_54 = { class: "send-label" };
const _hoisted_55 = {
  key: 0,
  class: "reply-attachment-list"
};
const _hoisted_56 = { class: "attachment-preview-list" };
const _hoisted_57 = ["onClick"];
const _hoisted_58 = ["onClick"];
const _hoisted_59 = { class: "comment-bubble" };
const _hoisted_60 = {
  key: 0,
  class: "inline-links"
};
const _hoisted_61 = ["href"];
const _hoisted_62 = { class: "comment-actions" };
const _hoisted_63 = ["onClick"];
const _hoisted_64 = ["onClick"];
const _hoisted_65 = {
  key: 1,
  class: "empty-card compact"
};
const _hoisted_66 = {
  key: 2,
  class: "compose-page",
  "data-forum-page": "compose"
};
const _hoisted_67 = { class: "compose-topbar" };
const _hoisted_68 = ["disabled"];
const _hoisted_69 = { class: "editor-card" };
const _hoisted_70 = ["value"];
const _hoisted_71 = { class: "attachment-bar" };
const _hoisted_72 = { class: "char-count" };
const _hoisted_73 = {
  key: 0,
  class: "attachment-preview-list"
};
const _hoisted_74 = ["onClick"];
const _hoisted_75 = {
  key: 1,
  class: "form-hint"
};
const _hoisted_76 = {
  key: 2,
  class: "form-hint warning"
};
const _hoisted_77 = {
  key: 3,
  class: "poll-score-page",
  "data-forum-page": "polls"
};
const _hoisted_78 = { class: "poll-score-hero" };
const _hoisted_79 = { class: "poll-score-summary" };
const _hoisted_80 = { class: "poll-score-grid" };
const _hoisted_81 = { class: "poll-score-card poll-list-card" };
const _hoisted_82 = { class: "section-heading compact" };
const _hoisted_83 = ["onClick"];
const _hoisted_84 = {
  key: 0,
  class: "poll-score-card"
};
const _hoisted_85 = { class: "section-heading compact" };
const _hoisted_86 = { class: "poll-option-list" };
const _hoisted_87 = ["disabled", "onClick"];
const _hoisted_88 = { class: "form-hint" };
const _hoisted_89 = {
  key: 1,
  class: "empty-card compact"
};
const _hoisted_90 = {
  key: 4,
  class: "page-stack",
  "data-forum-page": "notice"
};
const _hoisted_91 = { class: "section-heading tall" };
const _hoisted_92 = { class: "notice-summary-strip" };
const _hoisted_93 = { class: "notification-list" };
const _hoisted_94 = {
  key: 0,
  class: "empty-card compact"
};
const _hoisted_95 = { class: "section-heading compact" };
const _hoisted_96 = { class: "message-composer-card" };
const _hoisted_97 = { class: "message-form" };
const _hoisted_98 = ["disabled"];
const _hoisted_99 = { class: "message-thread-list" };
const _hoisted_100 = {
  key: 0,
  class: "empty-card compact"
};
const _hoisted_101 = {
  key: 5,
  class: "page-stack",
  "data-forum-page": "me"
};
const _hoisted_102 = { class: "profile-dashboard-card" };
const _hoisted_103 = { class: "profile-body" };
const _hoisted_104 = ["disabled", "onKeydown"];
const _hoisted_105 = ["src"];
const _hoisted_106 = { key: 1 };
const _hoisted_107 = ["disabled"];
const _hoisted_108 = { class: "tag-row" };
const _hoisted_109 = { class: "profile-stat-strip" };
const _hoisted_110 = { class: "edit-card" };
const _hoisted_111 = { class: "avatar-setting-card" };
const _hoisted_112 = {
  class: "avatar-setting-preview",
  "aria-label": "当前社区头像预览"
};
const _hoisted_113 = ["src"];
const _hoisted_114 = { key: 1 };
const _hoisted_115 = { class: "avatar-setting-actions" };
const _hoisted_116 = { class: "avatar-upload-field" };
const _hoisted_117 = ["disabled"];
const _hoisted_118 = ["onKeydown"];
const _hoisted_119 = {
  key: 0,
  class: "avatar-upload-status"
};
const _hoisted_120 = { class: "avatar-manual-fallback" };
const _hoisted_121 = { class: "admin-secret-field" };
const _hoisted_122 = { class: "profile-list-grid" };
const _hoisted_123 = { class: "profile-list-card" };
const _hoisted_124 = ["onClick"];
const _hoisted_125 = {
  key: 0,
  class: "empty-card compact"
};
const _hoisted_126 = { class: "profile-list-card" };
const _hoisted_127 = ["onClick"];
const _hoisted_128 = {
  key: 0,
  class: "empty-card compact"
};
const _hoisted_129 = { class: "profile-list-card" };
const _hoisted_130 = ["onClick"];
const _hoisted_131 = {
  key: 0,
  class: "empty-card compact"
};
const _hoisted_132 = { class: "badge-cloud" };
const _hoisted_133 = { key: 0 };
const _hoisted_134 = {
  key: 6,
  class: "page-stack",
  "data-forum-page": "user-profile"
};
const _hoisted_135 = { class: "detail-topbar" };
const _hoisted_136 = {
  key: 0,
  class: "forum-skeleton-list",
  "aria-label": "用户主页加载中"
};
const _hoisted_137 = {
  key: 1,
  class: "user-profile-hero"
};
const _hoisted_138 = { class: "profile-body" };
const _hoisted_139 = { class: "profile-avatar" };
const _hoisted_140 = ["src"];
const _hoisted_141 = { key: 1 };
const _hoisted_142 = { class: "user-profile-actions" };
const _hoisted_143 = ["disabled"];
const _hoisted_144 = { class: "user-profile-stat-strip" };
const _hoisted_145 = { class: "user-profile-badges" };
const _hoisted_146 = { key: 0 };
const _hoisted_147 = { class: "user-profile-content-grid" };
const _hoisted_148 = { class: "profile-list-card" };
const _hoisted_149 = ["onClick"];
const _hoisted_150 = {
  key: 0,
  class: "empty-card compact"
};
const _hoisted_151 = {
  key: 7,
  class: "page-stack",
  "data-forum-page": "admin"
};
const _hoisted_152 = { class: "admin-hero-card" };
const _hoisted_153 = ["disabled"];
const _hoisted_154 = { class: "admin-summary-strip" };
const _hoisted_155 = { class: "admin-grid" };
const _hoisted_156 = { class: "admin-card admin-section-card reports" };
const _hoisted_157 = { class: "section-heading compact" };
const _hoisted_158 = {
  key: 0,
  class: "empty-card compact"
};
const _hoisted_159 = { class: "admin-card admin-section-card users" };
const _hoisted_160 = { class: "section-heading compact" };
const _hoisted_161 = { class: "inline-form" };
const _hoisted_162 = { class: "admin-user-actions" };
const _hoisted_163 = ["onClick"];
const _hoisted_164 = { class: "admin-card admin-section-card moderation" };
const _hoisted_165 = { class: "button-row" };
const _hoisted_166 = ["disabled"];
const _hoisted_167 = ["disabled"];
const _hoisted_168 = { class: "admin-card admin-section-card badge-issuer" };
const _hoisted_169 = ["disabled"];
const _hoisted_170 = { class: "admin-card admin-section-card poll-admin span-2" };
const _hoisted_171 = { class: "section-heading compact" };
const _hoisted_172 = { class: "poll-admin-form" };
const _hoisted_173 = ["disabled"];
const _hoisted_174 = { class: "backup-record-list" };
const _hoisted_175 = ["disabled", "onClick"];
const _hoisted_176 = { class: "admin-card admin-section-card backup-panel span-2" };
const _hoisted_177 = { class: "section-heading compact" };
const _hoisted_178 = { class: "backup-status-card" };
const _hoisted_179 = { class: "backup-record-list" };
const _hoisted_180 = { class: "admin-path-chip" };
const _hoisted_181 = { class: "admin-path-chip" };
const _hoisted_182 = {
  key: 0,
  class: "empty-card compact"
};
const _hoisted_183 = {
  key: 8,
  class: "upload-experience-panel",
  "aria-label": "图床上传队列"
};
const _hoisted_184 = { class: "upload-progress-list" };
const _hoisted_185 = {
  class: "upload-progress-bar",
  "aria-hidden": "true"
};
const _hoisted_186 = ["onClick"];
const _hoisted_187 = {
  key: 1,
  class: "form-hint warning"
};
const _hoisted_188 = { class: "upload-progress-actions" };
const _hoisted_189 = { class: "upload-status-pill" };
const _hoisted_190 = ["disabled", "onClick"];
const _sfc_main = {
  __name: "ForumView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back", "require-login"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const fallbackCategories = [
      { id: 1, slug: "campus", name: "校园广场", description: "校园日常、资讯和闲聊" },
      { id: 2, slug: "study", name: "学习互助", description: "课程、考试、资料和选课交流" },
      { id: 3, slug: "life", name: "生活服务", description: "宿舍、食堂、二手和校园生活" },
      { id: 4, slug: "help", name: "软件反馈", description: "Mini-HBUT 使用反馈和建议" }
    ];
    const tabs = [
      { key: "feed", label: "广场", icon: "forum" },
      { key: "compose", label: "发帖", icon: "edit_square" },
      { key: "polls", label: "投票", icon: "how_to_vote" },
      { key: "notice", label: "通知", icon: "notifications" },
      { key: "me", label: "我的", icon: "person" },
      { key: "admin", label: "管理", icon: "admin_panel_settings" }
    ];
    const forumEnabled = ref(true);
    const apiBase = ref("");
    const activeTab = ref("feed");
    const categories = ref([]);
    const threads = ref([]);
    const hotThreads = ref([]);
    const selectedCategoryId = ref(0);
    const selectedThread = ref(null);
    const threadDetail = ref(null);
    const loading = ref(false);
    const refreshing = ref(false);
    const detailLoading = ref(false);
    const errorMessage = ref("");
    const searchQuery = ref("");
    const replyContent = ref("");
    const replyFiles = ref([]);
    const threadFiles = ref([]);
    const profile = ref(readForumProfile(props.studentId));
    const meSummary = ref(null);
    const viewedUserProfile = ref(null);
    const viewedProfileLoading = ref(false);
    const myThreads = ref([]);
    const myReplies = ref([]);
    const myBookmarks = ref([]);
    const notifications = ref([]);
    const messages = ref([]);
    const badges = ref([]);
    const adminReports = ref([]);
    const adminUsers = ref([]);
    const adminBackups = ref([]);
    const adminPolls = ref([]);
    const selectedPoll = ref(null);
    const adminSearch = ref("");
    const uploadQueue = ref([]);
    const threadUploadInput = ref(null);
    const messageDraft = ref({ receiver_student_id: "", content: "" });
    const banDraft = ref({ student_id: "", reason: "" });
    const badgeDraft = ref({ student_id: "", badge_key: "helper", display_name: "热心同学" });
    const pollDraft = ref({
      title: "本周学习体验投票",
      description: "由管理员发起，普通用户只在投票打分页参与，不再要求每个帖子评分。",
      options: "很有帮助|10\n比较有帮助|8\n一般|5\n需要改进|2"
    });
    const pendingActions = ref(/* @__PURE__ */ new Set());
    const profileAvatarInput = ref(null);
    const avatarUploadStatus = ref("");
    const newThread = ref({
      title: "",
      content_md: ""
    });
    let client = null;
    let forumCache = null;
    let pendingGuard = null;
    const isLoggedIn = computed(() => !!String(props.studentId || "").trim());
    const hasRemoteCategories = computed(() => categories.value.length > 0);
    const visibleCategories = computed(() => categories.value.length ? categories.value : fallbackCategories);
    const selectedCategory = computed(
      () => visibleCategories.value.find((item) => Number(item.id) === Number(selectedCategoryId.value)) || visibleCategories.value[0]
    );
    const isAdmin = computed(() => {
      const profileValue = meSummary.value?.profile || {};
      return profileValue.is_admin === true || Number(profileValue.is_admin || 0) === 1;
    });
    const visibleTabs = computed(() => tabs.filter((tab) => tab.key !== "admin" || isAdmin.value));
    const bookmarkedIds = computed(() => new Set(myBookmarks.value.map((thread) => Number(thread.id))));
    const displayThreads = computed(() => threads.value.length ? threads.value : hotThreads.value);
    const unreadCount = computed(() => notifications.value.filter((item) => !Number(item.is_read || 0)).length);
    const feedReplyCount = computed(() => displayThreads.value.reduce((total, thread) => total + Number(thread.reply_count || 0), 0));
    const feedAttachmentCount = computed(() => displayThreads.value.reduce((total, thread) => total + Number(thread.attachment_ids?.length || 0), 0));
    const canPublishThread = computed(() => forumEnabled.value && isLoggedIn.value && hasRemoteCategories.value);
    const composerHint = computed(() => {
      if (!forumEnabled.value) return "论坛暂未开放";
      if (!isLoggedIn.value) return "登录后可以发帖、收藏和回复";
      if (!hasRemoteCategories.value) return "版块初始化中，请稍后刷新";
      return "";
    });
    const meStats = computed(() => meSummary.value?.stats || {});
    const viewedProfileInfo = computed(() => viewedUserProfile.value?.profile || {});
    const viewedProfileStats = computed(() => viewedUserProfile.value?.stats || {});
    const currentThread = computed(() => threadDetail.value?.thread || selectedThread.value || null);
    const threadAttachments = computed(() => currentThread.value?.attachment_ids || []);
    const threadPendingKey = computed(() => `thread:${selectedCategoryId.value}:${newThread.value.title.trim()}:${newThread.value.content_md.trim()}`.slice(0, 180));
    const replyPendingKey = computed(() => selectedThread.value?.id ? `reply:${selectedThread.value.id}:${replyContent.value.trim().slice(0, 80)}` : "reply:none");
    const messagePendingKey = computed(() => {
      const receiver = messageDraft.value.receiver_student_id.trim();
      const content = messageDraft.value.content.trim();
      return `message:${receiver}:${content.slice(0, 40)}`;
    });
    const profileCompletion = computed(() => {
      const checks = [
        profile.value.nickname?.trim(),
        profile.value.avatar_url?.trim(),
        profile.value.bio?.trim(),
        Number(meStats.value.checkin_count || 0) > 0
      ];
      const completed = checks.filter(Boolean).length;
      return Math.round(completed / checks.length * 100);
    });
    const userProfileThreads = computed(() => {
      const target = toText2(viewedProfileInfo.value.student_id).trim();
      if (!target) return [];
      return displayThreads.value.filter((thread) => toText2(thread.author_student_id).trim() === target).slice(0, 3);
    });
    const userProfileBadges = computed(() => {
      const items = viewedUserProfile.value?.badges || viewedUserProfile.value?.profile?.badges || [];
      return Array.isArray(items) ? items : [];
    });
    const adminSummary = computed(() => ({
      reportCount: adminReports.value.length,
      userCount: adminUsers.value.length,
      bannedCount: adminUsers.value.filter((user) => Number(user.is_banned || 0)).length,
      backupCount: adminBackups.value.length,
      pollCount: adminPolls.value.length
    }));
    const latestBackup = computed(() => adminBackups.value[0] || null);
    const pollAdminSummary = computed(() => {
      const activeCount = adminPolls.value.filter((poll) => poll.status === "active").length;
      const voteCount = adminPolls.value.reduce((total, poll) => total + poll.options.reduce((sum, option) => sum + Number(option.votes || 0), 0), 0);
      return {
        total: adminPolls.value.length,
        active: activeCount,
        closed: Math.max(0, adminPolls.value.length - activeCount),
        votes: voteCount
      };
    });
    const toText2 = (value) => value == null ? "" : String(value);
    const initials = (value) => {
      const text = toText2(value).trim();
      return text ? text.slice(0, 2).toUpperCase() : "HB";
    };
    const authorName = (studentId) => {
      const text = toText2(studentId).trim();
      if (!text) return "匿名同学";
      if (text === String(props.studentId || "").trim()) return profile.value.nickname || text;
      return text;
    };
    const formatTime = (value) => {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    };
    const normalizePolls = (items = []) => items.filter((poll) => poll && typeof poll === "object").map((poll) => ({
      id: Number(poll.id || 0),
      title: toText2(poll.title).trim() || "未命名投票",
      description: toText2(poll.description).trim(),
      status: poll.status === "closed" ? "closed" : "active",
      created_at: toText2(poll.created_at).trim() || (/* @__PURE__ */ new Date()).toISOString(),
      my_vote_option_id: poll.my_vote_option_id == null ? null : Number(poll.my_vote_option_id),
      options: Array.isArray(poll.options) ? poll.options.map((option, index) => ({
        id: Number(option.id || 0) || index + 1,
        label: toText2(option.label).trim() || `选项 ${index + 1}`,
        score: Number(option.score || 0),
        votes: Number(option.votes || 0)
      })) : []
    })).filter((poll) => poll.id > 0 && poll.options.length >= 2);
    const loadAdminPolls = async ({ force = false } = {}) => {
      if (!isLoggedIn.value) {
        adminPolls.value = [];
        selectedPoll.value = null;
        return;
      }
      if (!client) await buildClient();
      if (force && forumCache) clearForumCache(forumCache, ["poll"]);
      try {
        const payload = await cached("poll:list", ({ etag }) => client.listPolls({ limit: 30 }, { includeMeta: true, etag }), 15e3);
        adminPolls.value = normalizePolls(payload?.items || []);
      } catch (error) {
        adminPolls.value = [];
        selectedPoll.value = null;
        showToast(error?.message || "投票列表加载失败", "warning");
        return;
      }
      const previousId = Number(selectedPoll.value?.id || 0);
      selectedPoll.value = adminPolls.value.find((poll) => Number(poll.id) === previousId) || adminPolls.value.find((poll) => poll.status === "active") || adminPolls.value[0] || null;
    };
    const selectPoll = (poll) => {
      selectedPoll.value = poll || null;
    };
    const pollOptionTotal = (poll) => (poll?.options || []).reduce((total, option) => total + Number(option.votes || 0), 0);
    const pollOptionPercent = (poll, option) => {
      const total = pollOptionTotal(poll);
      return total ? Math.round(Number(option?.votes || 0) / total * 100) : 0;
    };
    const hasVotedInPoll = (poll) => {
      return poll?.my_vote_option_id != null;
    };
    const parsePollOptions = () => pollDraft.value.options.split(/\n+/).map((line, index) => {
      const [label, score] = line.split("|").map((part) => toText2(part).trim());
      return {
        label: label || `选项 ${index + 1}`,
        score: Math.min(10, Math.max(0, Number(score || 0)))
      };
    }).filter((option) => option.label);
    const voteInPoll = async (option) => {
      if (!isLoggedIn.value) return requireLogin();
      const poll = selectedPoll.value;
      if (!poll || poll.status === "closed") {
        showToast("当前投票已关闭", "warning");
        return;
      }
      if (hasVotedInPoll(poll)) {
        showToast("你已经参与过这个投票", "info");
        return;
      }
      await runPending(`poll:vote:${poll.id}:${option.id}`, async () => {
        const updated = await client.votePoll(poll.id, option.id);
        const normalized = normalizePolls([updated])[0];
        adminPolls.value = adminPolls.value.map(
          (item) => Number(item.id) === Number(poll.id) ? normalized : item
        );
        selectedPoll.value = adminPolls.value.find((item) => Number(item.id) === Number(poll.id)) || null;
        invalidateForumCache(["poll"]);
        showToast("投票已记录", "success");
      }, "投票正在提交，请勿重复点击");
    };
    const createAdminPoll = async () => {
      if (!isAdmin.value) return;
      const title = pollDraft.value.title.trim();
      const options = parsePollOptions();
      if (!title || options.length < 2) {
        showToast("请填写投票标题，并至少提供两个选项", "warning");
        return;
      }
      await runPending("poll:create", async () => {
        const created = await client.createPoll({
          title,
          description: pollDraft.value.description.trim(),
          options
        });
        const poll = normalizePolls([created])[0];
        adminPolls.value = [poll, ...adminPolls.value].slice(0, 20);
        selectedPoll.value = poll;
        invalidateForumCache(["poll"]);
        pollDraft.value = {
          title: "",
          description: "",
          options: "赞成|10\n中立|5\n反对|1"
        };
        showToast("发布投票", "success");
      });
    };
    const closeAdminPoll = async (poll) => {
      if (!isAdmin.value || !poll?.id) return;
      await runPending(`poll:close:${poll.id}`, async () => {
        const closed = await client.closePoll(poll.id);
        const normalized = normalizePolls([closed])[0];
        adminPolls.value = adminPolls.value.map(
          (item) => Number(item.id) === Number(poll.id) ? normalized : item
        );
        selectedPoll.value = adminPolls.value.find((item) => Number(item.id) === Number(poll.id)) || selectedPoll.value;
        invalidateForumCache(["poll"]);
        showToast("关闭投票", "success");
      });
    };
    const categoryName = (categoryId) => visibleCategories.value.find((item) => Number(item.id) === Number(categoryId))?.name || "社区";
    const attachmentUrl = (attachmentId) => client?.getAttachmentUrl?.(attachmentId) || "";
    const threadActionKey = (thread, action) => {
      const normalizedAction = toText2(action).trim();
      if (normalizedAction === "follow") {
        return `follow:${toText2(thread?.author_student_id).trim() || "unknown"}`;
      }
      return `${normalizedAction}:${thread?.id || "unknown"}`;
    };
    const fileLabel = (file) => toText2(file?.name).trim() || "附件";
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
    const attachmentProxyUrl = (payloadOrId) => {
      const directUrl = toText2(payloadOrId?.url).trim();
      if (/^https?:\/\//i.test(directUrl)) return directUrl;
      const attachmentId = toText2(payloadOrId?.attachment_id).trim();
      const rawValue = typeof payloadOrId === "object" && payloadOrId !== null ? "" : toText2(payloadOrId).trim();
      const attachmentAddress = directUrl || attachmentId || rawValue;
      return attachmentAddress ? client?.getAttachmentUrl?.(attachmentAddress) || "" : "";
    };
    const rememberUploadResult = (file, scope = "thread", patch = {}) => {
      const key = patch.key || fileQueueKey(file, scope);
      const current = uploadQueue.value.find((item) => item.key === key);
      const nextItem = {
        key,
        scope,
        file,
        name: fileLabel(file),
        sizeLabel: fileSizeLabel(file),
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
    const resolveAvatarAttachmentUrl = (payload) => {
      const directUrl = toText2(payload?.url).trim();
      if (/^https?:\/\//i.test(directUrl)) return directUrl;
      const attachmentAddress = directUrl || toText2(payload?.attachment_id).trim();
      return attachmentAddress ? attachmentProxyUrl(attachmentAddress) : "";
    };
    const syncPendingActions = (next) => {
      pendingActions.value = next;
    };
    const ensurePendingGuard = () => {
      if (!pendingGuard) {
        pendingGuard = createForumPendingActions({
          notify: showToast,
          onChange: syncPendingActions
        });
      }
      return pendingGuard;
    };
    const isPending = (key) => {
      ensurePendingGuard();
      return pendingActions.value.has(toText2(key));
    };
    const runPending = async (key, task, duplicateMessage = "正在处理，请勿重复点击") => ensurePendingGuard().run(key, task, { duplicateMessage });
    const requireLogin = () => {
      showToast("请先登录后再使用社区功能", "warning");
      emit("require-login");
      return false;
    };
    const cached = (scope, fetcher, ttlMs = 6e4) => {
      if (!forumCache) return fetcher();
      return withForumCache(forumCache, scope, fetcher, { ttlMs });
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
        studentId: props.studentId,
        nickname: profile.value.nickname,
        avatarUrl: profile.value.avatar_url,
        bio: profile.value.bio,
        adminSecret: profile.value.admin_secret
      });
      forumCache = createForumCache({
        studentId: props.studentId || "guest",
        apiBase: apiBase.value
      });
    };
    const seedDefaultCategories = async () => {
      if (!client || !isLoggedIn.value) return;
      for (const category of fallbackCategories) {
        try {
          await client.createCategory({
            slug: category.slug,
            name: category.name,
            description: category.description
          });
        } catch {
          return;
        }
      }
    };
    const loadMe = async ({ force = false } = {}) => {
      if (!client || !isLoggedIn.value) return;
      if (force) invalidateForumCache(["me", "notice", "message", "admin"]);
      const settled = await Promise.allSettled([
        cached("me:summary", ({ etag }) => client.getMeSummary({ includeMeta: true, etag }), 3e4),
        cached("me:threads", ({ etag }) => client.listMyThreads({ limit: 30 }, { includeMeta: true, etag }), 3e4),
        cached("me:replies", ({ etag }) => client.listMyReplies({ limit: 30 }, { includeMeta: true, etag }), 3e4),
        cached("me:bookmarks", ({ etag }) => client.listMyBookmarks({ limit: 50 }, { includeMeta: true, etag }), 3e4),
        cached("notice:list", ({ etag }) => client.listNotifications({}, { includeMeta: true, etag }), 2e4),
        cached("message:list", ({ etag }) => client.listMessages({}, { includeMeta: true, etag }), 15e3),
        cached("me:badges", ({ etag }) => client.listBadges({ includeMeta: true, etag }), 6e4)
      ]);
      if (settled[0].status === "fulfilled") meSummary.value = settled[0].value;
      if (settled[1].status === "fulfilled") myThreads.value = settled[1].value?.items || [];
      if (settled[2].status === "fulfilled") myReplies.value = settled[2].value?.items || [];
      if (settled[3].status === "fulfilled") myBookmarks.value = settled[3].value?.items || [];
      if (settled[4].status === "fulfilled") notifications.value = settled[4].value?.items || [];
      if (settled[5].status === "fulfilled") messages.value = settled[5].value?.items || [];
      if (settled[6].status === "fulfilled") badges.value = settled[6].value?.items || [];
      if (isAdmin.value) await loadAdmin({ force });
    };
    const loadAdmin = async ({ force = false } = {}) => {
      if (!client || !isLoggedIn.value || !isAdmin.value) return;
      if (force) invalidateForumCache(["admin"]);
      const settled = await Promise.allSettled([
        cached("admin:reports", ({ etag }) => client.listAdminReports({ limit: 50 }, { includeMeta: true, etag }), 2e4),
        cached(`admin:users:${adminSearch.value}`, ({ etag }) => client.listAdminUsers({ query: adminSearch.value }, { includeMeta: true, etag }), 2e4),
        cached("admin:backups", ({ etag }) => client.listAdminBackups({ limit: 20 }, { includeMeta: true, etag }), 3e4)
      ]);
      if (settled[0].status === "fulfilled") adminReports.value = settled[0].value?.items || [];
      if (settled[1].status === "fulfilled") adminUsers.value = settled[1].value?.items || [];
      if (settled[2].status === "fulfilled") adminBackups.value = settled[2].value?.items || [];
    };
    const loadThreads = async ({ force = false } = {}) => {
      if (!client || !forumEnabled.value) return;
      if (force) invalidateForumCache(["feed", "hot"]);
      const categoryId = hasRemoteCategories.value ? selectedCategoryId.value || selectedCategory.value?.id : 0;
      const query = searchQuery.value.trim();
      const scope = query ? `feed:search:${categoryId}:${query}` : `feed:${categoryId || "all"}`;
      try {
        const payload = await cached(scope, ({ etag }) => {
          if (query) return client.searchThreads({ q: query, categoryId, limit: 40 }, { includeMeta: true, etag });
          return client.listThreads({ categoryId, limit: 40 }, { includeMeta: true, etag });
        }, 45e3);
        threads.value = Array.isArray(payload?.items) ? payload.items : [];
      } catch (error) {
        errorMessage.value = error?.message || "帖子列表加载失败";
      }
    };
    const loadForumData = async ({ force = false } = {}) => {
      if (!forumEnabled.value && client) return;
      loading.value = !force;
      refreshing.value = force;
      errorMessage.value = "";
      try {
        if (!client) await buildClient();
        if (force) invalidateForumCache();
        const [categoryPayload, hotPayload] = await Promise.all([
          cached("categories", ({ etag }) => client.listCategories({}, { includeMeta: true, etag }), 12e4),
          cached("hot:threads", ({ etag }) => client.listHotThreads(20, { includeMeta: true, etag }), 3e4)
        ]);
        categories.value = Array.isArray(categoryPayload?.items) ? categoryPayload.items : [];
        if (!categories.value.length) {
          await seedDefaultCategories();
          const seededPayload = await client.listCategories();
          categories.value = Array.isArray(seededPayload?.items) ? seededPayload.items : [];
        }
        hotThreads.value = Array.isArray(hotPayload?.items) ? hotPayload.items : [];
        if (!selectedCategoryId.value && visibleCategories.value[0]) {
          selectedCategoryId.value = Number(visibleCategories.value[0].id);
        }
        await Promise.all([loadThreads({ force }), loadMe({ force })]);
      } catch (error) {
        errorMessage.value = error?.message || "论坛加载失败";
      } finally {
        loading.value = false;
        refreshing.value = false;
      }
    };
    const chooseCategory = async (category) => {
      selectedCategoryId.value = Number(category?.id || 0);
      selectedThread.value = null;
      threadDetail.value = null;
      activeTab.value = "feed";
      await loadThreads();
    };
    const runSearch = async () => {
      activeTab.value = "feed";
      await loadThreads({ force: true });
    };
    const openThread = async (thread) => {
      if (!client || !thread?.id) return;
      selectedThread.value = thread;
      threadDetail.value = null;
      detailLoading.value = true;
      activeTab.value = "detail";
      try {
        const detail = await cached(`thread:${thread.id}`, ({ etag }) => client.getThread(thread.id, { includeMeta: true, etag }), 2e4);
        threadDetail.value = detail;
        selectedThread.value = detail?.thread || thread;
      } catch (error) {
        errorMessage.value = error?.message || "帖子详情加载失败";
      } finally {
        detailLoading.value = false;
      }
    };
    const closeThread = () => {
      selectedThread.value = null;
      threadDetail.value = null;
      replyContent.value = "";
      replyFiles.value = [];
      activeTab.value = "feed";
    };
    const uploadFiles = async (files, scope = "thread") => {
      const uploaded = [];
      for (const file of files || []) {
        try {
          rememberUploadResult(file, scope, { status: "uploading", progress: 45, error: "" });
          const payload = await client.uploadAttachment(file);
          const proxyUrl = attachmentProxyUrl(payload);
          rememberUploadResult(file, scope, {
            status: "success",
            progress: 100,
            attachmentId: toText2(payload?.attachment_id).trim(),
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
    const setThreadFiles = (event) => {
      const files = Array.from(event?.target?.files || []).slice(0, 6);
      threadFiles.value = files;
      syncUploadQueueForScope(files, "thread");
    };
    const setReplyFiles = (event) => {
      const files = Array.from(event?.target?.files || []).slice(0, 4);
      replyFiles.value = files;
      syncUploadQueueForScope(files, "reply");
    };
    const openThreadFilePicker = () => {
      if (!isLoggedIn.value) return requireLogin();
      threadUploadInput.value?.click?.();
    };
    const removeThreadFile = (index) => {
      const files = threadFiles.value.filter((_, fileIndex) => fileIndex !== index);
      threadFiles.value = files;
      syncUploadQueueForScope(files, "thread");
    };
    const removeReplyFile = (index) => {
      const files = replyFiles.value.filter((_, fileIndex) => fileIndex !== index);
      replyFiles.value = files;
      syncUploadQueueForScope(files, "reply");
    };
    const retryUploadFile = async (item) => {
      if (!item?.file) return;
      if (!isLoggedIn.value) return requireLogin();
      if (!client) await buildClient();
      await runPending(`upload:retry:${item.key}`, async () => {
        rememberUploadResult(item.file, item.scope || "retry", { key: item.key, status: "uploading", progress: 45, error: "" });
        try {
          const payload = await client.uploadAttachment(item.file);
          rememberUploadResult(item.file, item.scope || "retry", {
            key: item.key,
            status: "success",
            progress: 100,
            attachmentId: toText2(payload?.attachment_id).trim(),
            proxyUrl: attachmentProxyUrl(payload),
            error: ""
          });
          showToast("附件已重新上传到图床", "success");
        } catch (error) {
          rememberUploadResult(item.file, item.scope || "retry", {
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
      const url = toText2(value).trim();
      if (!url) {
        showToast("暂无可复制的代理 URL", "warning");
        return;
      }
      try {
        if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
          throw new Error("clipboard unavailable");
        }
        await navigator.clipboard.writeText(url);
        showToast("代理 URL 已复制", "success");
      } catch {
        showToast("当前环境不支持自动复制，请手动复制代理 URL", "warning");
      }
    };
    const openAvatarFilePicker = () => {
      if (isPending("profile:avatar-upload")) return;
      if (!isLoggedIn.value) return requireLogin();
      profileAvatarInput.value?.click?.();
    };
    const uploadAvatarImage = async (event) => {
      const input = event?.target;
      const file = Array.from(input?.files || [])[0];
      if (!file) return;
      if (!isLoggedIn.value) {
        if (input) input.value = "";
        return requireLogin();
      }
      if (!client) await buildClient();
      try {
        await runPending("profile:avatar-upload", async () => {
          avatarUploadStatus.value = "正在上传头像到图床";
          rememberUploadResult(file, "avatar", { status: "uploading", progress: 45, error: "" });
          const payload = await client.uploadAttachment(file);
          const avatarUrl = resolveAvatarAttachmentUrl(payload);
          if (!avatarUrl) throw new Error("图床未返回头像地址");
          profile.value.avatar_url = avatarUrl;
          rememberUploadResult(file, "avatar", {
            status: "success",
            progress: 100,
            attachmentId: toText2(payload?.attachment_id).trim(),
            proxyUrl: avatarUrl,
            error: ""
          });
          avatarUploadStatus.value = "已回填图床地址，请保存资料";
          showToast("头像已上传到图床，请保存资料", "success");
        }, "头像图床上传中，请勿重复选择");
      } catch (error) {
        rememberUploadResult(file, "avatar", { status: "failed", progress: 100, error: error?.message || "头像上传失败" });
        avatarUploadStatus.value = "头像上传失败，可重试或使用手动 URL";
        showToast(error?.message || "头像上传失败", "error");
      } finally {
        if (input) input.value = "";
      }
    };
    const submitThread = async () => {
      if (!isLoggedIn.value) return requireLogin();
      if (!client) await buildClient();
      const title = newThread.value.title.trim();
      const content = newThread.value.content_md.trim();
      if (!title || !content) {
        showToast("标题和内容不能为空", "warning");
        return;
      }
      if (!canPublishThread.value) {
        showToast(composerHint.value || "暂时无法发布", "warning");
        return;
      }
      await runPending(threadPendingKey.value, async () => {
        const attachmentIds = await uploadFiles(threadFiles.value, "thread");
        const created = await client.createThread({
          category_id: selectedCategoryId.value || selectedCategory.value?.id,
          title,
          content_md: content,
          attachment_ids: attachmentIds
        });
        newThread.value = { title: "", content_md: "" };
        threadFiles.value = [];
        invalidateForumCache(["feed", "hot", "me"]);
        showToast("发布成功", "success");
        await loadForumData({ force: true });
        await openThread(created);
      });
    };
    const submitReply = async () => {
      if (!isLoggedIn.value) return requireLogin();
      if (!selectedThread.value?.id) return;
      const content = replyContent.value.trim();
      if (!content) {
        showToast("回复内容不能为空", "warning");
        return;
      }
      await runPending(replyPendingKey.value, async () => {
        const attachmentIds = await uploadFiles(replyFiles.value, "reply");
        await client.createReply(selectedThread.value.id, {
          content_md: content,
          attachment_ids: attachmentIds
        });
        replyContent.value = "";
        replyFiles.value = [];
        invalidateForumCache(["thread", "feed", "hot", "me"]);
        showToast("回复已发送", "success");
        await openThread(selectedThread.value);
      });
    };
    const reactToReply = async (reply, reaction) => {
      if (!isLoggedIn.value) return requireLogin();
      await runPending(`react:${reply.id}:${reaction}`, async () => {
        await client.reactToPost(reply.id, reaction);
        invalidateForumCache(["thread"]);
        showToast("操作成功", "success");
        await openThread(selectedThread.value);
      });
    };
    const toggleBookmark = async (thread) => {
      if (!isLoggedIn.value) return requireLogin();
      const active = !bookmarkedIds.value.has(Number(thread.id));
      await runPending(`bookmark:${thread.id}`, async () => {
        await client.bookmarkThread(thread.id, active);
        invalidateForumCache(["me"]);
        showToast(active ? "已收藏" : "已取消收藏", "success");
        await loadMe({ force: true });
      });
    };
    const followAuthor = async (studentId) => {
      if (!isLoggedIn.value) return requireLogin();
      const target = toText2(studentId).trim();
      if (!target || target === String(props.studentId || "").trim()) return;
      await runPending(`follow:${target}`, async () => {
        await client.followUser(target, true);
        invalidateForumCache(["me"]);
        showToast("已关注作者", "success");
        await loadMe({ force: true });
      });
    };
    const openUserProfile = async (studentId) => {
      const target = toText2(studentId).trim();
      if (!target) return;
      if (!client) await buildClient();
      activeTab.value = "user-profile";
      viewedProfileLoading.value = true;
      viewedUserProfile.value = null;
      try {
        viewedUserProfile.value = await cached(`user-profile:${target}`, ({ etag }) => client.getUserProfile(target, { includeMeta: true, etag }), 3e4);
      } catch (error) {
        errorMessage.value = error?.message || "用户主页加载失败";
      } finally {
        viewedProfileLoading.value = false;
      }
    };
    const reportThread = async (thread) => {
      if (!isLoggedIn.value) return requireLogin();
      if (!thread?.id) return;
      await runPending(`report:${thread.id}`, async () => {
        await client.reportContent({
          target_type: "thread",
          target_id: thread.id,
          reason: "用户从客户端举报"
        });
        invalidateForumCache(["admin"]);
        showToast("举报已提交", "success");
      });
    };
    const saveProfile = async () => {
      profile.value = writeForumProfile(props.studentId, profile.value);
      client = null;
      forumCache = null;
      showToast("社区资料已保存", "success");
      await buildClient();
      await loadMe({ force: true });
      await loadAdminPolls({ force: true });
    };
    const checkIn = async () => {
      if (!isLoggedIn.value) return requireLogin();
      if (!client) await buildClient();
      await runPending("checkin", async () => {
        await client.checkIn();
        invalidateForumCache(["me"]);
        showToast("签到成功", "success");
        await loadMe({ force: true });
      });
    };
    const sendMessage = async () => {
      if (!isLoggedIn.value) return requireLogin();
      const receiver = messageDraft.value.receiver_student_id.trim();
      const content = messageDraft.value.content.trim();
      if (!receiver || !content) {
        showToast("请填写收件人和内容", "warning");
        return;
      }
      await runPending(messagePendingKey.value, async () => {
        await client.sendMessage({ receiver_student_id: receiver, content });
        messageDraft.value = { receiver_student_id: "", content: "" };
        invalidateForumCache(["message"]);
        showToast("私信已发送", "success");
        await loadMe({ force: true });
      });
    };
    const runBackup = async () => {
      if (!isAdmin.value) return;
      await runPending("admin:backup", async () => {
        await client.runBackup();
        invalidateForumCache(["admin"]);
        showToast("备份任务已触发", "success");
        await loadAdmin({ force: true });
      });
    };
    const searchAdminUsers = async () => {
      await loadAdmin({ force: true });
    };
    const setUserBan = async (banned) => {
      const studentId = banDraft.value.student_id.trim();
      if (!studentId) {
        showToast("请填写学号", "warning");
        return;
      }
      if (isPending(`admin:ban:${studentId}:${banned}`)) return;
      await runPending(`admin:ban:${studentId}:${banned}`, async () => {
        await client.setUserBan({ student_id: studentId, banned, reason: banDraft.value.reason.trim() });
        invalidateForumCache(["admin"]);
        showToast(banned ? "已封禁用户" : "已解除封禁", "success");
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
        showToast("请填写完整徽章信息", "warning");
        return;
      }
      if (isPending(`admin:badge:${payload.student_id}:${payload.badge_key}`)) return;
      await runPending(`admin:badge:${payload.student_id}:${payload.badge_key}`, async () => {
        await client.grantBadge(payload);
        invalidateForumCache(["admin"]);
        showToast("徽章已发放", "success");
      });
    };
    const switchTab = async (tab) => {
      if (tab === "compose" && !isLoggedIn.value) return requireLogin();
      if ((tab === "notice" || tab === "me") && !isLoggedIn.value) return requireLogin();
      if (tab === "admin" && !isAdmin.value) return;
      activeTab.value = tab;
      if (tab === "notice" || tab === "me") await loadMe();
      if (tab === "polls") await loadAdminPolls();
      if (tab === "admin") await loadAdmin();
    };
    onMounted(async () => {
      await buildClient();
      await loadAdminPolls();
      await loadForumData();
    });
    watch(
      () => props.studentId,
      async (nextStudentId, previousStudentId) => {
        if (String(nextStudentId || "").trim() === String(previousStudentId || "").trim()) return;
        profile.value = readForumProfile(props.studentId);
        avatarUploadStatus.value = "";
        client = null;
        forumCache = null;
        selectedThread.value = null;
        threadDetail.value = null;
        replyContent.value = "";
        replyFiles.value = [];
        threadFiles.value = [];
        meSummary.value = null;
        viewedUserProfile.value = null;
        viewedProfileLoading.value = false;
        adminPolls.value = [];
        selectedPoll.value = null;
        activeTab.value = "feed";
        await buildClient();
        await loadAdminPolls();
        await loadForumData({ force: true });
      }
    );
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("section", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            createBaseVNode("header", _hoisted_4, [
              createBaseVNode("button", {
                class: "avatar-button",
                type: "button",
                onClick: _cache[0] || (_cache[0] = ($event) => switchTab("me"))
              }, [
                createBaseVNode("span", null, toDisplayString(initials(profile.value.nickname || __props.studentId)), 1)
              ]),
              _cache[36] || (_cache[36] = createBaseVNode("h1", null, "HBUT Forum", -1)),
              createBaseVNode("button", {
                class: "icon-button",
                type: "button",
                disabled: refreshing.value,
                title: "刷新",
                onClick: _cache[1] || (_cache[1] = ($event) => loadForumData({ force: true }))
              }, [..._cache[35] || (_cache[35] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "refresh", -1)
              ])], 8, _hoisted_5)
            ]),
            createBaseVNode("nav", _hoisted_6, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(visibleCategories.value, (category) => {
                return openBlock(), createElementBlock("button", {
                  key: category.slug || category.id,
                  type: "button",
                  class: normalizeClass({ active: Number(selectedCategoryId.value) === Number(category.id) }),
                  onClick: ($event) => chooseCategory(category)
                }, toDisplayString(category.name), 11, _hoisted_7);
              }), 128))
            ]),
            createBaseVNode("main", _hoisted_8, [
              errorMessage.value ? (openBlock(), createElementBlock("section", _hoisted_9, [
                _cache[37] || (_cache[37] = createBaseVNode("span", { class: "material-symbols-outlined" }, "info", -1)),
                createBaseVNode("span", null, toDisplayString(errorMessage.value), 1)
              ])) : createCommentVNode("", true),
              createBaseVNode("section", _hoisted_10, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(visibleTabs.value, (tab) => {
                  return openBlock(), createElementBlock("button", {
                    key: tab.key,
                    type: "button",
                    class: normalizeClass({ active: activeTab.value === tab.key }),
                    onClick: ($event) => switchTab(tab.key)
                  }, [
                    createBaseVNode("span", _hoisted_12, toDisplayString(tab.icon), 1),
                    createBaseVNode("span", null, toDisplayString(tab.label), 1),
                    tab.key === "notice" && unreadCount.value ? (openBlock(), createElementBlock("em", _hoisted_13, toDisplayString(unreadCount.value), 1)) : createCommentVNode("", true)
                  ], 10, _hoisted_11);
                }), 128))
              ]),
              withDirectives(createBaseVNode("section", _hoisted_14, [
                createBaseVNode("div", _hoisted_15, [
                  createBaseVNode("div", null, [
                    _cache[38] || (_cache[38] = createBaseVNode("span", { class: "eyebrow" }, "Mini-HBUT Community", -1)),
                    _cache[39] || (_cache[39] = createBaseVNode("h2", null, "湖工大校园广场", -1)),
                    createBaseVNode("p", null, toDisplayString(isLoggedIn.value ? `${profile.value.nickname || __props.studentId}，欢迎回来` : "登录后可发帖、收藏、关注和私信"), 1)
                  ]),
                  createBaseVNode("button", {
                    class: "primary-pill",
                    type: "button",
                    disabled: !isLoggedIn.value,
                    onClick: _cache[2] || (_cache[2] = ($event) => switchTab("compose"))
                  }, [..._cache[40] || (_cache[40] = [
                    createBaseVNode("span", { class: "material-symbols-outlined" }, "edit_square", -1),
                    createTextVNode(" 发布 ", -1)
                  ])], 8, _hoisted_16)
                ]),
                createBaseVNode("div", _hoisted_17, [
                  createBaseVNode("label", null, [
                    _cache[41] || (_cache[41] = createBaseVNode("span", { class: "material-symbols-outlined" }, "search", -1)),
                    withDirectives(createBaseVNode("input", {
                      id: "forum-search",
                      "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => searchQuery.value = $event),
                      name: "forum-search",
                      placeholder: "搜索帖子、课程、反馈",
                      onKeyup: withKeys(runSearch, ["enter"])
                    }, null, 544), [
                      [vModelText, searchQuery.value]
                    ])
                  ]),
                  createBaseVNode("button", {
                    class: "icon-button tinted",
                    type: "button",
                    onClick: runSearch
                  }, [..._cache[42] || (_cache[42] = [
                    createBaseVNode("span", { class: "material-symbols-outlined" }, "travel_explore", -1)
                  ])])
                ]),
                createBaseVNode("div", _hoisted_18, [
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString(displayThreads.value.length), 1),
                    _cache[43] || (_cache[43] = createBaseVNode("span", null, "讨论", -1))
                  ]),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString(pollAdminSummary.value.active), 1),
                    _cache[44] || (_cache[44] = createBaseVNode("span", null, "投票", -1))
                  ]),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString(feedReplyCount.value), 1),
                    _cache[45] || (_cache[45] = createBaseVNode("span", null, "回复", -1))
                  ]),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString(feedAttachmentCount.value), 1),
                    _cache[46] || (_cache[46] = createBaseVNode("span", null, "附件", -1))
                  ])
                ]),
                hotThreads.value.length ? (openBlock(), createElementBlock("div", _hoisted_19, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(hotThreads.value.slice(0, 4), (hotThread) => {
                    return openBlock(), createElementBlock("button", {
                      key: hotThread.id,
                      type: "button",
                      onClick: ($event) => openThread(hotThread)
                    }, [
                      _cache[47] || (_cache[47] = createBaseVNode("span", { class: "material-symbols-outlined" }, "local_fire_department", -1)),
                      createBaseVNode("span", null, toDisplayString(hotThread.title), 1)
                    ], 8, _hoisted_20);
                  }), 128))
                ])) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_21, [
                  createBaseVNode("div", null, [
                    createBaseVNode("span", _hoisted_22, toDisplayString(searchQuery.value.trim() ? "Search Results" : selectedCategory.value?.name || "Hot"), 1),
                    createBaseVNode("h3", null, toDisplayString(searchQuery.value.trim() || selectedCategory.value?.description || "校园实时讨论"), 1)
                  ]),
                  createBaseVNode("span", null, toDisplayString(displayThreads.value.length) + " 条", 1)
                ]),
                loading.value ? (openBlock(), createElementBlock("div", _hoisted_23, [
                  (openBlock(), createElementBlock(Fragment, null, renderList(3, (item) => {
                    return createBaseVNode("article", {
                      key: item,
                      class: "skeleton-card",
                      "aria-hidden": "true"
                    }, [..._cache[48] || (_cache[48] = [
                      createBaseVNode("span", { class: "skeleton-pill" }, null, -1),
                      createBaseVNode("span", { class: "skeleton-line wide" }, null, -1),
                      createBaseVNode("span", { class: "skeleton-line" }, null, -1),
                      createBaseVNode("span", { class: "skeleton-line short" }, null, -1)
                    ])]);
                  }), 64))
                ])) : !displayThreads.value.length ? (openBlock(), createElementBlock("div", _hoisted_24, [..._cache[49] || (_cache[49] = [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "forum", -1),
                  createBaseVNode("strong", null, "还没有帖子", -1),
                  createBaseVNode("p", null, "发第一条校园讨论，或者刷新看看热帖。", -1)
                ])])) : (openBlock(true), createElementBlock(Fragment, { key: 3 }, renderList(displayThreads.value, (thread) => {
                  return openBlock(), createElementBlock("article", {
                    key: thread.id,
                    class: normalizeClass(["post-card", { active: selectedThread.value?.id === thread.id }]),
                    onClick: ($event) => openThread(thread)
                  }, [
                    createBaseVNode("div", _hoisted_26, [
                      createBaseVNode("button", {
                        class: "mini-avatar",
                        type: "button",
                        onClick: withModifiers(($event) => openUserProfile(thread.author_student_id), ["stop"])
                      }, toDisplayString(initials(authorName(thread.author_student_id))), 9, _hoisted_27),
                      createBaseVNode("div", null, [
                        createBaseVNode("strong", null, toDisplayString(authorName(thread.author_student_id)), 1),
                        createBaseVNode("small", null, toDisplayString(formatTime(thread.updated_at || thread.created_at)), 1)
                      ]),
                      createBaseVNode("span", _hoisted_28, toDisplayString(categoryName(thread.category_id)), 1)
                    ]),
                    createBaseVNode("h3", null, toDisplayString(thread.title), 1),
                    createBaseVNode("p", null, toDisplayString(thread.content_md), 1),
                    thread.attachment_ids?.length ? (openBlock(), createElementBlock("div", _hoisted_29, [
                      _cache[50] || (_cache[50] = createBaseVNode("span", { class: "material-symbols-outlined" }, "image", -1)),
                      createTextVNode(" " + toDisplayString(thread.attachment_ids.length) + " 个附件 ", 1)
                    ])) : createCommentVNode("", true),
                    createBaseVNode("div", _hoisted_30, [
                      createBaseVNode("span", null, [
                        createBaseVNode("strong", null, toDisplayString(Number(thread.reply_count || 0) + Number(thread.attachment_ids?.length || 0)), 1),
                        _cache[51] || (_cache[51] = createTextVNode("热度", -1))
                      ]),
                      createBaseVNode("span", null, [
                        createBaseVNode("strong", null, toDisplayString(thread.reply_count || 0), 1),
                        _cache[52] || (_cache[52] = createTextVNode("回复", -1))
                      ]),
                      createBaseVNode("span", null, [
                        createBaseVNode("strong", null, toDisplayString(thread.attachment_ids?.length || 0), 1),
                        _cache[53] || (_cache[53] = createTextVNode("附件", -1))
                      ])
                    ]),
                    createBaseVNode("div", {
                      class: "post-actions",
                      onClick: _cache[4] || (_cache[4] = withModifiers(() => {
                      }, ["stop"]))
                    }, [
                      createBaseVNode("button", {
                        class: "thread-action-button",
                        type: "button",
                        onClick: ($event) => openThread(thread)
                      }, [
                        _cache[54] || (_cache[54] = createBaseVNode("span", { class: "material-symbols-outlined" }, "comment", -1)),
                        createTextVNode(" " + toDisplayString(thread.reply_count || 0), 1)
                      ], 8, _hoisted_31),
                      createBaseVNode("button", {
                        class: "thread-action-button",
                        type: "button",
                        disabled: isPending(threadActionKey(thread, "bookmark")),
                        onClick: ($event) => toggleBookmark(thread)
                      }, [
                        createBaseVNode("span", _hoisted_33, toDisplayString(bookmarkedIds.value.has(Number(thread.id)) ? "bookmark" : "bookmark_add"), 1),
                        createTextVNode(" " + toDisplayString(isPending(threadActionKey(thread, "bookmark")) ? "收藏中" : bookmarkedIds.value.has(Number(thread.id)) ? "已收藏" : "收藏"), 1)
                      ], 8, _hoisted_32)
                    ])
                  ], 10, _hoisted_25);
                }), 128))
              ], 512), [
                [vShow, activeTab.value === "feed"]
              ]),
              activeTab.value === "detail" ? (openBlock(), createElementBlock("section", _hoisted_34, [
                createBaseVNode("div", _hoisted_35, [
                  createBaseVNode("button", {
                    class: "icon-button",
                    type: "button",
                    title: "返回列表",
                    onClick: closeThread
                  }, [..._cache[55] || (_cache[55] = [
                    createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)
                  ])]),
                  createBaseVNode("h2", null, toDisplayString(currentThread.value?.title || "帖子详情"), 1),
                  createBaseVNode("button", {
                    class: "icon-button",
                    type: "button",
                    title: "举报",
                    disabled: !currentThread.value || isPending(threadActionKey(currentThread.value, "report")),
                    onClick: _cache[5] || (_cache[5] = ($event) => reportThread(currentThread.value))
                  }, [..._cache[56] || (_cache[56] = [
                    createBaseVNode("span", { class: "material-symbols-outlined" }, "flag", -1)
                  ])], 8, _hoisted_36)
                ]),
                detailLoading.value ? (openBlock(), createElementBlock("div", _hoisted_37, [..._cache[57] || (_cache[57] = [
                  createStaticVNode('<article class="skeleton-card detail" aria-hidden="true" data-v-15f87371><span class="skeleton-pill" data-v-15f87371></span><span class="skeleton-line wide" data-v-15f87371></span><span class="skeleton-line" data-v-15f87371></span><span class="skeleton-line" data-v-15f87371></span><span class="skeleton-line short" data-v-15f87371></span></article>', 1)
                ])])) : currentThread.value ? (openBlock(), createElementBlock("article", _hoisted_38, [
                  createBaseVNode("div", _hoisted_39, [
                    createBaseVNode("button", {
                      class: "mini-avatar large",
                      type: "button",
                      onClick: _cache[6] || (_cache[6] = ($event) => openUserProfile(currentThread.value.author_student_id))
                    }, toDisplayString(initials(authorName(currentThread.value.author_student_id))), 1),
                    createBaseVNode("div", null, [
                      createBaseVNode("strong", null, toDisplayString(authorName(currentThread.value.author_student_id)), 1),
                      createBaseVNode("small", null, toDisplayString(formatTime(currentThread.value.created_at)) + " · " + toDisplayString(categoryName(currentThread.value.category_id)), 1)
                    ]),
                    createBaseVNode("span", _hoisted_40, toDisplayString(threadAttachments.value.length || 0) + " 附件", 1)
                  ]),
                  createBaseVNode("h2", null, toDisplayString(currentThread.value.title), 1),
                  createBaseVNode("p", _hoisted_41, toDisplayString(currentThread.value.content_md), 1),
                  createBaseVNode("div", _hoisted_42, [
                    createBaseVNode("button", {
                      class: "ghost-pill",
                      type: "button",
                      disabled: isPending(threadActionKey(currentThread.value, "follow")),
                      onClick: _cache[7] || (_cache[7] = ($event) => followAuthor(currentThread.value.author_student_id))
                    }, [
                      _cache[58] || (_cache[58] = createBaseVNode("span", { class: "material-symbols-outlined" }, "person_add", -1)),
                      createTextVNode(" " + toDisplayString(isPending(threadActionKey(currentThread.value, "follow")) ? "关注中" : "关注作者"), 1)
                    ], 8, _hoisted_43),
                    createBaseVNode("button", {
                      class: "ghost-pill",
                      type: "button",
                      disabled: isPending(threadActionKey(currentThread.value, "bookmark")),
                      onClick: _cache[8] || (_cache[8] = ($event) => toggleBookmark(currentThread.value))
                    }, [
                      _cache[59] || (_cache[59] = createBaseVNode("span", { class: "material-symbols-outlined" }, "bookmark", -1)),
                      createTextVNode(" " + toDisplayString(isPending(threadActionKey(currentThread.value, "bookmark")) ? "收藏中" : "收藏"), 1)
                    ], 8, _hoisted_44),
                    createBaseVNode("button", {
                      class: "danger-pill",
                      type: "button",
                      disabled: isPending(threadActionKey(currentThread.value, "report")),
                      onClick: _cache[9] || (_cache[9] = ($event) => reportThread(currentThread.value))
                    }, [
                      _cache[60] || (_cache[60] = createBaseVNode("span", { class: "material-symbols-outlined" }, "flag", -1)),
                      createTextVNode(" " + toDisplayString(isPending(threadActionKey(currentThread.value, "report")) ? "举报中" : "举报"), 1)
                    ], 8, _hoisted_45)
                  ]),
                  threadAttachments.value.length ? (openBlock(), createElementBlock("div", _hoisted_46, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(threadAttachments.value, (attachment) => {
                      return openBlock(), createElementBlock("a", {
                        key: attachment,
                        href: attachmentUrl(attachment),
                        target: "_blank",
                        rel: "noreferrer"
                      }, [
                        createBaseVNode("img", {
                          src: attachmentUrl(attachment),
                          alt: "帖子附件",
                          onError: _cache[10] || (_cache[10] = ($event) => $event.target.classList.add("broken"))
                        }, null, 40, _hoisted_48),
                        _cache[61] || (_cache[61] = createBaseVNode("span", null, "查看附件", -1))
                      ], 8, _hoisted_47);
                    }), 128))
                  ])) : createCommentVNode("", true)
                ])) : createCommentVNode("", true),
                createBaseVNode("section", _hoisted_49, [
                  createBaseVNode("div", _hoisted_50, [
                    createBaseVNode("h3", null, "Comments (" + toDisplayString(threadDetail.value?.replies?.length || 0) + ")", 1)
                  ]),
                  createBaseVNode("div", _hoisted_51, [
                    withDirectives(createBaseVNode("textarea", {
                      id: "forum-reply-content",
                      "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => replyContent.value = $event),
                      name: "forum-reply-content",
                      rows: "2",
                      placeholder: "Add a comment..."
                    }, null, 512), [
                      [vModelText, replyContent.value]
                    ]),
                    createBaseVNode("label", _hoisted_52, [
                      _cache[62] || (_cache[62] = createBaseVNode("span", { class: "material-symbols-outlined" }, "image", -1)),
                      createBaseVNode("input", {
                        type: "file",
                        multiple: "",
                        accept: "image/*,.pdf,.txt,.zip",
                        onChange: setReplyFiles
                      }, null, 32)
                    ]),
                    createBaseVNode("button", {
                      class: "primary-icon reply-send-button",
                      type: "button",
                      disabled: !currentThread.value || isPending(replyPendingKey.value),
                      onClick: submitReply
                    }, [
                      _cache[63] || (_cache[63] = createBaseVNode("span", { class: "material-symbols-outlined" }, "send", -1)),
                      createBaseVNode("span", _hoisted_54, toDisplayString(isPending(replyPendingKey.value) ? "回复中" : "发送"), 1)
                    ], 8, _hoisted_53)
                  ]),
                  replyFiles.value.length ? (openBlock(), createElementBlock("div", _hoisted_55, [
                    createBaseVNode("div", _hoisted_56, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(replyFiles.value, (file, index) => {
                        return openBlock(), createElementBlock("article", {
                          key: `${fileLabel(file)}-${index}`,
                          class: "attachment-preview-item"
                        }, [
                          _cache[65] || (_cache[65] = createBaseVNode("span", { class: "material-symbols-outlined" }, "attach_file", -1)),
                          createBaseVNode("div", null, [
                            createBaseVNode("strong", null, toDisplayString(fileLabel(file)), 1),
                            createBaseVNode("small", null, toDisplayString(fileSizeLabel(file)), 1)
                          ]),
                          createBaseVNode("button", {
                            type: "button",
                            title: "移除回复附件",
                            onClick: ($event) => removeReplyFile(index)
                          }, [..._cache[64] || (_cache[64] = [
                            createBaseVNode("span", { class: "material-symbols-outlined" }, "close", -1)
                          ])], 8, _hoisted_57)
                        ]);
                      }), 128))
                    ])
                  ])) : createCommentVNode("", true),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(threadDetail.value?.replies || [], (reply) => {
                    return openBlock(), createElementBlock("article", {
                      key: reply.id,
                      class: "comment-card"
                    }, [
                      createBaseVNode("button", {
                        class: "mini-avatar",
                        type: "button",
                        onClick: ($event) => openUserProfile(reply.author_student_id)
                      }, toDisplayString(initials(authorName(reply.author_student_id))), 9, _hoisted_58),
                      createBaseVNode("div", null, [
                        createBaseVNode("div", _hoisted_59, [
                          createBaseVNode("strong", null, toDisplayString(authorName(reply.author_student_id)), 1),
                          createBaseVNode("small", null, toDisplayString(formatTime(reply.created_at)), 1),
                          createBaseVNode("p", null, toDisplayString(reply.content_md), 1),
                          reply.attachment_ids?.length ? (openBlock(), createElementBlock("div", _hoisted_60, [
                            (openBlock(true), createElementBlock(Fragment, null, renderList(reply.attachment_ids, (attachment) => {
                              return openBlock(), createElementBlock("a", {
                                key: attachment,
                                href: attachmentUrl(attachment),
                                target: "_blank",
                                rel: "noreferrer"
                              }, "附件", 8, _hoisted_61);
                            }), 128))
                          ])) : createCommentVNode("", true)
                        ]),
                        createBaseVNode("div", _hoisted_62, [
                          createBaseVNode("button", {
                            type: "button",
                            onClick: ($event) => reactToReply(reply, "up")
                          }, [
                            _cache[66] || (_cache[66] = createBaseVNode("span", { class: "material-symbols-outlined" }, "thumb_up", -1)),
                            createTextVNode(" " + toDisplayString(reply.up_count || 0), 1)
                          ], 8, _hoisted_63),
                          createBaseVNode("button", {
                            type: "button",
                            onClick: ($event) => reactToReply(reply, "down")
                          }, [
                            _cache[67] || (_cache[67] = createBaseVNode("span", { class: "material-symbols-outlined" }, "thumb_down", -1)),
                            createTextVNode(" " + toDisplayString(reply.down_count || 0), 1)
                          ], 8, _hoisted_64)
                        ])
                      ])
                    ]);
                  }), 128)),
                  threadDetail.value && !threadDetail.value.replies?.length ? (openBlock(), createElementBlock("div", _hoisted_65, "暂无回复")) : createCommentVNode("", true)
                ])
              ])) : createCommentVNode("", true),
              activeTab.value === "compose" ? (openBlock(), createElementBlock("section", _hoisted_66, [
                createBaseVNode("div", _hoisted_67, [
                  createBaseVNode("button", {
                    class: "ghost-pill",
                    type: "button",
                    onClick: _cache[12] || (_cache[12] = ($event) => switchTab("feed"))
                  }, "Cancel"),
                  _cache[68] || (_cache[68] = createBaseVNode("h2", null, "Create Post", -1)),
                  createBaseVNode("button", {
                    class: "primary-pill",
                    type: "button",
                    disabled: !canPublishThread.value || isPending(threadPendingKey.value),
                    onClick: submitThread
                  }, toDisplayString(isPending(threadPendingKey.value) ? "发布中" : "Publish"), 9, _hoisted_68)
                ]),
                _cache[73] || (_cache[73] = createBaseVNode("div", { class: "compose-guidance" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "cloud_upload"),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, "上传附件会先进入后端图床"),
                    createBaseVNode("p", null, "发布成功后自动刷新广场和个人帖子，重复点击会被拦截并提示。")
                  ])
                ], -1)),
                createBaseVNode("div", _hoisted_69, [
                  withDirectives(createBaseVNode("select", {
                    "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => selectedCategoryId.value = $event),
                    class: "category-select"
                  }, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(visibleCategories.value, (category) => {
                      return openBlock(), createElementBlock("option", {
                        key: category.id,
                        value: Number(category.id)
                      }, toDisplayString(category.name), 9, _hoisted_70);
                    }), 128))
                  ], 512), [
                    [
                      vModelSelect,
                      selectedCategoryId.value,
                      void 0,
                      { number: true }
                    ]
                  ]),
                  withDirectives(createBaseVNode("input", {
                    id: "forum-thread-title",
                    "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => newThread.value.title = $event),
                    name: "forum-thread-title",
                    maxlength: "160",
                    class: "title-input",
                    placeholder: "An engaging title..."
                  }, null, 512), [
                    [vModelText, newThread.value.title]
                  ]),
                  withDirectives(createBaseVNode("textarea", {
                    id: "forum-thread-content",
                    "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => newThread.value.content_md = $event),
                    name: "forum-thread-content",
                    maxlength: "20000",
                    placeholder: "What do you want to share with the campus?"
                  }, null, 512), [
                    [vModelText, newThread.value.content_md]
                  ])
                ]),
                createBaseVNode("div", _hoisted_71, [
                  createBaseVNode("button", {
                    class: "tool-button",
                    type: "button",
                    title: "上传附件",
                    onClick: openThreadFilePicker
                  }, [..._cache[69] || (_cache[69] = [
                    createBaseVNode("span", { class: "material-symbols-outlined" }, "image", -1)
                  ])]),
                  createBaseVNode("input", {
                    ref_key: "threadUploadInput",
                    ref: threadUploadInput,
                    class: "visually-hidden-file",
                    type: "file",
                    multiple: "",
                    accept: "image/*,.pdf,.txt,.zip",
                    "aria-hidden": "true",
                    tabindex: "-1",
                    onChange: setThreadFiles
                  }, null, 544),
                  _cache[70] || (_cache[70] = createBaseVNode("span", { class: "attachment-copy" }, "图片、PDF、TXT 和 ZIP 会上传到论坛图床", -1)),
                  createBaseVNode("span", _hoisted_72, toDisplayString(newThread.value.content_md.length) + "/20000", 1)
                ]),
                threadFiles.value.length ? (openBlock(), createElementBlock("div", _hoisted_73, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(threadFiles.value, (file, index) => {
                    return openBlock(), createElementBlock("article", {
                      key: `${fileLabel(file)}-${index}`,
                      class: "attachment-preview-item"
                    }, [
                      _cache[72] || (_cache[72] = createBaseVNode("span", { class: "material-symbols-outlined" }, "attach_file", -1)),
                      createBaseVNode("div", null, [
                        createBaseVNode("strong", null, toDisplayString(fileLabel(file)), 1),
                        createBaseVNode("small", null, toDisplayString(fileSizeLabel(file)), 1)
                      ]),
                      createBaseVNode("button", {
                        type: "button",
                        title: "移除发帖附件",
                        onClick: ($event) => removeThreadFile(index)
                      }, [..._cache[71] || (_cache[71] = [
                        createBaseVNode("span", { class: "material-symbols-outlined" }, "close", -1)
                      ])], 8, _hoisted_74)
                    ]);
                  }), 128))
                ])) : createCommentVNode("", true),
                threadFiles.value.length ? (openBlock(), createElementBlock("p", _hoisted_75, toDisplayString(threadFiles.value.length) + " 个附件会通过后端图床接口上传", 1)) : createCommentVNode("", true),
                composerHint.value ? (openBlock(), createElementBlock("p", _hoisted_76, toDisplayString(composerHint.value), 1)) : createCommentVNode("", true)
              ])) : createCommentVNode("", true),
              activeTab.value === "polls" ? (openBlock(), createElementBlock("section", _hoisted_77, [
                createBaseVNode("div", _hoisted_78, [
                  _cache[75] || (_cache[75] = createBaseVNode("div", null, [
                    createBaseVNode("span", { class: "eyebrow" }, "Managed Vote"),
                    createBaseVNode("h2", null, "投票打分"),
                    createBaseVNode("p", null, "投票由管理员创建和关闭，帖子本身不再要求逐条打分。")
                  ], -1)),
                  createBaseVNode("div", _hoisted_79, [
                    createBaseVNode("strong", null, toDisplayString(pollAdminSummary.value.votes), 1),
                    _cache[74] || (_cache[74] = createBaseVNode("span", null, "累计投票", -1))
                  ])
                ]),
                createBaseVNode("div", _hoisted_80, [
                  createBaseVNode("aside", _hoisted_81, [
                    createBaseVNode("div", _hoisted_82, [
                      _cache[76] || (_cache[76] = createBaseVNode("h3", null, "投票列表", -1)),
                      createBaseVNode("span", null, toDisplayString(pollAdminSummary.value.active) + " 进行中", 1)
                    ]),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(adminPolls.value, (poll) => {
                      return openBlock(), createElementBlock("button", {
                        key: poll.id,
                        class: normalizeClass(["poll-list-item", { active: selectedPoll.value?.id === poll.id }]),
                        type: "button",
                        onClick: ($event) => selectPoll(poll)
                      }, [
                        createBaseVNode("strong", null, toDisplayString(poll.title), 1),
                        createBaseVNode("span", null, toDisplayString(poll.status === "closed" ? "已关闭" : "进行中") + " · " + toDisplayString(pollOptionTotal(poll)) + " 票", 1)
                      ], 10, _hoisted_83);
                    }), 128))
                  ]),
                  selectedPoll.value ? (openBlock(), createElementBlock("article", _hoisted_84, [
                    createBaseVNode("div", _hoisted_85, [
                      createBaseVNode("h3", null, toDisplayString(selectedPoll.value.title), 1),
                      createBaseVNode("span", null, toDisplayString(selectedPoll.value.status === "closed" ? "已关闭" : "进行中"), 1)
                    ]),
                    createBaseVNode("p", null, toDisplayString(selectedPoll.value.description || "管理员暂未填写说明"), 1),
                    createBaseVNode("div", _hoisted_86, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(selectedPoll.value.options, (option) => {
                        return openBlock(), createElementBlock("button", {
                          key: option.id,
                          class: "poll-score-option",
                          type: "button",
                          disabled: selectedPoll.value.status === "closed" || hasVotedInPoll(selectedPoll.value) || isPending(`poll:vote:${selectedPoll.value?.id}:${option.id}`),
                          onClick: ($event) => voteInPoll(option)
                        }, [
                          createBaseVNode("span", null, [
                            createBaseVNode("strong", null, toDisplayString(option.label), 1),
                            createBaseVNode("small", null, toDisplayString(option.score) + " 分 · " + toDisplayString(option.votes || 0) + " 票", 1)
                          ]),
                          createBaseVNode("em", null, toDisplayString(pollOptionPercent(selectedPoll.value, option)) + "%", 1),
                          createBaseVNode("i", {
                            style: normalizeStyle({ width: `${pollOptionPercent(selectedPoll.value, option)}%` })
                          }, null, 4)
                        ], 8, _hoisted_87);
                      }), 128))
                    ]),
                    createBaseVNode("p", _hoisted_88, toDisplayString(hasVotedInPoll(selectedPoll.value) ? "你已经参与过这个投票" : "选择一个选项后会立即记录，防重复提交会自动拦截。"), 1)
                  ])) : (openBlock(), createElementBlock("div", _hoisted_89, "暂无投票"))
                ])
              ])) : createCommentVNode("", true),
              activeTab.value === "notice" ? (openBlock(), createElementBlock("section", _hoisted_90, [
                createBaseVNode("div", _hoisted_91, [
                  _cache[77] || (_cache[77] = createBaseVNode("div", null, [
                    createBaseVNode("span", { class: "eyebrow" }, "Forum Activity"),
                    createBaseVNode("h2", null, "通知中心")
                  ], -1)),
                  createBaseVNode("span", null, toDisplayString(unreadCount.value) + " 未读", 1)
                ]),
                createBaseVNode("div", _hoisted_92, [
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString(unreadCount.value), 1),
                    _cache[78] || (_cache[78] = createBaseVNode("span", null, "未读", -1))
                  ]),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString(notifications.value.length), 1),
                    _cache[79] || (_cache[79] = createBaseVNode("span", null, "通知", -1))
                  ]),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString(messages.value.length), 1),
                    _cache[80] || (_cache[80] = createBaseVNode("span", null, "私信", -1))
                  ])
                ]),
                _cache[85] || (_cache[85] = createStaticVNode('<div class="filter-pills" data-v-15f87371><button type="button" class="active" data-v-15f87371>All Activity</button><button type="button" data-v-15f87371>Comments</button><button type="button" data-v-15f87371>Likes</button><button type="button" data-v-15f87371>System</button></div>', 1)),
                createBaseVNode("div", _hoisted_93, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(notifications.value, (notice) => {
                    return openBlock(), createElementBlock("article", {
                      key: notice.id,
                      class: normalizeClass(["notification-card", { unread: !Number(notice.is_read || 0) }])
                    }, [
                      _cache[81] || (_cache[81] = createBaseVNode("span", { class: "material-symbols-outlined" }, "notifications", -1)),
                      createBaseVNode("div", null, [
                        createBaseVNode("strong", null, toDisplayString(notice.title), 1),
                        createBaseVNode("p", null, toDisplayString(notice.content), 1),
                        createBaseVNode("small", null, toDisplayString(formatTime(notice.created_at)), 1)
                      ])
                    ], 2);
                  }), 128)),
                  !notifications.value.length ? (openBlock(), createElementBlock("div", _hoisted_94, "暂无通知")) : createCommentVNode("", true)
                ]),
                createBaseVNode("div", _hoisted_95, [
                  _cache[82] || (_cache[82] = createBaseVNode("h3", null, "私信", -1)),
                  createBaseVNode("span", null, toDisplayString(messages.value.length), 1)
                ]),
                createBaseVNode("div", _hoisted_96, [
                  createBaseVNode("div", _hoisted_97, [
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => messageDraft.value.receiver_student_id = $event),
                      placeholder: "收件人学号"
                    }, null, 512), [
                      [vModelText, messageDraft.value.receiver_student_id]
                    ]),
                    withDirectives(createBaseVNode("textarea", {
                      "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => messageDraft.value.content = $event),
                      rows: "3",
                      placeholder: "私信内容"
                    }, null, 512), [
                      [vModelText, messageDraft.value.content]
                    ]),
                    createBaseVNode("button", {
                      class: "primary-pill wide",
                      type: "button",
                      disabled: isPending(messagePendingKey.value),
                      onClick: sendMessage
                    }, [
                      _cache[83] || (_cache[83] = createBaseVNode("span", { class: "material-symbols-outlined" }, "send", -1)),
                      createTextVNode(" " + toDisplayString(isPending(messagePendingKey.value) ? "发送中" : "发送私信"), 1)
                    ], 8, _hoisted_98)
                  ])
                ]),
                createBaseVNode("div", _hoisted_99, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(messages.value, (message) => {
                    return openBlock(), createElementBlock("article", {
                      key: message.id,
                      class: "notification-card"
                    }, [
                      _cache[84] || (_cache[84] = createBaseVNode("span", { class: "material-symbols-outlined" }, "mail", -1)),
                      createBaseVNode("div", null, [
                        createBaseVNode("strong", null, toDisplayString(message.sender_student_id) + " -> " + toDisplayString(message.receiver_student_id), 1),
                        createBaseVNode("p", null, toDisplayString(message.content), 1),
                        createBaseVNode("small", null, toDisplayString(formatTime(message.created_at)), 1)
                      ])
                    ]);
                  }), 128)),
                  !messages.value.length ? (openBlock(), createElementBlock("div", _hoisted_100, "暂无私信")) : createCommentVNode("", true)
                ])
              ])) : createCommentVNode("", true),
              activeTab.value === "me" ? (openBlock(), createElementBlock("section", _hoisted_101, [
                createBaseVNode("div", _hoisted_102, [
                  _cache[92] || (_cache[92] = createBaseVNode("div", { class: "cover-gradient" }, null, -1)),
                  createBaseVNode("div", _hoisted_103, [
                    createBaseVNode("button", {
                      class: "profile-avatar uploadable-avatar",
                      type: "button",
                      disabled: isPending("profile:avatar-upload"),
                      title: "更换头像",
                      onClick: openAvatarFilePicker,
                      onKeydown: [
                        withKeys(withModifiers(openAvatarFilePicker, ["prevent"]), ["enter"]),
                        withKeys(withModifiers(openAvatarFilePicker, ["prevent"]), ["space"])
                      ]
                    }, [
                      profile.value.avatar_url ? (openBlock(), createElementBlock("img", {
                        key: 0,
                        src: profile.value.avatar_url,
                        alt: "社区头像"
                      }, null, 8, _hoisted_105)) : (openBlock(), createElementBlock("span", _hoisted_106, toDisplayString(initials(profile.value.nickname || __props.studentId)), 1)),
                      _cache[86] || (_cache[86] = createBaseVNode("span", { class: "avatar-upload-overlay" }, [
                        createBaseVNode("span", { class: "material-symbols-outlined" }, "photo_camera"),
                        createTextVNode(" 更换头像 ")
                      ], -1))
                    ], 40, _hoisted_104),
                    createBaseVNode("button", {
                      class: "primary-pill",
                      type: "button",
                      disabled: isPending("checkin"),
                      onClick: checkIn
                    }, toDisplayString(isPending("checkin") ? "签到中" : "签到"), 9, _hoisted_107),
                    createBaseVNode("h2", null, toDisplayString(profile.value.nickname || __props.studentId || "游客"), 1),
                    createBaseVNode("p", null, toDisplayString(meSummary.value?.profile?.bio || profile.value.bio || "还没有填写社区简介"), 1),
                    createBaseVNode("div", _hoisted_108, [
                      _cache[87] || (_cache[87] = createBaseVNode("span", null, "HBUT Student", -1)),
                      createBaseVNode("span", null, "Lv. " + toDisplayString(meStats.value.checkin_count || 0), 1),
                      createBaseVNode("span", null, "资料完整度 " + toDisplayString(profileCompletion.value) + "%", 1)
                    ]),
                    createBaseVNode("div", _hoisted_109, [
                      createBaseVNode("div", null, [
                        createBaseVNode("strong", null, toDisplayString(meStats.value.thread_count || 0), 1),
                        _cache[88] || (_cache[88] = createBaseVNode("span", null, "Posts", -1))
                      ]),
                      createBaseVNode("div", null, [
                        createBaseVNode("strong", null, toDisplayString(meStats.value.reply_count || 0), 1),
                        _cache[89] || (_cache[89] = createBaseVNode("span", null, "Replies", -1))
                      ]),
                      createBaseVNode("div", null, [
                        createBaseVNode("strong", null, toDisplayString(meStats.value.bookmark_count || 0), 1),
                        _cache[90] || (_cache[90] = createBaseVNode("span", null, "Collections", -1))
                      ]),
                      createBaseVNode("div", null, [
                        createBaseVNode("strong", null, toDisplayString(meStats.value.checkin_count || 0), 1),
                        _cache[91] || (_cache[91] = createBaseVNode("span", null, "Check-ins", -1))
                      ])
                    ])
                  ])
                ]),
                createBaseVNode("div", _hoisted_110, [
                  createBaseVNode("label", null, [
                    _cache[93] || (_cache[93] = createBaseVNode("span", null, "昵称", -1)),
                    withDirectives(createBaseVNode("input", {
                      id: "forum-profile-nickname",
                      "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => profile.value.nickname = $event),
                      name: "forum-profile-nickname",
                      maxlength: "80"
                    }, null, 512), [
                      [vModelText, profile.value.nickname]
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_111, [
                    createBaseVNode("div", _hoisted_112, [
                      profile.value.avatar_url ? (openBlock(), createElementBlock("img", {
                        key: 0,
                        src: profile.value.avatar_url,
                        alt: "当前社区头像"
                      }, null, 8, _hoisted_113)) : (openBlock(), createElementBlock("span", _hoisted_114, toDisplayString(initials(profile.value.nickname || __props.studentId)), 1))
                    ]),
                    createBaseVNode("div", _hoisted_115, [
                      _cache[95] || (_cache[95] = createBaseVNode("strong", null, "设置头像", -1)),
                      _cache[96] || (_cache[96] = createBaseVNode("span", { class: "avatar-upload-title" }, "头像上传（推荐）", -1)),
                      _cache[97] || (_cache[97] = createBaseVNode("p", { class: "form-hint" }, "从本地选择图片上传到论坛图床，成功后会自动回填到头像地址。", -1)),
                      createBaseVNode("div", _hoisted_116, [
                        createBaseVNode("input", {
                          id: "forum-profile-avatar-file",
                          ref_key: "profileAvatarInput",
                          ref: profileAvatarInput,
                          type: "file",
                          accept: "image/*",
                          disabled: isPending("profile:avatar-upload"),
                          onChange: uploadAvatarImage
                        }, null, 40, _hoisted_117),
                        createBaseVNode("label", {
                          class: "ghost-pill avatar-upload-button",
                          for: "forum-profile-avatar-file",
                          tabindex: "0",
                          onKeydown: [
                            withKeys(withModifiers(openAvatarFilePicker, ["prevent"]), ["enter"]),
                            withKeys(withModifiers(openAvatarFilePicker, ["prevent"]), ["space"])
                          ]
                        }, [
                          _cache[94] || (_cache[94] = createBaseVNode("span", { class: "material-symbols-outlined" }, "upload", -1)),
                          createBaseVNode("span", null, toDisplayString(isPending("profile:avatar-upload") ? "头像图床上传中" : "上传头像到图床"), 1)
                        ], 40, _hoisted_118)
                      ]),
                      avatarUploadStatus.value ? (openBlock(), createElementBlock("p", _hoisted_119, toDisplayString(avatarUploadStatus.value), 1)) : createCommentVNode("", true),
                      _cache[98] || (_cache[98] = createBaseVNode("p", { class: "form-hint" }, "自动上传失败时，仍可使用下方备用 URL。", -1))
                    ])
                  ]),
                  createBaseVNode("label", _hoisted_120, [
                    _cache[99] || (_cache[99] = createBaseVNode("span", null, "手动 URL（备用）", -1)),
                    withDirectives(createBaseVNode("input", {
                      id: "forum-profile-avatar",
                      "onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => profile.value.avatar_url = $event),
                      name: "forum-profile-avatar",
                      maxlength: "500",
                      placeholder: "自动上传失败时，可粘贴后端图床或外部图片 URL"
                    }, null, 512), [
                      [vModelText, profile.value.avatar_url]
                    ])
                  ]),
                  createBaseVNode("label", null, [
                    _cache[100] || (_cache[100] = createBaseVNode("span", null, "简介", -1)),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => profile.value.bio = $event),
                      maxlength: "300",
                      placeholder: "社区简介"
                    }, null, 512), [
                      [vModelText, profile.value.bio]
                    ])
                  ]),
                  createBaseVNode("label", _hoisted_121, [
                    _cache[101] || (_cache[101] = createBaseVNode("span", null, "管理员口令", -1)),
                    withDirectives(createBaseVNode("input", {
                      id: "forum-profile-admin-secret",
                      "onUpdate:modelValue": _cache[21] || (_cache[21] = ($event) => profile.value.admin_secret = $event),
                      name: "forum-profile-admin-secret",
                      type: "password",
                      maxlength: "300",
                      autocomplete: "current-password",
                      placeholder: "仅管理员填写"
                    }, null, 512), [
                      [vModelText, profile.value.admin_secret]
                    ])
                  ]),
                  createBaseVNode("button", {
                    class: "primary-pill wide",
                    type: "button",
                    onClick: saveProfile
                  }, "保存资料")
                ]),
                _cache[105] || (_cache[105] = createBaseVNode("div", { class: "profile-content-tabs" }, [
                  createBaseVNode("button", {
                    type: "button",
                    class: "active"
                  }, "Posts"),
                  createBaseVNode("button", { type: "button" }, "Replies"),
                  createBaseVNode("button", { type: "button" }, "Collections")
                ], -1)),
                createBaseVNode("div", _hoisted_122, [
                  createBaseVNode("div", _hoisted_123, [
                    _cache[102] || (_cache[102] = createBaseVNode("h3", null, "我的帖子", -1)),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(myThreads.value, (thread) => {
                      return openBlock(), createElementBlock("button", {
                        key: thread.id,
                        type: "button",
                        onClick: ($event) => openThread(thread)
                      }, toDisplayString(thread.title), 9, _hoisted_124);
                    }), 128)),
                    !myThreads.value.length ? (openBlock(), createElementBlock("div", _hoisted_125, "暂无帖子")) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("div", _hoisted_126, [
                    _cache[103] || (_cache[103] = createBaseVNode("h3", null, "我的回复", -1)),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(myReplies.value, (reply) => {
                      return openBlock(), createElementBlock("button", {
                        key: reply.id,
                        type: "button",
                        onClick: ($event) => openThread({ id: reply.thread_id, title: reply.thread_title })
                      }, toDisplayString(reply.thread_title || reply.content_md || `回复 #${reply.id}`), 9, _hoisted_127);
                    }), 128)),
                    !myReplies.value.length ? (openBlock(), createElementBlock("div", _hoisted_128, "暂无回复")) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("div", _hoisted_129, [
                    _cache[104] || (_cache[104] = createBaseVNode("h3", null, "我的收藏", -1)),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(myBookmarks.value, (thread) => {
                      return openBlock(), createElementBlock("button", {
                        key: thread.id,
                        type: "button",
                        onClick: ($event) => openThread(thread)
                      }, toDisplayString(thread.title), 9, _hoisted_130);
                    }), 128)),
                    !myBookmarks.value.length ? (openBlock(), createElementBlock("div", _hoisted_131, "暂无收藏")) : createCommentVNode("", true)
                  ])
                ]),
                createBaseVNode("div", _hoisted_132, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(badges.value, (badge) => {
                    return openBlock(), createElementBlock("span", {
                      key: badge.badge_key
                    }, toDisplayString(badge.display_name), 1);
                  }), 128)),
                  !badges.value.length ? (openBlock(), createElementBlock("span", _hoisted_133, "暂无徽章")) : createCommentVNode("", true)
                ])
              ])) : createCommentVNode("", true),
              activeTab.value === "user-profile" ? (openBlock(), createElementBlock("section", _hoisted_134, [
                createBaseVNode("div", _hoisted_135, [
                  createBaseVNode("button", {
                    class: "icon-button",
                    type: "button",
                    onClick: _cache[22] || (_cache[22] = ($event) => switchTab("feed"))
                  }, [..._cache[106] || (_cache[106] = [
                    createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)
                  ])]),
                  _cache[107] || (_cache[107] = createBaseVNode("h2", null, "用户主页", -1))
                ]),
                viewedProfileLoading.value ? (openBlock(), createElementBlock("div", _hoisted_136, [..._cache[108] || (_cache[108] = [
                  createBaseVNode("article", {
                    class: "skeleton-card profile",
                    "aria-hidden": "true"
                  }, [
                    createBaseVNode("span", { class: "skeleton-pill avatar" }),
                    createBaseVNode("span", { class: "skeleton-line wide" }),
                    createBaseVNode("span", { class: "skeleton-line short" })
                  ], -1)
                ])])) : (openBlock(), createElementBlock("div", _hoisted_137, [
                  _cache[112] || (_cache[112] = createBaseVNode("div", { class: "cover-gradient" }, null, -1)),
                  createBaseVNode("div", _hoisted_138, [
                    createBaseVNode("div", _hoisted_139, [
                      viewedProfileInfo.value.avatar_url ? (openBlock(), createElementBlock("img", {
                        key: 0,
                        src: viewedProfileInfo.value.avatar_url,
                        alt: "用户头像"
                      }, null, 8, _hoisted_140)) : (openBlock(), createElementBlock("span", _hoisted_141, toDisplayString(initials(viewedProfileInfo.value.nickname || viewedProfileInfo.value.student_id)), 1))
                    ]),
                    createBaseVNode("div", _hoisted_142, [
                      createBaseVNode("button", {
                        class: "primary-pill",
                        type: "button",
                        disabled: !viewedProfileInfo.value.student_id || isPending(`follow:${viewedProfileInfo.value.student_id}`),
                        onClick: _cache[23] || (_cache[23] = ($event) => followAuthor(viewedProfileInfo.value.student_id))
                      }, toDisplayString(isPending(`follow:${viewedProfileInfo.value.student_id}`) ? "关注中" : "关注"), 9, _hoisted_143)
                    ]),
                    createBaseVNode("h2", null, toDisplayString(viewedProfileInfo.value.nickname || viewedProfileInfo.value.student_id || "同学"), 1),
                    createBaseVNode("p", null, toDisplayString(viewedProfileInfo.value.bio || "这个同学还没有填写社区简介"), 1),
                    createBaseVNode("div", _hoisted_144, [
                      createBaseVNode("div", null, [
                        createBaseVNode("strong", null, toDisplayString(viewedProfileStats.value.thread_count || 0), 1),
                        _cache[109] || (_cache[109] = createBaseVNode("span", null, "Posts", -1))
                      ]),
                      createBaseVNode("div", null, [
                        createBaseVNode("strong", null, toDisplayString(viewedProfileStats.value.reply_count || 0), 1),
                        _cache[110] || (_cache[110] = createBaseVNode("span", null, "Replies", -1))
                      ]),
                      createBaseVNode("div", null, [
                        createBaseVNode("strong", null, toDisplayString(viewedProfileStats.value.follower_count || 0), 1),
                        _cache[111] || (_cache[111] = createBaseVNode("span", null, "Followers", -1))
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_145, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(userProfileBadges.value, (badge) => {
                        return openBlock(), createElementBlock("span", {
                          key: badge.badge_key
                        }, toDisplayString(badge.display_name), 1);
                      }), 128)),
                      !userProfileBadges.value.length ? (openBlock(), createElementBlock("span", _hoisted_146, "暂无公开徽章")) : createCommentVNode("", true)
                    ])
                  ])
                ])),
                createBaseVNode("div", _hoisted_147, [
                  createBaseVNode("div", _hoisted_148, [
                    _cache[113] || (_cache[113] = createBaseVNode("h3", null, "公开动态", -1)),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(userProfileThreads.value, (thread) => {
                      return openBlock(), createElementBlock("button", {
                        key: thread.id,
                        type: "button",
                        onClick: ($event) => openThread(thread)
                      }, toDisplayString(thread.title), 9, _hoisted_149);
                    }), 128)),
                    !userProfileThreads.value.length ? (openBlock(), createElementBlock("div", _hoisted_150, "这个同学还没有发帖")) : createCommentVNode("", true)
                  ])
                ])
              ])) : createCommentVNode("", true),
              activeTab.value === "admin" && isAdmin.value ? (openBlock(), createElementBlock("section", _hoisted_151, [
                createBaseVNode("div", _hoisted_152, [
                  _cache[115] || (_cache[115] = createBaseVNode("div", null, [
                    createBaseVNode("span", { class: "eyebrow" }, "Admin Center"),
                    createBaseVNode("h2", null, "社区管理中心"),
                    createBaseVNode("p", null, "面向举报、用户、徽章和备份的轻量运营台，所有操作都会走后端权限校验。")
                  ], -1)),
                  createBaseVNode("button", {
                    class: "primary-pill",
                    type: "button",
                    disabled: isPending("admin:backup"),
                    onClick: runBackup
                  }, [
                    _cache[114] || (_cache[114] = createBaseVNode("span", { class: "material-symbols-outlined" }, "backup", -1)),
                    createTextVNode(" " + toDisplayString(isPending("admin:backup") ? "备份中" : "触发备份"), 1)
                  ], 8, _hoisted_153)
                ]),
                createBaseVNode("div", _hoisted_154, [
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString(adminSummary.value.reportCount), 1),
                    _cache[116] || (_cache[116] = createBaseVNode("span", null, "举报队列", -1))
                  ]),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString(adminSummary.value.userCount), 1),
                    _cache[117] || (_cache[117] = createBaseVNode("span", null, "用户治理", -1))
                  ]),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString(adminSummary.value.bannedCount), 1),
                    _cache[118] || (_cache[118] = createBaseVNode("span", null, "已封禁", -1))
                  ]),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString(adminSummary.value.pollCount), 1),
                    _cache[119] || (_cache[119] = createBaseVNode("span", null, "投票打分", -1))
                  ]),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString(adminSummary.value.backupCount), 1),
                    _cache[120] || (_cache[120] = createBaseVNode("span", null, "备份记录", -1))
                  ])
                ]),
                createBaseVNode("div", _hoisted_155, [
                  createBaseVNode("div", _hoisted_156, [
                    createBaseVNode("div", _hoisted_157, [
                      _cache[121] || (_cache[121] = createBaseVNode("h3", null, "举报队列", -1)),
                      createBaseVNode("span", null, toDisplayString(adminReports.value.length), 1)
                    ]),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(adminReports.value, (report) => {
                      return openBlock(), createElementBlock("article", {
                        key: report.id,
                        class: "admin-row"
                      }, [
                        _cache[122] || (_cache[122] = createBaseVNode("span", { class: "material-symbols-outlined" }, "flag", -1)),
                        createBaseVNode("div", null, [
                          createBaseVNode("strong", null, toDisplayString(report.target_type) + " #" + toDisplayString(report.target_id), 1),
                          createBaseVNode("p", null, toDisplayString(report.reason), 1),
                          createBaseVNode("small", null, toDisplayString(report.reporter_student_id) + " · " + toDisplayString(formatTime(report.created_at)), 1)
                        ]),
                        _cache[123] || (_cache[123] = createBaseVNode("div", { class: "admin-report-actions" }, [
                          createBaseVNode("button", {
                            class: "ghost-pill",
                            type: "button"
                          }, "查看目标")
                        ], -1))
                      ]);
                    }), 128)),
                    !adminReports.value.length ? (openBlock(), createElementBlock("div", _hoisted_158, "暂无举报")) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("div", _hoisted_159, [
                    createBaseVNode("div", _hoisted_160, [
                      _cache[124] || (_cache[124] = createBaseVNode("h3", null, "用户治理", -1)),
                      createBaseVNode("span", null, toDisplayString(adminUsers.value.length), 1)
                    ]),
                    createBaseVNode("div", _hoisted_161, [
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[24] || (_cache[24] = ($event) => adminSearch.value = $event),
                        placeholder: "搜索学号/昵称",
                        onKeyup: withKeys(searchAdminUsers, ["enter"])
                      }, null, 544), [
                        [vModelText, adminSearch.value]
                      ]),
                      createBaseVNode("button", {
                        class: "ghost-pill",
                        type: "button",
                        onClick: searchAdminUsers
                      }, "搜索")
                    ]),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(adminUsers.value, (user) => {
                      return openBlock(), createElementBlock("article", {
                        key: user.student_id,
                        class: "admin-row"
                      }, [
                        _cache[125] || (_cache[125] = createBaseVNode("span", { class: "material-symbols-outlined" }, "person", -1)),
                        createBaseVNode("div", null, [
                          createBaseVNode("strong", null, toDisplayString(user.nickname || user.student_id), 1),
                          createBaseVNode("p", null, toDisplayString(user.student_id) + " · " + toDisplayString(Number(user.is_banned || 0) ? "已封禁" : "正常"), 1)
                        ]),
                        createBaseVNode("div", _hoisted_162, [
                          createBaseVNode("button", {
                            class: "ghost-pill",
                            type: "button",
                            onClick: ($event) => banDraft.value.student_id = user.student_id
                          }, "填入", 8, _hoisted_163)
                        ])
                      ]);
                    }), 128))
                  ]),
                  createBaseVNode("div", _hoisted_164, [
                    _cache[126] || (_cache[126] = createBaseVNode("h3", null, "封禁 / 解封", -1)),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[25] || (_cache[25] = ($event) => banDraft.value.student_id = $event),
                      placeholder: "目标学号"
                    }, null, 512), [
                      [vModelText, banDraft.value.student_id]
                    ]),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[26] || (_cache[26] = ($event) => banDraft.value.reason = $event),
                      placeholder: "原因，可选"
                    }, null, 512), [
                      [vModelText, banDraft.value.reason]
                    ]),
                    createBaseVNode("div", _hoisted_165, [
                      createBaseVNode("button", {
                        class: "danger-pill",
                        type: "button",
                        disabled: isPending(`admin:ban:${banDraft.value.student_id.trim()}:true`),
                        onClick: _cache[27] || (_cache[27] = ($event) => setUserBan(true))
                      }, toDisplayString(isPending(`admin:ban:${banDraft.value.student_id.trim()}:true`) ? "封禁中" : "封禁"), 9, _hoisted_166),
                      createBaseVNode("button", {
                        class: "ghost-pill",
                        type: "button",
                        disabled: isPending(`admin:ban:${banDraft.value.student_id.trim()}:false`),
                        onClick: _cache[28] || (_cache[28] = ($event) => setUserBan(false))
                      }, toDisplayString(isPending(`admin:ban:${banDraft.value.student_id.trim()}:false`) ? "解封中" : "解封"), 9, _hoisted_167)
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_168, [
                    _cache[127] || (_cache[127] = createBaseVNode("h3", null, "徽章发放", -1)),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[29] || (_cache[29] = ($event) => badgeDraft.value.student_id = $event),
                      placeholder: "目标学号"
                    }, null, 512), [
                      [vModelText, badgeDraft.value.student_id]
                    ]),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[30] || (_cache[30] = ($event) => badgeDraft.value.badge_key = $event),
                      placeholder: "badge_key"
                    }, null, 512), [
                      [vModelText, badgeDraft.value.badge_key]
                    ]),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[31] || (_cache[31] = ($event) => badgeDraft.value.display_name = $event),
                      placeholder: "展示名"
                    }, null, 512), [
                      [vModelText, badgeDraft.value.display_name]
                    ]),
                    createBaseVNode("button", {
                      class: "primary-pill wide",
                      type: "button",
                      disabled: isPending(`admin:badge:${badgeDraft.value.student_id.trim()}:${badgeDraft.value.badge_key.trim()}`),
                      onClick: grantBadge
                    }, toDisplayString(isPending(`admin:badge:${badgeDraft.value.student_id.trim()}:${badgeDraft.value.badge_key.trim()}`) ? "发放中" : "发放徽章"), 9, _hoisted_169)
                  ]),
                  createBaseVNode("div", _hoisted_170, [
                    createBaseVNode("div", _hoisted_171, [
                      _cache[128] || (_cache[128] = createBaseVNode("h3", null, "管理员创建投票", -1)),
                      createBaseVNode("span", null, toDisplayString(pollAdminSummary.value.total) + " 个", 1)
                    ]),
                    createBaseVNode("div", _hoisted_172, [
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[32] || (_cache[32] = ($event) => pollDraft.value.title = $event),
                        placeholder: "投票标题"
                      }, null, 512), [
                        [vModelText, pollDraft.value.title]
                      ]),
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[33] || (_cache[33] = ($event) => pollDraft.value.description = $event),
                        placeholder: "说明，可选"
                      }, null, 512), [
                        [vModelText, pollDraft.value.description]
                      ]),
                      withDirectives(createBaseVNode("textarea", {
                        "onUpdate:modelValue": _cache[34] || (_cache[34] = ($event) => pollDraft.value.options = $event),
                        rows: "4",
                        placeholder: "每行一个选项，如：很满意|10"
                      }, null, 512), [
                        [vModelText, pollDraft.value.options]
                      ]),
                      createBaseVNode("button", {
                        class: "primary-pill wide",
                        type: "button",
                        disabled: isPending("poll:create"),
                        onClick: createAdminPoll
                      }, toDisplayString(isPending("poll:create") ? "发布中" : "发布投票"), 9, _hoisted_173)
                    ]),
                    createBaseVNode("div", _hoisted_174, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(adminPolls.value, (poll) => {
                        return openBlock(), createElementBlock("article", {
                          key: poll.id,
                          class: "admin-row"
                        }, [
                          _cache[129] || (_cache[129] = createBaseVNode("span", { class: "material-symbols-outlined" }, "how_to_vote", -1)),
                          createBaseVNode("div", null, [
                            createBaseVNode("strong", null, toDisplayString(poll.title), 1),
                            createBaseVNode("p", null, toDisplayString(poll.status === "closed" ? "已关闭" : "进行中") + " · " + toDisplayString(pollOptionTotal(poll)) + " 票", 1),
                            createBaseVNode("small", null, toDisplayString(formatTime(poll.created_at)), 1)
                          ]),
                          createBaseVNode("button", {
                            class: "ghost-pill",
                            type: "button",
                            disabled: poll.status === "closed" || isPending(`poll:close:${poll.id}`),
                            onClick: ($event) => closeAdminPoll(poll)
                          }, toDisplayString(poll.status === "closed" ? "已关闭" : "关闭投票"), 9, _hoisted_175)
                        ]);
                      }), 128))
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_176, [
                    createBaseVNode("div", _hoisted_177, [
                      _cache[130] || (_cache[130] = createBaseVNode("h3", null, "备份记录", -1)),
                      createBaseVNode("span", null, toDisplayString(adminBackups.value.length), 1)
                    ]),
                    createBaseVNode("div", _hoisted_178, [
                      _cache[131] || (_cache[131] = createBaseVNode("span", { class: "material-symbols-outlined" }, "cloud_sync", -1)),
                      createBaseVNode("div", null, [
                        createBaseVNode("strong", null, toDisplayString(latestBackup.value ? `最近备份 ${formatTime(latestBackup.value.created_at)}` : "等待首次备份"), 1),
                        createBaseVNode("p", null, "HF Bucket：" + toDisplayString(latestBackup.value?.hf_path || "未返回路径"), 1),
                        createBaseVNode("p", null, "OneDrive：" + toDisplayString(latestBackup.value?.onedrive_path || latestBackup.value?.onedrive_status || "未同步"), 1)
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_179, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(adminBackups.value, (backup) => {
                        return openBlock(), createElementBlock("article", {
                          key: backup.id,
                          class: "admin-row"
                        }, [
                          _cache[132] || (_cache[132] = createBaseVNode("span", { class: "material-symbols-outlined" }, "database", -1)),
                          createBaseVNode("div", null, [
                            createBaseVNode("strong", null, toDisplayString(backup.kind) + " · " + toDisplayString(formatTime(backup.created_at)), 1),
                            createBaseVNode("p", _hoisted_180, "HF Bucket " + toDisplayString(backup.hf_path || "未返回路径"), 1),
                            createBaseVNode("p", _hoisted_181, "OneDrive " + toDisplayString(backup.onedrive_path || backup.onedrive_status || "未同步"), 1),
                            createBaseVNode("small", null, toDisplayString(backup.sqlite_path || "本地归档路径待返回"), 1)
                          ])
                        ]);
                      }), 128))
                    ]),
                    !adminBackups.value.length ? (openBlock(), createElementBlock("div", _hoisted_182, "暂无备份")) : createCommentVNode("", true)
                  ])
                ])
              ])) : createCommentVNode("", true),
              uploadQueue.value.length ? (openBlock(), createElementBlock("section", _hoisted_183, [
                _cache[134] || (_cache[134] = createBaseVNode("div", { class: "upload-drop-card" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "cloud_upload"),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, "上传到后端图床"),
                    createBaseVNode("p", null, "发帖、回复和头像上传都会在这里显示状态，成功后可复制代理 URL。")
                  ])
                ], -1)),
                createBaseVNode("div", _hoisted_184, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(uploadQueue.value, (item) => {
                    return openBlock(), createElementBlock("article", {
                      key: item.key,
                      class: normalizeClass(["upload-progress-item", item.status])
                    }, [
                      _cache[133] || (_cache[133] = createBaseVNode("span", { class: "material-symbols-outlined" }, "upload_file", -1)),
                      createBaseVNode("div", null, [
                        createBaseVNode("strong", null, toDisplayString(item.name), 1),
                        createBaseVNode("small", null, toDisplayString(uploadScopeLabel(item.scope)) + " · " + toDisplayString(item.sizeLabel), 1),
                        createBaseVNode("div", _hoisted_185, [
                          createBaseVNode("span", {
                            style: normalizeStyle({ width: `${item.progress || 0}%` })
                          }, null, 4)
                        ]),
                        item.proxyUrl ? (openBlock(), createElementBlock("button", {
                          key: 0,
                          class: "attachment-url-chip",
                          type: "button",
                          onClick: ($event) => copyAttachmentUrl(item.proxyUrl)
                        }, " 复制代理 URL ", 8, _hoisted_186)) : createCommentVNode("", true),
                        item.status === "failed" ? (openBlock(), createElementBlock("p", _hoisted_187, toDisplayString(item.error || "上传失败，点击重试"), 1)) : createCommentVNode("", true)
                      ]),
                      createBaseVNode("div", _hoisted_188, [
                        createBaseVNode("span", _hoisted_189, toDisplayString(uploadStatusText(item.status)), 1),
                        item.status === "failed" ? (openBlock(), createElementBlock("button", {
                          key: 0,
                          class: "upload-retry-button",
                          type: "button",
                          disabled: isPending(`upload:retry:${item.key}`),
                          onClick: ($event) => retryUploadFile(item)
                        }, toDisplayString(isPending(`upload:retry:${item.key}`) ? "重试中" : "上传失败，点击重试"), 9, _hoisted_190)) : createCommentVNode("", true)
                      ])
                    ], 2);
                  }), 128))
                ])
              ])) : createCommentVNode("", true)
            ]),
            _cache[135] || (_cache[135] = createBaseVNode("div", {
              class: "forum-bottom-safe-spacer",
              "aria-hidden": "true"
            }, null, -1))
          ])
        ])
      ]);
    };
  }
};
const ForumView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-15f87371"]]);
export {
  ForumView as default
};
