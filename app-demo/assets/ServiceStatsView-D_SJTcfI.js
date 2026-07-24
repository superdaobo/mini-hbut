import { _ as _export_sfc, a7 as fetchPersonalUsageSummary, a8 as fetchRemotePersonalUsageSummary } from "./app-demo-CxKBY5JQ.js";
import { a as ref, o as onMounted, w as watch, m as onBeforeUnmount, c as createElementBlock, b as openBlock, d as createBaseVNode, f as createCommentVNode, n as normalizeClass, e as computed, t as toDisplayString, F as Fragment, i as renderList } from "./vue-core-DdLVj9yW.js";
import "./runtime-bridge-apFQ0nCw.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "service-stats-view" };
const _hoisted_2 = { class: "stats-header" };
const _hoisted_3 = ["disabled"];
const _hoisted_4 = { class: "status-card" };
const _hoisted_5 = { class: "status-row" };
const _hoisted_6 = { class: "status-meta" };
const _hoisted_7 = {
  key: 0,
  class: "error-banner"
};
const _hoisted_8 = {
  class: "overview-grid",
  "aria-label": "服务总览"
};
const _hoisted_9 = { class: "material-symbols-outlined metric-icon" };
const _hoisted_10 = { class: "metric-label" };
const _hoisted_11 = { class: "metric-value" };
const _hoisted_12 = {
  key: 1,
  class: "usage-card",
  "aria-label": "我的使用"
};
const _hoisted_13 = { class: "overview-grid personal-grid" };
const _hoisted_14 = { class: "material-symbols-outlined metric-icon" };
const _hoisted_15 = { class: "metric-label" };
const _hoisted_16 = { class: "metric-value" };
const _hoisted_17 = {
  key: 0,
  class: "version-list"
};
const _hoisted_18 = { class: "version-name" };
const _hoisted_19 = { class: "version-count" };
const _hoisted_20 = {
  key: 1,
  class: "version-list"
};
const _hoisted_21 = { class: "version-name" };
const _hoisted_22 = { class: "version-count" };
const _hoisted_23 = {
  key: 2,
  class: "empty-hint"
};
const _hoisted_24 = {
  key: 2,
  class: "usage-card",
  "aria-label": "全站试用概况"
};
const _hoisted_25 = { class: "overview-grid personal-grid" };
const _hoisted_26 = { class: "material-symbols-outlined metric-icon" };
const _hoisted_27 = { class: "metric-label" };
const _hoisted_28 = { class: "metric-value" };
const _hoisted_29 = {
  key: 0,
  class: "version-list"
};
const _hoisted_30 = { class: "version-name" };
const _hoisted_31 = { class: "version-count" };
const _hoisted_32 = {
  key: 1,
  class: "version-list"
};
const _hoisted_33 = { class: "version-name" };
const _hoisted_34 = { class: "version-count" };
const _hoisted_35 = {
  key: 3,
  class: "version-card",
  "aria-label": "各版本人数"
};
const _hoisted_36 = { class: "version-list" };
const _hoisted_37 = { class: "version-name" };
const _hoisted_38 = { class: "version-count" };
const _hoisted_39 = { class: "trend-card" };
const _hoisted_40 = {
  key: 0,
  class: "trend-list"
};
const _hoisted_41 = { class: "trend-head" };
const _hoisted_42 = ["viewBox", "aria-label"];
const _hoisted_43 = ["x1", "x2", "y1", "y2"];
const _hoisted_44 = ["y"];
const _hoisted_45 = ["x", "y"];
const _hoisted_46 = ["d", "stroke"];
const _hoisted_47 = ["cx", "cy", "fill"];
const _hoisted_48 = {
  key: 1,
  class: "empty-state"
};
const HEALTH_URL = "https://mini-hbut-ocr-service.hf.space/health";
const HEALTH_CACHE_KEY = "hbu_service_health_cache_v1";
const HEALTH_TIMEOUT_MS = 1e4;
const REFRESH_INTERVAL_MS = 60 * 1e3;
const HEALTH_MAX_RETRIES = 2;
const CHART_WIDTH = 220;
const CHART_HEIGHT = 92;
const _sfc_main = {
  __name: "ServiceStatsView",
  props: {
    studentId: {
      type: String,
      default: ""
    }
  },
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const HEALTH_RETRY_DELAYS = [800, 1500];
    const toNumber = (value, fallback = 0) => {
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    };
    const formatNumber = (value) => toNumber(value).toLocaleString("zh-CN");
    const formatDuration = (seconds) => {
      const totalSeconds = Math.max(0, Math.floor(toNumber(seconds)));
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor(totalSeconds % 86400 / 3600);
      const minutes = Math.floor(totalSeconds % 3600 / 60);
      if (days > 0) return `${days}天 ${hours}小时`;
      if (hours > 0) return `${hours}小时 ${minutes}分钟`;
      return `${minutes}分钟`;
    };
    const formatDurationMs = (ms) => formatDuration(Math.floor(toNumber(ms) / 1e3));
    const normalizeClientUsage = (raw = {}) => ({
      today_active_users: toNumber(raw?.today_active_users),
      today_total_events: toNumber(raw?.today_total_events),
      today_duration_hours: toNumber(raw?.today_duration_hours),
      today_app_opens: toNumber(raw?.today_app_opens),
      top_modules_today: Array.isArray(raw?.top_modules_today) ? raw.top_modules_today.map((item) => ({
        module_id: String(item?.module_id || "").trim(),
        open_count: toNumber(item?.open_count),
        duration_ms_total: toNumber(item?.duration_ms_total),
        remote_count: toNumber(item?.remote_count),
        local_count: toNumber(item?.local_count)
      })).filter((item) => item.module_id) : [],
      load_mode_split_today: raw?.load_mode_split_today && typeof raw.load_mode_split_today === "object" ? raw.load_mode_split_today : {},
      trend_last_7_days: Array.isArray(raw?.trend_last_7_days) ? raw.trend_last_7_days.map((row) => ({
        date: row?.date || "",
        active_users: toNumber(row?.active_users),
        total_events: toNumber(row?.total_events),
        total_duration_ms: toNumber(row?.total_duration_ms),
        app_opens: toNumber(row?.app_opens)
      })) : []
    });
    const normalizePersonalUsage = (raw = null) => {
      if (!raw || typeof raw !== "object") return null;
      const today = raw?.today || {};
      return {
        today: {
          stat_date: today?.stat_date || "",
          open_count: toNumber(today?.open_count),
          duration_ms: toNumber(today?.duration_ms),
          module_open_count: toNumber(today?.module_open_count),
          view_open_count: toNumber(today?.view_open_count)
        },
        top_modules: Array.isArray(raw?.top_modules) ? raw.top_modules.map((item) => ({
          target_id: String(item?.target_id || "").trim(),
          open_count: toNumber(item?.open_count),
          duration_ms_total: toNumber(item?.duration_ms_total)
        })).filter((item) => item.target_id) : [],
        load_mode_split: Array.isArray(raw?.load_mode_split) ? raw.load_mode_split.map((item) => ({
          load_mode: String(item?.load_mode || "native").trim() || "native",
          open_count: toNumber(item?.open_count)
        })) : [],
        daily_trend: Array.isArray(raw?.daily_trend) ? raw.daily_trend.map((row) => ({
          stat_date: row?.stat_date || "",
          open_count: toNumber(row?.open_count),
          duration_ms: toNumber(row?.duration_ms)
        })) : []
      };
    };
    const mergePersonalUsage = (localRaw, remoteRaw) => {
      const local = normalizePersonalUsage(localRaw);
      const remote = normalizePersonalUsage(remoteRaw?.success === false ? null : remoteRaw);
      if (!local && !remote) return null;
      if (!remote) return local;
      if (!local) return remote;
      const pickMax = (a, b) => Math.max(toNumber(a), toNumber(b));
      return {
        today: {
          stat_date: remote.today.stat_date || local.today.stat_date,
          open_count: pickMax(local.today.open_count, remote.today.open_count),
          duration_ms: pickMax(local.today.duration_ms, remote.today.duration_ms),
          module_open_count: pickMax(local.today.module_open_count, remote.today.module_open_count),
          view_open_count: pickMax(local.today.view_open_count, remote.today.view_open_count)
        },
        top_modules: remote.top_modules.length ? remote.top_modules : local.top_modules,
        load_mode_split: remote.load_mode_split.length ? remote.load_mode_split : local.load_mode_split,
        daily_trend: remote.daily_trend.length ? remote.daily_trend : local.daily_trend
      };
    };
    const normalizeTrendRows = (rows) => {
      if (!Array.isArray(rows)) return [];
      return rows.map((row) => ({
        date: row?.date || "",
        ocr_count: toNumber(row?.ocr_count),
        upload_count: toNumber(row?.upload_count),
        grade_dist_query_count: toNumber(row?.grade_dist_query_count),
        cloud_sync_total: toNumber(row?.cloud_sync_total),
        latest_version_user_count: toNumber(row?.latest_version_user_count),
        latest_version: row?.latest_version || ""
      }));
    };
    const normalizeServiceHealth = (raw = {}) => {
      const trendRows2 = normalizeTrendRows(raw?.trend?.last_7_days);
      const uptimeSeconds = toNumber(raw?.service?.uptime_seconds);
      const archiveStatus = raw?.archive_status || {};
      const hfBucket = raw?.hf_bucket || {};
      return {
        status: raw?.status || "unknown",
        service: {
          started_at: raw?.service?.started_at || "",
          uptime_seconds: uptimeSeconds,
          uptime: raw?.service?.uptime || formatDuration(uptimeSeconds),
          version: raw?.service?.version || ""
        },
        daily_usage: {
          date: raw?.daily_usage?.date || "",
          ocr_count: toNumber(raw?.daily_usage?.ocr_count),
          upload_count: toNumber(raw?.daily_usage?.upload_count),
          grade_dist_query_count: toNumber(raw?.daily_usage?.grade_dist_query_count)
        },
        cloud_sync: {
          total_records: toNumber(raw?.cloud_sync?.total_records),
          latest_version: raw?.cloud_sync?.latest_version || "",
          latest_version_user_count: toNumber(raw?.cloud_sync?.latest_version_user_count),
          version_user_counts: Array.isArray(raw?.cloud_sync?.version_user_counts) ? raw.cloud_sync.version_user_counts.map((item) => ({
            version: String(item?.version || "").trim(),
            user_count: toNumber(item?.user_count)
          })).filter((item) => item.version) : []
        },
        trend: {
          last_7_days: trendRows2
        },
        hf_bucket: {
          enabled: Boolean(hfBucket.enabled),
          configured: Boolean(hfBucket.configured),
          bucket_id: hfBucket.bucket_id || "",
          last_error: hfBucket.last_error || ""
        },
        archive_status: {
          enabled: Boolean(archiveStatus.enabled),
          require_before_db: Boolean(archiveStatus.require_before_db),
          pending_replay_count: toNumber(archiveStatus.pending_replay_count),
          last_archive_at: archiveStatus.last_archive_at || "",
          last_archive_path: archiveStatus.last_archive_path || "",
          last_error: archiveStatus.last_error || ""
        },
        client_usage: normalizeClientUsage(raw?.client_usage || {})
      };
    };
    const loading = ref(false);
    const error = ref("");
    const lastUpdatedAt = ref("");
    const health = ref(normalizeServiceHealth());
    const personalUsage = ref(null);
    const personalLoading = ref(false);
    let refreshTimer = null;
    let healthRequestSeq = 0;
    const loadPersonalUsage = async () => {
      const sid = String(props.studentId || "").trim();
      if (!sid) {
        personalUsage.value = null;
        return;
      }
      personalLoading.value = true;
      try {
        const [localSummary, remoteSummary] = await Promise.all([
          fetchPersonalUsageSummary(sid),
          fetchRemotePersonalUsageSummary(sid)
        ]);
        personalUsage.value = mergePersonalUsage(localSummary, remoteSummary);
      } catch {
        personalUsage.value = null;
      } finally {
        personalLoading.value = false;
      }
    };
    const readCachedHealth = () => {
      try {
        const raw = localStorage.getItem(HEALTH_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.data) return null;
        return parsed;
      } catch {
        return null;
      }
    };
    const writeCachedHealth = (data) => {
      try {
        localStorage.setItem(HEALTH_CACHE_KEY, JSON.stringify({
          data,
          cachedAt: Date.now()
        }));
      } catch {
      }
    };
    const buildHealthSignal = () => {
      if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
        return AbortSignal.timeout(HEALTH_TIMEOUT_MS);
      }
      const controller = new AbortController();
      window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      return controller.signal;
    };
    const applyHealthData = (data, updatedAt = Date.now()) => {
      health.value = normalizeServiceHealth(data);
      lastUpdatedAt.value = new Date(updatedAt).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit"
      });
    };
    const statusText = computed(() => {
      if (health.value.status === "ok") return "运行正常";
      if (health.value.status === "degraded") return "部分异常";
      return "状态未知";
    });
    const statusClass = computed(() => ({
      "is-ok": health.value.status === "ok",
      "is-warn": health.value.status && health.value.status !== "ok"
    }));
    const displayClientVersion = computed(() => health.value.cloud_sync.latest_version || "");
    const clientUsage = computed(() => health.value.client_usage || normalizeClientUsage());
    const hasClientUsage = computed(() => clientUsage.value.today_total_events > 0 || clientUsage.value.today_active_users > 0 || clientUsage.value.top_modules_today.length > 0);
    const loadModeLabel = (mode) => {
      const key = String(mode || "").trim();
      if (key === "remote-site") return "服务器软加载";
      if (key === "tauri-local" || key === "capacitor-local") return "本地直接加载";
      if (key === "native") return "原生页面";
      return key || "未知";
    };
    const personalOverviewItems = computed(() => {
      const today = personalUsage.value?.today;
      if (!today) return [];
      return [
        { label: "今日打开", value: formatNumber(today.open_count), icon: "touch_app" },
        { label: "今日时长", value: formatDurationMs(today.duration_ms), icon: "schedule" },
        { label: "模块打开", value: formatNumber(today.module_open_count), icon: "extension" },
        { label: "页面打开", value: formatNumber(today.view_open_count), icon: "web" }
      ];
    });
    const globalUsageOverviewItems = computed(() => [
      { label: "今日活跃", value: formatNumber(clientUsage.value.today_active_users), icon: "groups" },
      { label: "今日事件", value: formatNumber(clientUsage.value.today_total_events), icon: "analytics" },
      { label: "今日时长", value: `${clientUsage.value.today_duration_hours.toFixed(1)} 小时`, icon: "timer" },
      { label: "应用打开", value: formatNumber(clientUsage.value.today_app_opens), icon: "smartphone" }
    ]);
    const loadModeSplitRows = computed(() => {
      const split = clientUsage.value.load_mode_split_today || {};
      return Object.entries(split).map(([mode, count]) => ({
        mode,
        label: loadModeLabel(mode),
        open_count: toNumber(count)
      })).filter((item) => item.open_count > 0).sort((a, b) => b.open_count - a.open_count);
    });
    const personalLoadModeRows = computed(() => personalUsage.value?.load_mode_split || []);
    const hasPersonalUsage = computed(() => Boolean(personalUsage.value?.today));
    const overviewItems = computed(() => [
      {
        label: "OCR 今日",
        value: formatNumber(health.value.daily_usage.ocr_count),
        icon: "document_scanner"
      },
      {
        label: "课表上传",
        value: formatNumber(health.value.daily_usage.upload_count),
        icon: "cloud_upload"
      },
      {
        label: "给分查询",
        value: formatNumber(health.value.daily_usage.grade_dist_query_count),
        icon: "query_stats"
      },
      {
        label: "云同步记录",
        value: formatNumber(health.value.cloud_sync.total_records),
        icon: "database"
      },
      {
        label: "最新版本人数",
        value: formatNumber(health.value.cloud_sync.latest_version_user_count),
        icon: "groups"
      },
      {
        label: "运行时长",
        value: health.value.service.uptime,
        icon: "schedule"
      }
    ]);
    const trendRows = computed(() => health.value.trend?.last_7_days || []);
    const hasTrend = computed(() => trendRows.value.length > 0);
    const versionUserCounts = computed(() => health.value.cloud_sync.version_user_counts || []);
    const hasVersionUserCounts = computed(() => versionUserCounts.value.length > 0);
    const trendMetrics = computed(() => [
      {
        key: "ocr_count",
        label: "OCR",
        color: "#2563eb",
        values: trendRows.value.map((row) => row.ocr_count)
      },
      {
        key: "upload_count",
        label: "上传",
        color: "#059669",
        values: trendRows.value.map((row) => row.upload_count)
      },
      {
        key: "grade_dist_query_count",
        label: "给分",
        color: "#d97706",
        values: trendRows.value.map((row) => row.grade_dist_query_count)
      },
      {
        key: "cloud_sync_total",
        label: "云同步",
        color: "#7c3aed",
        values: trendRows.value.map((row) => row.cloud_sync_total)
      },
      {
        key: "latest_version_user_count",
        label: "最新版本人数",
        color: "#0891b2",
        values: trendRows.value.map((row) => row.latest_version_user_count),
        axisLabelKey: "latest_version"
      }
    ]);
    const CHART_PADDING = {
      top: 10,
      right: 10,
      bottom: 20,
      left: 38
    };
    const formatAxisValue = (value) => {
      const number = toNumber(value);
      if (Math.abs(number) >= 1e4) return `${(number / 1e4).toFixed(1).replace(/\.0$/, "")}万`;
      return formatNumber(Math.round(number));
    };
    const formatAxisDate = (value) => {
      const text = String(value || "");
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.slice(5).replace("-", "/");
      return text || "-";
    };
    const formatAxisVersion = (value) => {
      const text = String(value || "").trim();
      return text || "-";
    };
    const buildTrendChart = (values, axisLabelKey = "date") => {
      const safeValues = Array.isArray(values) ? values.map((value) => toNumber(value)) : [];
      const plotWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
      const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
      if (!safeValues.length) {
        return {
          path: "",
          points: [],
          axisTicks: [],
          dateTicks: [],
          min: 0,
          max: 0
        };
      }
      const rawMin = Math.min(...safeValues);
      const rawMax = Math.max(...safeValues);
      const range = rawMax - rawMin;
      const padding = range > 0 ? range * 0.12 : Math.max(rawMax * 0.18, 1);
      const min = Math.max(0, rawMin - padding);
      const max = rawMax + padding;
      const span = Math.max(max - min, 1);
      const step = safeValues.length > 1 ? plotWidth / (safeValues.length - 1) : plotWidth;
      const points = safeValues.map((value, index) => {
        const x = CHART_PADDING.left + (safeValues.length > 1 ? index * step : plotWidth / 2);
        const y = CHART_PADDING.top + (max - value) / span * plotHeight;
        return { x, y, value };
      });
      const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
      const axisTicks = [max, min + span / 2, min].map((value) => ({
        value,
        label: formatAxisValue(value),
        y: CHART_PADDING.top + (max - value) / span * plotHeight
      }));
      const dateSource = trendRows.value;
      const formatAxisLabel = axisLabelKey === "latest_version" ? formatAxisVersion : formatAxisDate;
      const labelField = axisLabelKey === "latest_version" ? "latest_version" : "date";
      const dateTicks = points.map((point, index) => ({
        x: point.x,
        label: formatAxisLabel(dateSource[index]?.[labelField])
      })).filter((_, index) => index === 0 || index === points.length - 1);
      return {
        path,
        points,
        axisTicks,
        dateTicks,
        min,
        max
      };
    };
    const loadHealth = async ({ silent = false } = {}) => {
      if (!silent) loading.value = true;
      error.value = "";
      const seq = ++healthRequestSeq;
      let lastErr = null;
      for (let attempt = 0; attempt <= HEALTH_MAX_RETRIES; attempt++) {
        try {
          const response = await fetch(HEALTH_URL, {
            headers: { accept: "application/json" },
            cache: "no-store",
            signal: buildHealthSignal()
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const data = await response.json();
          if (seq !== healthRequestSeq) return;
          writeCachedHealth(data);
          applyHealthData(data);
          if (!silent) loading.value = false;
          return;
        } catch (err) {
          lastErr = err;
          if (attempt < HEALTH_MAX_RETRIES) {
            await new Promise((resolve) => setTimeout(resolve, HEALTH_RETRY_DELAYS[attempt] || 1500));
            if (seq !== healthRequestSeq) return;
          }
        }
      }
      if (seq !== healthRequestSeq) return;
      const cached = readCachedHealth();
      if (cached?.data) {
        applyHealthData(cached.data, cached.cachedAt);
        error.value = "读取服务状态失败，显示上次数据";
      } else {
        error.value = "读取服务状态失败";
      }
      console.warn("[ServiceStatsView] health request failed after retries", lastErr);
      if (!silent) loading.value = false;
    };
    const refreshNow = () => {
      void loadHealth();
      void loadPersonalUsage();
    };
    onMounted(() => {
      void loadHealth();
      void loadPersonalUsage();
      refreshTimer = setInterval(() => {
        void loadHealth({ silent: true });
      }, REFRESH_INTERVAL_MS);
    });
    watch(
      () => props.studentId,
      () => {
        void loadPersonalUsage();
      }
    );
    onBeforeUnmount(() => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", _hoisted_2, [
          createBaseVNode("button", {
            class: "back-button",
            type: "button",
            onClick: _cache[0] || (_cache[0] = ($event) => emit("back")),
            "aria-label": "返回"
          }, [..._cache[1] || (_cache[1] = [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)
          ])]),
          _cache[2] || (_cache[2] = createBaseVNode("div", { class: "header-copy" }, [
            createBaseVNode("span", { class: "header-kicker" }, "我的"),
            createBaseVNode("h1", null, "服务统计")
          ], -1)),
          createBaseVNode("button", {
            class: "refresh-button",
            type: "button",
            disabled: loading.value,
            onClick: refreshNow
          }, [
            createBaseVNode("span", {
              class: normalizeClass(["material-symbols-outlined", { spinning: loading.value }])
            }, "refresh", 2)
          ], 8, _hoisted_3)
        ]),
        createBaseVNode("section", _hoisted_4, [
          createBaseVNode("div", null, [
            _cache[3] || (_cache[3] = createBaseVNode("span", { class: "status-label" }, "OCR 服务", -1)),
            createBaseVNode("div", _hoisted_5, [
              createBaseVNode("span", {
                class: normalizeClass(["status-dot", statusClass.value])
              }, null, 2),
              createBaseVNode("strong", null, toDisplayString(statusText.value), 1)
            ])
          ]),
          createBaseVNode("div", _hoisted_6, [
            createBaseVNode("span", null, "版本 " + toDisplayString(displayClientVersion.value || "未知"), 1),
            createBaseVNode("span", null, "更新 " + toDisplayString(lastUpdatedAt.value || "等待中"), 1)
          ])
        ]),
        error.value ? (openBlock(), createElementBlock("p", _hoisted_7, toDisplayString(error.value), 1)) : createCommentVNode("", true),
        createBaseVNode("section", _hoisted_8, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(overviewItems.value, (item) => {
            return openBlock(), createElementBlock("article", {
              key: item.label,
              class: "metric-card"
            }, [
              createBaseVNode("span", _hoisted_9, toDisplayString(item.icon), 1),
              createBaseVNode("span", _hoisted_10, toDisplayString(item.label), 1),
              createBaseVNode("strong", _hoisted_11, toDisplayString(item.value), 1)
            ]);
          }), 128))
        ]),
        hasPersonalUsage.value ? (openBlock(), createElementBlock("section", _hoisted_12, [
          _cache[4] || (_cache[4] = createBaseVNode("div", { class: "section-title" }, [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "person"),
            createBaseVNode("h2", null, "我的使用")
          ], -1)),
          createBaseVNode("div", _hoisted_13, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(personalOverviewItems.value, (item) => {
              return openBlock(), createElementBlock("article", {
                key: item.label,
                class: "metric-card"
              }, [
                createBaseVNode("span", _hoisted_14, toDisplayString(item.icon), 1),
                createBaseVNode("span", _hoisted_15, toDisplayString(item.label), 1),
                createBaseVNode("strong", _hoisted_16, toDisplayString(item.value), 1)
              ]);
            }), 128))
          ]),
          personalUsage.value?.top_modules?.length ? (openBlock(), createElementBlock("ul", _hoisted_17, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(personalUsage.value.top_modules, (item) => {
              return openBlock(), createElementBlock("li", {
                key: item.target_id,
                class: "version-row"
              }, [
                createBaseVNode("span", _hoisted_18, toDisplayString(item.target_id), 1),
                createBaseVNode("strong", _hoisted_19, toDisplayString(formatNumber(item.open_count)) + " 次", 1)
              ]);
            }), 128))
          ])) : createCommentVNode("", true),
          personalLoadModeRows.value.length ? (openBlock(), createElementBlock("ul", _hoisted_20, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(personalLoadModeRows.value, (item) => {
              return openBlock(), createElementBlock("li", {
                key: item.load_mode,
                class: "version-row"
              }, [
                createBaseVNode("span", _hoisted_21, toDisplayString(loadModeLabel(item.load_mode)), 1),
                createBaseVNode("strong", _hoisted_22, toDisplayString(formatNumber(item.open_count)), 1)
              ]);
            }), 128))
          ])) : personalLoading.value ? (openBlock(), createElementBlock("p", _hoisted_23, "正在加载个人统计…")) : createCommentVNode("", true)
        ])) : createCommentVNode("", true),
        hasClientUsage.value ? (openBlock(), createElementBlock("section", _hoisted_24, [
          _cache[5] || (_cache[5] = createBaseVNode("div", { class: "section-title" }, [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "public"),
            createBaseVNode("h2", null, "全站试用概况")
          ], -1)),
          createBaseVNode("div", _hoisted_25, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(globalUsageOverviewItems.value, (item) => {
              return openBlock(), createElementBlock("article", {
                key: item.label,
                class: "metric-card"
              }, [
                createBaseVNode("span", _hoisted_26, toDisplayString(item.icon), 1),
                createBaseVNode("span", _hoisted_27, toDisplayString(item.label), 1),
                createBaseVNode("strong", _hoisted_28, toDisplayString(item.value), 1)
              ]);
            }), 128))
          ]),
          clientUsage.value.top_modules_today.length ? (openBlock(), createElementBlock("ul", _hoisted_29, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(clientUsage.value.top_modules_today, (item) => {
              return openBlock(), createElementBlock("li", {
                key: item.module_id,
                class: "version-row"
              }, [
                createBaseVNode("span", _hoisted_30, toDisplayString(item.module_id), 1),
                createBaseVNode("strong", _hoisted_31, toDisplayString(formatNumber(item.open_count)) + " 次", 1)
              ]);
            }), 128))
          ])) : createCommentVNode("", true),
          loadModeSplitRows.value.length ? (openBlock(), createElementBlock("ul", _hoisted_32, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(loadModeSplitRows.value, (item) => {
              return openBlock(), createElementBlock("li", {
                key: item.mode,
                class: "version-row"
              }, [
                createBaseVNode("span", _hoisted_33, toDisplayString(item.label), 1),
                createBaseVNode("strong", _hoisted_34, toDisplayString(formatNumber(item.open_count)), 1)
              ]);
            }), 128))
          ])) : createCommentVNode("", true)
        ])) : createCommentVNode("", true),
        hasVersionUserCounts.value ? (openBlock(), createElementBlock("section", _hoisted_35, [
          _cache[6] || (_cache[6] = createBaseVNode("div", { class: "section-title" }, [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "devices"),
            createBaseVNode("h2", null, "各版本人数")
          ], -1)),
          createBaseVNode("ul", _hoisted_36, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(versionUserCounts.value, (item) => {
              return openBlock(), createElementBlock("li", {
                key: item.version,
                class: "version-row"
              }, [
                createBaseVNode("span", _hoisted_37, toDisplayString(item.version), 1),
                createBaseVNode("strong", _hoisted_38, toDisplayString(formatNumber(item.user_count)), 1)
              ]);
            }), 128))
          ])
        ])) : createCommentVNode("", true),
        createBaseVNode("section", _hoisted_39, [
          _cache[8] || (_cache[8] = createBaseVNode("div", { class: "section-title" }, [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "stacked_line_chart"),
            createBaseVNode("h2", null, "近 7 天趋势")
          ], -1)),
          hasTrend.value ? (openBlock(), createElementBlock("div", _hoisted_40, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(trendMetrics.value, (metric) => {
              return openBlock(), createElementBlock("article", {
                key: metric.key,
                class: "trend-item"
              }, [
                createBaseVNode("div", _hoisted_41, [
                  createBaseVNode("span", null, toDisplayString(metric.label), 1),
                  createBaseVNode("strong", null, toDisplayString(formatNumber(metric.values[metric.values.length - 1] || 0)), 1)
                ]),
                (openBlock(), createElementBlock("svg", {
                  class: "trend-chart",
                  viewBox: `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`,
                  role: "img",
                  "aria-label": `${metric.label}趋势`
                }, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(buildTrendChart(metric.values, metric.axisLabelKey).axisTicks, (tick) => {
                    return openBlock(), createElementBlock(Fragment, {
                      key: `${metric.key}-${tick.label}`
                    }, [
                      createBaseVNode("line", {
                        class: "trend-grid-line",
                        x1: CHART_PADDING.left,
                        x2: CHART_WIDTH - CHART_PADDING.right,
                        y1: tick.y,
                        y2: tick.y
                      }, null, 8, _hoisted_43),
                      createBaseVNode("text", {
                        class: "trend-axis-label",
                        x: "4",
                        y: tick.y + 4
                      }, toDisplayString(tick.label), 9, _hoisted_44)
                    ], 64);
                  }), 128)),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(buildTrendChart(metric.values, metric.axisLabelKey).dateTicks, (tick) => {
                    return openBlock(), createElementBlock("text", {
                      key: `${metric.key}-${tick.label}`,
                      class: "trend-date-label",
                      x: tick.x,
                      y: CHART_HEIGHT - 4,
                      "text-anchor": "middle"
                    }, toDisplayString(tick.label), 9, _hoisted_45);
                  }), 128)),
                  createBaseVNode("path", {
                    d: buildTrendChart(metric.values, metric.axisLabelKey).path,
                    class: "trend-line drawTrendLine",
                    fill: "none",
                    stroke: metric.color,
                    "stroke-width": "3.5",
                    "stroke-linecap": "round",
                    "stroke-linejoin": "round",
                    pathLength: "1",
                    "stroke-dasharray": "1",
                    "stroke-dashoffset": "1"
                  }, null, 8, _hoisted_46),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(buildTrendChart(metric.values, metric.axisLabelKey).points, (point) => {
                    return openBlock(), createElementBlock("circle", {
                      key: `${metric.key}-${point.x}`,
                      class: "trend-point",
                      cx: point.x,
                      cy: point.y,
                      r: "2.8",
                      fill: metric.color
                    }, null, 8, _hoisted_47);
                  }), 128))
                ], 8, _hoisted_42))
              ]);
            }), 128))
          ])) : (openBlock(), createElementBlock("div", _hoisted_48, [..._cache[7] || (_cache[7] = [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "bar_chart_off", -1),
            createBaseVNode("p", null, "趋势数据暂不可用", -1)
          ])]))
        ])
      ]);
    };
  }
};
const ServiceStatsView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-13c7b3e9"]]);
export {
  ServiceStatsView as default
};
