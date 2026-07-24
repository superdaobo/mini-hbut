import { b as isTauriRuntime, a as invokeNative } from "./runtime-bridge-apFQ0nCw.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import { _ as _export_sfc } from "./app-demo-CxKBY5JQ.js";
import { T as TEmptyState } from "./TEmptyState-BSfdOG3N.js";
import { o as onMounted, c as createElementBlock, b as openBlock, q as createVNode, l as withCtx, d as createBaseVNode, a as ref, n as normalizeClass, u as unref, t as toDisplayString, f as createCommentVNode, F as Fragment, e as computed, i as renderList, k as createBlock } from "./vue-core-DdLVj9yW.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "so-page min-h-screen flex flex-col mx-auto max-w-[448px] relative pb-24" };
const _hoisted_2 = ["aria-busy"];
const _hoisted_3 = {
  key: 0,
  class: "p-4"
};
const _hoisted_4 = {
  key: 1,
  class: "flex-1 flex flex-col gap-4 p-4"
};
const _hoisted_5 = { class: "so-card" };
const _hoisted_6 = { class: "so-card-title" };
const _hoisted_7 = { class: "so-meta-row" };
const _hoisted_8 = {
  key: 0,
  class: "so-badge"
};
const _hoisted_9 = { class: "so-body whitespace-pre-wrap" };
const _hoisted_10 = {
  key: 0,
  class: "so-banner mx-4 mt-2"
};
const _hoisted_11 = { key: 0 };
const _hoisted_12 = {
  key: 1,
  class: "so-badge so-badge--demo"
};
const _hoisted_13 = {
  key: 2,
  class: "so-banner-notice"
};
const _hoisted_14 = {
  class: "so-tabs",
  "aria-label": "智慧迎新分区"
};
const _hoisted_15 = ["onClick"];
const _hoisted_16 = { class: "material-symbols-outlined text-base" };
const _hoisted_17 = {
  key: 0,
  class: "so-tab-dot"
};
const _hoisted_18 = { class: "flex-1 flex flex-col gap-3 p-4" };
const _hoisted_19 = {
  key: 0,
  class: "so-stats"
};
const _hoisted_20 = { class: "so-stat so-stat--primary" };
const _hoisted_21 = { class: "so-stat-value" };
const _hoisted_22 = { class: "so-stat" };
const _hoisted_23 = { class: "so-stat-value" };
const _hoisted_24 = {
  key: 2,
  class: "flex flex-col gap-2"
};
const _hoisted_25 = ["onClick"];
const _hoisted_26 = { class: "flex items-start gap-3" };
const _hoisted_27 = { class: "flex-1 min-w-0 text-left" };
const _hoisted_28 = { class: "flex items-start justify-between gap-2" };
const _hoisted_29 = { class: "so-msg-title" };
const _hoisted_30 = {
  key: 0,
  class: "so-msg-summary"
};
const _hoisted_31 = { class: "so-msg-time" };
const _hoisted_32 = {
  key: 1,
  class: "so-card"
};
const _hoisted_33 = { class: "so-field-list" };
const _hoisted_34 = {
  key: 1,
  class: "so-card"
};
const _hoisted_35 = { class: "so-field-list" };
const _hoisted_36 = {
  key: 1,
  class: "so-card"
};
const _hoisted_37 = { class: "so-field-list" };
const _hoisted_38 = {
  key: 1,
  class: "so-card"
};
const _hoisted_39 = { class: "so-field-list" };
const _hoisted_40 = {
  key: 7,
  class: "so-soft-error"
};
const _sfc_main = {
  __name: "SmartOrientationView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back", "logout"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const TABS = [
      { id: "messages", label: "消息", icon: "mail" },
      { id: "mentor", label: "班导师", icon: "person" },
      { id: "counselor", label: "辅导员", icon: "support_agent" },
      { id: "dorm", label: "宿舍", icon: "apartment" },
      { id: "profile", label: "个人信息", icon: "badge" }
    ];
    const activeTab = ref("messages");
    const loading = ref(false);
    const refreshing = ref(false);
    const error = ref("");
    const notice = ref("");
    const source = ref("");
    const demo = ref(false);
    const fetchedAt = ref("");
    const panels = ref([]);
    const messages = ref([]);
    const mentor = ref(null);
    const counselor = ref(null);
    const dorm = ref(null);
    const profile = ref(null);
    const selectedMessage = ref(null);
    const isInitialLoading = computed(() => loading.value && !fetchedAt.value);
    const unreadCount = computed(() => messages.value.filter((m) => !m.isRead).length);
    const sourceLabel = computed(() => {
      if (source.value === "live") return "在线";
      if (source.value === "mixed") return "部分在线";
      if (source.value === "fixture") return "协议样例";
      return source.value || "智慧迎新";
    });
    const personFields = (person) => {
      if (!person) return [];
      return [
        { label: "姓名", value: person.name },
        { label: "工号", value: person.staffId },
        { label: "学院", value: person.college },
        { label: "手机", value: person.phone },
        { label: "邮箱", value: person.email },
        { label: "办公地点", value: person.office },
        { label: "备注", value: person.remark }
      ].filter((row) => String(row.value || "").trim());
    };
    const dormFields = computed(() => {
      const d = dorm.value;
      if (!d) return [];
      return [
        { label: "校区", value: d.campus },
        { label: "楼栋", value: d.building },
        { label: "房间", value: d.room },
        { label: "床位", value: d.bed },
        { label: "状态", value: d.status },
        { label: "备注", value: d.remark }
      ].filter((row) => String(row.value || "").trim());
    });
    const profileFields = computed(() => {
      const p = profile.value;
      if (!p) return [];
      return [
        { label: "学号", value: p.studentId },
        { label: "姓名", value: p.name },
        { label: "性别", value: p.gender },
        { label: "学院", value: p.college },
        { label: "专业", value: p.major },
        { label: "班级", value: p.className },
        { label: "年级", value: p.grade },
        { label: "培养层次", value: p.educationLevel },
        { label: "身份证号", value: p.idNumber },
        { label: "手机", value: p.phone },
        { label: "迎新状态", value: p.orientationStatus }
      ].filter((row) => String(row.value || "").trim());
    });
    const normalizeMessage = (item) => ({
      id: String(item?.id || ""),
      title: String(item?.title || "无标题"),
      summary: String(item?.summary || ""),
      body: String(item?.body || item?.summary || ""),
      publishedAt: String(item?.publishedAt || item?.published_at || ""),
      isRead: !!(item?.isRead ?? item?.is_read),
      category: String(item?.category || "")
    });
    const normalizePerson = (raw) => {
      if (!raw || typeof raw !== "object") return null;
      return {
        name: String(raw.name || ""),
        staffId: String(raw.staffId || raw.staff_id || ""),
        college: String(raw.college || ""),
        phone: String(raw.phone || ""),
        email: String(raw.email || ""),
        office: String(raw.office || ""),
        remark: String(raw.remark || "")
      };
    };
    const formatTime = (value) => {
      const text = String(value || "").trim();
      if (!text) return "未知时间";
      const parsed = Date.parse(text.replace(/-/g, "/"));
      if (!Number.isFinite(parsed)) return text;
      return formatRelativeTime(new Date(parsed).toISOString()) || text;
    };
    const applyMeta = (payload) => {
      if (!payload || typeof payload !== "object") return;
      source.value = String(payload.source || source.value || "");
      demo.value = !!(payload.demo ?? demo.value);
      notice.value = String(payload.notice || notice.value || "");
      fetchedAt.value = String(payload.fetchedAt || payload.fetched_at || fetchedAt.value || "");
      if (payload.error) {
        error.value = String(payload.error);
      }
    };
    const fetchAll = async ({ force = false } = {}) => {
      if (!isTauriRuntime()) {
        error.value = "智慧迎新仅支持 Tauri 桌面端";
        return;
      }
      if (force) {
        refreshing.value = true;
      } else {
        loading.value = true;
      }
      error.value = "";
      notice.value = "";
      try {
        const [panelsRes, messagesRes, blocksRes] = await Promise.all([
          invokeNative("smart_orientation_list_panels").catch((e) => ({
            panels: [],
            error: e?.message || String(e),
            source: "fixture",
            demo: true
          })),
          invokeNative("smart_orientation_list_messages").catch((e) => ({
            items: [],
            error: e?.message || String(e),
            source: "fixture",
            demo: true
          })),
          invokeNative("smart_orientation_profile_blocks").catch((e) => ({
            error: e?.message || String(e),
            source: "fixture",
            demo: true
          }))
        ]);
        panels.value = Array.isArray(panelsRes?.panels) ? panelsRes.panels : [];
        applyMeta(panelsRes);
        const list = Array.isArray(messagesRes?.items) ? messagesRes.items : [];
        messages.value = list.map(normalizeMessage).filter((m) => m.id);
        applyMeta(messagesRes);
        mentor.value = normalizePerson(blocksRes?.mentor);
        counselor.value = normalizePerson(blocksRes?.counselor);
        dorm.value = blocksRes?.dorm && typeof blocksRes.dorm === "object" ? blocksRes.dorm : null;
        profile.value = blocksRes?.profile && typeof blocksRes.profile === "object" ? blocksRes.profile : null;
        applyMeta(blocksRes);
        if (!fetchedAt.value) {
          fetchedAt.value = (/* @__PURE__ */ new Date()).toISOString();
        }
      } catch (err) {
        error.value = err?.message || String(err) || "获取智慧迎新数据失败";
      } finally {
        loading.value = false;
        refreshing.value = false;
      }
    };
    const openMessage = (item) => {
      selectedMessage.value = item;
    };
    const closeMessage = () => {
      selectedMessage.value = null;
    };
    const handleBack = () => {
      if (selectedMessage.value) {
        closeMessage();
        return;
      }
      emit("back");
    };
    const switchTab = (id) => {
      selectedMessage.value = null;
      activeTab.value = id;
    };
    onMounted(() => {
      void fetchAll();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: selectedMessage.value ? "消息详情" : "智慧迎新",
          icon: "waving_hand",
          onBack: handleBack
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              class: "so-icon-btn",
              type: "button",
              "aria-busy": refreshing.value || loading.value,
              "aria-label": "刷新",
              onClick: _cache[0] || (_cache[0] = ($event) => fetchAll({ force: true }))
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { spinning: refreshing.value || loading.value }])
              }, " refresh ", 2)
            ], 8, _hoisted_2)
          ]),
          _: 1
        }, 8, ["title"]),
        !unref(isTauriRuntime)() ? (openBlock(), createElementBlock("div", _hoisted_3, [
          createVNode(unref(TEmptyState), {
            type: "empty",
            message: "智慧迎新仅支持 Tauri 桌面端，请在桌面应用中使用。"
          })
        ])) : selectedMessage.value ? (openBlock(), createElementBlock("main", _hoisted_4, [
          createBaseVNode("article", _hoisted_5, [
            createBaseVNode("h2", _hoisted_6, toDisplayString(selectedMessage.value.title), 1),
            createBaseVNode("div", _hoisted_7, [
              selectedMessage.value.category ? (openBlock(), createElementBlock("span", _hoisted_8, toDisplayString(selectedMessage.value.category), 1)) : createCommentVNode("", true),
              createBaseVNode("span", null, toDisplayString(selectedMessage.value.publishedAt || "未知时间"), 1)
            ]),
            createBaseVNode("p", _hoisted_9, toDisplayString(selectedMessage.value.body), 1)
          ])
        ])) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
          fetchedAt.value || notice.value || demo.value ? (openBlock(), createElementBlock("div", _hoisted_10, [
            createBaseVNode("span", null, "来源：" + toDisplayString(sourceLabel.value), 1),
            fetchedAt.value ? (openBlock(), createElementBlock("span", _hoisted_11, " · 更新于 " + toDisplayString(unref(formatRelativeTime)(fetchedAt.value) || fetchedAt.value), 1)) : createCommentVNode("", true),
            demo.value ? (openBlock(), createElementBlock("span", _hoisted_12, "样例")) : createCommentVNode("", true),
            notice.value ? (openBlock(), createElementBlock("p", _hoisted_13, toDisplayString(notice.value), 1)) : createCommentVNode("", true)
          ])) : createCommentVNode("", true),
          createBaseVNode("nav", _hoisted_14, [
            (openBlock(), createElementBlock(Fragment, null, renderList(TABS, (tab) => {
              return createBaseVNode("button", {
                key: tab.id,
                type: "button",
                class: normalizeClass(["so-tab", { "so-tab--active": activeTab.value === tab.id }]),
                onClick: ($event) => switchTab(tab.id)
              }, [
                createBaseVNode("span", _hoisted_16, toDisplayString(tab.icon), 1),
                createBaseVNode("span", null, toDisplayString(tab.label), 1),
                tab.id === "messages" && unreadCount.value > 0 ? (openBlock(), createElementBlock("span", _hoisted_17, toDisplayString(unreadCount.value), 1)) : createCommentVNode("", true)
              ], 10, _hoisted_15);
            }), 64))
          ]),
          createBaseVNode("main", _hoisted_18, [
            isInitialLoading.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "loading",
              message: "正在加载智慧迎新..."
            })) : error.value && !messages.value.length && !mentor.value && !counselor.value && !dorm.value && !profile.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 1,
              type: "error",
              message: error.value
            }, {
              default: withCtx(() => [
                createBaseVNode("button", {
                  class: "so-primary-btn mt-3",
                  type: "button",
                  onClick: _cache[1] || (_cache[1] = ($event) => fetchAll({ force: true }))
                }, " 重试 ")
              ]),
              _: 1
            }, 8, ["message"])) : activeTab.value === "messages" ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
              messages.value.length ? (openBlock(), createElementBlock("div", _hoisted_19, [
                createBaseVNode("div", _hoisted_20, [
                  _cache[2] || (_cache[2] = createBaseVNode("span", { class: "so-stat-label" }, "全部", -1)),
                  createBaseVNode("span", _hoisted_21, toDisplayString(messages.value.length), 1)
                ]),
                createBaseVNode("div", _hoisted_22, [
                  _cache[3] || (_cache[3] = createBaseVNode("span", { class: "so-stat-label" }, "未读", -1)),
                  createBaseVNode("span", _hoisted_23, toDisplayString(unreadCount.value), 1)
                ])
              ])) : createCommentVNode("", true),
              !messages.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 1,
                type: "empty",
                message: "暂无迎新消息"
              })) : (openBlock(), createElementBlock("ul", _hoisted_24, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(messages.value, (item) => {
                  return openBlock(), createElementBlock("li", {
                    key: item.id
                  }, [
                    createBaseVNode("button", {
                      type: "button",
                      class: normalizeClass(["so-msg-item", { "so-msg-item--unread": !item.isRead }]),
                      onClick: ($event) => openMessage(item)
                    }, [
                      createBaseVNode("div", _hoisted_26, [
                        createBaseVNode("span", {
                          class: normalizeClass(["so-dot", item.isRead ? "so-dot--read" : "so-dot--unread"]),
                          "aria-hidden": "true"
                        }, null, 2),
                        createBaseVNode("div", _hoisted_27, [
                          createBaseVNode("div", _hoisted_28, [
                            createBaseVNode("h3", _hoisted_29, toDisplayString(item.title), 1),
                            _cache[4] || (_cache[4] = createBaseVNode("span", { class: "material-symbols-outlined text-base so-chevron" }, "chevron_right", -1))
                          ]),
                          item.summary ? (openBlock(), createElementBlock("p", _hoisted_30, toDisplayString(item.summary), 1)) : createCommentVNode("", true),
                          createBaseVNode("div", _hoisted_31, toDisplayString(formatTime(item.publishedAt)), 1)
                        ])
                      ])
                    ], 10, _hoisted_25)
                  ]);
                }), 128))
              ]))
            ], 64)) : activeTab.value === "mentor" ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
              !mentor.value?.name ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 0,
                type: "empty",
                message: "暂无班导师信息"
              })) : (openBlock(), createElementBlock("article", _hoisted_32, [
                _cache[5] || (_cache[5] = createBaseVNode("h2", { class: "so-card-title" }, "班导师", -1)),
                createBaseVNode("dl", _hoisted_33, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(personFields(mentor.value), (row) => {
                    return openBlock(), createElementBlock("div", {
                      key: row.label,
                      class: "so-field"
                    }, [
                      createBaseVNode("dt", null, toDisplayString(row.label), 1),
                      createBaseVNode("dd", null, toDisplayString(row.value), 1)
                    ]);
                  }), 128))
                ])
              ]))
            ], 64)) : activeTab.value === "counselor" ? (openBlock(), createElementBlock(Fragment, { key: 4 }, [
              !counselor.value?.name ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 0,
                type: "empty",
                message: "暂无辅导员信息"
              })) : (openBlock(), createElementBlock("article", _hoisted_34, [
                _cache[6] || (_cache[6] = createBaseVNode("h2", { class: "so-card-title" }, "辅导员", -1)),
                createBaseVNode("dl", _hoisted_35, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(personFields(counselor.value), (row) => {
                    return openBlock(), createElementBlock("div", {
                      key: row.label,
                      class: "so-field"
                    }, [
                      createBaseVNode("dt", null, toDisplayString(row.label), 1),
                      createBaseVNode("dd", null, toDisplayString(row.value), 1)
                    ]);
                  }), 128))
                ])
              ]))
            ], 64)) : activeTab.value === "dorm" ? (openBlock(), createElementBlock(Fragment, { key: 5 }, [
              !dormFields.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 0,
                type: "empty",
                message: "暂无宿舍信息"
              })) : (openBlock(), createElementBlock("article", _hoisted_36, [
                _cache[7] || (_cache[7] = createBaseVNode("h2", { class: "so-card-title" }, "宿舍信息", -1)),
                createBaseVNode("dl", _hoisted_37, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(dormFields.value, (row) => {
                    return openBlock(), createElementBlock("div", {
                      key: row.label,
                      class: "so-field"
                    }, [
                      createBaseVNode("dt", null, toDisplayString(row.label), 1),
                      createBaseVNode("dd", null, toDisplayString(row.value), 1)
                    ]);
                  }), 128))
                ])
              ]))
            ], 64)) : activeTab.value === "profile" ? (openBlock(), createElementBlock(Fragment, { key: 6 }, [
              !profileFields.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 0,
                type: "empty",
                message: "暂无个人信息"
              })) : (openBlock(), createElementBlock("article", _hoisted_38, [
                _cache[8] || (_cache[8] = createBaseVNode("h2", { class: "so-card-title" }, "个人信息", -1)),
                _cache[9] || (_cache[9] = createBaseVNode("p", { class: "so-readonly-hint" }, "只读展示 · 填报请前往官方门户", -1)),
                createBaseVNode("dl", _hoisted_39, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(profileFields.value, (row) => {
                    return openBlock(), createElementBlock("div", {
                      key: row.label,
                      class: "so-field"
                    }, [
                      createBaseVNode("dt", null, toDisplayString(row.label), 1),
                      createBaseVNode("dd", null, toDisplayString(row.value), 1)
                    ]);
                  }), 128))
                ])
              ]))
            ], 64)) : createCommentVNode("", true),
            error.value && (messages.value.length || mentor.value || counselor.value || dorm.value || profile.value) ? (openBlock(), createElementBlock("p", _hoisted_40, toDisplayString(error.value), 1)) : createCommentVNode("", true)
          ])
        ], 64))
      ]);
    };
  }
};
const SmartOrientationView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-81477aa8"]]);
export {
  SmartOrientationView as default
};
