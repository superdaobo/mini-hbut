import { x as watch, o as onMounted, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, u as unref, n as normalizeClass, d as createCommentVNode, M as withDirectives, S as vShow, j as createBlock, F as Fragment, f as renderList, l as withCtx, g as createTextVNode, r as ref, h as computed } from "./vue-core-4L5yFbGc.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { d as invokeNative } from "./runtime-bridge-BNc94E8M.js";
import { u as useI18n, t as tf } from "./more-modules-_ebfrMaq.js";
import { _ as _export_sfc } from "./app-demo-C2QcskTn.js";
import { T as TEmptyState } from "./TEmptyState-CcMJuzH9.js";
import "./debug-tools-CR1SXL-G.js";
import "./capture-BLRn_Hwi.js";
const _hoisted_1 = { class: "trans-view" };
const _hoisted_2 = { class: "trans-header" };
const _hoisted_3 = { class: "header-left" };
const _hoisted_4 = { class: "header-title" };
const _hoisted_5 = {
  class: "trans-tabs",
  role: "tablist"
};
const _hoisted_6 = ["aria-selected"];
const _hoisted_7 = ["aria-selected"];
const _hoisted_8 = {
  key: 0,
  class: "offline-banner"
};
const _hoisted_9 = {
  key: 1,
  class: "offline-banner"
};
const _hoisted_10 = { class: "trans-content" };
const _hoisted_11 = { class: "bento-section" };
const _hoisted_12 = { class: "month-selector-card" };
const _hoisted_13 = { class: "month-center" };
const _hoisted_14 = { class: "month-title" };
const _hoisted_15 = { class: "month-subtitle" };
const _hoisted_16 = { class: "stats-grid" };
const _hoisted_17 = { class: "stat-card expense-card" };
const _hoisted_18 = { class: "stat-label" };
const _hoisted_19 = { class: "stat-value-row" };
const _hoisted_20 = { class: "stat-amount expense" };
const _hoisted_21 = { class: "stat-card income-card" };
const _hoisted_22 = { class: "stat-label" };
const _hoisted_23 = { class: "stat-value-row" };
const _hoisted_24 = { class: "stat-amount income" };
const _hoisted_25 = { class: "disclaimer-card" };
const _hoisted_26 = { class: "list-section" };
const _hoisted_27 = { class: "section-title" };
const _hoisted_28 = {
  key: 1,
  class: "glass-list-card"
};
const _hoisted_29 = { class: "date-group-label" };
const _hoisted_30 = { class: "material-symbols-outlined fill" };
const _hoisted_31 = { class: "trans-info" };
const _hoisted_32 = { class: "trans-name" };
const _hoisted_33 = { class: "trans-meta" };
const _hoisted_34 = {
  key: 4,
  class: "list-end-hint"
};
const _hoisted_35 = { class: "trans-content" };
const _hoisted_36 = { class: "bento-section" };
const _hoisted_37 = { class: "month-selector-card" };
const _hoisted_38 = { class: "month-center" };
const _hoisted_39 = { class: "month-title" };
const _hoisted_40 = { class: "month-subtitle" };
const _hoisted_41 = { class: "stats-grid" };
const _hoisted_42 = { class: "stat-card expense-card" };
const _hoisted_43 = { class: "stat-label" };
const _hoisted_44 = { class: "stat-value-row" };
const _hoisted_45 = { class: "stat-amount expense" };
const _hoisted_46 = { class: "stat-card income-card" };
const _hoisted_47 = { class: "stat-label" };
const _hoisted_48 = { class: "stat-value-row" };
const _hoisted_49 = { class: "stat-amount income" };
const _hoisted_50 = {
  key: 0,
  class: "type-filter"
};
const _hoisted_51 = ["onClick"];
const _hoisted_52 = { class: "list-section" };
const _hoisted_53 = { class: "section-title" };
const _hoisted_54 = {
  key: 1,
  class: "glass-list-card"
};
const _hoisted_55 = { class: "material-symbols-outlined fill" };
const _hoisted_56 = { class: "trans-info" };
const _hoisted_57 = { class: "trans-name" };
const _hoisted_58 = { class: "trans-meta" };
const _hoisted_59 = {
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
    const activeTab = ref("consume");
    const balanceLoaded = ref(false);
    const balanceLoading = ref(false);
    const balanceError = ref("");
    const balanceOffline = ref(false);
    const balanceSyncTime = ref("");
    const balanceRaw = ref([]);
    const balanceMonth = ref("");
    const balanceType = ref("");
    const balanceTypes = ref([]);
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
    const normalizeBalanceRecords = (list) => {
      if (!Array.isArray(list)) return [];
      return list.map((item) => {
        const date = parseDateString(
          item.date || item.txDate || item.tradeTime || item.time || item.createTime || item.tradeDate
        );
        const rawAmt = normalizeAmount(
          item.amt || item.amount || item.money || item.fee || item.tradeAmount || item.transAmount,
          item
        );
        const isIncome = String(item.in ?? item.direction ?? "") === "1" || String(item.in ?? "").toLowerCase() === "true";
        const absAmt = String(rawAmt).replace(/^[+-]/, "");
        const amt = rawAmt === "" ? "" : isIncome ? absAmt : `-${absAmt}`;
        const merchantName = item.merchantName || item.merchant || item.merchant_name || "";
        const summary = item.summary || item.tradeName || item.remark || item.title || item.description || "";
        const balance = item.balance ?? item.afterBalance ?? item.leftBalance ?? item.cardBalance ?? item.surplus ?? "";
        const tradeType = item.tradeType ?? item.tradeTypeCode ?? item.type ?? item.typeCode ?? "";
        return {
          ...item,
          date,
          amt,
          merchantName,
          summary,
          balance,
          tradeType: tradeType === "" || tradeType == null ? "" : String(tradeType)
        };
      }).filter((item) => item.date || item.amt || item.merchantName || item.summary);
    };
    const normalizeTradeTypes = (res) => {
      const nested = [res?.resultData, res?.data].map((box) => box && typeof box === "object" ? box.tradeTypes : null).find((item) => Array.isArray(item));
      const candidates = [nested, res?.resultData, res?.data, res?.rows, res?.list, res?.result];
      const raw = candidates.find((item) => Array.isArray(item));
      if (!Array.isArray(raw)) return [];
      const seen = /* @__PURE__ */ new Set();
      return raw.map((item) => {
        const value = item?.tradeType ?? item?.type ?? item?.code ?? item?.value ?? item?.key;
        const label = item?.tradeTypeName ?? item?.typeName ?? item?.name ?? item?.label ?? item?.desc ?? item?.title ?? "";
        if (value == null || value === "") return null;
        const key = String(value);
        if (key.includes(",")) return null;
        if (seen.has(key)) return null;
        seen.add(key);
        return { value: key, label: String(label || key) };
      }).filter(Boolean);
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
    const formatBalance = (value) => {
      if (value == null || value === "") return "";
      const num = Number(value);
      if (isNaN(num)) return String(value);
      return num.toFixed(2);
    };
    const balanceMonths = computed(() => {
      const months = /* @__PURE__ */ new Set();
      balanceRaw.value.forEach((item) => {
        if (item.date) {
          const m = item.date.substring(0, 7);
          if (m) months.add(m);
        }
      });
      return Array.from(months).sort((a, b) => b.localeCompare(a));
    });
    const balanceMonthRecords = computed(() => {
      if (!balanceMonth.value) return [];
      return balanceRaw.value.filter((item) => item.date && item.date.startsWith(balanceMonth.value));
    });
    const balanceFilteredRecords = computed(() => balanceMonthRecords.value);
    const selectBalanceType = (type) => {
      if (balanceType.value === type) return;
      balanceType.value = type;
      void loadBalance();
    };
    const balanceMonthLabel = computed(() => {
      if (!balanceMonth.value) return t("tx.noData");
      const [year, month] = balanceMonth.value.split("-");
      return tf("tx.monthLabel", { year, month: parseInt(month) });
    });
    const balanceStats = computed(() => {
      let inc = 0;
      let exp = 0;
      balanceFilteredRecords.value.forEach((item) => {
        const val = parseFloat(item.amt);
        if (isNaN(val)) return;
        if (val < 0) exp += Math.abs(val);
        else inc += val;
      });
      return { income: inc.toFixed(2), expense: exp.toFixed(2) };
    });
    const navigateBalanceMonth = (direction) => {
      const idx = balanceMonths.value.indexOf(balanceMonth.value);
      if (idx < 0) return;
      const nextIdx = idx - direction;
      if (nextIdx >= 0 && nextIdx < balanceMonths.value.length) {
        balanceMonth.value = balanceMonths.value[nextIdx];
      }
    };
    const loadBalanceTypes = async () => {
      if (balanceTypes.value.length > 0) return;
      try {
        const res = await invokeNative("fetch_trade_list_config", { balance: true });
        balanceTypes.value = normalizeTradeTypes(res);
      } catch (e) {
        console.warn("Failed to fetch trade list config:", e);
      }
    };
    const loadBalance = async () => {
      balanceLoading.value = true;
      balanceError.value = "";
      try {
        const end = /* @__PURE__ */ new Date();
        const start = /* @__PURE__ */ new Date();
        start.setMonth(start.getMonth() - 12);
        const res = await invokeNative("fetch_balance_trade_list", {
          startDate: start.toISOString().split("T")[0],
          endDate: end.toISOString().split("T")[0],
          pageNo: 1,
          pageSize: 1e3,
          // 类型编码（11 消费 / 12 充值 / 13 补助）；空 = 后端默认 11,12,13
          tradeType: balanceType.value || ""
        });
        const isSuccess = res?.success === true || res?.code === "" || Array.isArray(res?.resultData) || Array.isArray(res?.resultData?.list) || Array.isArray(res?.data);
        if (isSuccess) {
          balanceOffline.value = !!res.offline;
          balanceSyncTime.value = res.sync_time || "";
          const rawList = res.resultData?.list || res.resultData || res.data?.list || res.data || res.rows || res.result || res.list || [];
          balanceRaw.value = normalizeBalanceRecords(rawList);
          if (balanceMonths.value.length > 0) {
            balanceMonth.value = balanceMonths.value[0];
          }
        } else {
          balanceError.value = res.message || res.msg || t("tx.error.fetchFailed");
        }
      } catch (e) {
        console.error("Failed to fetch balance trade list:", e);
        balanceError.value = tf("tx.error.network", { msg: e.toString() });
      } finally {
        balanceLoading.value = false;
      }
    };
    const retryBalance = () => {
      loadBalance();
      loadBalanceTypes();
    };
    const selectTab = (tab) => {
      if (tab === activeTab.value) return;
      activeTab.value = tab;
      if (tab === "balance" && !balanceLoaded.value) {
        balanceLoaded.value = true;
        loadBalance();
        loadBalanceTypes();
      }
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
            }, [..._cache[7] || (_cache[7] = [
              createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)
            ])]),
            createBaseVNode("h1", _hoisted_4, toDisplayString(unref(t)("tx.title")), 1)
          ])
        ]),
        createBaseVNode("nav", _hoisted_5, [
          createBaseVNode("button", {
            type: "button",
            role: "tab",
            class: normalizeClass(["trans-tab", { "is-active": activeTab.value === "consume" }]),
            "aria-selected": activeTab.value === "consume",
            onClick: _cache[0] || (_cache[0] = ($event) => selectTab("consume"))
          }, toDisplayString(unref(t)("tx.tab.consume")), 11, _hoisted_6),
          createBaseVNode("button", {
            type: "button",
            role: "tab",
            class: normalizeClass(["trans-tab", { "is-active": activeTab.value === "balance" }]),
            "aria-selected": activeTab.value === "balance",
            onClick: _cache[1] || (_cache[1] = ($event) => selectTab("balance"))
          }, toDisplayString(unref(t)("tx.tab.balance")), 11, _hoisted_7)
        ]),
        activeTab.value === "consume" && offline.value ? (openBlock(), createElementBlock("div", _hoisted_8, toDisplayString(unref(tf)("tx.offlineBanner", { time: unref(formatRelativeTime)(syncTime.value) })), 1)) : activeTab.value === "balance" && balanceOffline.value ? (openBlock(), createElementBlock("div", _hoisted_9, toDisplayString(unref(tf)("tx.offlineBanner", { time: unref(formatRelativeTime)(balanceSyncTime.value) })), 1)) : createCommentVNode("", true),
        withDirectives(createBaseVNode("main", _hoisted_10, [
          createBaseVNode("section", _hoisted_11, [
            createBaseVNode("div", _hoisted_12, [
              createBaseVNode("button", {
                class: "month-nav-btn",
                onClick: _cache[2] || (_cache[2] = ($event) => navigateMonth(-1))
              }, [..._cache[8] || (_cache[8] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "chevron_left", -1)
              ])]),
              createBaseVNode("div", _hoisted_13, [
                createBaseVNode("span", _hoisted_14, toDisplayString(selectedMonthLabel.value), 1),
                createBaseVNode("span", _hoisted_15, toDisplayString(unref(tf)("tx.monthCount", { n: currentMonthTransactions.value.length })), 1)
              ]),
              createBaseVNode("button", {
                class: "month-nav-btn",
                onClick: _cache[3] || (_cache[3] = ($event) => navigateMonth(1))
              }, [..._cache[9] || (_cache[9] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "chevron_right", -1)
              ])])
            ]),
            createBaseVNode("div", _hoisted_16, [
              createBaseVNode("div", _hoisted_17, [
                _cache[11] || (_cache[11] = createBaseVNode("div", { class: "stat-bg-icon" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "outbox")
                ], -1)),
                createBaseVNode("span", _hoisted_18, toDisplayString(unref(t)("tx.expense")), 1),
                createBaseVNode("div", _hoisted_19, [
                  _cache[10] || (_cache[10] = createBaseVNode("span", { class: "stat-currency expense" }, "¥", -1)),
                  createBaseVNode("span", _hoisted_20, toDisplayString(monthStats.value.expense), 1)
                ])
              ]),
              createBaseVNode("div", _hoisted_21, [
                _cache[13] || (_cache[13] = createBaseVNode("div", { class: "stat-bg-icon" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "move_to_inbox")
                ], -1)),
                createBaseVNode("span", _hoisted_22, toDisplayString(unref(t)("tx.income")), 1),
                createBaseVNode("div", _hoisted_23, [
                  _cache[12] || (_cache[12] = createBaseVNode("span", { class: "stat-currency income" }, "¥", -1)),
                  createBaseVNode("span", _hoisted_24, toDisplayString(monthStats.value.income), 1)
                ])
              ])
            ])
          ]),
          createBaseVNode("div", _hoisted_25, [
            _cache[14] || (_cache[14] = createBaseVNode("span", { class: "material-symbols-outlined disclaimer-icon" }, "info", -1)),
            createBaseVNode("span", null, toDisplayString(unref(t)("tx.disclaimer")), 1)
          ]),
          createBaseVNode("section", _hoisted_26, [
            createBaseVNode("h2", _hoisted_27, toDisplayString(unref(t)("tx.detail")), 1),
            loading.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "loading",
              message: unref(t)("tx.syncingYear")
            }, null, 8, ["message"])) : currentMonthTransactions.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_28, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(groupedTransactions.value, (group, gIdx) => {
                return openBlock(), createElementBlock(Fragment, { key: gIdx }, [
                  createBaseVNode("div", _hoisted_29, toDisplayString(group.dateLabel), 1),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(group.items, (item, index) => {
                    return openBlock(), createElementBlock("div", {
                      key: `${gIdx}-${index}`,
                      class: "trans-item"
                    }, [
                      createBaseVNode("div", {
                        class: normalizeClass(["trans-icon-circle", getIconClass(item)])
                      }, [
                        createBaseVNode("span", _hoisted_30, toDisplayString(getIconName(item)), 1)
                      ], 2),
                      createBaseVNode("div", _hoisted_31, [
                        createBaseVNode("span", _hoisted_32, toDisplayString(item.merchantName || item.summary || unref(t)("tx.unknownMerchant")), 1),
                        createBaseVNode("span", _hoisted_33, toDisplayString(formatTime(item.date)) + " · " + toDisplayString(unref(t)("tx.campusCardMeta")), 1)
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
            !loading.value && currentMonthTransactions.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_34, toDisplayString(unref(t)("tx.listEnd")), 1)) : createCommentVNode("", true)
          ])
        ], 512), [
          [vShow, activeTab.value === "consume"]
        ]),
        withDirectives(createBaseVNode("main", _hoisted_35, [
          createBaseVNode("section", _hoisted_36, [
            createBaseVNode("div", _hoisted_37, [
              createBaseVNode("button", {
                class: "month-nav-btn",
                onClick: _cache[4] || (_cache[4] = ($event) => navigateBalanceMonth(-1))
              }, [..._cache[15] || (_cache[15] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "chevron_left", -1)
              ])]),
              createBaseVNode("div", _hoisted_38, [
                createBaseVNode("span", _hoisted_39, toDisplayString(balanceMonthLabel.value), 1),
                createBaseVNode("span", _hoisted_40, toDisplayString(unref(tf)("tx.monthCount", { n: balanceFilteredRecords.value.length })), 1)
              ]),
              createBaseVNode("button", {
                class: "month-nav-btn",
                onClick: _cache[5] || (_cache[5] = ($event) => navigateBalanceMonth(1))
              }, [..._cache[16] || (_cache[16] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "chevron_right", -1)
              ])])
            ]),
            createBaseVNode("div", _hoisted_41, [
              createBaseVNode("div", _hoisted_42, [
                _cache[18] || (_cache[18] = createBaseVNode("div", { class: "stat-bg-icon" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "outbox")
                ], -1)),
                createBaseVNode("span", _hoisted_43, toDisplayString(unref(t)("tx.expense")), 1),
                createBaseVNode("div", _hoisted_44, [
                  _cache[17] || (_cache[17] = createBaseVNode("span", { class: "stat-currency expense" }, "¥", -1)),
                  createBaseVNode("span", _hoisted_45, toDisplayString(balanceStats.value.expense), 1)
                ])
              ]),
              createBaseVNode("div", _hoisted_46, [
                _cache[20] || (_cache[20] = createBaseVNode("div", { class: "stat-bg-icon" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "move_to_inbox")
                ], -1)),
                createBaseVNode("span", _hoisted_47, toDisplayString(unref(t)("tx.income")), 1),
                createBaseVNode("div", _hoisted_48, [
                  _cache[19] || (_cache[19] = createBaseVNode("span", { class: "stat-currency income" }, "¥", -1)),
                  createBaseVNode("span", _hoisted_49, toDisplayString(balanceStats.value.income), 1)
                ])
              ])
            ]),
            balanceTypes.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_50, [
              createBaseVNode("button", {
                type: "button",
                class: normalizeClass(["type-chip", { "is-active": balanceType.value === "" }]),
                onClick: _cache[6] || (_cache[6] = ($event) => selectBalanceType(""))
              }, toDisplayString(unref(t)("tx.balance.typeAll")), 3),
              (openBlock(true), createElementBlock(Fragment, null, renderList(balanceTypes.value, (item) => {
                return openBlock(), createElementBlock("button", {
                  key: item.value,
                  type: "button",
                  class: normalizeClass(["type-chip", { "is-active": balanceType.value === item.value }]),
                  onClick: ($event) => selectBalanceType(item.value)
                }, toDisplayString(item.label), 11, _hoisted_51);
              }), 128))
            ])) : createCommentVNode("", true)
          ]),
          createBaseVNode("section", _hoisted_52, [
            createBaseVNode("h2", _hoisted_53, toDisplayString(unref(t)("tx.balance.detail")), 1),
            balanceLoading.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "loading",
              message: unref(t)("tx.syncingYear")
            }, null, 8, ["message"])) : balanceFilteredRecords.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_54, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(balanceFilteredRecords.value, (item, index) => {
                return openBlock(), createElementBlock("div", {
                  key: `balance-${index}`,
                  class: "trans-item"
                }, [
                  createBaseVNode("div", {
                    class: normalizeClass(["trans-icon-circle", getIconClass(item)])
                  }, [
                    createBaseVNode("span", _hoisted_55, toDisplayString(getIconName(item)), 1)
                  ], 2),
                  createBaseVNode("div", _hoisted_56, [
                    createBaseVNode("span", _hoisted_57, toDisplayString(item.merchantName || item.summary || unref(t)("tx.unknownMerchant")), 1),
                    createBaseVNode("span", _hoisted_58, [
                      createTextVNode(toDisplayString(item.date ? item.date.slice(5, 16) : unref(t)("tx.unknownDate")) + " ", 1),
                      item.balance !== "" && item.balance != null ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        createTextVNode(" · " + toDisplayString(unref(t)("tx.balance.remain")) + " " + toDisplayString(formatBalance(item.balance)), 1)
                      ], 64)) : createCommentVNode("", true)
                    ])
                  ]),
                  createBaseVNode("div", {
                    class: normalizeClass(["trans-amount", {
                      "is-expense": String(item.amt).startsWith("-"),
                      "is-income": !String(item.amt).startsWith("-")
                    }])
                  }, toDisplayString(String(item.amt).startsWith("-") ? item.amt : `+${item.amt}`), 3)
                ]);
              }), 128))
            ])) : balanceError.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 2,
              type: "error",
              message: balanceError.value
            }, {
              default: withCtx(() => [
                createBaseVNode("button", {
                  onClick: retryBalance,
                  class: "retry-btn"
                }, toDisplayString(unref(t)("common.retry")), 1)
              ]),
              _: 1
            }, 8, ["message"])) : (openBlock(), createBlock(unref(TEmptyState), {
              key: 3,
              message: unref(t)("tx.balance.empty")
            }, {
              default: withCtx(() => [
                createBaseVNode("button", {
                  onClick: retryBalance,
                  class: "retry-btn"
                }, toDisplayString(unref(t)("tx.refreshData")), 1)
              ]),
              _: 1
            }, 8, ["message"])),
            !balanceLoading.value && balanceFilteredRecords.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_59, toDisplayString(unref(t)("tx.listEnd")), 1)) : createCommentVNode("", true)
          ])
        ], 512), [
          [vShow, activeTab.value === "balance"]
        ])
      ]);
    };
  }
};
const TransactionHistory = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-1854699d"]]);
export {
  TransactionHistory as default
};
