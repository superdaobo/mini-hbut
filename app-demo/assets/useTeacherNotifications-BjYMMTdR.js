import { a as isTauriRuntime, d as invokeNative, v as isTeacherRoleValue } from "./runtime-bridge-DtTGpr5b.js";
import { a9 as readJSON, aa as teacherReminderSnapshotKeyFor, ab as toSafeText, ac as asString, ad as readTeacherSnapshot, ae as canPersistTeacherState, af as writeTeacherSnapshot, ag as toTeacherDataError, ah as buildTeacherSnapshotKey, ai as classifyTeacherErrorKind, aj as buildTeacherScopedKey, ak as looksLikeHtml, al as sanitizeSchoolInboxHtml, am as normalizeTeacherText, an as stripTeacherHtml } from "./app-demo-TQEQRs3d.js";
import { r as resolveTeacherSyncStatus, i as isTeacherOffline } from "./teacher_sync_status-But3HSMJ.js";
import { h as computed, r as ref } from "./vue-core-CU1bwGIw.js";
const listTeacherReminderEvents = (accountId, semester, now = /* @__PURE__ */ new Date()) => {
  const state = readJSON(
    teacherReminderSnapshotKeyFor(accountId, semester),
    null
  );
  const entries = Array.isArray(state?.entries) ? state.entries : [];
  const nowSecs = Math.floor((now instanceof Date ? now.getTime() : Date.now()) / 1e3);
  return entries.map((raw) => {
    const record = raw && typeof raw === "object" ? raw : {};
    const atEpochSecs = Number(record.atEpochSecs);
    if (!Number.isFinite(atEpochSecs)) return null;
    const type = record.type === "exam" || record.type === "personal" ? record.type : "class";
    return {
      id: Number(record.id) || 0,
      type,
      title: toSafeText(record.title),
      body: toSafeText(record.body),
      atEpochSecs,
      targetView: toSafeText(record.targetView) || "schedule"
    };
  }).filter((event) => event !== null && event.atEpochSecs >= nowSecs).sort((a, b) => a.atEpochSecs - b.atEpochSecs);
};
const shouldSendRemoteMarkRead = (role, readOnly = false) => !readOnly && !isTeacherRoleValue(role);
const TEACHER_ERROR_I18N_KEY = {
  empty: "teacher.error.empty",
  unauthorized: "teacher.error.unauthorized",
  expired: "teacher.error.expired",
  errorHtml: "teacher.error.errorHtml",
  timeout: "teacher.error.timeout",
  notImplemented: "teacher.error.notImplemented",
  unknown: "teacher.error.unknown"
};
const teacherNoticeReadKey = (accountId, semester) => canPersistTeacherState(accountId) ? buildTeacherScopedKey("notices-read", accountId, semester) : "";
const readReadIds = (key) => {
  if (!key) return [];
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((value) => String(value)).filter(Boolean) : [];
  } catch {
    return [];
  }
};
const writeReadIds = (key, ids) => {
  if (!key) return;
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(ids));
  } catch {
  }
};
const toTeacherNoticeItem = (raw) => {
  const record = raw && typeof raw === "object" ? raw : {};
  const rawBody = asString(record.body ?? record.summary);
  const body = rawBody && looksLikeHtml(rawBody) ? sanitizeSchoolInboxHtml(rawBody) : rawBody;
  const summary = normalizeTeacherText(record.summary) || stripTeacherHtml(record.body).slice(0, 160);
  return {
    id: asString(record.id),
    title: stripTeacherHtml(record.title),
    summary,
    body,
    createdAt: asString(record.createdAt ?? record.created_at),
    isRead: Boolean(record.isRead ?? record.is_read),
    source: asString(record.source) || "portal"
  };
};
const fetchTeacherNoticesReadOnly = async () => {
  if (!isTauriRuntime()) {
    return { items: [], source: "", fetchedAt: "", desktopOnly: true };
  }
  const response = await invokeNative("school_inbox_fetch", { loginMode: "portal" });
  const rawItems = Array.isArray(response?.items) ? response.items : [];
  const items = rawItems.map(toTeacherNoticeItem).filter((item) => item.id);
  const errorMessage = asString(response?.error);
  return {
    items,
    source: asString(response?.source) || "portal",
    fetchedAt: asString(response?.fetchedAt),
    ...errorMessage ? { errorKind: classifyInboxError(errorMessage), errorMessage } : {}
  };
};
const classifyInboxError = (message) => {
  const text = String(message || "");
  if (/JSON\s*解析失败|expected value|unexpected token|invalid json/i.test(text)) {
    return "errorHtml";
  }
  return classifyTeacherErrorKind(text);
};
const useTeacherNotifications = (options) => {
  const fetcher = options.fetcher ?? fetchTeacherNoticesReadOnly;
  const notices = ref([]);
  const reminders = ref([]);
  const loading = ref(false);
  const remindersLoading = ref(false);
  const error = ref(null);
  const desktopOnly = ref(false);
  const fetchedAt = ref("");
  const source = ref("portal");
  const localReadIds = ref(/* @__PURE__ */ new Set());
  const lastSuccessfulSyncAt = ref("");
  const fromCache = ref(false);
  const snapshotStale = ref(false);
  const semesterOf = () => options.semester ? options.semester() ?? "" : "";
  const snapshotKey = computed(
    () => buildTeacherSnapshotKey({
      resource: "notices",
      accountId: options.accountId(),
      semester: semesterOf()
    })
  );
  const syncStatus = computed(
    () => resolveTeacherSyncStatus({
      phase: loading.value ? "loading" : error.value ? "error" : notices.value.length ? "ready" : "empty",
      hasData: notices.value.length > 0,
      fromCache: fromCache.value,
      stale: snapshotStale.value,
      hasSyncTime: Boolean(lastSuccessfulSyncAt.value),
      offline: isTeacherOffline(),
      errorKind: error.value?.kind ?? null
    })
  );
  const readKey = () => teacherNoticeReadKey(options.accountId(), options.semester ? options.semester() : "");
  const loadReadIds = () => {
    localReadIds.value = new Set(readReadIds(readKey()));
  };
  const isLocallyRead = (itemId) => localReadIds.value.has(itemId);
  const academicNotices = computed(
    () => notices.value.map((item) => ({
      ...item,
      isRead: item.isRead || localReadIds.value.has(item.id)
    }))
  );
  const unreadCount = computed(
    () => academicNotices.value.filter((item) => !item.isRead).length
  );
  const loadNotices = async (opts = {}) => {
    const key = snapshotKey.value;
    const account = options.accountId() ?? "";
    loadReadIds();
    if (!opts.force && key) {
      const snapshot = readTeacherSnapshot(key);
      if (snapshot) {
        notices.value = snapshot.data;
        fetchedAt.value = snapshot.meta.lastSuccessfulSyncAt;
        lastSuccessfulSyncAt.value = snapshot.meta.lastSuccessfulSyncAt;
        fromCache.value = true;
        snapshotStale.value = snapshot.meta.stale;
        if (!snapshot.meta.stale) return;
      }
    }
    loading.value = true;
    error.value = null;
    desktopOnly.value = false;
    try {
      const result = await fetcher();
      notices.value = result.items;
      fetchedAt.value = result.fetchedAt;
      source.value = result.source || "portal";
      desktopOnly.value = result.desktopOnly === true;
      if (result.errorMessage) {
        error.value = {
          kind: result.errorKind ?? classifyInboxError(result.errorMessage),
          message: result.errorMessage
        };
      } else if (!desktopOnly.value) {
        const syncedAt = result.fetchedAt || (/* @__PURE__ */ new Date()).toISOString();
        lastSuccessfulSyncAt.value = syncedAt;
        fromCache.value = false;
        snapshotStale.value = false;
        if (key && canPersistTeacherState(account)) {
          writeTeacherSnapshot({
            scopeKey: key,
            accountId: account,
            semester: semesterOf(),
            resource: "notices",
            queryKey: "",
            data: result.items,
            lastSuccessfulSyncAt: syncedAt
          });
        }
      }
    } catch (caught) {
      const normalized = toTeacherDataError(caught);
      error.value = { kind: classifyInboxError(normalized.message), message: normalized.message };
    } finally {
      loading.value = false;
    }
  };
  const loadReminders = async () => {
    remindersLoading.value = true;
    try {
      reminders.value = listTeacherReminderEvents(options.accountId(), options.semester ? options.semester() : "");
    } finally {
      remindersLoading.value = false;
    }
  };
  const markLocalRead = (itemId) => {
    const id = asString(itemId);
    if (!id) return;
    const next = new Set(localReadIds.value);
    next.add(id);
    localReadIds.value = next;
    writeReadIds(readKey(), [...next]);
  };
  return {
    notices,
    reminders,
    loading,
    remindersLoading,
    error,
    desktopOnly,
    fetchedAt,
    source,
    unreadCount,
    academicNotices,
    lastSuccessfulSyncAt,
    fromCache,
    snapshotStale,
    syncStatus,
    loadNotices,
    loadReminders,
    markLocalRead,
    isLocallyRead
  };
};
export {
  TEACHER_ERROR_I18N_KEY as T,
  shouldSendRemoteMarkRead as s,
  useTeacherNotifications as u
};
