import { o as onMounted, c as createElementBlock, b as openBlock, q as createVNode, d as createBaseVNode, a as ref, u as unref, f as createCommentVNode, t as toDisplayString, F as Fragment, k as createBlock, e as computed, i as renderList, C as withDirectives, D as vModelText, l as withCtx, g as createTextVNode, H as vModelCheckbox } from "./vue-core-DdLVj9yW.js";
import { b as isTauriRuntime, a as invokeNative } from "./runtime-bridge-apFQ0nCw.js";
import { _ as _export_sfc, aj as TModal, s as showToast } from "./app-demo-CxKBY5JQ.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import { T as TEmptyState } from "./TEmptyState-BSfdOG3N.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
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
const _hoisted_14 = {
  key: 3,
  class: "card-surface"
};
const _hoisted_15 = { class: "te-title" };
const _hoisted_16 = { class: "te-meta" };
const _hoisted_17 = {
  key: 0,
  class: "te-form"
};
const _hoisted_18 = { class: "te-q-title" };
const _hoisted_19 = ["onUpdate:modelValue", "max"];
const _hoisted_20 = ["onUpdate:modelValue"];
const _hoisted_21 = {
  key: 2,
  class: "te-meta"
};
const _hoisted_22 = { class: "te-actions" };
const _hoisted_23 = ["disabled"];
const _hoisted_24 = { class: "te-check" };
const _hoisted_25 = { class: "te-actions" };
const SKIP_KEY = "hbu_teaching_eval_skip_confirm";
const COMMENT_TEMPLATE = "认真负责，收获很大。";
const _sfc_main = {
  __name: "TeachingEvalView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
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
        if (!isTauriRuntime()) throw new Error("请在客户端内使用评教");
        const res = await invokeNative("teaching_eval_list", {});
        protocolReady.value = res?.protocol_ready !== false;
        items.value = Array.isArray(res?.items) ? res.items : [];
        if (res?.message && !items.value.length) {
          error.value = String(res.message);
        }
      } catch (e) {
        error.value = String(e?.message || e || "加载失败");
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
        showToast(String(e?.message || e || "表单加载失败"));
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
      showToast("已填入满分与默认评语");
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
        if (res?.success === false) throw new Error(res?.message || "提交失败");
        showToast("提交成功");
        selected.value = null;
        form.value = null;
        await fetchList();
      } catch (e) {
        showToast(String(e?.message || e || "提交失败"));
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
      showToast("已恢复每次确认");
    };
    onMounted(() => {
      loadSkip();
      void fetchList();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: "教学评教",
          subtitle: selected.value ? selected.value.title : "待评课程",
          onBack: _cache[0] || (_cache[0] = ($event) => selected.value ? (selected.value = null, form.value = null) : emit("back"))
        }, null, 8, ["subtitle"]),
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            createBaseVNode("button", {
              type: "button",
              class: "te-btn",
              disabled: loading.value,
              onClick: fetchList
            }, toDisplayString(loading.value ? "刷新中…" : "刷新"), 9, _hoisted_4),
            skipConfirm.value ? (openBlock(), createElementBlock("button", {
              key: 0,
              type: "button",
              class: "te-btn ghost",
              onClick: resetSkipPreference
            }, " 重置「不再询问」 ")) : createCommentVNode("", true)
          ]),
          error.value ? (openBlock(), createElementBlock("p", _hoisted_5, toDisplayString(error.value), 1)) : createCommentVNode("", true),
          !protocolReady.value ? (openBlock(), createElementBlock("p", _hoisted_6, " 评教协议尚未完全对接时，列表可能为空。后续版本将补齐抓包路径。 ")) : createCommentVNode("", true),
          !selected.value ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
            createBaseVNode("h3", _hoisted_7, "待评（" + toDisplayString(pending.value.length) + "）", 1),
            !loading.value && !pending.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "empty",
              message: "暂无待评。当前学期若有评教任务会显示在此。"
            })) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(pending.value, (item) => {
              return openBlock(), createElementBlock("button", {
                key: item.id,
                type: "button",
                class: "card-surface te-row",
                onClick: ($event) => openItem(item)
              }, [
                createBaseVNode("div", _hoisted_9, toDisplayString(item.title || item.course_name || "评教任务"), 1),
                createBaseVNode("div", _hoisted_10, toDisplayString(item.teacher || item.teacher_name || "") + " · 待完成", 1)
              ], 8, _hoisted_8);
            }), 128)),
            createBaseVNode("h3", _hoisted_11, "已评（" + toDisplayString(done.value.length) + "）", 1),
            (openBlock(true), createElementBlock(Fragment, null, renderList(done.value, (item) => {
              return openBlock(), createElementBlock("button", {
                key: item.id,
                type: "button",
                class: "card-surface te-row muted",
                onClick: ($event) => openItem(item)
              }, [
                createBaseVNode("div", _hoisted_13, toDisplayString(item.title || item.course_name || "评教任务"), 1),
                _cache[5] || (_cache[5] = createBaseVNode("div", { class: "te-meta" }, "已完成", -1))
              ], 8, _hoisted_12);
            }), 128))
          ], 64)) : (openBlock(), createElementBlock("section", _hoisted_14, [
            createBaseVNode("h3", _hoisted_15, toDisplayString(selected.value.title || selected.value.course_name), 1),
            createBaseVNode("p", _hoisted_16, toDisplayString(selected.value.teacher || selected.value.teacher_name), 1),
            form.value?.questions?.length ? (openBlock(), createElementBlock("div", _hoisted_17, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(form.value.questions, (q, idx) => {
                return openBlock(), createElementBlock("div", {
                  key: q.id || idx,
                  class: "te-q"
                }, [
                  createBaseVNode("div", _hoisted_18, toDisplayString(idx + 1) + ". " + toDisplayString(q.title || q.label), 1),
                  q.kind === "score" || q.kind === "rate" ? withDirectives((openBlock(), createElementBlock("input", {
                    key: 0,
                    "onUpdate:modelValue": ($event) => q.value = $event,
                    type: "number",
                    min: 0,
                    max: q.max_score || 10,
                    class: "te-input"
                  }, null, 8, _hoisted_19)), [
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
                  }, null, 8, _hoisted_20)), [
                    [vModelText, q.value]
                  ]) : (openBlock(), createElementBlock("p", _hoisted_21, "题型：" + toDisplayString(q.kind || "未知"), 1))
                ]);
              }), 128))
            ])) : (openBlock(), createBlock(unref(TEmptyState), {
              key: 1,
              type: "empty",
              message: "暂无表单详情，后端将在协议对接后返回题目结构。"
            })),
            createBaseVNode("div", _hoisted_22, [
              createBaseVNode("button", {
                type: "button",
                class: "te-btn",
                onClick: fillFullScore
              }, "全部 10 分"),
              createBaseVNode("button", {
                type: "button",
                class: "te-btn primary",
                disabled: submitting.value,
                onClick: onQuickSubmit
              }, toDisplayString(submitting.value ? "提交中…" : "一键满分并提交"), 9, _hoisted_23)
            ])
          ]))
        ]),
        createVNode(unref(TModal), {
          visible: showConfirm.value,
          title: "确认满分提交",
          onClose: _cache[4] || (_cache[4] = ($event) => showConfirm.value = false)
        }, {
          default: withCtx(() => [
            _cache[7] || (_cache[7] = createBaseVNode("p", null, "将对本评教全部评分题填 10 分（或满分）并提交，通常不可撤销。", -1)),
            createBaseVNode("label", _hoisted_24, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => skipConfirm.value = $event),
                type: "checkbox"
              }, null, 512), [
                [vModelCheckbox, skipConfirm.value]
              ]),
              _cache[6] || (_cache[6] = createTextVNode(" 不再询问 ", -1))
            ]),
            createBaseVNode("div", _hoisted_25, [
              createBaseVNode("button", {
                type: "button",
                class: "te-btn",
                onClick: _cache[2] || (_cache[2] = ($event) => showConfirm.value = false)
              }, "取消"),
              createBaseVNode("button", {
                type: "button",
                class: "te-btn primary",
                onClick: _cache[3] || (_cache[3] = ($event) => confirmSubmit(skipConfirm.value))
              }, " 确认提交 ")
            ])
          ]),
          _: 1
        }, 8, ["visible"])
      ]);
    };
  }
};
const TeachingEvalView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-10ab82a8"]]);
export {
  TeachingEvalView as default
};
