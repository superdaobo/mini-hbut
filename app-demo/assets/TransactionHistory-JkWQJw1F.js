import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { d as invokeNative } from "./runtime-bridge-Dt57BD2i.js";
import { _ as _export_sfc, m as useI18n, p as tf } from "./app-demo-CUOWTnz-.js";
import { T as TEmptyState } from "./TEmptyState-BwJ_g5G7.js";
import { v as watch, o as onMounted, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, u as unref, d as createCommentVNode, j as createBlock, F as Fragment, f as renderList, n as normalizeClass, k as withCtx, r as ref, h as computed } from "./vue-core-Dzs4fLAU.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "trans-view" };
const _hoisted_2 = { class: "trans-header" };
const _hoisted_3 = { class: "header-left" };
const _hoisted_4 = { class: "header-title" };
const _hoisted_5 = {
  key: 0,
  class: "offline-banner"
};
const _hoisted_6 = { class: "trans-content" };
const _hoisted_7 = { class: "bento-section" };
const _hoisted_8 = { class: "month-selector-card" };
const _hoisted_9 = { class: "month-center" };
const _hoisted_10 = { class: "month-title" };
const _hoisted_11 = { class: "month-subtitle" };
const _hoisted_12 = { class: "stats-grid" };
const _hoisted_13 = { class: "stat-card expense-card" };
const _hoisted_14 = { class: "stat-label" };
const _hoisted_15 = { class: "stat-value-row" };
const _hoisted_16 = { class: "stat-amount expense" };
const _hoisted_17 = { class: "stat-card income-card" };
const _hoisted_18 = { class: "stat-label" };
const _hoisted_19 = { class: "stat-value-row" };
const _hoisted_20 = { class: "stat-amount income" };
const _hoisted_21 = { class: "disclaimer-card" };
const _hoisted_22 = { class: "list-section" };
const _hoisted_23 = { class: "section-title" };
const _hoisted_24 = {
  key: 1,
  class: "glass-list-card"
};
const _hoisted_25 = { class: "date-group-label" };
const _hoisted_26 = { class: "material-symbols-outlined fill" };
const _hoisted_27 = { class: "trans-info" };
const _hoisted_28 = { class: "trans-name" };
const _hoisted_29 = { class: "trans-meta" };
const _hoisted_30 = {
  key: 4,
  class: "list-end-hint"
};
const _sfc_main = {
  __name: "TransactionHistory",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const loading = ref(false);
    const rawTransactions = ref([]);
    const errorMsg = ref("");
    const selectedMonth = ref("");
    const monthStats = ref({ income: 0, expense: 0 });
    const offline = ref(false);
    const syncTime = ref("");
    const parseDateString = (value) => {
      if (!value) return "";
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return "";
        if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed;
        const parsed = new Date(trimmed);
        if (!isNaN(parsed.getTime())) return parsed.toISOString().replace("T", " ").slice(0, 19);
        return trimmed;
      }
      if (typeof value === "number") {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) return parsed.toISOString().replace("T", " ").slice(0, 19);
      }
      return "";
    };
    const normalizeAmount = (value, item) => {
      if (value == null) return "";
      if (typeof value === "number") return value.toFixed(2);
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) return trimmed;
      }
      if (item && item.money != null) return String(item.money);
      return "";
    };
    const normalizeTransactions = (list) => {
      if (!Array.isArray(list)) return [];
      return list.map((item) => {
        const date = parseDateString(
          item.date || item.tradeTime || item.time || item.createTime || item.tradeDate || item.orderTime
        );
        const amt = normalizeAmount(
          item.amt || item.amount || item.money || item.fee || item.tradeAmount || item.transAmount,
          item
        );
        const merchantName = item.merchantName || item.merchant || item.merchant_name || "";
        const summary = item.summary || item.remark || item.title || item.description || "";
        const balance = item.balance || item.afterBalance || item.leftBalance || item.cardBalance || "";
        return {
          ...item,
          date,
          amt,
          merchantName,
          summary,
          balance
        };
      }).filter((item) => item.date || item.amt || item.merchantName || item.summary);
    };
    const availableMonths = computed(() => {
      const months = /* @__PURE__ */ new Set();
      rawTransactions.value.forEach((t2) => {
        if (t2.date) {
          const m = t2.date.substring(0, 7);
          if (m) months.add(m);
        }
      });
      return Array.from(months).sort((a, b) => b.localeCompare(a));
    });
    const currentMonthTransactions = computed(() => {
      if (!selectedMonth.value) return [];
      return rawTransactions.value.filter((t2) => t2.date && t2.date.startsWith(selectedMonth.value));
    });
    watch(currentMonthTransactions, (list) => {
      let inc = 0;
      let exp = 0;
      list.forEach((t2) => {
        const val = parseFloat(t2.amt);
        if (!isNaN(val)) {
          if (val < 0) exp += Math.abs(val);
          else inc += val;
        }
      });
      monthStats.value = {
        income: inc.toFixed(2),
        expense: exp.toFixed(2)
      };
    });
    const initLoad = async () => {
      loading.value = true;
      errorMsg.value = "";
      try {
        const end = /* @__PURE__ */ new Date();
        const start = /* @__PURE__ */ new Date();
        start.setMonth(start.getMonth() - 12);
        const res = await invokeNative("fetch_transaction_history", {
          startDate: start.toISOString().split("T")[0],
          endDate: end.toISOString().split("T")[0],
          pageNo: 1,
          pageSize: 1e3
        });
        const isSuccess = res?.success === true || res?.code === "" || Array.isArray(res?.resultData) || Array.isArray(res?.data);
        if (isSuccess) {
          offline.value = !!res.offline;
          syncTime.value = res.sync_time || "";
          const rawList = res.resultData || res.data || res.rows || res.result || res.list || [];
          rawTransactions.value = normalizeTransactions(rawList);
          if (availableMonths.value.length > 0) {
            selectedMonth.value = availableMonths.value[0];
          }
        } else {
          errorMsg.value = res.message || res.msg || t("tx.error.fetchFailed");
        }
      } catch (e) {
        console.error("Failed to fetch transactions:", e);
        errorMsg.value = tf("tx.error.network", { msg: e.toString() });
      } finally {
        loading.value = false;
      }
    };
    const handleBack = () => emit("back");
    const navigateMonth = (direction) => {
      const idx = availableMonths.value.indexOf(selectedMonth.value);
      if (idx < 0) return;
      const nextIdx = idx - direction;
      if (nextIdx >= 0 && nextIdx < availableMonths.value.length) {
        selectedMonth.value = availableMonths.value[nextIdx];
      }
    };
    const selectedMonthLabel = computed(() => {
      if (!selectedMonth.value) return t("tx.noData");
      const [year, month] = selectedMonth.value.split("-");
      return tf("tx.monthLabel", { year, month: parseInt(month) });
    });
    const groupedTransactions = computed(() => {
      const groups = [];
      const dateMap = /* @__PURE__ */ new Map();
      currentMonthTransactions.value.forEach((item) => {
        const dateKey = item.date ? item.date.substring(0, 10) : t("tx.unknownDate");
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, []);
        }
        dateMap.get(dateKey).push(item);
      });
      for (const [dateKey, items] of dateMap) {
        const d = new Date(dateKey);
        const weekdays = [t("tx.weekday.0"), t("tx.weekday.1"), t("tx.weekday.2"), t("tx.weekday.3"), t("tx.weekday.4"), t("tx.weekday.5"), t("tx.weekday.6")];
        const dateLabel = !isNaN(d.getTime()) ? tf("tx.dateLabel", { m: d.getMonth() + 1, d: d.getDate(), weekday: weekdays[d.getDay()] }) : dateKey;
        groups.push({ dateLabel, items });
      }
      return groups;
    });
    const getIconName = (item) => {
      const name = (item.merchantName || item.summary || "").toLowerCase();
      if (name.includes("食堂") || name.includes("餐")) return "restaurant";
      if (name.includes("超市") || name.includes("商店")) return "local_convenience_store";
      if (name.includes("充值") || name.includes("转入")) return "account_balance_wallet";
      if (name.includes("图书") || name.includes("打印")) return "menu_book";
      if (name.includes("车") || name.includes("交通")) return "directions_bus";
      if (!item.amt.startsWith("-")) return "account_balance_wallet";
      return "payments";
    };
    const getIconClass = (item) => {
      const name = (item.merchantName || item.summary || "").toLowerCase();
      if (name.includes("食堂") || name.includes("餐")) return "icon-orange";
      if (name.includes("超市") || name.includes("商店")) return "icon-sky";
      if (name.includes("充值") || name.includes("转入") || !item.amt.startsWith("-")) return "icon-teal";
      if (name.includes("图书") || name.includes("打印")) return "icon-primary";
      if (name.includes("车") || name.includes("交通")) return "icon-secondary";
      return "icon-primary";
    };
    const formatTime = (dateStr) => {
      if (!dateStr) return "";
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };
    onMounted(() => {
      initLoad();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            createBaseVNode("button", {
              class: "header-icon-btn",
              onClick: handleBack
            }, [..._cache[2] || (_cache[2] = [
              createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)
            ])]),
            createBaseVNode("h1", _hoisted_4, toDisplayString(unref(t)("tx.title")), 1)
          ])
        ]),
        offline.value ? (openBlock(), createElementBlock("div", _hoisted_5, toDisplayString(unref(tf)("tx.offlineBanner", { time: unref(formatRelativeTime)(syncTime.value) })), 1)) : createCommentVNode("", true),
        createBaseVNode("main", _hoisted_6, [
          createBaseVNode("section", _hoisted_7, [
            createBaseVNode("div", _hoisted_8, [
              createBaseVNode("button", {
                class: "month-nav-btn",
                onClick: _cache[0] || (_cache[0] = ($event) => navigateMonth(-1))
              }, [..._cache[3] || (_cache[3] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "chevron_left", -1)
              ])]),
              createBaseVNode("div", _hoisted_9, [
                createBaseVNode("span", _hoisted_10, toDisplayString(selectedMonthLabel.value), 1),
                createBaseVNode("span", _hoisted_11, toDisplayString(unref(tf)("tx.monthCount", { n: currentMonthTransactions.value.length })), 1)
              ]),
              createBaseVNode("button", {
                class: "month-nav-btn",
                onClick: _cache[1] || (_cache[1] = ($event) => navigateMonth(1))
              }, [..._cache[4] || (_cache[4] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "chevron_right", -1)
              ])])
            ]),
            createBaseVNode("div", _hoisted_12, [
              createBaseVNode("div", _hoisted_13, [
                _cache[6] || (_cache[6] = createBaseVNode("div", { class: "stat-bg-icon" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "outbox")
                ], -1)),
                createBaseVNode("span", _hoisted_14, toDisplayString(unref(t)("tx.expense")), 1),
                createBaseVNode("div", _hoisted_15, [
                  _cache[5] || (_cache[5] = createBaseVNode("span", { class: "stat-currency expense" }, "¥", -1)),
                  createBaseVNode("span", _hoisted_16, toDisplayString(monthStats.value.expense), 1)
                ])
              ]),
              createBaseVNode("div", _hoisted_17, [
                _cache[8] || (_cache[8] = createBaseVNode("div", { class: "stat-bg-icon" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "move_to_inbox")
                ], -1)),
                createBaseVNode("span", _hoisted_18, toDisplayString(unref(t)("tx.income")), 1),
                createBaseVNode("div", _hoisted_19, [
                  _cache[7] || (_cache[7] = createBaseVNode("span", { class: "stat-currency income" }, "¥", -1)),
                  createBaseVNode("span", _hoisted_20, toDisplayString(monthStats.value.income), 1)
                ])
              ])
            ])
          ]),
          createBaseVNode("div", _hoisted_21, [
            _cache[9] || (_cache[9] = createBaseVNode("span", { class: "material-symbols-outlined disclaimer-icon" }, "info", -1)),
            createBaseVNode("span", null, toDisplayString(unref(t)("tx.disclaimer")), 1)
          ]),
          createBaseVNode("section", _hoisted_22, [
            createBaseVNode("h2", _hoisted_23, toDisplayString(unref(t)("tx.detail")), 1),
            loading.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "loading",
              message: unref(t)("tx.syncingYear")
            }, null, 8, ["message"])) : currentMonthTransactions.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_24, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(groupedTransactions.value, (group, gIdx) => {
                return openBlock(), createElementBlock(Fragment, { key: gIdx }, [
                  createBaseVNode("div", _hoisted_25, toDisplayString(group.dateLabel), 1),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(group.items, (item, index) => {
                    return openBlock(), createElementBlock("div", {
                      key: `${gIdx}-${index}`,
                      class: "trans-item"
                    }, [
                      createBaseVNode("div", {
                        class: normalizeClass(["trans-icon-circle", getIconClass(item)])
                      }, [
                        createBaseVNode("span", _hoisted_26, toDisplayString(getIconName(item)), 1)
                      ], 2),
                      createBaseVNode("div", _hoisted_27, [
                        createBaseVNode("span", _hoisted_28, toDisplayString(item.merchantName || item.summary || unref(t)("tx.unknownMerchant")), 1),
                        createBaseVNode("span", _hoisted_29, toDisplayString(formatTime(item.date)) + " · " + toDisplayString(unref(t)("tx.campusCardMeta")), 1)
                      ]),
                      createBaseVNode("div", {
                        class: normalizeClass(["trans-amount", { "is-expense": item.amt.startsWith("-"), "is-income": !item.amt.startsWith("-") }])
                      }, toDisplayString(item.amt.startsWith("-") ? item.amt : `+${item.amt}`), 3)
                    ]);
                  }), 128))
                ], 64);
              }), 128))
            ])) : errorMsg.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 2,
              type: "error",
              message: errorMsg.value
            }, {
              default: withCtx(() => [
                createBaseVNode("button", {
                  onClick: initLoad,
                  class: "retry-btn"
                }, toDisplayString(unref(t)("common.retry")), 1)
              ]),
              _: 1
            }, 8, ["message"])) : (openBlock(), createBlock(unref(TEmptyState), {
              key: 3,
              message: unref(t)("tx.empty")
            }, {
              default: withCtx(() => [
                createBaseVNode("button", {
                  onClick: initLoad,
                  class: "retry-btn"
                }, toDisplayString(unref(t)("tx.refreshData")), 1)
              ]),
              _: 1
            }, 8, ["message"])),
            !loading.value && currentMonthTransactions.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_30, toDisplayString(unref(t)("tx.listEnd")), 1)) : createCommentVNode("", true)
          ])
        ])
      ]);
    };
  }
};
const TransactionHistory = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-aa6ad4f6"]]);
export {
  TransactionHistory as default
};
