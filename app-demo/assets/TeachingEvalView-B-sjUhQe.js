import { o as onMounted, a as openBlock, c as createElementBlock, p as createVNode, u as unref, b as createBaseVNode, t as toDisplayString, d as createCommentVNode, F as Fragment, j as createBlock, f as renderList, K as withDirectives, L as vModelText, k as withCtx, Q as vModelCheckbox, g as createTextVNode, r as ref, h as computed } from "./vue-core-Dzs4fLAU.js";
import { a as isTauriRuntime, d as invokeNative } from "./runtime-bridge-Dt57BD2i.js";
import { _ as _export_sfc, m as useI18n, aN as TModal, j as showToast } from "./app-demo-CUOWTnz-.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import { T as TEmptyState } from "./TEmptyState-BwJ_g5G7.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "te-page" };
const _hoisted_2 = { class: "te-body" };
const _hoisted_3 = { class: "te-toolbar" };
const _hoisted_4 = ["disabled"];
const _hoisted_5 = {
  key: 0,
  class: "te-error"
};
const _hoisted_6 = {
  key: 1,
  class: "te-warn"
};
const _hoisted_7 = { class: "te-h" };
const _hoisted_8 = ["onClick"];
const _hoisted_9 = { class: "te-title" };
const _hoisted_10 = { class: "te-meta" };
const _hoisted_11 = { class: "te-h" };
const _hoisted_12 = ["onClick"];
const _hoisted_13 = { class: "te-title" };
const _hoisted_14 = { class: "te-meta" };
const _hoisted_15 = {
  key: 3,
  class: "card-surface"
};
const _hoisted_16 = { class: "te-title" };
const _hoisted_17 = { class: "te-meta" };
const _hoisted_18 = {
  key: 0,
  class: "te-form"
};
const _hoisted_19 = { class: "te-q-title" };
const _hoisted_20 = ["onUpdate:modelValue", "max"];
const _hoisted_21 = ["onUpdate:modelValue"];
const _hoisted_22 = {
  key: 2,
  class: "te-meta"
};
const _hoisted_23 = { class: "te-actions" };
const _hoisted_24 = ["disabled"];
const _hoisted_25 = { class: "te-check" };
const _hoisted_26 = { class: "te-actions" };
const SKIP_KEY = "hbu_teaching_eval_skip_confirm";
const COMMENT_TEMPLATE = "认真负责，收获很大。";
const _sfc_main = {
  __name: "TeachingEvalView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const loading = ref(false);
    const submitting = ref(false);
    const error = ref("");
    const items = ref([]);
    const selected = ref(null);
    const form = ref(null);
    const showConfirm = ref(false);
    const skipConfirm = ref(false);
    const protocolReady = ref(true);
    const pending = computed(() => items.value.filter((i) => i.status !== "done"));
    const done = computed(() => items.value.filter((i) => i.status === "done"));
    const loadSkip = () => {
      try {
        skipConfirm.value = localStorage.getItem(SKIP_KEY) === "1";
      } catch {
        skipConfirm.value = false;
      }
    };
    const saveSkip = (value) => {
      try {
        if (value) localStorage.setItem(SKIP_KEY, "1");
        else localStorage.removeItem(SKIP_KEY);
      } catch {
      }
      skipConfirm.value = !!value;
    };
    const fetchList = async () => {
      loading.value = true;
      error.value = "";
      try {
        if (!isTauriRuntime()) throw new Error(t("eval.error.clientOnly"));
        const res = await invokeNative("teaching_eval_list", {});
        protocolReady.value = res?.protocol_ready !== false;
        items.value = Array.isArray(res?.items) ? res.items : [];
        if (res?.message && !items.value.length) {
          error.value = String(res.message);
        }
      } catch (e) {
        error.value = String(e?.message || e || t("eval.error.loadFailed"));
        protocolReady.value = false;
      } finally {
        loading.value = false;
      }
    };
    const openItem = async (item) => {
      selected.value = item;
      form.value = null;
      try {
        if (!isTauriRuntime()) return;
        const res = await invokeNative("teaching_eval_form", { eval_id: item.id });
        form.value = res || null;
      } catch (e) {
        showToast(String(e?.message || e || t("eval.error.formFailed")));
      }
    };
    const fillFullScore = () => {
      if (!form.value?.questions) return;
      form.value = {
        ...form.value,
        questions: form.value.questions.map((q) => {
          if (q.kind === "score" || q.kind === "rate") {
            return { ...q, value: q.max_score ?? 10 };
          }
          if (q.kind === "text" && (!q.value || !String(q.value).trim())) {
            return { ...q, value: COMMENT_TEMPLATE };
          }
          return q;
        })
      };
      showToast(t("eval.toast.fullScoreFilled"));
    };
    const doSubmit = async () => {
      if (!selected.value) return;
      submitting.value = true;
      try {
        fillFullScore();
        const res = await invokeNative("teaching_eval_submit", {
          eval_id: selected.value.id,
          answers: form.value?.questions || [],
          quick_full_score: true
        });
        if (res?.success === false) throw new Error(res?.message || t("eval.error.submitFailed"));
        showToast(t("eval.toast.submitted"));
        selected.value = null;
        form.value = null;
        await fetchList();
      } catch (e) {
        showToast(String(e?.message || e || t("eval.error.submitFailed")));
      } finally {
        submitting.value = false;
        showConfirm.value = false;
      }
    };
    const onQuickSubmit = () => {
      if (skipConfirm.value) {
        void doSubmit();
        return;
      }
      showConfirm.value = true;
    };
    const confirmSubmit = (remember) => {
      if (remember) saveSkip(true);
      void doSubmit();
    };
    const resetSkipPreference = () => {
      saveSkip(false);
      showToast(t("eval.toast.confirmRestored"));
    };
    onMounted(() => {
      loadSkip();
      void fetchList();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("eval.title"),
          subtitle: selected.value ? selected.value.title : unref(t)("eval.subtitle.pending"),
          onBack: _cache[0] || (_cache[0] = ($event) => selected.value ? (selected.value = null, form.value = null) : emit("back"))
        }, null, 8, ["title", "subtitle"]),
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            createBaseVNode("button", {
              type: "button",
              class: "te-btn",
              disabled: loading.value,
              onClick: fetchList
            }, toDisplayString(loading.value ? unref(t)("eval.action.refreshing") : unref(t)("common.refresh")), 9, _hoisted_4),
            skipConfirm.value ? (openBlock(), createElementBlock("button", {
              key: 0,
              type: "button",
              class: "te-btn ghost",
              onClick: resetSkipPreference
            }, toDisplayString(unref(t)("eval.action.resetSkip")), 1)) : createCommentVNode("", true)
          ]),
          error.value ? (openBlock(), createElementBlock("p", _hoisted_5, toDisplayString(error.value), 1)) : createCommentVNode("", true),
          !protocolReady.value ? (openBlock(), createElementBlock("p", _hoisted_6, toDisplayString(unref(t)("eval.warn.protocol")), 1)) : createCommentVNode("", true),
          !selected.value ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
            createBaseVNode("h3", _hoisted_7, toDisplayString(_ctx.tf("eval.list.pending", { n: pending.value.length })), 1),
            !loading.value && !pending.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "empty",
              message: unref(t)("eval.list.emptyPending")
            }, null, 8, ["message"])) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(pending.value, (item) => {
              return openBlock(), createElementBlock("button", {
                key: item.id,
                type: "button",
                class: "card-surface te-row",
                onClick: ($event) => openItem(item)
              }, [
                createBaseVNode("div", _hoisted_9, toDisplayString(item.title || item.course_name || unref(t)("eval.list.taskFallback")), 1),
                createBaseVNode("div", _hoisted_10, toDisplayString(item.teacher || item.teacher_name || "") + " · " + toDisplayString(unref(t)("eval.list.pendingMeta")), 1)
              ], 8, _hoisted_8);
            }), 128)),
            createBaseVNode("h3", _hoisted_11, toDisplayString(_ctx.tf("eval.list.done", { n: done.value.length })), 1),
            (openBlock(true), createElementBlock(Fragment, null, renderList(done.value, (item) => {
              return openBlock(), createElementBlock("button", {
                key: item.id,
                type: "button",
                class: "card-surface te-row muted",
                onClick: ($event) => openItem(item)
              }, [
                createBaseVNode("div", _hoisted_13, toDisplayString(item.title || item.course_name || unref(t)("eval.list.taskFallback")), 1),
                createBaseVNode("div", _hoisted_14, toDisplayString(unref(t)("eval.list.doneMeta")), 1)
              ], 8, _hoisted_12);
            }), 128))
          ], 64)) : (openBlock(), createElementBlock("section", _hoisted_15, [
            createBaseVNode("h3", _hoisted_16, toDisplayString(selected.value.title || selected.value.course_name), 1),
            createBaseVNode("p", _hoisted_17, toDisplayString(selected.value.teacher || selected.value.teacher_name), 1),
            form.value?.questions?.length ? (openBlock(), createElementBlock("div", _hoisted_18, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(form.value.questions, (q, idx) => {
                return openBlock(), createElementBlock("div", {
                  key: q.id || idx,
                  class: "te-q"
                }, [
                  createBaseVNode("div", _hoisted_19, toDisplayString(idx + 1) + ". " + toDisplayString(q.title || q.label), 1),
                  q.kind === "score" || q.kind === "rate" ? withDirectives((openBlock(), createElementBlock("input", {
                    key: 0,
                    "onUpdate:modelValue": ($event) => q.value = $event,
                    type: "number",
                    min: 0,
                    max: q.max_score || 10,
                    class: "te-input"
                  }, null, 8, _hoisted_20)), [
                    [
                      vModelText,
                      q.value,
                      void 0,
                      { number: true }
                    ]
                  ]) : q.kind === "text" ? withDirectives((openBlock(), createElementBlock("textarea", {
                    key: 1,
                    "onUpdate:modelValue": ($event) => q.value = $event,
                    class: "te-input te-textarea",
                    rows: "3"
                  }, null, 8, _hoisted_21)), [
                    [vModelText, q.value]
                  ]) : (openBlock(), createElementBlock("p", _hoisted_22, toDisplayString(_ctx.tf("eval.form.questionType", { kind: q.kind || unref(t)("eval.form.kind.unknown") })), 1))
                ]);
              }), 128))
            ])) : (openBlock(), createBlock(unref(TEmptyState), {
              key: 1,
              type: "empty",
              message: unref(t)("eval.form.empty")
            }, null, 8, ["message"])),
            createBaseVNode("div", _hoisted_23, [
              createBaseVNode("button", {
                type: "button",
                class: "te-btn",
                onClick: fillFullScore
              }, toDisplayString(unref(t)("eval.action.fullScore")), 1),
              createBaseVNode("button", {
                type: "button",
                class: "te-btn primary",
                disabled: submitting.value,
                onClick: onQuickSubmit
              }, toDisplayString(submitting.value ? unref(t)("eval.action.submitting") : unref(t)("eval.action.quickSubmit")), 9, _hoisted_24)
            ])
          ]))
        ]),
        createVNode(unref(TModal), {
          visible: showConfirm.value,
          title: unref(t)("eval.confirm.title"),
          onClose: _cache[4] || (_cache[4] = ($event) => showConfirm.value = false)
        }, {
          default: withCtx(() => [
            createBaseVNode("p", null, toDisplayString(unref(t)("eval.confirm.text")), 1),
            createBaseVNode("label", _hoisted_25, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => skipConfirm.value = $event),
                type: "checkbox"
              }, null, 512), [
                [vModelCheckbox, skipConfirm.value]
              ]),
              createTextVNode(" " + toDisplayString(unref(t)("eval.confirm.noMoreAsk")), 1)
            ]),
            createBaseVNode("div", _hoisted_26, [
              createBaseVNode("button", {
                type: "button",
                class: "te-btn",
                onClick: _cache[2] || (_cache[2] = ($event) => showConfirm.value = false)
              }, toDisplayString(unref(t)("common.cancel")), 1),
              createBaseVNode("button", {
                type: "button",
                class: "te-btn primary",
                onClick: _cache[3] || (_cache[3] = ($event) => confirmSubmit(skipConfirm.value))
              }, toDisplayString(unref(t)("eval.confirm.submit")), 1)
            ])
          ]),
          _: 1
        }, 8, ["visible", "title"])
      ]);
    };
  }
};
const TeachingEvalView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-d97c05cd"]]);
export {
  TeachingEvalView as default
};
