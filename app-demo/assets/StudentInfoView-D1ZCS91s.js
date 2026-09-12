import { o as onMounted, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, u as unref, n as normalizeClass, d as createCommentVNode, j as createBlock, k as withCtx, K as withDirectives, R as vShow, F as Fragment, f as renderList, g as createTextVNode, r as ref, h as computed } from "./vue-core-Dzs4fLAU.js";
import { _ as _export_sfc, u as useLocale, t, f as fetchWithCache, d as axiosInstance, E as EXTRA_LONG_TTL } from "./app-demo-CUOWTnz-.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { a as isTauriRuntime, d as invokeNative } from "./runtime-bridge-Dt57BD2i.js";
import { T as TEmptyState } from "./TEmptyState-BwJ_g5G7.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "student-info-view" };
const _hoisted_2 = { class: "page-header" };
const _hoisted_3 = { class: "header-title" };
const _hoisted_4 = ["aria-label", "disabled"];
const _hoisted_5 = {
  key: 0,
  class: "offline-banner"
};
const _hoisted_6 = { class: "view-content" };
const _hoisted_7 = {
  key: 2,
  class: "panel-stack"
};
const _hoisted_8 = { class: "profile-card" };
const _hoisted_9 = { class: "profile-content" };
const _hoisted_10 = { class: "avatar-ring" };
const _hoisted_11 = { class: "avatar-circle" };
const _hoisted_12 = { class: "profile-name" };
const _hoisted_13 = { class: "profile-id" };
const _hoisted_14 = { class: "profile-badge" };
const _hoisted_15 = { class: "tab-bar" };
const _hoisted_16 = { class: "info-card" };
const _hoisted_17 = { class: "card-section-title" };
const _hoisted_18 = {
  key: 0,
  class: "inline-error"
};
const _hoisted_19 = { class: "info-grid" };
const _hoisted_20 = { class: "field-label" };
const _hoisted_21 = { class: "material-symbols-outlined field-icon" };
const _hoisted_22 = { class: "field-value" };
const _hoisted_23 = { class: "orientation-blocks" };
const _hoisted_24 = { class: "orientation-head" };
const _hoisted_25 = { class: "card-section-title orientation-title" };
const _hoisted_26 = {
  key: 0,
  class: "orientation-pill"
};
const _hoisted_27 = {
  key: 1,
  class: "orientation-pill muted"
};
const _hoisted_28 = {
  key: 0,
  class: "orientation-hint"
};
const _hoisted_29 = {
  key: 1,
  class: "inline-error"
};
const _hoisted_30 = { class: "orientation-sub" };
const _hoisted_31 = { class: "info-grid" };
const _hoisted_32 = { class: "field-label" };
const _hoisted_33 = { class: "material-symbols-outlined field-icon" };
const _hoisted_34 = { class: "field-value" };
const _hoisted_35 = { class: "orientation-sub" };
const _hoisted_36 = { class: "info-grid" };
const _hoisted_37 = { class: "field-label" };
const _hoisted_38 = { class: "material-symbols-outlined field-icon" };
const _hoisted_39 = { class: "field-value" };
const _hoisted_40 = { class: "orientation-sub" };
const _hoisted_41 = { class: "info-grid" };
const _hoisted_42 = { class: "field-label" };
const _hoisted_43 = { class: "material-symbols-outlined field-icon" };
const _hoisted_44 = { class: "field-value" };
const _hoisted_45 = {
  key: 5,
  class: "orientation-hint"
};
const _hoisted_46 = { class: "info-card" };
const _hoisted_47 = { class: "card-section-title" };
const _hoisted_48 = {
  key: 0,
  class: "inline-error"
};
const _hoisted_49 = {
  key: 1,
  class: "cache-hint"
};
const _hoisted_50 = { class: "contact-list" };
const _hoisted_51 = { class: "contact-row" };
const _hoisted_52 = { class: "contact-info" };
const _hoisted_53 = { class: "field-label" };
const _hoisted_54 = { class: "field-value" };
const _hoisted_55 = { class: "contact-row" };
const _hoisted_56 = { class: "contact-info" };
const _hoisted_57 = { class: "field-label" };
const _hoisted_58 = { class: "field-value" };
const _hoisted_59 = {
  class: "card-section-title",
  style: { "margin-top": "1rem" }
};
const _hoisted_60 = { class: "login-list" };
const _hoisted_61 = { class: "login-row" };
const _hoisted_62 = { class: "login-label" };
const _hoisted_63 = { class: "login-value" };
const _hoisted_64 = { class: "login-row" };
const _hoisted_65 = { class: "login-label" };
const _hoisted_66 = { class: "login-value" };
const _hoisted_67 = { class: "login-row" };
const _hoisted_68 = { class: "login-label" };
const _hoisted_69 = { class: "login-value" };
const _hoisted_70 = { class: "login-row" };
const _hoisted_71 = { class: "login-label" };
const _hoisted_72 = { class: "login-value" };
const _hoisted_73 = { class: "info-card" };
const _hoisted_74 = {
  key: 0,
  class: "cache-hint"
};
const _hoisted_75 = {
  key: 1,
  class: "inline-loading"
};
const _hoisted_76 = { class: "access-list" };
const _hoisted_77 = { class: "access-head" };
const _hoisted_78 = { class: "access-app-name" };
const _hoisted_79 = { class: "access-meta" };
const _hoisted_80 = { class: "access-time" };
const _hoisted_81 = { class: "pagination-bar" };
const _hoisted_82 = { class: "total-text" };
const _hoisted_83 = { class: "pager-controls" };
const _hoisted_84 = ["disabled"];
const _hoisted_85 = ["disabled", "onClick"];
const _hoisted_86 = ["disabled"];
const _sfc_main = {
  __name: "StudentInfoView",
  props: {
    studentId: { type: String, required: true }
  },
  emits: ["back", "logout"],
  setup(__props, { emit: __emit }) {
    const { locale } = useLocale();
    const tParams = (key, params) => {
      const text = t(key);
      return Object.entries(params ?? {}).reduce(
        (acc, [name, value]) => acc.replaceAll(`{{${name}}}`, String(value)),
        text
      );
    };
    const API_BASE = "/api";
    const props = __props;
    const emit = __emit;
    const loading = ref(true);
    const refreshing = ref(false);
    const accessLoading = ref(false);
    const error = ref("");
    const infoError = ref("");
    const accessError = ref("");
    const orientationError = ref("");
    const orientationNotice = ref("");
    const orientationLoading = ref(false);
    const orientationSource = ref("");
    const mentor = ref(null);
    const counselor = ref(null);
    const dorm = ref(null);
    const activeTab = ref("basic");
    const info = ref(null);
    const offline = ref(false);
    const accessOffline = ref(false);
    const accessSyncTime = ref("");
    const syncTime = ref("");
    const pageSizeOptions = [10, 20, 50];
    const accessPage = ref(1);
    const accessPageSize = ref(10);
    const loginAccess = ref({
      current_login: {},
      current_logins: [],
      app_access_records: [],
      auth_info: {
        phone_verified: false,
        phone: "-",
        email_verified: false,
        email: "-",
        password_hint: "-"
      },
      app_access_pagination: {
        page: 1,
        page_size: 10,
        total: 0,
        total_pages: 1
      }
    });
    const fieldLabels = [
      { key: "student_id", labelKey: "studentinfo.field.studentId" },
      { key: "name", labelKey: "studentinfo.field.name" },
      { key: "gender", labelKey: "studentinfo.field.gender" },
      { key: "grade", labelKey: "studentinfo.field.grade" },
      { key: "college", labelKey: "studentinfo.field.college" },
      { key: "major", labelKey: "studentinfo.field.major" },
      { key: "class_name", labelKey: "studentinfo.field.class" },
      { key: "id_number", labelKey: "studentinfo.field.idNumber" },
      { key: "ethnicity", labelKey: "studentinfo.field.ethnicity" },
      { key: "birth_date", labelKey: "studentinfo.field.birthDate" },
      { key: "phone", labelKey: "studentinfo.field.phone" },
      { key: "email", labelKey: "studentinfo.field.email" }
    ];
    const normalizeString = (value, fallback = "-") => {
      if (value === null || value === void 0) return fallback;
      const text = String(value).trim();
      return text || fallback;
    };
    const normalizeAuthResult = (value) => {
      const text = normalizeString(value, "unknown");
      const lower = text.toLowerCase();
      if (lower.includes("success") || lower.includes("pass") || lower === "ok" || text.includes("成功")) {
        return t("studentinfo.auth.success");
      }
      if (lower.includes("fail") || lower.includes("deny") || lower.includes("reject") || text.includes("失败")) {
        return t("studentinfo.auth.fail");
      }
      if (lower === "unknown") return t("studentinfo.auth.unknown");
      return text;
    };
    const normalizeLoginItem = (item) => ({
      client_ip: normalizeString(item.client_ip ?? item.clientIp ?? item.ip),
      ip_location: normalizeString(item.ip_location ?? item.ipLocation ?? item.location, t("common.unknown")),
      login_time: normalizeString(item.login_time ?? item.loginTime ?? item.last_login_time),
      browser: normalizeString(item.browser ?? item.browser_name ?? item.client_browser)
    });
    const normalizeAccessItem = (item, index) => ({
      id: `${normalizeString(item.app_name ?? item.appName ?? item.title ?? item.name, "app")}-${index}`,
      app_name: normalizeString(item.app_name ?? item.appName ?? item.title ?? item.name),
      access_time: normalizeString(item.access_time ?? item.accessTime ?? item.time),
      auth_result: normalizeAuthResult(item.auth_result ?? item.authResult ?? item.status),
      browser: normalizeString(item.browser),
      link_url: typeof item.link_url === "string" ? item.link_url : ""
    });
    const normalizeAuthInfo = (item) => ({
      phone_verified: item?.phone_verified === true || item?.phone_verified === "true" || item?.phone_verified === 1 || item?.phone_verified === "1",
      phone: normalizeString(item?.phone, "-"),
      email_verified: item?.email_verified === true || item?.email_verified === "true" || item?.email_verified === 1 || item?.email_verified === "1",
      email: normalizeString(item?.email, "-"),
      password_hint: normalizeString(item?.password_hint, "-")
    });
    const normalizePagination = (raw, fallbackTotal, fallbackPage = 1, fallbackPageSize = 10) => {
      const page = Number(raw?.page) || fallbackPage;
      const pageSize = Number(raw?.page_size ?? raw?.pageSize) || fallbackPageSize;
      const total = Number(raw?.total ?? raw?.totalCount) || fallbackTotal;
      const totalPages = Number(raw?.total_pages ?? raw?.totalPages) || Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));
      return {
        page,
        page_size: pageSize,
        total,
        total_pages: totalPages
      };
    };
    const normalizeLoginAccess = (payload, fallbackPage = 1, fallbackPageSize = 10) => {
      const data = payload && typeof payload === "object" ? payload : {};
      const listSource = Array.isArray(data.current_logins) ? data.current_logins : Array.isArray(data.login_records) ? data.login_records : [];
      const currentRaw = data.current_login && typeof data.current_login === "object" ? data.current_login : null;
      const currentLogins2 = listSource.map(normalizeLoginItem).filter((item) => item.client_ip !== "-" || item.login_time !== "-" || item.browser !== "-");
      if (currentLogins2.length === 0 && currentRaw) {
        currentLogins2.push(normalizeLoginItem(currentRaw));
      }
      const appRecordsRaw = Array.isArray(data.app_access_records) ? data.app_access_records : [];
      const appAccessRecords2 = appRecordsRaw.map((item, index) => normalizeAccessItem(item, index));
      const pagination = normalizePagination(
        data.app_access_pagination,
        appAccessRecords2.length,
        fallbackPage,
        fallbackPageSize
      );
      return {
        current_login: currentLogins2[0] || normalizeLoginItem({}),
        current_logins: currentLogins2,
        app_access_records: appAccessRecords2,
        auth_info: normalizeAuthInfo(data.auth_info || data.authInfo || {}),
        app_access_pagination: pagination
      };
    };
    const fetchStudentInfo = async (force = false) => {
      try {
        const result = await fetchWithCache(
          `studentinfo:${props.studentId}`,
          async () => {
            const res = await axiosInstance.post(`${API_BASE}/v2/student_info`, {
              student_id: props.studentId
            });
            return res.data;
          },
          EXTRA_LONG_TTL,
          { cacheOfflinePayload: true, forceRemote: force }
        );
        const data = result?.data;
        if (data?.success) {
          info.value = data.data || {};
          infoError.value = "";
          return { ...data, _fromCache: !!result?.fromCache, _stale: !!result?.stale };
        }
        infoError.value = data?.error || t("studentinfo.error.basic");
        return null;
      } catch (e) {
        infoError.value = e.response?.data?.error || t("studentinfo.error.basic");
        return null;
      }
    };
    const fetchLoginAccess = async (page = accessPage.value, pageSize = accessPageSize.value, options = {}) => {
      const normalizedPage = Math.max(1, Number(page) || 1);
      const normalizedPageSize = pageSizeOptions.includes(Number(pageSize)) ? Number(pageSize) : 10;
      const showLoading = options.showLoading !== false;
      if (showLoading) {
        accessLoading.value = true;
      }
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/student_login_access`, {
          student_id: props.studentId,
          page: normalizedPage,
          page_size: normalizedPageSize
        });
        const data = res.data;
        if (data?.success) {
          loginAccess.value = normalizeLoginAccess(data.data, normalizedPage, normalizedPageSize);
          accessError.value = "";
          const serverPage = Number(loginAccess.value.app_access_pagination?.page) || normalizedPage;
          const serverPageSize = Number(loginAccess.value.app_access_pagination?.page_size) || normalizedPageSize;
          accessPage.value = Math.max(1, serverPage);
          accessPageSize.value = pageSizeOptions.includes(serverPageSize) ? serverPageSize : 10;
          return data;
        }
        accessError.value = data?.error || t("studentinfo.error.access");
        return null;
      } catch (e) {
        accessError.value = e?.response?.data?.error || (typeof e === "string" ? e : e?.message) || t("studentinfo.error.access");
        return null;
      } finally {
        if (showLoading) {
          accessLoading.value = false;
        }
      }
    };
    const fetchOrientationBlocks = async () => {
      orientationLoading.value = true;
      orientationError.value = "";
      orientationNotice.value = "";
      try {
        if (!isTauriRuntime()) {
          orientationNotice.value = t("studentinfo.orientation.webHint");
          return null;
        }
        const res = await invokeNative("smart_orientation_profile_blocks", {});
        mentor.value = res?.mentor || null;
        counselor.value = res?.counselor || null;
        dorm.value = res?.dorm || null;
        orientationSource.value = String(res?.source || "");
        orientationNotice.value = String(res?.notice || "").trim();
        if (res?.error) {
          orientationError.value = String(res.error);
        }
        return res;
      } catch (e) {
        mentor.value = null;
        counselor.value = null;
        dorm.value = null;
        orientationError.value = String(e?.message || e || t("studentinfo.error.orientation"));
        return null;
      } finally {
        orientationLoading.value = false;
      }
    };
    const personKvRows = (person) => {
      if (!person) return [];
      return [
        { labelKey: "studentinfo.person.name", value: person.name },
        { labelKey: "studentinfo.person.staffId", value: person.staffId || person.staff_id },
        { labelKey: "studentinfo.person.college", value: person.college },
        { labelKey: "studentinfo.person.phone", value: person.phone },
        { labelKey: "studentinfo.person.email", value: person.email },
        { labelKey: "studentinfo.person.office", value: person.office },
        { labelKey: "studentinfo.person.remark", value: person.remark }
      ].filter((x) => x.value && String(x.value).trim() && String(x.value).trim() !== "-");
    };
    const dormKvRows = computed(() => {
      const d = dorm.value || {};
      return [
        { labelKey: "studentinfo.dorm.campus", value: d.campus },
        { labelKey: "studentinfo.dorm.building", value: d.building },
        { labelKey: "studentinfo.dorm.room", value: d.room },
        { labelKey: "studentinfo.dorm.bed", value: d.bed },
        { labelKey: "studentinfo.dorm.status", value: d.status },
        { labelKey: "studentinfo.dorm.remark", value: d.remark }
      ].filter((x) => x.value && String(x.value).trim() && String(x.value).trim() !== "-");
    });
    const hasOrientationBlocks = computed(
      () => !!mentor.value || !!counselor.value || !!dorm.value || dormKvRows.value.length > 0
    );
    const refreshData = async (options = {}) => {
      const force = !!options.force;
      if (force) {
        refreshing.value = true;
      } else {
        loading.value = true;
      }
      error.value = "";
      const [basicRes, accessRes] = await Promise.all([
        fetchStudentInfo(force),
        fetchLoginAccess(1, accessPageSize.value, { showLoading: false }),
        fetchOrientationBlocks()
      ]);
      const basicOffline = !!basicRes?.offline && !basicRes?._fromCache && !basicRes?._stale;
      const accessCached = !!accessRes?.offline;
      offline.value = basicOffline;
      accessOffline.value = accessCached;
      accessSyncTime.value = accessRes?.sync_time || "";
      if (offline.value) {
        if (basicOffline && basicRes?.sync_time) {
          syncTime.value = basicRes.sync_time;
        } else if (accessCached && accessRes?.sync_time) {
          syncTime.value = accessRes.sync_time;
        } else {
          syncTime.value = "";
        }
      } else {
        const timeList = [basicRes?.sync_time, accessRes?.sync_time].filter(Boolean);
        syncTime.value = timeList.length ? timeList.sort().at(-1) : "";
      }
      if (!basicRes && !accessRes) {
        error.value = t("studentinfo.error.all");
      }
      loading.value = false;
      refreshing.value = false;
    };
    const handleManualRefresh = async () => {
      if (refreshing.value) return;
      refreshing.value = true;
      try {
        await refreshData({ force: true });
      } catch {
        refreshing.value = false;
      }
    };
    const basicRows = computed(() => {
      return fieldLabels.map((item) => ({
        labelKey: item.labelKey,
        value: normalizeString(info.value?.[item.key])
      }));
    });
    const currentLogins = computed(() => {
      return Array.isArray(loginAccess.value?.current_logins) ? loginAccess.value.current_logins : [];
    });
    const authInfo = computed(() => normalizeAuthInfo(loginAccess.value?.auth_info || {}));
    const appAccessRecords = computed(() => {
      return Array.isArray(loginAccess.value?.app_access_records) ? loginAccess.value.app_access_records : [];
    });
    const accessTotal = computed(() => {
      const total = Number(loginAccess.value?.app_access_pagination?.total);
      if (Number.isFinite(total) && total >= 0) {
        return total;
      }
      return appAccessRecords.value.length;
    });
    const accessTotalPages = computed(() => {
      const totalPages = Number(loginAccess.value?.app_access_pagination?.total_pages);
      if (Number.isFinite(totalPages) && totalPages > 0) {
        return Math.max(1, totalPages);
      }
      return Math.max(1, Math.ceil(accessTotal.value / Math.max(accessPageSize.value, 1)));
    });
    const pagedAppAccessRecords = computed(() => {
      return appAccessRecords.value;
    });
    const visiblePageNumbers = computed(() => {
      const total = accessTotalPages.value;
      const current = accessPage.value;
      const windowSize = 5;
      if (total <= windowSize) {
        return Array.from({ length: total }, (_, i) => i + 1);
      }
      let start = Math.max(1, current - 2);
      let end = Math.min(total, start + windowSize - 1);
      if (end - start + 1 < windowSize) {
        start = Math.max(1, end - windowSize + 1);
      }
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    });
    const canShowContent = computed(() => {
      return !!info.value || currentLogins.value.length > 0 || appAccessRecords.value.length > 0;
    });
    const authResultClass = (text) => {
      const value = String(text || "").toLowerCase();
      if (value.includes("成功") || value.includes("success") || value.includes("pass") || value === "ok" || value === t("studentinfo.auth.success").toLowerCase()) return "success";
      if (value.includes("失败") || value.includes("fail") || value.includes("deny") || value.includes("reject") || value === t("studentinfo.auth.fail").toLowerCase()) return "fail";
      return "neutral";
    };
    const fieldIconMap = {
      student_id: "badge",
      name: "person",
      gender: "person",
      grade: "calendar_month",
      college: "school",
      major: "book",
      class_name: "groups",
      id_number: "credit_card",
      ethnicity: "diversity_3",
      birth_date: "cake",
      phone: "smartphone",
      email: "mail"
    };
    const getFieldIcon = (key) => fieldIconMap[key] || "info";
    const personFieldIcons = {
      studentinfo_person_name: "person",
      studentinfo_person_staffId: "badge",
      studentinfo_person_college: "school",
      studentinfo_person_phone: "call",
      studentinfo_person_email: "mail",
      studentinfo_person_office: "meeting_room",
      studentinfo_person_remark: "notes"
    };
    const dormFieldIcons = {
      studentinfo_dorm_campus: "map",
      studentinfo_dorm_building: "apartment",
      studentinfo_dorm_room: "door_front",
      studentinfo_dorm_bed: "bed",
      studentinfo_dorm_status: "verified_user",
      studentinfo_dorm_remark: "notes"
    };
    const getPersonFieldIcon = (labelKey) => personFieldIcons[labelKey] || "info";
    const getDormFieldIcon = (labelKey) => dormFieldIcons[labelKey] || "info";
    const setAccessPage = async (page) => {
      const total = accessTotalPages.value;
      const nextPage = Math.min(Math.max(1, page), total);
      if (nextPage === accessPage.value || accessLoading.value) {
        return;
      }
      await fetchLoginAccess(nextPage, accessPageSize.value, { showLoading: true });
    };
    onMounted(() => {
      refreshData();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", _hoisted_2, [
          createBaseVNode("button", {
            class: "header-icon-btn",
            onClick: _cache[0] || (_cache[0] = ($event) => emit("back"))
          }, [..._cache[6] || (_cache[6] = [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)
          ])]),
          createBaseVNode("h1", _hoisted_3, toDisplayString(unref(t)("studentinfo.title")), 1),
          createBaseVNode("button", {
            class: "header-icon-btn",
            type: "button",
            "aria-label": unref(t)("studentinfo.refresh"),
            disabled: refreshing.value,
            onClick: handleManualRefresh
          }, [
            createBaseVNode("span", {
              class: normalizeClass(["material-symbols-outlined", { spinning: refreshing.value }])
            }, "refresh", 2)
          ], 8, _hoisted_4)
        ]),
        offline.value ? (openBlock(), createElementBlock("div", _hoisted_5, toDisplayString(unref(t)("common.offline.prefix")) + " " + toDisplayString(unref(formatRelativeTime)(syncTime.value)), 1)) : createCommentVNode("", true),
        createBaseVNode("main", _hoisted_6, [
          loading.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 0,
            type: "loading",
            message: unref(t)("studentinfo.loading")
          }, null, 8, ["message"])) : error.value && !canShowContent.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 1,
            type: "error",
            message: error.value
          }, {
            default: withCtx(() => [
              createBaseVNode("button", {
                class: "btn-primary",
                style: { "margin-top": "12px" },
                onClick: refreshData
              }, toDisplayString(unref(t)("studentinfo.retry")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : (openBlock(), createElementBlock("div", _hoisted_7, [
            createBaseVNode("section", _hoisted_8, [
              _cache[7] || (_cache[7] = createBaseVNode("div", { class: "profile-gradient-bg" }, null, -1)),
              createBaseVNode("div", _hoisted_9, [
                createBaseVNode("div", _hoisted_10, [
                  createBaseVNode("div", _hoisted_11, toDisplayString(info.value?.name?.charAt(0) || "?"), 1)
                ]),
                createBaseVNode("h2", _hoisted_12, toDisplayString(normalizeString(info.value?.name)), 1),
                createBaseVNode("p", _hoisted_13, toDisplayString(normalizeString(info.value?.student_id)), 1),
                createBaseVNode("span", _hoisted_14, toDisplayString(unref(t)("studentinfo.badge.undergrad")), 1)
              ])
            ]),
            createBaseVNode("div", _hoisted_15, [
              createBaseVNode("button", {
                class: normalizeClass(["tab-item", { active: activeTab.value === "basic" }]),
                onClick: _cache[1] || (_cache[1] = ($event) => activeTab.value = "basic")
              }, toDisplayString(unref(t)("studentinfo.tab.basic")), 3),
              createBaseVNode("button", {
                class: normalizeClass(["tab-item", { active: activeTab.value === "login" }]),
                onClick: _cache[2] || (_cache[2] = ($event) => activeTab.value = "login")
              }, toDisplayString(unref(t)("studentinfo.tab.login")), 3),
              createBaseVNode("button", {
                class: normalizeClass(["tab-item", { active: activeTab.value === "access" }]),
                onClick: _cache[3] || (_cache[3] = ($event) => activeTab.value = "access")
              }, toDisplayString(unref(t)("studentinfo.tab.access")), 3)
            ]),
            withDirectives(createBaseVNode("section", _hoisted_16, [
              createBaseVNode("h3", _hoisted_17, toDisplayString(unref(t)("studentinfo.section.details")), 1),
              infoError.value ? (openBlock(), createElementBlock("div", _hoisted_18, toDisplayString(infoError.value), 1)) : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_19, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(basicRows.value, (row) => {
                  return openBlock(), createElementBlock("article", {
                    key: row.labelKey,
                    class: normalizeClass(["info-field", { "full-width": row.labelKey === "studentinfo.field.college" }])
                  }, [
                    createBaseVNode("span", _hoisted_20, [
                      createBaseVNode("span", _hoisted_21, toDisplayString(getFieldIcon(row.labelKey)), 1),
                      createTextVNode(" " + toDisplayString(unref(t)(row.labelKey)), 1)
                    ]),
                    createBaseVNode("span", _hoisted_22, toDisplayString(row.value), 1)
                  ], 2);
                }), 128))
              ]),
              createBaseVNode("div", _hoisted_23, [
                createBaseVNode("div", _hoisted_24, [
                  createBaseVNode("h3", _hoisted_25, toDisplayString(unref(t)("studentinfo.orientation.title")), 1),
                  orientationSource.value ? (openBlock(), createElementBlock("span", _hoisted_26, toDisplayString(orientationSource.value), 1)) : createCommentVNode("", true),
                  orientationLoading.value ? (openBlock(), createElementBlock("span", _hoisted_27, toDisplayString(unref(t)("studentinfo.orientation.syncing")), 1)) : createCommentVNode("", true)
                ]),
                orientationNotice.value ? (openBlock(), createElementBlock("p", _hoisted_28, toDisplayString(orientationNotice.value), 1)) : createCommentVNode("", true),
                orientationError.value && !hasOrientationBlocks.value ? (openBlock(), createElementBlock("p", _hoisted_29, toDisplayString(orientationError.value), 1)) : createCommentVNode("", true),
                mentor.value && personKvRows(mentor.value).length ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
                  createBaseVNode("h4", _hoisted_30, toDisplayString(unref(t)("studentinfo.orientation.mentor")), 1),
                  createBaseVNode("div", _hoisted_31, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(personKvRows(mentor.value), (row, i) => {
                      return openBlock(), createElementBlock("article", {
                        key: "mt-" + i,
                        class: "info-field"
                      }, [
                        createBaseVNode("span", _hoisted_32, [
                          createBaseVNode("span", _hoisted_33, toDisplayString(getPersonFieldIcon(row.labelKey)), 1),
                          createTextVNode(" " + toDisplayString(unref(t)(row.labelKey)), 1)
                        ]),
                        createBaseVNode("span", _hoisted_34, toDisplayString(row.value), 1)
                      ]);
                    }), 128))
                  ])
                ], 64)) : createCommentVNode("", true),
                counselor.value && personKvRows(counselor.value).length ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
                  createBaseVNode("h4", _hoisted_35, toDisplayString(unref(t)("studentinfo.orientation.counselor")), 1),
                  createBaseVNode("div", _hoisted_36, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(personKvRows(counselor.value), (row, i) => {
                      return openBlock(), createElementBlock("article", {
                        key: "cs-" + i,
                        class: "info-field"
                      }, [
                        createBaseVNode("span", _hoisted_37, [
                          createBaseVNode("span", _hoisted_38, toDisplayString(getPersonFieldIcon(row.labelKey)), 1),
                          createTextVNode(" " + toDisplayString(unref(t)(row.labelKey)), 1)
                        ]),
                        createBaseVNode("span", _hoisted_39, toDisplayString(row.value), 1)
                      ]);
                    }), 128))
                  ])
                ], 64)) : createCommentVNode("", true),
                dormKvRows.value.length ? (openBlock(), createElementBlock(Fragment, { key: 4 }, [
                  createBaseVNode("h4", _hoisted_40, toDisplayString(unref(t)("studentinfo.orientation.dorm")), 1),
                  createBaseVNode("div", _hoisted_41, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(dormKvRows.value, (row, i) => {
                      return openBlock(), createElementBlock("article", {
                        key: "dm-" + i,
                        class: "info-field"
                      }, [
                        createBaseVNode("span", _hoisted_42, [
                          createBaseVNode("span", _hoisted_43, toDisplayString(getDormFieldIcon(row.labelKey)), 1),
                          createTextVNode(" " + toDisplayString(unref(t)(row.labelKey)), 1)
                        ]),
                        createBaseVNode("span", _hoisted_44, toDisplayString(row.value), 1)
                      ]);
                    }), 128))
                  ])
                ], 64)) : createCommentVNode("", true),
                !orientationLoading.value && !hasOrientationBlocks.value && !orientationError.value ? (openBlock(), createElementBlock("p", _hoisted_45, toDisplayString(unref(t)("studentinfo.orientation.empty")), 1)) : createCommentVNode("", true)
              ])
            ], 512), [
              [vShow, activeTab.value === "basic"]
            ]),
            withDirectives(createBaseVNode("section", _hoisted_46, [
              createBaseVNode("h3", _hoisted_47, toDisplayString(unref(t)("studentinfo.tab.login")) + " & " + toDisplayString(unref(t)("studentinfo.tab.access")), 1),
              accessError.value ? (openBlock(), createElementBlock("div", _hoisted_48, toDisplayString(accessError.value), 1)) : createCommentVNode("", true),
              accessOffline.value && !accessError.value ? (openBlock(), createElementBlock("div", _hoisted_49, toDisplayString(unref(t)("studentinfo.error.cacheHintPrefix")) + " " + toDisplayString(unref(formatRelativeTime)(accessSyncTime.value)) + toDisplayString(unref(t)("studentinfo.error.cacheHintSuffix")), 1)) : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_50, [
                createBaseVNode("div", _hoisted_51, [
                  createBaseVNode("div", _hoisted_52, [
                    createBaseVNode("span", _hoisted_53, [
                      _cache[8] || (_cache[8] = createBaseVNode("span", { class: "material-symbols-outlined field-icon" }, "smartphone", -1)),
                      createTextVNode(" " + toDisplayString(unref(t)("studentinfo.contact.phone")), 1)
                    ]),
                    createBaseVNode("span", _hoisted_54, toDisplayString(authInfo.value.phone), 1)
                  ]),
                  createBaseVNode("span", {
                    class: normalizeClass(["auth-pill", authInfo.value.phone_verified ? "verified" : "unverified"])
                  }, toDisplayString(authInfo.value.phone_verified ? unref(t)("studentinfo.contact.verified") : unref(t)("studentinfo.contact.unverified")), 3)
                ]),
                createBaseVNode("div", _hoisted_55, [
                  createBaseVNode("div", _hoisted_56, [
                    createBaseVNode("span", _hoisted_57, [
                      _cache[9] || (_cache[9] = createBaseVNode("span", { class: "material-symbols-outlined field-icon" }, "mail", -1)),
                      createTextVNode(" " + toDisplayString(unref(t)("studentinfo.contact.email")), 1)
                    ]),
                    createBaseVNode("span", _hoisted_58, toDisplayString(authInfo.value.email), 1)
                  ]),
                  createBaseVNode("span", {
                    class: normalizeClass(["auth-pill", authInfo.value.email_verified ? "verified" : "unverified"])
                  }, toDisplayString(authInfo.value.email_verified ? unref(t)("studentinfo.contact.verified") : unref(t)("studentinfo.contact.unverified")), 3)
                ])
              ]),
              currentLogins.value.length === 0 ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 2,
                type: "empty",
                message: unref(t)("studentinfo.login.empty")
              }, null, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
                createBaseVNode("h3", _hoisted_59, toDisplayString(unref(t)("studentinfo.login.devices")), 1),
                createBaseVNode("div", _hoisted_60, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(currentLogins.value, (item, index) => {
                    return openBlock(), createElementBlock("article", {
                      key: `login-${index}`,
                      class: "login-card"
                    }, [
                      createBaseVNode("div", _hoisted_61, [
                        createBaseVNode("span", _hoisted_62, toDisplayString(unref(t)("studentinfo.login.clientIp")), 1),
                        createBaseVNode("span", _hoisted_63, toDisplayString(item.client_ip), 1)
                      ]),
                      createBaseVNode("div", _hoisted_64, [
                        createBaseVNode("span", _hoisted_65, toDisplayString(unref(t)("studentinfo.login.ipLocation")), 1),
                        createBaseVNode("span", _hoisted_66, toDisplayString(item.ip_location), 1)
                      ]),
                      createBaseVNode("div", _hoisted_67, [
                        createBaseVNode("span", _hoisted_68, toDisplayString(unref(t)("studentinfo.login.time")), 1),
                        createBaseVNode("span", _hoisted_69, toDisplayString(item.login_time), 1)
                      ]),
                      createBaseVNode("div", _hoisted_70, [
                        createBaseVNode("span", _hoisted_71, toDisplayString(unref(t)("studentinfo.login.browser")), 1),
                        createBaseVNode("span", _hoisted_72, toDisplayString(item.browser), 1)
                      ])
                    ]);
                  }), 128))
                ])
              ], 64))
            ], 512), [
              [vShow, activeTab.value === "login"]
            ]),
            withDirectives(createBaseVNode("section", _hoisted_73, [
              accessOffline.value && !accessLoading.value ? (openBlock(), createElementBlock("div", _hoisted_74, toDisplayString(unref(t)("studentinfo.error.cacheHintPrefix")) + " " + toDisplayString(unref(formatRelativeTime)(accessSyncTime.value)) + toDisplayString(unref(t)("studentinfo.error.cacheHintSuffix")), 1)) : createCommentVNode("", true),
              accessLoading.value ? (openBlock(), createElementBlock("div", _hoisted_75, [
                _cache[10] || (_cache[10] = createBaseVNode("div", { class: "mini-spinner" }, null, -1)),
                createBaseVNode("span", null, toDisplayString(unref(t)("studentinfo.access.loading")), 1)
              ])) : createCommentVNode("", true),
              !accessLoading.value && appAccessRecords.value.length === 0 ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 2,
                type: "empty",
                message: unref(t)("studentinfo.access.empty")
              }, null, 8, ["message"])) : appAccessRecords.value.length > 0 ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
                createBaseVNode("div", _hoisted_76, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(pagedAppAccessRecords.value, (record) => {
                    return openBlock(), createElementBlock("article", {
                      key: record.id,
                      class: "access-card"
                    }, [
                      createBaseVNode("div", _hoisted_77, [
                        createBaseVNode("h4", _hoisted_78, toDisplayString(record.app_name), 1),
                        createBaseVNode("span", {
                          class: normalizeClass(["auth-badge", authResultClass(record.auth_result)])
                        }, toDisplayString(record.auth_result), 3)
                      ]),
                      createBaseVNode("div", _hoisted_79, [
                        createBaseVNode("span", _hoisted_80, toDisplayString(record.access_time), 1)
                      ])
                    ]);
                  }), 128))
                ]),
                createBaseVNode("div", _hoisted_81, [
                  createBaseVNode("span", _hoisted_82, toDisplayString(tParams("studentinfo.access.total", { n: accessTotal.value })), 1),
                  createBaseVNode("div", _hoisted_83, [
                    createBaseVNode("button", {
                      class: "pager-btn",
                      disabled: accessPage.value <= 1 || accessLoading.value,
                      onClick: _cache[4] || (_cache[4] = ($event) => setAccessPage(accessPage.value - 1))
                    }, toDisplayString(unref(t)("studentinfo.access.prev")), 9, _hoisted_84),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(visiblePageNumbers.value, (page) => {
                      return openBlock(), createElementBlock("button", {
                        key: page,
                        class: normalizeClass(["pager-btn", { active: page === accessPage.value }]),
                        disabled: accessLoading.value,
                        onClick: ($event) => setAccessPage(page)
                      }, toDisplayString(page), 11, _hoisted_85);
                    }), 128)),
                    createBaseVNode("button", {
                      class: "pager-btn",
                      disabled: accessPage.value >= accessTotalPages.value || accessLoading.value,
                      onClick: _cache[5] || (_cache[5] = ($event) => setAccessPage(accessPage.value + 1))
                    }, toDisplayString(unref(t)("studentinfo.access.next")), 9, _hoisted_86)
                  ])
                ])
              ], 64)) : createCommentVNode("", true)
            ], 512), [
              [vShow, activeTab.value === "access"]
            ])
          ]))
        ])
      ]);
    };
  }
};
const StudentInfoView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-6909cbfd"]]);
export {
  StudentInfoView as default
};
