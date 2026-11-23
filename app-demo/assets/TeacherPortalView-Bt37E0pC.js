import { h as computed, r as ref, i as defineComponent, o as onMounted, a as openBlock, c as createElementBlock, k as createVNode, l as withCtx, b as createBaseVNode, u as unref, n as normalizeClass, j as createBlock, t as toDisplayString, F as Fragment, M as withDirectives, N as vModelText, d as createCommentVNode, f as renderList } from "./vue-core-4L5yFbGc.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-BqDeZlwd.js";
import { a5 as buildTeacherScopedKey, a6 as normalizeScopeAccountId, a7 as canPersistTeacherState, cu as fetchTeacherPortalCards, ad as dedupeByStableKey, ae as asArray, af as asRecord, a9 as asString, ab as asNumber, ay as normalizeTeacherText, ac as buildStableKey, u as useAuthStore, a3 as resolveTeacherAccountId, _ as _export_sfc } from "./app-demo-D63SYrKg.js";
import { T as TEmptyState } from "./TEmptyState-6p1dD4Yb.js";
import { u as useI18n, t as tf } from "./more-modules-CjuZH60i.js";
import { r as resolveTeacherSyncStatus, i as isTeacherOffline } from "./teacher_sync_status-But3HSMJ.js";
import { _ as _sfc_main$2 } from "./TeacherSyncBar.vue_vue_type_script_setup_true_lang-rODitHm4.js";
import "./runtime-bridge-D89yarmp.js";
import "./debug-tools-M02-hysp.js";
import "./capture-DywMeU18.js";
const teacherPortalErrorKey = (kind) => `teacher.error.${kind}`;
const cardIdContains = (cardId, needle) => cardId.toUpperCase().includes(needle);
const classifyPortalCardKind = (cardId) => {
  if (cardIdContains(cardId, "TODOTASK")) return "todo";
  if (cardIdContains(cardId, "DONETASK")) return "done";
  if (cardIdContains(cardId, "MYTASK")) return "mine";
  if (cardIdContains(cardId, "COPYME")) return "copy";
  return null;
};
const normalizePortalCard = (value, index) => {
  const record = asRecord(value);
  const cardId = asString(record.cardId);
  const cardWid = asString(record.cardWid);
  return {
    key: buildStableKey([cardWid, cardId]) || `portal-card-${index}`,
    cardWid,
    cardId,
    cardName: normalizeTeacherText(record.cardName),
    cardType: asString(record.cardType),
    markNumber: asNumber(record.markNumber) ?? null,
    taskKind: classifyPortalCardKind(cardId)
  };
};
const normalizePortalCardsPayload = (raw) => ({
  cards: dedupeByStableKey(
    asArray(asRecord(raw).cards).map(normalizePortalCard),
    (item) => item.key
  )
});
const portalBadgeVisible = (card) => card.markNumber !== null && card.markNumber > 0;
const portalBadgeText = (card) => {
  if (!portalBadgeVisible(card)) return "";
  const value = Math.floor(card.markNumber ?? 0);
  return value > 99 ? "99+" : String(value);
};
const PORTAL_CACHE_TTL_MS = 5 * 60 * 1e3;
const portalSnapshots = /* @__PURE__ */ new Map();
const PORTAL_SNAPSHOT_MAX_ENTRIES = 32;
const readPortalSnapshot = (key, now = Date.now()) => {
  const snapshot = portalSnapshots.get(key);
  if (!snapshot) return null;
  const syncedAtMs = Date.parse(snapshot.syncedAt);
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > PORTAL_CACHE_TTL_MS;
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale };
};
const writePortalSnapshot = (key, data, syncedAt) => {
  portalSnapshots.set(key, { syncedAt, data });
  while (portalSnapshots.size > PORTAL_SNAPSHOT_MAX_ENTRIES) {
    const oldest = portalSnapshots.keys().next().value;
    if (oldest === void 0) break;
    portalSnapshots.delete(oldest);
  }
};
const useTeacherPortalCards = (options = {}) => {
  const state = ref({
    status: "idle",
    data: null,
    error: null
  });
  const requestSeq = ref(0);
  const lastSuccessfulSyncAt = ref("");
  const fromCache = ref(false);
  const snapshotStale = ref(false);
  const accountId = computed(() => normalizeScopeAccountId(options.accountId?.() ?? ""));
  const scopeKey = computed(
    () => buildTeacherScopedKey("portal-cards", accountId.value, "all")
  );
  const snapshotKey = computed(
    () => canPersistTeacherState(accountId.value) ? scopeKey.value : ""
  );
  const cards = computed(() => state.value.data?.cards ?? []);
  const taskCards = computed(() => {
    const order = ["todo", "done", "mine", "copy"];
    return cards.value.filter((item) => item.taskKind !== null).sort((a, b) => order.indexOf(a.taskKind) - order.indexOf(b.taskKind));
  });
  const serviceCards = computed(
    () => cards.value.filter((item) => item.taskKind === null)
  );
  const isLoading = computed(() => state.value.status === "loading");
  const isEmpty = computed(() => state.value.status === "empty");
  const isReady = computed(() => state.value.status === "ready");
  const isError = computed(() => state.value.status === "error");
  const errorKind = computed(
    () => state.value.error?.kind ?? null
  );
  const errorKey = computed(
    () => state.value.error ? teacherPortalErrorKey(state.value.error.kind) : ""
  );
  const syncStatus = computed(
    () => resolveTeacherSyncStatus({
      phase: state.value.status,
      hasData: state.value.data !== null,
      fromCache: fromCache.value,
      stale: snapshotStale.value,
      hasSyncTime: Boolean(lastSuccessfulSyncAt.value),
      offline: isTeacherOffline(),
      errorKind: errorKind.value
    })
  );
  const applySnapshot = (snapshot, stale) => {
    lastSuccessfulSyncAt.value = snapshot.syncedAt;
    fromCache.value = true;
    snapshotStale.value = stale;
    const empty = snapshot.data.cards.length === 0;
    state.value = empty ? { status: "empty", data: null, error: { kind: "empty", message: "" } } : { status: "ready", data: snapshot.data, error: null };
  };
  const revalidate = async (scope, account, key) => {
    const seq = ++requestSeq.value;
    state.value = { status: "loading", data: state.value.data, error: null };
    const result = await fetchTeacherPortalCards({ scope: account });
    if (seq !== requestSeq.value || scope !== scopeKey.value) return;
    if (result.status === "ready" && result.data) {
      const data = normalizePortalCardsPayload(result.data);
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      lastSuccessfulSyncAt.value = syncedAt;
      fromCache.value = false;
      snapshotStale.value = false;
      if (data.cards.length === 0) {
        state.value = { status: "empty", data: null, error: { kind: "empty", message: "" } };
        return;
      }
      if (key) writePortalSnapshot(key, data, syncedAt);
      state.value = { status: "ready", data, error: null };
      return;
    }
    if (result.status === "empty") {
      lastSuccessfulSyncAt.value = (/* @__PURE__ */ new Date()).toISOString();
      fromCache.value = false;
      snapshotStale.value = false;
      state.value = { status: "empty", data: null, error: { kind: "empty", message: "" } };
      return;
    }
    state.value = { status: "error", data: state.value.data, error: result.error };
  };
  const load = async (opts = {}) => {
    const scope = scopeKey.value;
    const account = accountId.value;
    const key = snapshotKey.value;
    if (!opts.force && key) {
      const snapshot = readPortalSnapshot(key);
      if (snapshot) {
        applySnapshot({ syncedAt: snapshot.syncedAt, data: snapshot.data }, snapshot.stale);
        if (!snapshot.stale) return;
      }
    }
    await revalidate(scope, account, key);
  };
  const retry = () => load({ force: true });
  return {
    accountId,
    scopeKey,
    state,
    cards,
    taskCards,
    serviceCards,
    isLoading,
    isEmpty,
    isReady,
    isError,
    errorKind,
    errorKey,
    lastSuccessfulSyncAt,
    fromCache,
    snapshotStale,
    syncStatus,
    load,
    retry
  };
};
const _hoisted_1 = { class: "min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-pt" };
const _hoisted_2 = ["aria-label", "disabled"];
const _hoisted_3 = { class: "px-4 pt-3 space-y-3" };
const _hoisted_4 = { class: "mt-1.5 text-xs text-on-surface-variant" };
const _hoisted_5 = { class: "tch-pt-search" };
const _hoisted_6 = ["placeholder", "aria-label"];
const _hoisted_7 = ["aria-label"];
const _hoisted_8 = {
  key: 1,
  class: "grid grid-cols-4 gap-2.5"
};
const _hoisted_9 = {
  key: 0,
  class: "tch-pt-badge",
  "aria-hidden": "true"
};
const _hoisted_10 = {
  class: "material-symbols-outlined text-[16px]",
  "aria-hidden": "true"
};
const _hoisted_11 = { class: "tch-label-caption text-on-surface-variant mt-0.5 text-center leading-tight" };
const _hoisted_12 = {
  key: 2,
  class: "flex flex-col gap-2"
};
const _hoisted_13 = { class: "flex items-center gap-1.5 px-1 pt-1" };
const _hoisted_14 = { class: "text-sm font-bold text-on-surface tracking-tight" };
const _hoisted_15 = { class: "tch-label-caption text-on-surface-variant bg-surface-muted px-2 py-0.5 rounded-full" };
const _hoisted_16 = { class: "grid grid-cols-4 gap-2.5" };
const _hoisted_17 = {
  key: 0,
  class: "tch-pt-badge",
  "aria-hidden": "true"
};
const _hoisted_18 = {
  class: "material-symbols-outlined text-[24px]",
  "aria-hidden": "true"
};
const _hoisted_19 = ["title"];
const _hoisted_20 = {
  key: 3,
  class: "tch-label-caption text-on-surface-variant px-1"
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherPortalView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const auth = useAuthStore();
    const {
      taskCards,
      serviceCards,
      isLoading,
      isReady,
      isError,
      errorKind,
      errorKey,
      lastSuccessfulSyncAt,
      syncStatus,
      load,
      retry
    } = useTeacherPortalCards({
      accountId: () => resolveTeacherAccountId(auth.studentId)
    });
    const hasCards = computed(() => taskCards.value.length + serviceCards.value.length > 0);
    const hasTaskCards = computed(() => taskCards.value.length > 0);
    const hasServiceCards = computed(() => serviceCards.value.length > 0);
    const keyword = ref("");
    const normalizedKeyword = computed(() => keyword.value.trim().toLowerCase());
    const matchesKeyword = (card) => {
      if (!normalizedKeyword.value) return true;
      const haystack = `${card.cardName} ${card.cardId}`.toLowerCase();
      return haystack.includes(normalizedKeyword.value);
    };
    const filteredTaskCards = computed(
      () => taskCards.value.filter(matchesKeyword)
    );
    const filteredServiceCards = computed(
      () => serviceCards.value.filter(matchesKeyword)
    );
    const noSearchResult = computed(
      () => normalizedKeyword.value !== "" && filteredTaskCards.value.length === 0 && filteredServiceCards.value.length === 0
    );
    const clearKeyword = () => {
      keyword.value = "";
    };
    const taskFallbackKey = (kind) => `teacher.portal.task.${kind}`;
    const taskName = (card) => card.cardName || (card.taskKind ? t(taskFallbackKey(card.taskKind)) : card.cardId || "—");
    const TASK_ICONS = {
      todo: "pending_actions",
      done: "task_alt",
      mine: "schedule_send",
      copy: "mark_email_unread"
    };
    const taskIcon = (card) => card.taskKind && TASK_ICONS[card.taskKind] || "inbox";
    const taskNumber = (card) => card.markNumber === null ? "—" : String(card.markNumber);
    const SERVICE_ICON_MAP = [
      { test: /ALLSERVICEBUS|ALLSERVICE/i, icon: "apps" },
      { test: /HOTAPP|RECOMMEND/i, icon: "local_fire_department" },
      { test: /FAVORITE|FAVOURITE/i, icon: "bookmark" },
      { test: /MYAPP/i, icon: "widgets" },
      { test: /NOTICE|NOTIFY|NEWS/i, icon: "campaign" },
      { test: /TASK|FLOW|APPROVE/i, icon: "assignment" },
      { test: /OA|OFFICE/i, icon: "corporate_fare" },
      { test: /MAIL|MSG/i, icon: "mail" },
      { test: /CALENDAR|SCHEDULE/i, icon: "event" },
      { test: /SEARCH|QUERY/i, icon: "search" }
    ];
    const SERVICE_TILE_COLORS = [
      "bg-primary",
      "bg-course-teal",
      "bg-course-lake-blue",
      "bg-course-wisteria",
      "bg-course-amber"
    ];
    const serviceIcon = (card) => {
      const hit = SERVICE_ICON_MAP.find((item) => item.test.test(card.cardId));
      return hit?.icon ?? "widgets";
    };
    const serviceTileColor = (index) => SERVICE_TILE_COLORS[index % SERVICE_TILE_COLORS.length];
    const serviceName = (card) => card.cardName || card.cardId || "—";
    const portalErrorDescKey = computed(() => {
      const kind = errorKind.value;
      return kind === "expired" || kind === "unauthorized" ? "teacher.portal.error.sessionHint" : errorKey.value;
    });
    const reload = async () => {
      await retry();
    };
    onMounted(() => {
      void load();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("teacher.portal.title"),
          icon: "dashboard",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              type: "button",
              class: "w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest",
              "aria-label": unref(t)("teacher.portal.action.refresh"),
              disabled: unref(isLoading),
              onClick: reload
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { "animate-spin": unref(isLoading) }])
              }, "refresh", 2)
            ], 8, _hoisted_2)
          ]),
          _: 1
        }, 8, ["title"]),
        createBaseVNode("main", _hoisted_3, [
          unref(isLoading) && !hasCards.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 0,
            type: "loading",
            message: unref(t)("teacher.portal.loading")
          }, null, 8, ["message"])) : unref(isError) && !hasCards.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 1,
            type: "error",
            message: unref(t)("teacher.portal.error.title")
          }, {
            default: withCtx(() => [
              createBaseVNode("p", _hoisted_4, toDisplayString(unref(t)(portalErrorDescKey.value)), 1),
              createBaseVNode("button", {
                type: "button",
                class: "mt-3 text-primary font-semibold",
                onClick: reload
              }, toDisplayString(unref(t)("teacher.portal.action.retry")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : !hasCards.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            message: unref(t)("teacher.portal.empty")
          }, null, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            createBaseVNode("section", _hoisted_5, [
              _cache[3] || (_cache[3] = createBaseVNode("span", {
                class: "material-symbols-outlined text-primary text-[20px] shrink-0",
                "aria-hidden": "true"
              }, "search", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => keyword.value = $event),
                type: "search",
                class: "tch-pt-search-input",
                placeholder: unref(t)("teacher.portal.search.placeholder"),
                "aria-label": unref(t)("teacher.portal.search.placeholder")
              }, null, 8, _hoisted_6), [
                [vModelText, keyword.value]
              ]),
              keyword.value ? (openBlock(), createElementBlock("button", {
                key: 0,
                type: "button",
                class: "w-6 h-6 rounded-full flex items-center justify-center text-outline shrink-0",
                "aria-label": unref(t)("teacher.portal.search.clear"),
                onClick: clearKeyword
              }, [..._cache[2] || (_cache[2] = [
                createBaseVNode("span", {
                  class: "material-symbols-outlined text-[16px]",
                  "aria-hidden": "true"
                }, "close", -1)
              ])], 8, _hoisted_7)) : createCommentVNode("", true)
            ]),
            noSearchResult.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              message: unref(t)("teacher.portal.search.empty")
            }, null, 8, ["message"])) : createCommentVNode("", true),
            filteredTaskCards.value.length > 0 ? (openBlock(), createElementBlock("section", _hoisted_8, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(filteredTaskCards.value, (card) => {
                return openBlock(), createElementBlock("div", {
                  key: card.key,
                  class: "tch-pt-task"
                }, [
                  unref(portalBadgeVisible)(card) ? (openBlock(), createElementBlock("div", _hoisted_9, toDisplayString(unref(portalBadgeText)(card)), 1)) : createCommentVNode("", true),
                  createBaseVNode("span", {
                    class: normalizeClass(["w-7 h-7 rounded-full flex items-center justify-center mb-1", unref(portalBadgeVisible)(card) ? "bg-surface-highlight text-primary" : "bg-surface-muted text-on-surface-variant"])
                  }, [
                    createBaseVNode("span", _hoisted_10, toDisplayString(taskIcon(card)), 1)
                  ], 2),
                  createBaseVNode("span", {
                    class: normalizeClass(["tch-pt-task-num", unref(portalBadgeVisible)(card) ? "text-course-amber" : "text-on-surface"])
                  }, toDisplayString(taskNumber(card)), 3),
                  createBaseVNode("span", _hoisted_11, toDisplayString(taskName(card)), 1)
                ]);
              }), 128))
            ])) : createCommentVNode("", true),
            filteredServiceCards.value.length > 0 ? (openBlock(), createElementBlock("section", _hoisted_12, [
              createBaseVNode("div", _hoisted_13, [
                _cache[4] || (_cache[4] = createBaseVNode("span", { class: "w-1.5 h-3.5 rounded-full bg-primary" }, null, -1)),
                createBaseVNode("h2", _hoisted_14, toDisplayString(unref(t)("teacher.portal.services.title")), 1),
                createBaseVNode("span", _hoisted_15, toDisplayString(unref(tf)("teacher.portal.services.count", { n: filteredServiceCards.value.length })), 1)
              ]),
              createBaseVNode("div", _hoisted_16, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(filteredServiceCards.value, (card, index) => {
                  return openBlock(), createElementBlock("div", {
                    key: card.key,
                    class: "tch-pt-service"
                  }, [
                    unref(portalBadgeVisible)(card) ? (openBlock(), createElementBlock("div", _hoisted_17, toDisplayString(unref(portalBadgeText)(card)), 1)) : createCommentVNode("", true),
                    createBaseVNode("span", {
                      class: normalizeClass(["w-12 h-12 rounded-2xl flex items-center justify-center text-on-primary mb-2 tch-pt-service-tile", serviceTileColor(index)])
                    }, [
                      createBaseVNode("span", _hoisted_18, toDisplayString(serviceIcon(card)), 1)
                    ], 2),
                    createBaseVNode("span", {
                      class: "tch-label-caption text-on-surface text-center font-semibold leading-tight line-clamp-1",
                      title: serviceName(card)
                    }, toDisplayString(serviceName(card)), 9, _hoisted_19)
                  ]);
                }), 128))
              ])
            ])) : createCommentVNode("", true),
            unref(isReady) && hasTaskCards.value && !hasServiceCards.value && !normalizedKeyword.value ? (openBlock(), createElementBlock("p", _hoisted_20, toDisplayString(unref(t)("teacher.portal.services.empty")), 1)) : createCommentVNode("", true)
          ], 64)),
          createVNode(_sfc_main$2, {
            status: unref(syncStatus),
            "last-successful-sync-at": unref(lastSuccessfulSyncAt),
            "error-key": unref(isError) ? unref(errorKey) : ""
          }, null, 8, ["status", "last-successful-sync-at", "error-key"])
        ])
      ]);
    };
  }
});
const TeacherPortalView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-139a9561"]]);
export {
  TeacherPortalView as default
};
