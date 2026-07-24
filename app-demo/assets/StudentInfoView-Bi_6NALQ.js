import { o as onMounted, c as createElementBlock, b as openBlock, d as createBaseVNode, f as createCommentVNode, a as ref, t as toDisplayString, u as unref, k as createBlock, e as computed, l as withCtx, C as withDirectives, n as normalizeClass, I as vShow, F as Fragment, i as renderList, g as createTextVNode } from "./vue-core-DdLVj9yW.js";
import { _ as _export_sfc, f as fetchWithCache, a as axiosInstance, E as EXTRA_LONG_TTL } from "./app-demo-CxKBY5JQ.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { b as isTauriRuntime, a as invokeNative } from "./runtime-bridge-apFQ0nCw.js";
import { T as TEmptyState } from "./TEmptyState-BSfdOG3N.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "student-info-view" };
const _hoisted_2 = { class: "page-header" };
const _hoisted_3 = {
  key: 0,
  class: "offline-banner"
};
const _hoisted_4 = { class: "view-content" };
const _hoisted_5 = {
  key: 2,
  class: "panel-stack"
};
const _hoisted_6 = { class: "profile-card" };
const _hoisted_7 = { class: "profile-content" };
const _hoisted_8 = { class: "avatar-ring" };
const _hoisted_9 = { class: "avatar-circle" };
const _hoisted_10 = { class: "profile-name" };
const _hoisted_11 = { class: "profile-id" };
const _hoisted_12 = { class: "tab-bar" };
const _hoisted_13 = { class: "info-card" };
const _hoisted_14 = {
  key: 0,
  class: "inline-error"
};
const _hoisted_15 = { class: "info-grid" };
const _hoisted_16 = { class: "field-label" };
const _hoisted_17 = { class: "material-symbols-outlined field-icon" };
const _hoisted_18 = { class: "field-value" };
const _hoisted_19 = { class: "orientation-blocks" };
const _hoisted_20 = { class: "orientation-head" };
const _hoisted_21 = {
  key: 0,
  class: "orientation-pill"
};
const _hoisted_22 = {
  key: 1,
  class: "orientation-pill muted"
};
const _hoisted_23 = {
  key: 0,
  class: "orientation-hint"
};
const _hoisted_24 = {
  key: 1,
  class: "inline-error"
};
const _hoisted_25 = { class: "info-grid" };
const _hoisted_26 = { class: "field-label" };
const _hoisted_27 = { class: "field-value" };
const _hoisted_28 = { class: "info-grid" };
const _hoisted_29 = { class: "field-label" };
const _hoisted_30 = { class: "field-value" };
const _hoisted_31 = { class: "info-grid" };
const _hoisted_32 = { class: "field-label" };
const _hoisted_33 = { class: "field-value" };
const _hoisted_34 = {
  key: 5,
  class: "orientation-hint"
};
const _hoisted_35 = { class: "info-card" };
const _hoisted_36 = {
  key: 0,
  class: "inline-error"
};
const _hoisted_37 = { class: "contact-list" };
const _hoisted_38 = { class: "contact-row" };
const _hoisted_39 = { class: "contact-info" };
const _hoisted_40 = { class: "field-value" };
const _hoisted_41 = { class: "contact-row" };
const _hoisted_42 = { class: "contact-info" };
const _hoisted_43 = { class: "field-value" };
const _hoisted_44 = { class: "login-list" };
const _hoisted_45 = { class: "login-row" };
const _hoisted_46 = { class: "login-value" };
const _hoisted_47 = { class: "login-row" };
const _hoisted_48 = { class: "login-value" };
const _hoisted_49 = { class: "login-row" };
const _hoisted_50 = { class: "login-value" };
const _hoisted_51 = { class: "login-row" };
const _hoisted_52 = { class: "login-value" };
const _hoisted_53 = { class: "info-card" };
const _hoisted_54 = {
  key: 0,
  class: "inline-loading"
};
const _hoisted_55 = { class: "access-list" };
const _hoisted_56 = { class: "access-head" };
const _hoisted_57 = { class: "access-app-name" };
const _hoisted_58 = { class: "access-meta" };
const _hoisted_59 = { class: "access-time" };
const _hoisted_60 = { class: "pagination-bar" };
const _hoisted_61 = { class: "total-text" };
const _hoisted_62 = { class: "pager-controls" };
const _hoisted_63 = ["disabled"];
const _hoisted_64 = ["disabled", "onClick"];
const _hoisted_65 = ["disabled"];
const _sfc_main = {
  __name: "StudentInfoView",
  props: {
    studentId: { type: String, required: true }
  },
  emits: ["back", "logout"],
  setup(__props, { emit: __emit }) {
    const API_BASE = "/api";
    const props = __props;
    const emit = __emit;
    const loading = ref(true);
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
      { key: "student_id", label: "学号" },
      { key: "name", label: "姓名" },
      { key: "gender", label: "性别" },
      { key: "grade", label: "年级" },
      { key: "college", label: "学院" },
      { key: "major", label: "专业" },
      { key: "class_name", label: "班级" },
      { key: "id_number", label: "身份证号" },
      { key: "ethnicity", label: "民族" },
      { key: "birth_date", label: "出生日期" },
      { key: "phone", label: "手机号" },
      { key: "email", label: "邮箱" }
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
        return "成功";
      }
      if (lower.includes("fail") || lower.includes("deny") || lower.includes("reject") || text.includes("失败")) {
        return "失败";
      }
      if (lower === "unknown") return "未知";
      return text;
    };
    const normalizeLoginItem = (item) => ({
      client_ip: normalizeString(item.client_ip ?? item.clientIp ?? item.ip),
      ip_location: normalizeString(item.ip_location ?? item.ipLocation ?? item.location, "未知"),
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
    const fetchStudentInfo = async () => {
      try {
        const { data } = await fetchWithCache(
          `studentinfo:${props.studentId}`,
          async () => {
            const res = await axiosInstance.post(`${API_BASE}/v2/student_info`, {
              student_id: props.studentId
            });
            return res.data;
          },
          EXTRA_LONG_TTL
        );
        if (data?.success) {
          info.value = data.data || {};
          infoError.value = "";
          return data;
        }
        infoError.value = data?.error || "获取基本信息失败";
        return null;
      } catch (e) {
        infoError.value = e.response?.data?.error || "获取基本信息失败";
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
        accessError.value = data?.error || "获取登录访问信息失败";
        return null;
      } catch (e) {
        accessError.value = e.response?.data?.error || "获取登录访问信息失败";
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
          orientationNotice.value = "客户端内可同步班导师/辅导员/宿舍";
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
        orientationError.value = String(e?.message || e || "迎新附属信息暂不可用");
        return null;
      } finally {
        orientationLoading.value = false;
      }
    };
    const personKvRows = (person) => {
      if (!person) return [];
      return [
        { label: "姓名", value: person.name },
        { label: "工号", value: person.staffId || person.staff_id },
        { label: "学院", value: person.college },
        { label: "电话", value: person.phone },
        { label: "邮箱", value: person.email },
        { label: "办公室", value: person.office },
        { label: "备注", value: person.remark }
      ].filter((x) => x.value && String(x.value).trim() && String(x.value).trim() !== "-");
    };
    const dormKvRows = computed(() => {
      const d = dorm.value || {};
      return [
        { label: "校区", value: d.campus },
        { label: "楼栋", value: d.building },
        { label: "房间", value: d.room },
        { label: "床位", value: d.bed },
        { label: "状态", value: d.status },
        { label: "备注", value: d.remark }
      ].filter((x) => x.value && String(x.value).trim() && String(x.value).trim() !== "-");
    });
    const hasOrientationBlocks = computed(
      () => !!mentor.value || !!counselor.value || !!dorm.value || dormKvRows.value.length > 0
    );
    const refreshData = async () => {
      loading.value = true;
      error.value = "";
      const [basicRes, accessRes] = await Promise.all([
        fetchStudentInfo(),
        fetchLoginAccess(1, accessPageSize.value, { showLoading: false }),
        fetchOrientationBlocks()
      ]);
      offline.value = !!(basicRes?.offline || accessRes?.offline);
      const timeList = [basicRes?.sync_time, accessRes?.sync_time].filter(Boolean);
      syncTime.value = timeList.length ? timeList.sort().at(-1) : "";
      if (!basicRes && !accessRes) {
        error.value = "个人信息与登录记录均获取失败";
      }
      loading.value = false;
    };
    const basicRows = computed(() => {
      return fieldLabels.map((item) => ({
        label: item.label,
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
      if (value.includes("成功") || value.includes("success") || value.includes("pass") || value === "ok") return "success";
      if (value.includes("失败") || value.includes("fail") || value.includes("deny") || value.includes("reject")) return "fail";
      return "neutral";
    };
    const getFieldIcon = (label) => {
      const iconMap = {
        "学号": "badge",
        "姓名": "person",
        "性别": "person",
        "年级": "calendar_month",
        "学院": "school",
        "专业": "book",
        "班级": "groups",
        "身份证号": "credit_card",
        "民族": "diversity_3",
        "出生日期": "cake",
        "手机号": "smartphone",
        "邮箱": "mail"
      };
      return iconMap[label] || "info";
    };
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
          _cache[7] || (_cache[7] = createBaseVNode("h1", { class: "header-title" }, "个人信息", -1)),
          _cache[8] || (_cache[8] = createBaseVNode("div", { class: "header-spacer" }, null, -1))
        ]),
        offline.value ? (openBlock(), createElementBlock("div", _hoisted_3, " 当前显示离线数据，更新于 " + toDisplayString(unref(formatRelativeTime)(syncTime.value)), 1)) : createCommentVNode("", true),
        createBaseVNode("main", _hoisted_4, [
          loading.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 0,
            type: "loading",
            message: "正在加载个人信息与访问记录..."
          })) : error.value && !canShowContent.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 1,
            type: "error",
            message: error.value
          }, {
            default: withCtx(() => [
              createBaseVNode("button", {
                class: "btn-primary",
                style: { "margin-top": "12px" },
                onClick: refreshData
              }, "重试")
            ]),
            _: 1
          }, 8, ["message"])) : (openBlock(), createElementBlock("div", _hoisted_5, [
            createBaseVNode("section", _hoisted_6, [
              _cache[10] || (_cache[10] = createBaseVNode("div", { class: "profile-gradient-bg" }, null, -1)),
              createBaseVNode("div", _hoisted_7, [
                createBaseVNode("div", _hoisted_8, [
                  createBaseVNode("div", _hoisted_9, toDisplayString(info.value?.name?.charAt(0) || "?"), 1)
                ]),
                createBaseVNode("h2", _hoisted_10, toDisplayString(normalizeString(info.value?.name)), 1),
                createBaseVNode("p", _hoisted_11, toDisplayString(normalizeString(info.value?.student_id)), 1),
                _cache[9] || (_cache[9] = createBaseVNode("span", { class: "profile-badge" }, "本科生", -1))
              ])
            ]),
            createBaseVNode("div", _hoisted_12, [
              createBaseVNode("button", {
                class: normalizeClass(["tab-item", { active: activeTab.value === "basic" }]),
                onClick: _cache[1] || (_cache[1] = ($event) => activeTab.value = "basic")
              }, "基本信息", 2),
              createBaseVNode("button", {
                class: normalizeClass(["tab-item", { active: activeTab.value === "login" }]),
                onClick: _cache[2] || (_cache[2] = ($event) => activeTab.value = "login")
              }, "当前登录", 2),
              createBaseVNode("button", {
                class: normalizeClass(["tab-item", { active: activeTab.value === "access" }]),
                onClick: _cache[3] || (_cache[3] = ($event) => activeTab.value = "access")
              }, "登录信息", 2)
            ]),
            withDirectives(createBaseVNode("section", _hoisted_13, [
              _cache[18] || (_cache[18] = createBaseVNode("h3", { class: "card-section-title" }, "详细信息", -1)),
              infoError.value ? (openBlock(), createElementBlock("div", _hoisted_14, toDisplayString(infoError.value), 1)) : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_15, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(basicRows.value, (row) => {
                  return openBlock(), createElementBlock("article", {
                    key: row.label,
                    class: normalizeClass(["info-field", { "full-width": row.label === "学院" }])
                  }, [
                    createBaseVNode("span", _hoisted_16, [
                      createBaseVNode("span", _hoisted_17, toDisplayString(getFieldIcon(row.label)), 1),
                      createTextVNode(" " + toDisplayString(row.label), 1)
                    ]),
                    createBaseVNode("span", _hoisted_18, toDisplayString(row.value), 1)
                  ], 2);
                }), 128))
              ]),
              createBaseVNode("div", _hoisted_19, [
                createBaseVNode("div", _hoisted_20, [
                  _cache[11] || (_cache[11] = createBaseVNode("h3", { class: "card-section-title orientation-title" }, "学工附属信息", -1)),
                  orientationSource.value ? (openBlock(), createElementBlock("span", _hoisted_21, toDisplayString(orientationSource.value), 1)) : createCommentVNode("", true),
                  orientationLoading.value ? (openBlock(), createElementBlock("span", _hoisted_22, "同步中")) : createCommentVNode("", true)
                ]),
                orientationNotice.value ? (openBlock(), createElementBlock("p", _hoisted_23, toDisplayString(orientationNotice.value), 1)) : createCommentVNode("", true),
                orientationError.value && !hasOrientationBlocks.value ? (openBlock(), createElementBlock("p", _hoisted_24, toDisplayString(orientationError.value), 1)) : createCommentVNode("", true),
                mentor.value && personKvRows(mentor.value).length ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
                  _cache[13] || (_cache[13] = createBaseVNode("h4", { class: "orientation-sub" }, "班导师", -1)),
                  createBaseVNode("div", _hoisted_25, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(personKvRows(mentor.value), (row, i) => {
                      return openBlock(), createElementBlock("article", {
                        key: "mt-" + i,
                        class: "info-field"
                      }, [
                        createBaseVNode("span", _hoisted_26, [
                          _cache[12] || (_cache[12] = createBaseVNode("span", { class: "material-symbols-outlined field-icon" }, "person", -1)),
                          createTextVNode(" " + toDisplayString(row.label), 1)
                        ]),
                        createBaseVNode("span", _hoisted_27, toDisplayString(row.value), 1)
                      ]);
                    }), 128))
                  ])
                ], 64)) : createCommentVNode("", true),
                counselor.value && personKvRows(counselor.value).length ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
                  _cache[15] || (_cache[15] = createBaseVNode("h4", { class: "orientation-sub" }, "辅导员", -1)),
                  createBaseVNode("div", _hoisted_28, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(personKvRows(counselor.value), (row, i) => {
                      return openBlock(), createElementBlock("article", {
                        key: "cs-" + i,
                        class: "info-field"
                      }, [
                        createBaseVNode("span", _hoisted_29, [
                          _cache[14] || (_cache[14] = createBaseVNode("span", { class: "material-symbols-outlined field-icon" }, "support_agent", -1)),
                          createTextVNode(" " + toDisplayString(row.label), 1)
                        ]),
                        createBaseVNode("span", _hoisted_30, toDisplayString(row.value), 1)
                      ]);
                    }), 128))
                  ])
                ], 64)) : createCommentVNode("", true),
                dormKvRows.value.length ? (openBlock(), createElementBlock(Fragment, { key: 4 }, [
                  _cache[17] || (_cache[17] = createBaseVNode("h4", { class: "orientation-sub" }, "宿舍信息", -1)),
                  createBaseVNode("div", _hoisted_31, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(dormKvRows.value, (row, i) => {
                      return openBlock(), createElementBlock("article", {
                        key: "dm-" + i,
                        class: "info-field"
                      }, [
                        createBaseVNode("span", _hoisted_32, [
                          _cache[16] || (_cache[16] = createBaseVNode("span", { class: "material-symbols-outlined field-icon" }, "apartment", -1)),
                          createTextVNode(" " + toDisplayString(row.label), 1)
                        ]),
                        createBaseVNode("span", _hoisted_33, toDisplayString(row.value), 1)
                      ]);
                    }), 128))
                  ])
                ], 64)) : createCommentVNode("", true),
                !orientationLoading.value && !hasOrientationBlocks.value && !orientationError.value ? (openBlock(), createElementBlock("p", _hoisted_34, " 暂无班导师/辅导员/宿舍信息（可能不在迎新开放时段） ")) : createCommentVNode("", true)
              ])
            ], 512), [
              [vShow, activeTab.value === "basic"]
            ]),
            withDirectives(createBaseVNode("section", _hoisted_35, [
              _cache[26] || (_cache[26] = createBaseVNode("h3", { class: "card-section-title" }, "联系方式 & 认证", -1)),
              accessError.value ? (openBlock(), createElementBlock("div", _hoisted_36, toDisplayString(accessError.value), 1)) : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_37, [
                createBaseVNode("div", _hoisted_38, [
                  createBaseVNode("div", _hoisted_39, [
                    _cache[19] || (_cache[19] = createBaseVNode("span", { class: "field-label" }, [
                      createBaseVNode("span", { class: "material-symbols-outlined field-icon" }, "smartphone"),
                      createTextVNode(" 手机号码 ")
                    ], -1)),
                    createBaseVNode("span", _hoisted_40, toDisplayString(authInfo.value.phone), 1)
                  ]),
                  createBaseVNode("span", {
                    class: normalizeClass(["auth-pill", authInfo.value.phone_verified ? "verified" : "unverified"])
                  }, toDisplayString(authInfo.value.phone_verified ? "已认证" : "未认证"), 3)
                ]),
                createBaseVNode("div", _hoisted_41, [
                  createBaseVNode("div", _hoisted_42, [
                    _cache[20] || (_cache[20] = createBaseVNode("span", { class: "field-label" }, [
                      createBaseVNode("span", { class: "material-symbols-outlined field-icon" }, "mail"),
                      createTextVNode(" 电子邮箱 ")
                    ], -1)),
                    createBaseVNode("span", _hoisted_43, toDisplayString(authInfo.value.email), 1)
                  ]),
                  createBaseVNode("span", {
                    class: normalizeClass(["auth-pill", authInfo.value.email_verified ? "verified" : "unverified"])
                  }, toDisplayString(authInfo.value.email_verified ? "已认证" : "未认证"), 3)
                ])
              ]),
              currentLogins.value.length === 0 ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 1,
                type: "empty",
                message: "暂无当前登录记录"
              })) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
                _cache[25] || (_cache[25] = createBaseVNode("h3", {
                  class: "card-section-title",
                  style: { "margin-top": "1rem" }
                }, "当前登录设备", -1)),
                createBaseVNode("div", _hoisted_44, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(currentLogins.value, (item, index) => {
                    return openBlock(), createElementBlock("article", {
                      key: `login-${index}`,
                      class: "login-card"
                    }, [
                      createBaseVNode("div", _hoisted_45, [
                        _cache[21] || (_cache[21] = createBaseVNode("span", { class: "login-label" }, "客户端IP", -1)),
                        createBaseVNode("span", _hoisted_46, toDisplayString(item.client_ip), 1)
                      ]),
                      createBaseVNode("div", _hoisted_47, [
                        _cache[22] || (_cache[22] = createBaseVNode("span", { class: "login-label" }, "IP归属地", -1)),
                        createBaseVNode("span", _hoisted_48, toDisplayString(item.ip_location), 1)
                      ]),
                      createBaseVNode("div", _hoisted_49, [
                        _cache[23] || (_cache[23] = createBaseVNode("span", { class: "login-label" }, "登录时间", -1)),
                        createBaseVNode("span", _hoisted_50, toDisplayString(item.login_time), 1)
                      ]),
                      createBaseVNode("div", _hoisted_51, [
                        _cache[24] || (_cache[24] = createBaseVNode("span", { class: "login-label" }, "浏览器", -1)),
                        createBaseVNode("span", _hoisted_52, toDisplayString(item.browser), 1)
                      ])
                    ]);
                  }), 128))
                ])
              ], 64))
            ], 512), [
              [vShow, activeTab.value === "login"]
            ]),
            withDirectives(createBaseVNode("section", _hoisted_53, [
              accessLoading.value ? (openBlock(), createElementBlock("div", _hoisted_54, [..._cache[27] || (_cache[27] = [
                createBaseVNode("div", { class: "mini-spinner" }, null, -1),
                createBaseVNode("span", null, "正在加载访问记录...", -1)
              ])])) : createCommentVNode("", true),
              !accessLoading.value && appAccessRecords.value.length === 0 ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 1,
                type: "empty",
                message: "暂无应用访问记录"
              })) : appAccessRecords.value.length > 0 ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
                createBaseVNode("div", _hoisted_55, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(pagedAppAccessRecords.value, (record) => {
                    return openBlock(), createElementBlock("article", {
                      key: record.id,
                      class: "access-card"
                    }, [
                      createBaseVNode("div", _hoisted_56, [
                        createBaseVNode("h4", _hoisted_57, toDisplayString(record.app_name), 1),
                        createBaseVNode("span", {
                          class: normalizeClass(["auth-badge", authResultClass(record.auth_result)])
                        }, toDisplayString(record.auth_result), 3)
                      ]),
                      createBaseVNode("div", _hoisted_58, [
                        createBaseVNode("span", _hoisted_59, toDisplayString(record.access_time), 1)
                      ])
                    ]);
                  }), 128))
                ]),
                createBaseVNode("div", _hoisted_60, [
                  createBaseVNode("span", _hoisted_61, "共 " + toDisplayString(accessTotal.value) + " 条", 1),
                  createBaseVNode("div", _hoisted_62, [
                    createBaseVNode("button", {
                      class: "pager-btn",
                      disabled: accessPage.value <= 1 || accessLoading.value,
                      onClick: _cache[4] || (_cache[4] = ($event) => setAccessPage(accessPage.value - 1))
                    }, "上一页", 8, _hoisted_63),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(visiblePageNumbers.value, (page) => {
                      return openBlock(), createElementBlock("button", {
                        key: page,
                        class: normalizeClass(["pager-btn", { active: page === accessPage.value }]),
                        disabled: accessLoading.value,
                        onClick: ($event) => setAccessPage(page)
                      }, toDisplayString(page), 11, _hoisted_64);
                    }), 128)),
                    createBaseVNode("button", {
                      class: "pager-btn",
                      disabled: accessPage.value >= accessTotalPages.value || accessLoading.value,
                      onClick: _cache[5] || (_cache[5] = ($event) => setAccessPage(accessPage.value + 1))
                    }, "下一页", 8, _hoisted_65)
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
const StudentInfoView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-5fae60d2"]]);
export {
  StudentInfoView as default
};
