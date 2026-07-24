import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { a as invokeNative } from "./runtime-bridge-apFQ0nCw.js";
import { _ as _export_sfc } from "./app-demo-CxKBY5JQ.js";
import { T as TEmptyState } from "./TEmptyState-BSfdOG3N.js";
import { w as watch, o as onMounted, c as createElementBlock, b as openBlock, d as createBaseVNode, f as createCommentVNode, a as ref, t as toDisplayString, u as unref, e as computed, k as createBlock, F as Fragment, i as renderList, n as normalizeClass, l as withCtx } from "./vue-core-DdLVj9yW.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "trans-view" };
const _hoisted_2 = {
  key: 0,
  class: "offline-banner"
};
const _hoisted_3 = { class: "trans-content" };
const _hoisted_4 = { class: "bento-section" };
const _hoisted_5 = { class: "month-selector-card" };
const _hoisted_6 = { class: "month-center" };
const _hoisted_7 = { class: "month-title" };
const _hoisted_8 = { class: "month-subtitle" };
const _hoisted_9 = { class: "stats-grid" };
const _hoisted_10 = { class: "stat-card expense-card" };
const _hoisted_11 = { class: "stat-value-row" };
const _hoisted_12 = { class: "stat-amount expense" };
const _hoisted_13 = { class: "stat-card income-card" };
const _hoisted_14 = { class: "stat-value-row" };
const _hoisted_15 = { class: "stat-amount income" };
const _hoisted_16 = { class: "list-section" };
const _hoisted_17 = {
  key: 1,
  class: "glass-list-card"
};
const _hoisted_18 = { class: "date-group-label" };
const _hoisted_19 = { class: "material-symbols-outlined fill" };
const _hoisted_20 = { class: "trans-info" };
const _hoisted_21 = { class: "trans-name" };
const _hoisted_22 = { class: "trans-meta" };
const _hoisted_23 = {
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
      rawTransactions.value.forEach((t) => {
        if (t.date) {
          const m = t.date.substring(0, 7);
          if (m) months.add(m);
        }
      });
      return Array.from(months).sort((a, b) => b.localeCompare(a));
    });
    const currentMonthTransactions = computed(() => {
      if (!selectedMonth.value) return [];
      return rawTransactions.value.filter((t) => t.date && t.date.startsWith(selectedMonth.value));
    });
    watch(currentMonthTransactions, (list) => {
      let inc = 0;
      let exp = 0;
      list.forEach((t) => {
        const val = parseFloat(t.amt);
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
          errorMsg.value = res.message || res.msg || "获取数据失败";
        }
      } catch (e) {
        console.error("Failed to fetch transactions:", e);
        errorMsg.value = "网络请求异常: " + e.toString();
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
      if (!selectedMonth.value) return "暂无数据";
      const [year, month] = selectedMonth.value.split("-");
      return `${year}年 ${parseInt(month)}月`;
    });
    const groupedTransactions = computed(() => {
      const groups = [];
      const dateMap = /* @__PURE__ */ new Map();
      currentMonthTransactions.value.forEach((item) => {
        const dateKey = item.date ? item.date.substring(0, 10) : "未知日期";
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, []);
        }
        dateMap.get(dateKey).push(item);
      });
      for (const [dateKey, items] of dateMap) {
        const d = new Date(dateKey);
        const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
        const dateLabel = !isNaN(d.getTime()) ? `${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}` : dateKey;
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
        createBaseVNode("header", { class: "trans-header" }, [
          createBaseVNode("div", { class: "header-left" }, [
            createBaseVNode("button", {
              class: "header-icon-btn",
              onClick: handleBack
            }, [..._cache[2] || (_cache[2] = [
              createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)
            ])]),
            _cache[3] || (_cache[3] = createBaseVNode("h1", { class: "header-title" }, "💳 交易记录", -1))
          ])
        ]),
        offline.value ? (openBlock(), createElementBlock("div", _hoisted_2, " 当前显示为离线数据，更新于" + toDisplayString(unref(formatRelativeTime)(syncTime.value)), 1)) : createCommentVNode("", true),
        createBaseVNode("main", _hoisted_3, [
          createBaseVNode("section", _hoisted_4, [
            createBaseVNode("div", _hoisted_5, [
              createBaseVNode("button", {
                class: "month-nav-btn",
                onClick: _cache[0] || (_cache[0] = ($event) => navigateMonth(-1))
              }, [..._cache[4] || (_cache[4] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "chevron_left", -1)
              ])]),
              createBaseVNode("div", _hoisted_6, [
                createBaseVNode("span", _hoisted_7, toDisplayString(selectedMonthLabel.value), 1),
                createBaseVNode("span", _hoisted_8, "本月共 " + toDisplayString(currentMonthTransactions.value.length) + " 笔交易", 1)
              ]),
              createBaseVNode("button", {
                class: "month-nav-btn",
                onClick: _cache[1] || (_cache[1] = ($event) => navigateMonth(1))
              }, [..._cache[5] || (_cache[5] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "chevron_right", -1)
              ])])
            ]),
            createBaseVNode("div", _hoisted_9, [
              createBaseVNode("div", _hoisted_10, [
                _cache[7] || (_cache[7] = createBaseVNode("div", { class: "stat-bg-icon" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "outbox")
                ], -1)),
                _cache[8] || (_cache[8] = createBaseVNode("span", { class: "stat-label" }, "本月支出", -1)),
                createBaseVNode("div", _hoisted_11, [
                  _cache[6] || (_cache[6] = createBaseVNode("span", { class: "stat-currency expense" }, "¥", -1)),
                  createBaseVNode("span", _hoisted_12, toDisplayString(monthStats.value.expense), 1)
                ])
              ]),
              createBaseVNode("div", _hoisted_13, [
                _cache[10] || (_cache[10] = createBaseVNode("div", { class: "stat-bg-icon" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "move_to_inbox")
                ], -1)),
                _cache[11] || (_cache[11] = createBaseVNode("span", { class: "stat-label" }, "本月存入", -1)),
                createBaseVNode("div", _hoisted_14, [
                  _cache[9] || (_cache[9] = createBaseVNode("span", { class: "stat-currency income" }, "¥", -1)),
                  createBaseVNode("span", _hoisted_15, toDisplayString(monthStats.value.income), 1)
                ])
              ])
            ])
          ]),
          _cache[13] || (_cache[13] = createBaseVNode("div", { class: "disclaimer-card" }, [
            createBaseVNode("span", { class: "material-symbols-outlined disclaimer-icon" }, "info"),
            createBaseVNode("span", null, "此功能仅在首次登录后有效，长期未登录可能导致查询失败。若无法加载，请尝试退出后重新登录。")
          ], -1)),
          createBaseVNode("section", _hoisted_16, [
            _cache[12] || (_cache[12] = createBaseVNode("h2", { class: "section-title" }, "账单明细", -1)),
            loading.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "loading",
              message: "正在同步近一年数据..."
            })) : currentMonthTransactions.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_17, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(groupedTransactions.value, (group, gIdx) => {
                return openBlock(), createElementBlock(Fragment, { key: gIdx }, [
                  createBaseVNode("div", _hoisted_18, toDisplayString(group.dateLabel), 1),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(group.items, (item, index) => {
                    return openBlock(), createElementBlock("div", {
                      key: `${gIdx}-${index}`,
                      class: "trans-item"
                    }, [
                      createBaseVNode("div", {
                        class: normalizeClass(["trans-icon-circle", getIconClass(item)])
                      }, [
                        createBaseVNode("span", _hoisted_19, toDisplayString(getIconName(item)), 1)
                      ], 2),
                      createBaseVNode("div", _hoisted_20, [
                        createBaseVNode("span", _hoisted_21, toDisplayString(item.merchantName || item.summary || "未知交易"), 1),
                        createBaseVNode("span", _hoisted_22, toDisplayString(formatTime(item.date)) + " · 校园卡消费", 1)
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
                }, "重试")
              ]),
              _: 1
            }, 8, ["message"])) : (openBlock(), createBlock(unref(TEmptyState), {
              key: 3,
              message: "该月份暂无交易记录"
            }, {
              default: withCtx(() => [
                createBaseVNode("button", {
                  onClick: initLoad,
                  class: "retry-btn"
                }, "刷新数据")
              ]),
              _: 1
            })),
            !loading.value && currentMonthTransactions.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_23, " 没有更多记录了 ")) : createCommentVNode("", true)
          ])
        ])
      ]);
    };
  }
};
const TransactionHistory = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-28e51af6"]]);
export {
  TransactionHistory as default
};
