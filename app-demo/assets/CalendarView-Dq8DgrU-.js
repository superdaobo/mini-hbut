import { _ as _export_sfc, G as getPreferredSemesterFast, H as mergeSemesterOptions, f as fetchWithCache, a as axiosInstance, E as EXTRA_LONG_TTL, b as setCachedData, n as normalizeSemesterList, h as resolveCurrentSemester, J as getStaleCachedData } from "./app-demo-CxKBY5JQ.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import { T as TEmptyState } from "./TEmptyState-BSfdOG3N.js";
import { o as onMounted, m as onBeforeUnmount, E as resolveComponent, c as createElementBlock, b as openBlock, q as createVNode, f as createCommentVNode, d as createBaseVNode, k as createBlock, l as withCtx, a as ref, n as normalizeClass, u as unref, F as Fragment, g as createTextVNode, t as toDisplayString, i as renderList, e as computed } from "./vue-core-DdLVj9yW.js";
import "./runtime-bridge-apFQ0nCw.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "calendar-view" };
const _hoisted_2 = ["aria-busy"];
const _hoisted_3 = { class: "controls" };
const _hoisted_4 = ["value"];
const _hoisted_5 = { class: "meta" };
const _hoisted_6 = {
  key: 0,
  class: "calendar-updated-at"
};
const _hoisted_7 = {
  key: 3,
  class: "calendar-table-wrapper"
};
const _hoisted_8 = { class: "calendar-table" };
const _hoisted_9 = ["rowspan"];
const _hoisted_10 = { class: "week-cell" };
const _hoisted_11 = { class: "day-num" };
const _hoisted_12 = {
  key: 0,
  class: "day-lunar"
};
const _hoisted_13 = {
  key: 1,
  class: "day-remark holiday"
};
const _hoisted_14 = {
  key: 2,
  class: "day-remark"
};
const _hoisted_15 = { class: "remark-cell" };
const _hoisted_16 = { class: "remark-cell" };
const CALENDAR_CACHE_REFRESH_RETRY_MS = 8e3;
const _sfc_main = {
  __name: "CalendarView",
  props: {
    studentId: { type: String, required: true }
  },
  emits: ["back", "logout"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const API_BASE = "/api";
    const loading = ref(false);
    const refreshing = ref(false);
    const error = ref("");
    const semesters = ref([]);
    const selectedSemester = ref("");
    const currentSemester = ref("");
    const calendarData = ref([]);
    const displayedCalendarCacheKey = ref("");
    const offline = ref(false);
    const sessionExpired = ref(false);
    const syncTime = ref("");
    const meta = ref({
      semester: "",
      start_date: "",
      current_week: "",
      current_weekday: "",
      total_weeks: "",
      today: ""
    });
    let calendarRequestSeq = 0;
    let calendarRealtimeRetryTimer = null;
    const resolveCalendarSyncTime = (data) => {
      const explicit = String(data?.sync_time || data?.updated_at || data?.timestamp || "").trim();
      if (explicit) return explicit;
      if (data?.offline) return syncTime.value || "";
      return (/* @__PURE__ */ new Date()).toISOString();
    };
    const isInitialLoading = computed(() => loading.value && calendarData.value.length === 0);
    const applyCalendarPayload = (data, cacheKey = "") => {
      if (!data?.success) return false;
      calendarData.value = Array.isArray(data.data) ? data.data : [];
      meta.value = data.meta || meta.value;
      if (data.meta?.semester && !selectedSemester.value) {
        selectedSemester.value = data.meta.semester;
        semesters.value = mergeSemesterOptions(semesters.value, selectedSemester.value);
      }
      offline.value = !!data.offline;
      sessionExpired.value = false;
      syncTime.value = resolveCalendarSyncTime(data);
      displayedCalendarCacheKey.value = cacheKey || displayedCalendarCacheKey.value;
      return true;
    };
    const applyStaleCalendarSnapshot = (cacheKey) => {
      const stale = getStaleCachedData(cacheKey);
      const data = stale?.data;
      if (!data?.success || !Array.isArray(data.data) || data.data.length === 0) {
        return false;
      }
      calendarData.value = data.data;
      meta.value = data.meta || meta.value;
      offline.value = true;
      sessionExpired.value = false;
      syncTime.value = resolveCalendarSyncTime(data);
      displayedCalendarCacheKey.value = cacheKey;
      return true;
    };
    const clearCalendarRealtimeRetry = () => {
      if (calendarRealtimeRetryTimer) {
        clearTimeout(calendarRealtimeRetryTimer);
        calendarRealtimeRetryTimer = null;
      }
    };
    const scheduleCalendarRealtimeRetry = () => {
      clearCalendarRealtimeRetry();
      if (sessionExpired.value) return;
      calendarRealtimeRetryTimer = setTimeout(() => {
        calendarRealtimeRetryTimer = null;
        if (offline.value && !sessionExpired.value) {
          fetchCalendar({ keepOfflineBanner: true }).catch(() => {
          });
        }
      }, CALENDAR_CACHE_REFRESH_RETRY_MS);
    };
    const restoreStaleSyncTime = (cacheKey) => {
      if (syncTime.value) return;
      const stale = getStaleCachedData(cacheKey);
      if (stale?.data) {
        syncTime.value = resolveCalendarSyncTime(stale.data);
      }
    };
    const initializeFastSemester = () => {
      const preferred = getPreferredSemesterFast();
      if (preferred && !selectedSemester.value) {
        selectedSemester.value = preferred;
      }
      semesters.value = mergeSemesterOptions(semesters.value, selectedSemester.value);
    };
    const normalizeRemark = (text) => {
      if (!text) return "";
      const cleaned = String(text).trim();
      if (cleaned === "无备注信息") return "";
      return cleaned;
    };
    const isHolidayRemark = (text) => {
      if (!text) return false;
      return /(节|假|休|放假)/.test(text);
    };
    const normalizeDayNumber = (value) => {
      if (value === null || value === void 0) return "";
      const raw = String(value).trim();
      if (!raw) return "";
      const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
      const dayText = parts.length > 0 ? parts[parts.length - 1] : raw;
      const day = Number(dayText);
      if (!Number.isFinite(day) || day <= 0) return "";
      return String(day);
    };
    const buildDateFromNyDay = (ny, dayValue) => {
      const day = normalizeDayNumber(dayValue);
      if (!ny || !day) return null;
      const [yearText, monthText] = String(ny).split("-");
      const year = Number(yearText);
      const month = Number(monthText);
      const dayNum = Number(day);
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(dayNum)) {
        return null;
      }
      return new Date(year, month - 1, dayNum);
    };
    const chineseLunarFormatter = (() => {
      try {
        return new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
          month: "long",
          day: "numeric"
        });
      } catch {
        return null;
      }
    })();
    const solarFestivalMap = {
      "01-01": "元旦",
      "02-14": "情人节",
      "03-08": "妇女节",
      "05-01": "劳动节",
      "06-01": "儿童节",
      "09-10": "教师节",
      "10-01": "国庆节",
      "12-25": "圣诞节"
    };
    const lunarFestivalMap = {
      "正月初一": "春节",
      "正月十五": "元宵节",
      "五月初五": "端午节",
      "七月初七": "七夕",
      "八月十五": "中秋节",
      "九月初九": "重阳节",
      "腊月初八": "腊八节",
      "腊月廿九": "除夕",
      "腊月三十": "除夕"
    };
    const formatLunarText = (date) => {
      if (!date || !chineseLunarFormatter) return "";
      try {
        const raw = chineseLunarFormatter.format(date).replace(/\s+/g, "");
        const yearPos = raw.indexOf("年");
        return yearPos >= 0 ? raw.slice(yearPos + 1) : raw;
      } catch {
        return "";
      }
    };
    const formatMonthDay = (value) => String(value).padStart(2, "0");
    const getFestivalLabel = (date, lunarText) => {
      if (!date) return "";
      const mmdd = `${formatMonthDay(date.getMonth() + 1)}-${formatMonthDay(date.getDate())}`;
      if (solarFestivalMap[mmdd]) return solarFestivalMap[mmdd];
      if (lunarFestivalMap[lunarText]) return lunarFestivalMap[lunarText];
      return "";
    };
    const getDayRemark = (item, dayKey) => {
      const candidates = [
        `${dayKey}remark`,
        `${dayKey}Remark`,
        `${dayKey}_remark`,
        `${dayKey}bz`,
        `${dayKey}Bz`,
        `${dayKey}_bz`,
        `${dayKey}jr`,
        `${dayKey}jrxx`,
        `${dayKey}holiday`
      ];
      for (const key of candidates) {
        if (Object.prototype.hasOwnProperty.call(item, key)) {
          const value = normalizeRemark(item[key]);
          if (value) return value;
        }
      }
      return "";
    };
    const getWeekRemark = (item, dayRemarks) => {
      const directKeys = ["remark", "weekremark", "weekRemark", "bz", "weekbz", "weekBz"];
      for (const key of directKeys) {
        if (Object.prototype.hasOwnProperty.call(item, key)) {
          const value = normalizeRemark(item[key]);
          if (value) return value;
        }
      }
      return Array.from(new Set(dayRemarks.filter(Boolean))).join(" / ");
    };
    const getMonthRemark = (item) => {
      const keys = ["monthremark", "monthRemark", "ybz", "yremark"];
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(item, key)) {
          const value = normalizeRemark(item[key]);
          if (value) return value;
        }
      }
      return "";
    };
    const buildDayCell = (item, dayKey) => {
      const rawDate = normalizeDayNumber(item[dayKey]);
      const remark = getDayRemark(item, dayKey);
      const dateObj = buildDateFromNyDay(item.ny, item[dayKey]);
      const lunar = formatLunarText(dateObj);
      const computedFestival = getFestivalLabel(dateObj, lunar);
      const holiday = isHolidayRemark(remark) ? remark : computedFestival;
      return {
        date: rawDate,
        remark,
        lunar,
        holiday,
        isHoliday: !!holiday
      };
    };
    const calendarRows = computed(() => {
      const rows = (calendarData.value || []).map((item) => {
        const days = [
          buildDayCell(item, "monday"),
          buildDayCell(item, "tuesday"),
          buildDayCell(item, "wednesday"),
          buildDayCell(item, "thursday"),
          buildDayCell(item, "friday"),
          buildDayCell(item, "saturday"),
          buildDayCell(item, "sunday")
        ];
        const weekRemark = getWeekRemark(item, days.map((d) => d.remark));
        const monthRemark = getMonthRemark(item);
        return {
          ny: item.ny,
          zc: item.zc,
          days,
          weekRemark,
          monthRemark,
          isCurrentWeek: String(item.zc) === String(meta.value.current_week)
        };
      });
      const monthSpanMap = {};
      rows.forEach((r) => {
        monthSpanMap[r.ny] = (monthSpanMap[r.ny] || 0) + 1;
      });
      const seen = /* @__PURE__ */ new Set();
      return rows.map((r) => {
        if (!seen.has(r.ny)) {
          seen.add(r.ny);
          return { ...r, showMonth: true, monthSpan: monthSpanMap[r.ny] };
        }
        return { ...r, showMonth: false, monthSpan: 0 };
      });
    });
    const fetchSemesters = async () => {
      const previousSemester = selectedSemester.value;
      try {
        const { data } = await fetchWithCache("semesters", async () => {
          const res = await axiosInstance.get(`${API_BASE}/v2/semesters`);
          return res.data;
        }, EXTRA_LONG_TTL, { staleWhileRevalidate: true, priority: "foreground" });
        if (data?.success) {
          const sorted = normalizeSemesterList(data.semesters || []);
          semesters.value = mergeSemesterOptions(sorted, selectedSemester.value);
          currentSemester.value = resolveCurrentSemester(sorted, data.current || "");
          if (!selectedSemester.value) {
            selectedSemester.value = currentSemester.value || sorted[0] || "";
            semesters.value = mergeSemesterOptions(semesters.value, selectedSemester.value);
          }
          const shouldRefetchResolvedSemester = !previousSemester && selectedSemester.value;
          if (shouldRefetchResolvedSemester) {
            fetchCalendar({ keepOfflineBanner: true }).catch(() => {
            });
          }
        }
      } catch (e) {
        console.error("获取学期失败", e);
      }
    };
    const fetchCalendar = async (options = {}) => {
      const requestSeq = ++calendarRequestSeq;
      const cacheKey = `calendar:${props.studentId}:${selectedSemester.value || "current"}`;
      const staleApplied = applyStaleCalendarSnapshot(cacheKey);
      if (!staleApplied && displayedCalendarCacheKey.value && displayedCalendarCacheKey.value !== cacheKey) {
        calendarData.value = [];
        displayedCalendarCacheKey.value = "";
      }
      loading.value = calendarData.value.length === 0;
      refreshing.value = true;
      error.value = "";
      clearCalendarRealtimeRetry();
      if (!staleApplied || !options.keepOfflineBanner) {
        offline.value = false;
        sessionExpired.value = false;
        syncTime.value = "";
      }
      try {
        const { data } = await fetchWithCache(cacheKey, async () => {
          const res = await axiosInstance.post(`${API_BASE}/v2/calendar`, {
            student_id: props.studentId,
            semester: selectedSemester.value
          });
          return res.data;
        }, EXTRA_LONG_TTL, { forceRemote: true, priority: "foreground" });
        if (requestSeq !== calendarRequestSeq) return;
        if (data?.success) {
          applyCalendarPayload(data, cacheKey);
          if (!data.offline) {
            setCachedData(cacheKey, data);
            clearCalendarRealtimeRetry();
          } else {
            offline.value = true;
            sessionExpired.value = false;
            scheduleCalendarRealtimeRetry();
          }
          return;
        }
        if (data?.need_login) {
          const method = String(localStorage.getItem("hbu_login_method") || "").trim();
          const isTemp = localStorage.getItem("hbu_login_temp") === "1" || method.endsWith("_temp");
          if (isTemp) {
            emit("logout");
            return;
          }
          if (calendarData.value.length > 0 || staleApplied) {
            sessionExpired.value = true;
            offline.value = true;
            restoreStaleSyncTime(cacheKey);
            error.value = "";
          } else {
            sessionExpired.value = false;
            offline.value = false;
            error.value = data?.error || "会话已过期，请重新登录";
          }
          return;
        }
        if (calendarData.value.length > 0 || staleApplied) {
          offline.value = true;
          sessionExpired.value = false;
          restoreStaleSyncTime(cacheKey);
          error.value = "";
          scheduleCalendarRealtimeRetry();
        } else {
          error.value = data?.error || "获取校历失败";
        }
      } catch (e) {
        if (requestSeq !== calendarRequestSeq) return;
        if (calendarData.value.length > 0 || staleApplied) {
          offline.value = true;
          sessionExpired.value = false;
          restoreStaleSyncTime(cacheKey);
          error.value = "";
          scheduleCalendarRealtimeRetry();
        } else {
          error.value = e.response?.data?.error || e.message || "网络错误，请稍后重试";
        }
      } finally {
        if (requestSeq === calendarRequestSeq) {
          loading.value = false;
          refreshing.value = false;
        }
      }
    };
    const handleSemesterChange = () => {
      fetchCalendar();
    };
    onMounted(() => {
      initializeFastSemester();
      fetchCalendar();
      fetchSemesters();
    });
    onBeforeUnmount(() => {
      clearCalendarRealtimeRetry();
    });
    return (_ctx, _cache) => {
      const _component_IOSSelect = resolveComponent("IOSSelect");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: "校历信息",
          icon: "event_note",
          onBack: _cache[1] || (_cache[1] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              class: "calendar-refresh-btn",
              type: "button",
              "aria-busy": refreshing.value || loading.value,
              "aria-label": "刷新校历",
              onClick: _cache[0] || (_cache[0] = ($event) => fetchCalendar())
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { spinning: refreshing.value || loading.value || offline.value }])
              }, "refresh", 2)
            ], 8, _hoisted_2)
          ]),
          _: 1
        }),
        offline.value || sessionExpired.value ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: normalizeClass(["offline-banner", { "session-banner": sessionExpired.value }])
        }, [
          sessionExpired.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
            createTextVNode(" 教务会话已失效，当前显示缓存校历（更新于" + toDisplayString(unref(formatRelativeTime)(syncTime.value) || "未知") + "）。请重新登录后刷新，而非官网校历接口消失。 ", 1)
          ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            createTextVNode(" 当前显示为离线数据，更新于" + toDisplayString(unref(formatRelativeTime)(syncTime.value)), 1)
          ], 64))
        ], 2)) : createCommentVNode("", true),
        createBaseVNode("div", _hoisted_3, [
          createVNode(_component_IOSSelect, {
            modelValue: selectedSemester.value,
            "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => selectedSemester.value = $event),
            onChange: handleSemesterChange
          }, {
            default: withCtx(() => [
              (openBlock(true), createElementBlock(Fragment, null, renderList(semesters.value, (s) => {
                return openBlock(), createElementBlock("option", {
                  key: s,
                  value: s
                }, toDisplayString(s), 9, _hoisted_4);
              }), 128))
            ]),
            _: 1
          }, 8, ["modelValue"]),
          createBaseVNode("div", _hoisted_5, [
            createBaseVNode("span", null, "当前周：第" + toDisplayString(meta.value.current_week) + "周", 1),
            createBaseVNode("span", null, "学期开始：" + toDisplayString(meta.value.start_date || "-"), 1),
            createBaseVNode("span", null, "总周数：" + toDisplayString(meta.value.total_weeks || "-"), 1),
            syncTime.value ? (openBlock(), createElementBlock("span", _hoisted_6, "最新更新：" + toDisplayString(unref(formatRelativeTime)(syncTime.value)), 1)) : createCommentVNode("", true)
          ])
        ]),
        isInitialLoading.value ? (openBlock(), createBlock(unref(TEmptyState), {
          key: 1,
          type: "loading",
          message: "正在获取校历..."
        })) : error.value ? (openBlock(), createBlock(unref(TEmptyState), {
          key: 2,
          type: "error",
          message: error.value
        }, {
          default: withCtx(() => [
            createBaseVNode("button", {
              class: "calendar-retry-btn",
              type: "button",
              onClick: _cache[3] || (_cache[3] = ($event) => fetchCalendar())
            }, "重试")
          ]),
          _: 1
        }, 8, ["message"])) : calendarData.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_7, [
          createBaseVNode("table", _hoisted_8, [
            _cache[4] || (_cache[4] = createBaseVNode("thead", null, [
              createBaseVNode("tr", null, [
                createBaseVNode("th", { class: "month-col" }, "月份"),
                createBaseVNode("th", { class: "week-col" }, "教学周"),
                createBaseVNode("th", null, "星期一"),
                createBaseVNode("th", null, "星期二"),
                createBaseVNode("th", null, "星期三"),
                createBaseVNode("th", null, "星期四"),
                createBaseVNode("th", null, "星期五"),
                createBaseVNode("th", null, "星期六"),
                createBaseVNode("th", null, "星期日"),
                createBaseVNode("th", { class: "remark-col" }, "周备注"),
                createBaseVNode("th", { class: "remark-col" }, "月备注")
              ])
            ], -1)),
            createBaseVNode("tbody", null, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(calendarRows.value, (row, index) => {
                return openBlock(), createElementBlock("tr", {
                  key: index,
                  class: normalizeClass({ "is-current": row.isCurrentWeek })
                }, [
                  row.showMonth ? (openBlock(), createElementBlock("td", {
                    key: 0,
                    rowspan: row.monthSpan,
                    class: "month-cell"
                  }, toDisplayString(row.ny), 9, _hoisted_9)) : createCommentVNode("", true),
                  createBaseVNode("td", _hoisted_10, toDisplayString(row.zc), 1),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(row.days, (day, dIndex) => {
                    return openBlock(), createElementBlock("td", {
                      key: dIndex,
                      class: "day-cell"
                    }, [
                      createBaseVNode("div", _hoisted_11, toDisplayString(day.date), 1),
                      day.lunar ? (openBlock(), createElementBlock("div", _hoisted_12, toDisplayString(day.lunar), 1)) : createCommentVNode("", true),
                      day.holiday ? (openBlock(), createElementBlock("div", _hoisted_13, toDisplayString(day.holiday), 1)) : day.remark ? (openBlock(), createElementBlock("div", _hoisted_14, toDisplayString(day.remark), 1)) : createCommentVNode("", true)
                    ]);
                  }), 128)),
                  createBaseVNode("td", _hoisted_15, toDisplayString(row.weekRemark || "-"), 1),
                  createBaseVNode("td", _hoisted_16, toDisplayString(row.monthRemark || "-"), 1)
                ], 2);
              }), 128))
            ])
          ])
        ])) : (openBlock(), createBlock(unref(TEmptyState), {
          key: 4,
          type: "empty",
          message: "暂无校历数据"
        }))
      ]);
    };
  }
};
const CalendarView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-c33efd41"]]);
export {
  CalendarView as default
};
