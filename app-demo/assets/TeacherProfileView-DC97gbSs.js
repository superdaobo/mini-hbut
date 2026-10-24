import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-DPr8J7w0.js";
import { T as TCard, _ as _sfc_main$2 } from "./TeacherSyncBar.vue_vue_type_script_setup_true_lang-Cnj2iqbI.js";
import { T as TEmptyState } from "./TEmptyState-BN1DyviL.js";
import { c0 as clearTeacherSnapshotScope, c1 as fetchTeacherProfile, ae as readTeacherSnapshot, c2 as normalizeScopeAccountId, ai as buildTeacherSnapshotKey, ag as writeTeacherSnapshot, u as useI18n, c as useAuthStore, c3 as resolveTeacherAccountId } from "./app-demo-D7XNtlJ4.js";
import { r as resolveTeacherSyncStatus, i as isTeacherOffline } from "./teacher_sync_status-But3HSMJ.js";
import { h as computed, r as ref, i as defineComponent, o as onMounted, a as openBlock, c as createElementBlock, k as createVNode, l as withCtx, b as createBaseVNode, u as unref, n as normalizeClass, j as createBlock, t as toDisplayString, F as Fragment, f as renderList, g as createTextVNode, d as createCommentVNode } from "./vue-core-CVT-P0lT.js";
import "./runtime-bridge-BimU7Kjk.js";
import "./more-modules-DshM5kk8.js";
import "./debug-tools-Qn_xy0xQ.js";
import "./capture-C0vEZJ2q.js";
const ERROR_MESSAGE_KEYS = {
  empty: "teacher.error.empty",
  unauthorized: "teacher.error.unauthorized",
  expired: "teacher.error.expired",
  errorHtml: "teacher.error.errorHtml",
  timeout: "teacher.error.timeout",
  notImplemented: "teacher.error.notImplemented",
  unknown: "teacher.error.unknown"
};
const teacherProfileErrorMessageKey = (kind) => kind ? ERROR_MESSAGE_KEYS[kind] : "teacher.error.unknown";
const TEACHER_ROLE_LABEL_KEY = "teacher.profile.role.teacher";
const TEACHER_ROLE_ID = "js";
const useTeacherProfile = (options = {}) => {
  const state = ref({
    status: "idle",
    data: null,
    error: null
  });
  const lastSuccessfulSyncAt = ref("");
  const fromCache = ref(false);
  const snapshotStale = ref(false);
  const accountId = computed(() => normalizeScopeAccountId(options.accountId?.() ?? ""));
  const snapshotKey = computed(
    () => buildTeacherSnapshotKey({
      resource: "profile",
      accountId: accountId.value,
      semester: options.semester ? options.semester() : ""
    })
  );
  const profile = computed(() => state.value.data);
  const status = computed(() => state.value.status);
  const loading = computed(
    () => state.value.status === "idle" || state.value.status === "loading"
  );
  const isEmpty = computed(() => state.value.status === "empty");
  const hasError = computed(() => state.value.status === "error");
  const errorMessageKey = computed(
    () => teacherProfileErrorMessageKey(state.value.error?.kind ?? null)
  );
  const syncStatus = computed(
    () => resolveTeacherSyncStatus({
      phase: state.value.status,
      hasData: state.value.data !== null,
      fromCache: fromCache.value,
      stale: snapshotStale.value,
      hasSyncTime: Boolean(lastSuccessfulSyncAt.value),
      offline: isTeacherOffline(),
      errorKind: state.value.error?.kind ?? null
    })
  );
  const revalidate = async () => {
    const key = snapshotKey.value;
    const account = accountId.value;
    const previous = state.value.data;
    state.value = { status: "loading", data: previous, error: null };
    const result = await fetchTeacherProfile({ scope: account });
    if (snapshotKey.value !== key || accountId.value !== account) return;
    if (result.status === "ready" && result.data) {
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      lastSuccessfulSyncAt.value = syncedAt;
      fromCache.value = false;
      snapshotStale.value = false;
      if (key) {
        writeTeacherSnapshot({
          scopeKey: key,
          accountId: account,
          semester: options.semester ? options.semester() : "",
          resource: "profile",
          queryKey: "",
          data: result.data,
          lastSuccessfulSyncAt: syncedAt
        });
      }
      state.value = result;
      return;
    }
    if (result.status === "empty") {
      state.value = result;
      return;
    }
    state.value = { status: "error", data: previous, error: result.error };
  };
  const load = async () => {
    const key = snapshotKey.value;
    if (key) {
      const snapshot = readTeacherSnapshot(key);
      if (snapshot) {
        lastSuccessfulSyncAt.value = snapshot.meta.lastSuccessfulSyncAt;
        fromCache.value = true;
        snapshotStale.value = snapshot.meta.stale;
        state.value = { status: "ready", data: snapshot.data, error: null };
        if (!snapshot.meta.stale) return;
      }
    }
    await revalidate();
  };
  const reload = async () => {
    const previous = state.value.data;
    state.value = { status: "loading", data: previous, error: null };
    state.value = await fetchTeacherProfile({ scope: accountId.value });
  };
  const clearCache = () => {
    clearTeacherSnapshotScope(accountId.value);
  };
  return {
    state,
    profile,
    status,
    loading,
    isEmpty,
    hasError,
    errorMessageKey,
    lastSuccessfulSyncAt,
    fromCache,
    snapshotStale,
    syncStatus,
    load,
    reload,
    clearCache
  };
};
const _hoisted_1 = { class: "min-h-screen bg-surface text-on-surface max-w-[448px] mx-auto pb-24" };
const _hoisted_2 = ["aria-label", "disabled"];
const _hoisted_3 = { class: "p-4 space-y-4" };
const _hoisted_4 = { class: "flex items-center gap-4" };
const _hoisted_5 = { class: "w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-bold shrink-0" };
const _hoisted_6 = { class: "min-w-0 flex-1" };
const _hoisted_7 = { class: "font-bold text-lg text-on-surface truncate" };
const _hoisted_8 = { class: "text-sm text-on-surface-variant mt-1" };
const _hoisted_9 = { class: "inline-flex mt-2 px-2 py-1 bg-surface-container-high text-xs text-on-surface rounded-full" };
const _hoisted_10 = { class: "font-bold text-on-surface mb-3" };
const _hoisted_11 = { class: "divide-y divide-outline-variant/30" };
const _hoisted_12 = { class: "text-sm text-on-surface-variant flex items-center gap-2" };
const _hoisted_13 = {
  class: "material-symbols-outlined text-base text-on-surface-variant",
  "aria-hidden": "true"
};
const _hoisted_14 = { class: "text-sm font-semibold text-on-surface text-right min-w-0 break-words" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherProfileView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const auth = useAuthStore();
    const {
      profile,
      loading,
      isEmpty,
      hasError,
      errorMessageKey,
      lastSuccessfulSyncAt,
      syncStatus,
      load,
      reload
    } = useTeacherProfile({ accountId: () => resolveTeacherAccountId(auth.studentId) });
    const avatarText = computed(() => {
      const source = String(profile.value?.name || profile.value?.accountId || "").trim();
      return source ? source.charAt(0) : "?";
    });
    const roleText = computed(() => {
      const roleId = String(profile.value?.roleId || "").trim();
      if (!roleId) return "";
      return roleId === TEACHER_ROLE_ID ? t(TEACHER_ROLE_LABEL_KEY) : roleId;
    });
    const fields = computed(() => {
      const data = profile.value;
      if (!data) return [];
      return [
        { key: "accountId", labelKey: "teacher.profile.field.accountId", icon: "badge", value: data.accountId },
        { key: "name", labelKey: "teacher.profile.field.name", icon: "person", value: data.name },
        { key: "role", labelKey: "teacher.profile.field.role", icon: "school", value: roleText.value },
        ...data.departmentName ? [{
          key: "departmentName",
          labelKey: "teacher.profile.field.departmentName",
          icon: "apartment",
          value: data.departmentName
        }] : []
      ].map((row) => ({ ...row, value: String(row.value || "").trim() || "—" }));
    });
    const showContent = computed(() => Boolean(profile.value));
    onMounted(() => {
      void load();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("teacher.profile.title"),
          icon: "badge",
          onBack: _cache[1] || (_cache[1] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              type: "button",
              class: "w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest",
              "aria-label": unref(t)("teacher.profile.refresh"),
              disabled: unref(loading),
              onClick: _cache[0] || (_cache[0] = //@ts-ignore
              (...args) => unref(reload) && unref(reload)(...args))
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { "animate-spin": unref(loading) }])
              }, "refresh", 2)
            ], 8, _hoisted_2)
          ]),
          _: 1
        }, 8, ["title"]),
        createBaseVNode("main", _hoisted_3, [
          unref(loading) && !unref(profile) ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 0,
            type: "loading",
            message: unref(t)("teacher.profile.loading")
          }, null, 8, ["message"])) : unref(hasError) && !unref(profile) ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 1,
            type: "error",
            message: unref(t)(unref(errorMessageKey))
          }, {
            default: withCtx(() => [
              createBaseVNode("button", {
                type: "button",
                class: "mt-3 text-primary font-semibold",
                onClick: _cache[2] || (_cache[2] = //@ts-ignore
                (...args) => unref(reload) && unref(reload)(...args))
              }, toDisplayString(unref(t)("teacher.profile.retry")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : unref(isEmpty) && !unref(profile) ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            message: unref(t)("teacher.profile.empty")
          }, null, 8, ["message"])) : showContent.value ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            createVNode(unref(TCard), null, {
              default: withCtx(() => [
                createBaseVNode("div", _hoisted_4, [
                  createBaseVNode("div", _hoisted_5, toDisplayString(avatarText.value), 1),
                  createBaseVNode("div", _hoisted_6, [
                    createBaseVNode("h2", _hoisted_7, toDisplayString(unref(profile)?.name || "—"), 1),
                    createBaseVNode("p", _hoisted_8, toDisplayString(unref(t)("teacher.profile.field.accountId")) + "：" + toDisplayString(unref(profile)?.accountId || "—"), 1),
                    createBaseVNode("span", _hoisted_9, toDisplayString(roleText.value || "—"), 1)
                  ])
                ])
              ]),
              _: 1
            }),
            createVNode(unref(TCard), null, {
              default: withCtx(() => [
                createBaseVNode("h3", _hoisted_10, toDisplayString(unref(t)("teacher.profile.section.details")), 1),
                createBaseVNode("dl", _hoisted_11, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(fields.value, (row) => {
                    return openBlock(), createElementBlock("div", {
                      key: row.key,
                      class: "flex gap-4 justify-between py-3 first:pt-0 last:pb-0"
                    }, [
                      createBaseVNode("dt", _hoisted_12, [
                        createBaseVNode("span", _hoisted_13, toDisplayString(row.icon), 1),
                        createTextVNode(" " + toDisplayString(unref(t)(row.labelKey)), 1)
                      ]),
                      createBaseVNode("dd", _hoisted_14, toDisplayString(row.value), 1)
                    ]);
                  }), 128))
                ])
              ]),
              _: 1
            })
          ], 64)) : createCommentVNode("", true),
          createVNode(_sfc_main$2, {
            status: unref(syncStatus),
            "last-successful-sync-at": unref(lastSuccessfulSyncAt),
            "error-key": unref(hasError) ? unref(errorMessageKey) : ""
          }, null, 8, ["status", "last-successful-sync-at", "error-key"])
        ])
      ]);
    };
  }
});
export {
  _sfc_main as default
};
