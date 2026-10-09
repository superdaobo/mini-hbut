import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-DhSUOFfG.js";
import { u as useI18n, _ as _export_sfc } from "./app-demo-DztvWo2z.js";
import { T as TEmptyState } from "./TEmptyState-B5LRf-mZ.js";
import { f as fetchTeacherProfile } from "./teacherApi-BZ56ekcn.js";
import { h as computed, r as ref, y as defineComponent, o as onMounted, a as openBlock, c as createElementBlock, p as createVNode, k as withCtx, b as createBaseVNode, u as unref, n as normalizeClass, j as createBlock, t as toDisplayString, F as Fragment, f as renderList, g as createTextVNode, d as createCommentVNode } from "./vue-core-D-44rohN.js";
import "./runtime-bridge-gQMtwwk6.js";
import "./more-modules-yxgAg-Rh.js";
import "./debug-tools-CyNtADDO.js";
import "./capture-YhmA9GNe.js";
import "./school_inbox_content-CxpfsU1v.js";
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
const useTeacherProfile = () => {
  const state = ref({
    status: "idle",
    data: null,
    error: null
  });
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
  const reload = async () => {
    const previous = state.value.data;
    state.value = { status: "loading", data: previous, error: null };
    state.value = await fetchTeacherProfile();
  };
  return {
    state,
    profile,
    status,
    loading,
    isEmpty,
    hasError,
    errorMessageKey,
    reload
  };
};
const _hoisted_1 = { class: "teacher-profile-view" };
const _hoisted_2 = ["aria-label", "disabled"];
const _hoisted_3 = { class: "view-content" };
const _hoisted_4 = {
  key: 3,
  class: "panel-stack"
};
const _hoisted_5 = { class: "profile-card" };
const _hoisted_6 = { class: "profile-content" };
const _hoisted_7 = { class: "avatar-ring" };
const _hoisted_8 = { class: "avatar-circle" };
const _hoisted_9 = { class: "profile-name" };
const _hoisted_10 = { class: "profile-id" };
const _hoisted_11 = { class: "profile-badge" };
const _hoisted_12 = { class: "info-card" };
const _hoisted_13 = { class: "card-section-title" };
const _hoisted_14 = { class: "info-grid" };
const _hoisted_15 = { class: "field-label" };
const _hoisted_16 = { class: "material-symbols-outlined field-icon" };
const _hoisted_17 = { class: "field-value" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherProfileView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const { profile, loading, isEmpty, hasError, errorMessageKey, reload } = useTeacherProfile();
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
        {
          key: "departmentId",
          labelKey: "teacher.profile.field.departmentId",
          icon: "apartment",
          value: data.departmentId
        }
      ].map((row) => ({ ...row, value: String(row.value || "").trim() || "—" }));
    });
    const showContent = computed(() => Boolean(profile.value));
    onMounted(() => {
      void reload();
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
              class: "header-action-btn",
              type: "button",
              "aria-label": unref(t)("teacher.profile.refresh"),
              disabled: unref(loading),
              onClick: _cache[0] || (_cache[0] = //@ts-ignore
              (...args) => unref(reload) && unref(reload)(...args))
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { spinning: unref(loading) }])
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
                class: "btn-retry",
                type: "button",
                onClick: _cache[2] || (_cache[2] = //@ts-ignore
                (...args) => unref(reload) && unref(reload)(...args))
              }, toDisplayString(unref(t)("teacher.profile.retry")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : unref(isEmpty) && !unref(profile) ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            type: "empty",
            message: unref(t)("teacher.profile.empty")
          }, null, 8, ["message"])) : showContent.value ? (openBlock(), createElementBlock("div", _hoisted_4, [
            createBaseVNode("section", _hoisted_5, [
              _cache[3] || (_cache[3] = createBaseVNode("div", { class: "profile-gradient-bg" }, null, -1)),
              createBaseVNode("div", _hoisted_6, [
                createBaseVNode("div", _hoisted_7, [
                  createBaseVNode("div", _hoisted_8, toDisplayString(avatarText.value), 1)
                ]),
                createBaseVNode("h2", _hoisted_9, toDisplayString(unref(profile)?.name || "—"), 1),
                createBaseVNode("p", _hoisted_10, toDisplayString(unref(profile)?.accountId || "—"), 1),
                createBaseVNode("span", _hoisted_11, toDisplayString(roleText.value || "—"), 1)
              ])
            ]),
            createBaseVNode("section", _hoisted_12, [
              createBaseVNode("h3", _hoisted_13, toDisplayString(unref(t)("teacher.profile.section.details")), 1),
              createBaseVNode("div", _hoisted_14, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(fields.value, (row) => {
                  return openBlock(), createElementBlock("article", {
                    key: row.key,
                    class: "info-field"
                  }, [
                    createBaseVNode("span", _hoisted_15, [
                      createBaseVNode("span", _hoisted_16, toDisplayString(row.icon), 1),
                      createTextVNode(" " + toDisplayString(unref(t)(row.labelKey)), 1)
                    ]),
                    createBaseVNode("span", _hoisted_17, toDisplayString(row.value), 1)
                  ]);
                }), 128))
              ])
            ])
          ])) : createCommentVNode("", true)
        ])
      ]);
    };
  }
});
const TeacherProfileView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-6c2fa404"]]);
export {
  TeacherProfileView as default
};
