import { a as ref, o as onMounted, c as createElementBlock, b as openBlock, q as createVNode, k as createBlock, J as createSlots, l as withCtx, e as computed, d as createBaseVNode, n as normalizeClass, u as unref, t as toDisplayString, F as Fragment, f as createCommentVNode, g as createTextVNode, i as renderList, p as withKeys, j as withModifiers, v as Teleport } from "./vue-core-DdLVj9yW.js";
import { b as isTauriRuntime, a as invokeNative, p as pushDebugLog, f as platformBridge } from "./runtime-bridge-apFQ0nCw.js";
import { _ as _export_sfc, s as showToast, o as openExternal, M as loadPortalRememberedPassword } from "./app-demo-CxKBY5JQ.js";
import { T as getChaoxingClassConfig, j as fetchRemoteConfig } from "./more-modules-CsUTdMqs.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "cx-page" };
const _hoisted_2 = ["disabled"];
const _hoisted_3 = {
  key: 0,
  class: "cx-boot"
};
const _hoisted_4 = { class: "cx-boot-text" };
const _hoisted_5 = { class: "cx-sso-label" };
const _hoisted_6 = {
  key: 1,
  class: "cx-alert",
  role: "alert"
};
const _hoisted_7 = { class: "cx-alert-text" };
const _hoisted_8 = ["disabled"];
const _hoisted_9 = { class: "cx-nimbus-head" };
const _hoisted_10 = { class: "cx-nimbus-title-row" };
const _hoisted_11 = { class: "cx-nimbus-titles" };
const _hoisted_12 = { class: "cx-nimbus-course" };
const _hoisted_13 = {
  key: 0,
  class: "cx-nimbus-sub"
};
const _hoisted_14 = {
  class: "cx-chips",
  role: "tablist",
  "aria-label": "资料筛选"
};
const _hoisted_15 = ["aria-selected", "onClick"];
const _hoisted_16 = { class: "cx-toolbar" };
const _hoisted_17 = { class: "cx-toolbar-label" };
const _hoisted_18 = { class: "cx-toolbar-meta" };
const _hoisted_19 = {
  key: 0,
  class: "cx-breadcrumb",
  "aria-label": "资料路径"
};
const _hoisted_20 = ["disabled", "onClick"];
const _hoisted_21 = {
  key: 0,
  class: "material-symbols-outlined cx-crumb-chev",
  "aria-hidden": "true"
};
const _hoisted_22 = { class: "cx-list" };
const _hoisted_23 = {
  key: 0,
  class: "cx-skeleton-list"
};
const _hoisted_24 = {
  key: 1,
  class: "cx-empty"
};
const _hoisted_25 = { class: "sub" };
const _hoisted_26 = ["onClick", "onKeydown"];
const _hoisted_27 = ["data-kind"];
const _hoisted_28 = ["src", "alt", "onError"];
const _hoisted_29 = {
  key: 1,
  class: "material-symbols-outlined fill"
};
const _hoisted_30 = { class: "cx-row-main" };
const _hoisted_31 = ["title"];
const _hoisted_32 = {
  key: 0,
  class: "cx-row-meta"
};
const _hoisted_33 = {
  key: 0,
  class: "cx-last-tag"
};
const _hoisted_34 = {
  key: 1,
  class: "cx-row-meta"
};
const _hoisted_35 = {
  key: 0,
  class: "material-symbols-outlined cx-chev"
};
const _hoisted_36 = ["disabled", "onClick"];
const _hoisted_37 = { class: "material-symbols-outlined" };
const _hoisted_38 = {
  key: 3,
  class: "cx-welcome"
};
const _hoisted_39 = { class: "cx-welcome-card" };
const _hoisted_40 = {
  key: 0,
  class: "cx-welcome-cover"
};
const _hoisted_41 = ["src"];
const _hoisted_42 = {
  key: 1,
  class: "cx-welcome-icon"
};
const _hoisted_43 = {
  key: 2,
  class: "cx-welcome-teacher"
};
const _hoisted_44 = { class: "cx-welcome-actions" };
const _hoisted_45 = {
  key: 3,
  class: "cx-welcome-note"
};
const _hoisted_46 = {
  key: 4,
  class: "cx-welcome-note"
};
const _hoisted_47 = ["aria-label"];
const _hoisted_48 = { class: "cx-preview-sheet" };
const _hoisted_49 = { class: "cx-preview-head" };
const _hoisted_50 = { class: "cx-preview-titles" };
const _hoisted_51 = { class: "cx-preview-kicker" };
const _hoisted_52 = { class: "cx-preview-title" };
const _hoisted_53 = {
  key: 0,
  class: "cx-preview-method-hint"
};
const _hoisted_54 = {
  key: 0,
  class: "cx-preview-state"
};
const _hoisted_55 = {
  key: 1,
  class: "cx-preview-state err"
};
const _hoisted_56 = { class: "cx-preview-state-actions" };
const _hoisted_57 = ["disabled"];
const _hoisted_58 = {
  key: 0,
  class: "cx-preview-warn"
};
const _hoisted_59 = {
  key: 1,
  class: "cx-preview-image-wrap"
};
const _hoisted_60 = ["src", "alt"];
const _hoisted_61 = ["src"];
const _hoisted_62 = ["src"];
const _hoisted_63 = {
  key: 4,
  class: "cx-preview-state"
};
const _hoisted_64 = {
  key: 0,
  class: "cx-preview-toolbar"
};
const _hoisted_65 = { class: "cx-preview-toolbar-inner" };
const _hoisted_66 = { class: "cx-open-method-wrap" };
const _hoisted_67 = ["disabled"];
const _hoisted_68 = { class: "cx-toolbar-btn-text" };
const _hoisted_69 = { class: "cx-toolbar-btn-sub" };
const _hoisted_70 = { class: "material-symbols-outlined cx-chev-sm" };
const _hoisted_71 = ["onClick"];
const _hoisted_72 = { class: "material-symbols-outlined" };
const _hoisted_73 = { class: "cx-open-method-item-text" };
const _hoisted_74 = { class: "name" };
const _hoisted_75 = { class: "desc" };
const _hoisted_76 = {
  key: 0,
  class: "material-symbols-outlined check"
};
const _hoisted_77 = ["disabled"];
const _hoisted_78 = ["disabled"];
const _hoisted_79 = { class: "material-symbols-outlined" };
const _hoisted_80 = { class: "cx-toolbar-btn-label only" };
const _hoisted_81 = {
  key: 0,
  class: "cx-dialog-root",
  role: "dialog",
  "aria-modal": "true",
  "aria-labelledby": "cx-join-title"
};
const _hoisted_82 = { class: "cx-dialog" };
const _hoisted_83 = ["src"];
const _hoisted_84 = {
  key: 1,
  class: "material-symbols-outlined fill"
};
const _hoisted_85 = { class: "cx-dialog-kicker" };
const _hoisted_86 = { class: "cx-dialog-course" };
const _hoisted_87 = {
  key: 0,
  class: "cx-dialog-teacher"
};
const _hoisted_88 = { class: "cx-dialog-actions" };
const _hoisted_89 = ["disabled"];
const _hoisted_90 = ["disabled"];
const LAST_CLASS_KEY = "hbu_chaoxing_class_last_v1";
const JOIN_DECLINED_KEY = "hbu_chaoxing_class_declined_v1";
const _sfc_main = {
  __name: "ChaoxingClassView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const classConfig = ref(getChaoxingClassConfig());
    const inviteCode = computed(() => String(classConfig.value?.invite_code || "").trim());
    const classMeta = computed(() => {
      const c = classConfig.value || {};
      return {
        invite_code: String(c.invite_code || "").trim(),
        course_id: String(c.course_id || "").trim(),
        clazz_id: String(c.clazz_id || "").trim(),
        course_name: String(c.course_name || "").trim(),
        teacher_name: String(c.teacher_name || "").trim(),
        cover_url: "",
        cpi: String(c.cpi || "0").trim() || "0"
      };
    });
    const defaultCpi = () => classMeta.value.cpi || "0";
    const props = __props;
    const emit = __emit;
    const loadingSso = ref(false);
    const loadingBoot = ref(true);
    const loadingJoin = ref(false);
    const loadingResources = ref(false);
    const actingId = ref("");
    const ssoReady = ref(false);
    const ssoHint = ref("");
    const error = ref("");
    const statusMsg = ref("");
    const preview = ref(null);
    const resources = ref([]);
    const activeClass = ref(null);
    const showJoinDialog = ref(false);
    const joinDeclined = ref(false);
    const needsRejoin = ref(false);
    const bootPhase = ref("init");
    const folderStack = ref([]);
    const showPreviewModal = ref(false);
    const previewModalTitle = ref("");
    const previewModalUrl = ref("");
    const previewModalLoading = ref(false);
    const previewModalError = ref("");
    const previewModalOfficial = ref(false);
    const previewDownloadUrl = ref("");
    const previewModalMode = ref("iframe");
    const previewCandidates = ref([]);
    const previewCandidateIdx = ref(0);
    const previewItem = ref(null);
    const previewOfficialUrl = ref("");
    const previewOpenMethods = ref([]);
    const previewMethodId = ref("");
    const showOpenMethodMenu = ref(false);
    const previewDownloading = ref(false);
    const filterChip = ref("all");
    const thumbFailed = ref({});
    let loadSeq = 0;
    let suppressNotJoinedUntil = 0;
    const hasTauri = isTauriRuntime();
    const courseTitle = computed(() => {
      const p = activeClass.value || preview.value;
      return String(p?.course_name || p?.courseName || "班级资料").trim();
    });
    const teacherName = computed(() => {
      const p = activeClass.value || preview.value;
      return String(p?.teacher_name || p?.teacherName || "").trim();
    });
    const coverUrl = computed(() => {
      const p = activeClass.value || preview.value;
      const raw = String(p?.cover_url || p?.coverUrl || "").trim();
      if (!raw) return "";
      if (raw.startsWith("//")) return `https:${raw}`;
      if (raw.startsWith("http://")) return `https://${raw.slice(7)}`;
      return raw;
    });
    const resourceCount = computed(() => resources.value.length);
    const isJoined = computed(() => !!(activeClass.value?.course_id && activeClass.value?.clazz_id));
    const formatErr = (e) => {
      if (!e) return "未知错误";
      if (typeof e === "string") return e;
      const msg = e?.message || e?.error || String(e);
      return String(msg || "未知错误");
    };
    const studentPayload = () => {
      const sid = String(props.studentId || "").trim();
      return sid ? { student_id: sid } : { student_id: null };
    };
    const ssoPayload = async () => {
      const base = studentPayload();
      const sid = String(props.studentId || "").trim();
      if (!sid) return { ...base, portal_password: null };
      try {
        const pwd = String(await loadPortalRememberedPassword(sid) || "").trim();
        return { ...base, portal_password: pwd || null };
      } catch {
        return { ...base, portal_password: null };
      }
    };
    const loadLastClass = () => {
      try {
        const raw = localStorage.getItem(LAST_CLASS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed?.course_id && parsed?.clazz_id) {
          const savedInvite = String(parsed.invite_code || "").trim();
          if (inviteCode.value && savedInvite !== inviteCode.value) {
            clearLastClassStorageOnly();
            return null;
          }
          activeClass.value = {
            invite_code: savedInvite || inviteCode.value,
            course_id: String(parsed.course_id),
            clazz_id: String(parsed.clazz_id),
            course_name: String(parsed.course_name || ""),
            teacher_name: String(parsed.teacher_name || ""),
            cover_url: String(parsed.cover_url || ""),
            cpi: String(parsed.cpi || defaultCpi())
          };
          return activeClass.value;
        }
      } catch {
      }
      return null;
    };
    const clearLastClassStorageOnly = () => {
      try {
        localStorage.removeItem(LAST_CLASS_KEY);
      } catch {
      }
    };
    const clearLastClass = () => {
      clearLastClassStorageOnly();
      activeClass.value = null;
      resources.value = [];
      folderStack.value = [];
    };
    const saveLastClass = (cls) => {
      try {
        localStorage.setItem(LAST_CLASS_KEY, JSON.stringify(cls));
        localStorage.removeItem(JOIN_DECLINED_KEY);
      } catch {
      }
    };
    const loadDeclined = () => {
      try {
        joinDeclined.value = localStorage.getItem(JOIN_DECLINED_KEY) === inviteCode.value;
      } catch {
        joinDeclined.value = false;
      }
    };
    const markDeclined = () => {
      joinDeclined.value = true;
      showJoinDialog.value = false;
      try {
        localStorage.setItem(JOIN_DECLINED_KEY, inviteCode.value);
      } catch {
      }
    };
    const enterNotJoinedState = async ({ openDialog = false, reason = "", rejoin = false } = {}) => {
      clearLastClass();
      needsRejoin.value = !!rejoin;
      error.value = "";
      statusMsg.value = rejoin ? reason || "你已不在该班级，请重新加入" : "";
      preview.value = { ...classMeta.value };
      bootPhase.value = "ready";
      loadingBoot.value = false;
      if (openDialog && !joinDeclined.value) {
        try {
          void fetchPreview().catch(() => {
          });
          showJoinDialog.value = true;
        } catch {
          showJoinDialog.value = true;
        }
      }
    };
    const isNotJoinedSignal = (resOrMsg) => {
      if (Date.now() < suppressNotJoinedUntil) return false;
      if (resOrMsg && typeof resOrMsg === "object") {
        const m = String(resOrMsg.membership || "").toLowerCase();
        const role = String(resOrMsg.role || "").toLowerCase();
        const ut = String(resOrMsg.ut || "").toLowerCase();
        if (m === "ok" || role === "teacher" || ut === "t") return false;
        if (m === "not_joined" || m === "not-joined") return true;
        if (resOrMsg.enrolled === false || resOrMsg.enrolled === 0 || resOrMsg.enrolled === "false") {
          return true;
        }
      }
      const msg = typeof resOrMsg === "string" ? resOrMsg : formatErr(resOrMsg);
      return /未加入|不在该班|无权限|请先加入|不是该班|未选课|已退课|退班|无权访问/.test(String(msg || ""));
    };
    const ensureSso = async () => {
      loadingSso.value = true;
      if (bootPhase.value === "init" || bootPhase.value === "sso") {
        bootPhase.value = "sso";
      }
      ssoHint.value = "正在通过门户会话接入学习通…";
      try {
        if (!hasTauri) {
          throw new Error("请在客户端内使用本功能");
        }
        const req = await ssoPayload();
        const res = await invokeNative("chaoxing_class_ensure_sso", { req });
        ssoReady.value = !!(res?.success ?? res?.sso);
        ssoHint.value = ssoReady.value ? res?.partial ? "门户会话部分可用（已可访问固定班级）" : res?.from_cache || res?.cookie_reuse ? "学习通会话已复用" : res?.silent_relogin ? "已静默续期并接入学习通" : "门户 SSO 已连接" : "会话未就绪，请重新登录门户";
        return ssoReady.value;
      } catch (e) {
        ssoReady.value = false;
        const msg = formatErr(e);
        ssoHint.value = msg;
        error.value = msg.includes("过期") || msg.includes("登录") || msg.includes("密码") ? `${msg}（教务会话可能仍可用；学习通需门户 CAS 票据或记住密码以静默续期）` : msg;
        return false;
      } finally {
        loadingSso.value = false;
      }
    };
    const fetchPreview = async () => {
      bootPhase.value = "preview";
      const code = inviteCode.value;
      if (!code) throw new Error("未配置学习通邀请码");
      const ssoReq = await ssoPayload();
      try {
        const res = await invokeNative("chaoxing_class_preview_invite", {
          req: {
            invite_code: code,
            student_id: ssoReq.student_id ?? null,
            portal_password: ssoReq.portal_password ?? null
          }
        });
        preview.value = {
          invite_code: code,
          course_id: String(res.course_id || classMeta.value.course_id || ""),
          clazz_id: String(res.clazz_id || classMeta.value.clazz_id || ""),
          course_name: String(res.course_name || classMeta.value.course_name || "班级"),
          teacher_name: String(res.teacher_name || classMeta.value.teacher_name || ""),
          cover_url: String(res.cover_url || ""),
          cpi: String(res.cpi || defaultCpi())
        };
        return preview.value;
      } catch (e) {
        const msg = formatErr(e);
        pushDebugLog("ChaoxingInvite", msg, "error", {
          invite_code_len: code.length,
          student_id: ssoReq.student_id || null,
          has_portal_password: !!ssoReq.portal_password
        });
        throw e;
      }
    };
    const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
    const refreshAfterJoin = async (cls, statusText = "加入成功") => {
      joinDeclined.value = false;
      needsRejoin.value = false;
      showJoinDialog.value = false;
      folderStack.value = [];
      resources.value = [];
      filterChip.value = "all";
      error.value = "";
      preview.value = cls;
      activeClass.value = cls;
      saveLastClass(cls);
      bootPhase.value = "ready";
      loadingBoot.value = false;
      statusMsg.value = "正在同步班级资料…";
      suppressNotJoinedUntil = Date.now() + 2e4;
      const gapsMs = [0, 500, 1e3, 1600, 2500, 3500];
      for (let i = 0; i < gapsMs.length; i++) {
        if (gapsMs[i] > 0) {
          statusMsg.value = `正在刷新资料…（${i}/${gapsMs.length - 1}）`;
          await sleepMs(gapsMs[i]);
        }
        if (!isJoined.value && cls?.course_id && cls?.clazz_id) {
          needsRejoin.value = false;
          activeClass.value = cls;
          preview.value = cls;
          saveLastClass(cls);
          bootPhase.value = "ready";
        }
        try {
          await loadResources();
        } catch {
        }
        if (resources.value.length > 0) {
          break;
        }
      }
      if (!isJoined.value && cls?.course_id && cls?.clazz_id) {
        needsRejoin.value = false;
        activeClass.value = cls;
        preview.value = cls;
        saveLastClass(cls);
        bootPhase.value = "ready";
        try {
          await loadResources();
        } catch {
        }
      }
      if (isJoined.value) {
        needsRejoin.value = false;
        error.value = "";
        statusMsg.value = resources.value.length ? `共 ${resources.value.length} 项` : statusText || "已在班级";
      }
    };
    const handleJoinConfirm = async () => {
      loadingJoin.value = true;
      error.value = "";
      statusMsg.value = "";
      try {
        const code = inviteCode.value;
        if (!code) throw new Error("未配置学习通邀请码");
        const ssoReq = await ssoPayload();
        const res = await invokeNative("chaoxing_class_accept_invite", {
          req: {
            invite_code: code,
            student_id: ssoReq.student_id ?? null,
            portal_password: ssoReq.portal_password ?? null
          }
        });
        const p = res?.preview || preview.value || {};
        const cls = {
          invite_code: code,
          course_id: String(p.course_id || preview.value?.course_id || classMeta.value.course_id || ""),
          clazz_id: String(p.clazz_id || preview.value?.clazz_id || classMeta.value.clazz_id || ""),
          course_name: String(p.course_name || preview.value?.course_name || classMeta.value.course_name || ""),
          teacher_name: String(
            p.teacher_name || preview.value?.teacher_name || classMeta.value.teacher_name || ""
          ),
          cover_url: String(p.cover_url || preview.value?.cover_url || ""),
          cpi: String(p.cpi || preview.value?.cpi || defaultCpi())
        };
        if (!cls.course_id || !cls.clazz_id) {
          throw new Error("入班成功但未返回课程信息");
        }
        await refreshAfterJoin(cls, res?.already_joined ? "你已在该班级" : "加入成功");
      } catch (e) {
        const msg = formatErr(e);
        if (msg.includes("已") && (msg.includes("加入") || msg.includes("在"))) {
          const fallback = preview.value?.course_id ? {
            ...preview.value,
            invite_code: inviteCode.value,
            cpi: String(preview.value.cpi || defaultCpi())
          } : classMeta.value.course_id ? { ...classMeta.value } : null;
          if (fallback?.course_id && fallback?.clazz_id) {
            await refreshAfterJoin(fallback, "你已在该班级");
            return;
          }
        }
        error.value = msg;
      } finally {
        loadingJoin.value = false;
      }
    };
    const reopenJoinDialog = async () => {
      error.value = "";
      joinDeclined.value = false;
      try {
        localStorage.removeItem(JOIN_DECLINED_KEY);
      } catch {
      }
      clearLastClass();
      preview.value = { ...classMeta.value };
      try {
        if (!preview.value?.course_id) await fetchPreview();
        showJoinDialog.value = true;
      } catch (e) {
        preview.value = { ...classMeta.value };
        showJoinDialog.value = true;
        error.value = formatErr(e);
      }
    };
    const currentFolder = computed(
      () => folderStack.value.length ? folderStack.value[folderStack.value.length - 1] : null
    );
    const breadcrumbLabels = computed(() => {
      const base = ["班级资料"];
      return base.concat(folderStack.value.map((f) => f.name || "文件夹"));
    });
    const mapResourceItem = (item) => {
      const name = String(item.name || "未命名");
      const file_type = String(item.file_type || item.fileType || "");
      const object_id = String(item.object_id || item.objectId || "");
      let thumbnail_url = String(item.thumbnail_url || item.thumbnailUrl || "");
      if (!thumbnail_url && object_id) {
        const t = `${file_type} ${name}`.toLowerCase();
        if (/\b(jpg|jpeg|png|gif|webp|bmp|heic)\b/.test(t)) {
          thumbnail_url = `https://p.ananas.chaoxing.com/star3/150_150c/${object_id}`;
        }
      }
      return {
        data_id: String(item.data_id || item.dataId || ""),
        name,
        file_type,
        object_id,
        size_label: String(item.size_label || item.sizeLabel || "-"),
        creator: String(item.creator || ""),
        created_at: String(item.created_at || item.createdAt || ""),
        is_folder: !!(item.is_folder ?? item.isFolder),
        folder_kind: String(item.folder_kind || item.folderKind || ""),
        download_url: String(item.download_url || item.downloadUrl || ""),
        preview_cdn_url: String(item.preview_cdn_url || item.previewCdnUrl || ""),
        thumbnail_url,
        is_downloadable: !!(item.is_downloadable ?? item.isDownloadable ?? true)
      };
    };
    const thumbKey = (item) => item.data_id || item.object_id || item.name;
    const onThumbError = (item) => {
      thumbFailed.value = { ...thumbFailed.value, [thumbKey(item)]: true };
    };
    const showThumb = (item) => !!(item.thumbnail_url && !thumbFailed.value[thumbKey(item)] && fileKind(item) === "image");
    const isTransientListError = (msg) => {
      const m = String(msg || "");
      return m.includes("网络失败") || m.includes("连接") || m.includes("超时") || m.includes("error sending") || m.includes("timed out") || m.includes("connection");
    };
    const loadResources = async (opts = {}) => {
      const rejoinOnNotJoined = opts.rejoinOnNotJoined === true;
      const cls = activeClass.value || preview.value;
      if (!cls?.course_id || !cls?.clazz_id) {
        error.value = "尚未加入班级";
        return;
      }
      const seq = ++loadSeq;
      const folderSnap = currentFolder.value ? { ...currentFolder.value } : null;
      loadingResources.value = true;
      error.value = "";
      const invokeOnce = () => invokeNative("chaoxing_class_list_resources", {
        req: {
          course_id: cls.course_id,
          clazz_id: cls.clazz_id,
          cpi: cls.cpi || defaultCpi(),
          parent_data_id: folderSnap?.parent_data_id || null,
          data_name: folderSnap?.data_name || null,
          parent_chain: folderSnap?.parent_chain || null,
          folder_kind: folderSnap?.folder_kind || null,
          ...studentPayload()
        }
      });
      const handleNotJoined = async () => {
        if (folderSnap) return false;
        await enterNotJoinedState({
          openDialog: rejoinOnNotJoined || !joinDeclined.value,
          rejoin: rejoinOnNotJoined,
          reason: rejoinOnNotJoined ? "你已不在该班级，请重新加入" : ""
        });
        return true;
      };
      try {
        let res;
        try {
          res = await invokeOnce();
        } catch (e1) {
          const msg1 = formatErr(e1);
          if (seq !== loadSeq) return;
          if (isNotJoinedSignal(msg1) && await handleNotJoined()) return;
          if (!isTransientListError(msg1)) throw e1;
          await new Promise((r) => setTimeout(r, 200));
          if (seq !== loadSeq) return;
          res = await invokeOnce();
        }
        if (seq !== loadSeq) return;
        if (isNotJoinedSignal(res) && await handleNotJoined()) return;
        if (res?.cpi && activeClass.value) {
          activeClass.value = {
            ...activeClass.value,
            cpi: String(res.cpi),
            // 记住角色，便于下载走教师 ut
            role: String(res.role || activeClass.value.role || ""),
            ut: String(res.ut || activeClass.value.ut || "s")
          };
          saveLastClass(activeClass.value);
        }
        const list = Array.isArray(res?.resources) ? res.resources : [];
        resources.value = list.map(mapResourceItem);
        bootPhase.value = "ready";
        statusMsg.value = resources.value.length ? `共 ${resources.value.length} 项` : "暂无资料";
        error.value = "";
      } catch (e) {
        if (seq !== loadSeq) return;
        const msg = formatErr(e);
        if (isNotJoinedSignal(msg) && await handleNotJoined()) return;
        error.value = isTransientListError(msg) ? `${msg}（快速进出目录时可能瞬时失败，可点重试）` : msg;
      } finally {
        if (seq === loadSeq) {
          loadingResources.value = false;
        }
      }
    };
    const openUrl = async (url) => {
      const href = String(url || "").trim();
      if (!href) {
        error.value = "链接为空";
        return;
      }
      if (/coursedata\/downloadData/i.test(href) || /mooc1\.chaoxing\.com\/coursedata\/download/i.test(href)) {
        throw new Error("该下载链接需登录会话，请使用应用内「下载」而非浏览器打开");
      }
      await openExternal(href);
    };
    const resolveAccess = async (item) => {
      const cls = activeClass.value || preview.value;
      if (!cls) throw new Error("尚未加入班级");
      return invokeNative("chaoxing_class_resolve_resource", {
        req: {
          course_id: cls.course_id,
          clazz_id: cls.clazz_id,
          data_id: item.data_id,
          object_id: item.object_id || null,
          cpi: cls.cpi || defaultCpi(),
          file_name: item.name || null,
          file_type: item.file_type || null,
          ...studentPayload()
        }
      });
    };
    const isMobileClient = () => {
      if (typeof navigator === "undefined") return false;
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "")) return true;
      try {
        return !!(window.Capacitor?.isNativePlatform?.() || window.Capacitor?.getPlatform?.());
      } catch {
        return false;
      }
    };
    const downloadWithSession = async (item, { retries = 2 } = {}) => {
      const cls = activeClass.value || preview.value;
      if (!cls) throw new Error("尚未加入班级");
      if (!hasTauri) {
        throw new Error("请在客户端内下载（浏览器环境无法携带学习通会话）");
      }
      let lastErr = null;
      for (let i = 0; i <= retries; i++) {
        try {
          const res = await invokeNative("chaoxing_class_download_resource", {
            req: {
              course_id: cls.course_id,
              clazz_id: cls.clazz_id,
              data_id: item.data_id,
              object_id: item.object_id || null,
              cpi: cls.cpi || defaultCpi(),
              file_name: item.name || null,
              ...studentPayload()
            }
          });
          const path = String(res?.path || "").trim();
          const fileUri = String(res?.file_uri || "").trim();
          const name = String(res?.file_name || item.name || "文件").trim();
          if (!path) throw new Error("下载完成但未返回保存路径");
          const mobile = !!(res?.mobile_share || isMobileClient());
          if (mobile) {
            showToast("下载完成，请选择保存位置或分享…", "success", 2400);
            const shareTarget = fileUri || path;
            try {
              const ok = await platformBridge.shareLinkOrFile(
                shareTarget,
                `保存或分享：${name}`
              );
              if (!ok) {
                showToast(`已保存，可到文件管理中查看：${name}`, "info", 4e3);
              }
            } catch (shareErr) {
              console.warn("[chaoxing] share failed:", shareErr);
              showToast(`已下载：${name}（分享面板打开失败时可到文件中查找）`, "warning", 4200);
            }
          } else {
            showToast(`已保存：${name}`, "success", 3600);
          }
          return res;
        } catch (e) {
          lastErr = e;
          const msg = formatErr(e);
          if (i < retries) {
            showToast(`下载失败，正在重试（${i + 1}/${retries}）…`, "warning", 2e3);
            await new Promise((r) => setTimeout(r, 600 * (i + 1)));
            continue;
          }
          throw new Error(msg || "下载失败");
        }
      }
      throw lastErr || new Error("下载失败");
    };
    const closePreviewModal = () => {
      showPreviewModal.value = false;
      previewModalUrl.value = "";
      previewModalError.value = "";
      previewModalTitle.value = "";
      previewDownloadUrl.value = "";
      previewModalMode.value = "iframe";
      previewCandidates.value = [];
      previewCandidateIdx.value = 0;
      previewItem.value = null;
      previewOfficialUrl.value = "";
      previewOpenMethods.value = [];
      previewMethodId.value = "";
      showOpenMethodMenu.value = false;
      previewDownloading.value = false;
    };
    const isOfficialPreviewPage = (url) => {
      const u = String(url || "").toLowerCase();
      return u.includes("objectshowpreview") || u.includes("mooc2-resource-index") || u.includes("ananas/modules") || u.includes("preview/v2");
    };
    const isLikelyDirectMedia = (url) => {
      const u = String(url || "").toLowerCase();
      if (!u || isOfficialPreviewPage(u)) return false;
      if (u.startsWith("data:image/")) return true;
      return u.includes(".jpg") || u.includes(".jpeg") || u.includes(".png") || u.includes(".gif") || u.includes(".webp") || u.includes("/star3/") || u.includes(".mp4") || u.includes(".webm") || u.includes(".m4v");
    };
    const applyPreviewCandidate = (idx) => {
      const list = previewCandidates.value;
      if (!list.length) return;
      const i = Math.max(0, Math.min(idx, list.length - 1));
      previewCandidateIdx.value = i;
      previewModalUrl.value = list[i];
    };
    const onPreviewImageError = () => {
      const next = previewCandidateIdx.value + 1;
      if (next < previewCandidates.value.length) {
        applyPreviewCandidate(next);
        return;
      }
      previewModalError.value = previewModalError.value || "图片无法加载。可切换打开方式或下载。";
    };
    const currentOpenMethod = computed(
      () => previewOpenMethods.value.find((m) => m.id === previewMethodId.value) || null
    );
    const buildOpenMethods = ({ item, mode, cands, officialUrl, downloadUrl }) => {
      const kind = fileKind(item);
      const methods = [];
      const mediaUrls = cands.filter((u) => isLikelyDirectMedia(u));
      const official = officialUrl || cands.find((u) => isOfficialPreviewPage(u)) || (mode === "iframe" ? cands[0] : "") || "";
      if (kind === "image" && mediaUrls.length) {
        methods.push({
          id: "embed-image",
          label: "内嵌图片预览",
          desc: "在应用内直接查看图片",
          icon: "image",
          kind: "embed",
          mode: "image",
          url: mediaUrls[0]
        });
      }
      if (kind === "video" && mediaUrls.length) {
        methods.push({
          id: "embed-video",
          label: "内嵌视频播放",
          desc: "在应用内播放视频",
          icon: "movie",
          kind: "embed",
          mode: "video",
          url: mediaUrls[0]
        });
      }
      if (official) {
        methods.push({
          id: "embed-official",
          label: "官方在线预览",
          desc: "学习通官方预览页（内嵌）",
          icon: "preview",
          kind: "embed",
          mode: "iframe",
          url: official
        });
      } else if (cands[0] && kind !== "image" && kind !== "video") {
        methods.push({
          id: "embed-default",
          label: "内嵌预览",
          desc: "应用内打开",
          icon: "visibility",
          kind: "embed",
          mode: "iframe",
          url: cands[0]
        });
      }
      const browserTarget = official || mediaUrls[0] || cands[0] || "";
      if (browserTarget && !String(browserTarget).startsWith("data:")) {
        methods.push({
          id: "browser-preview",
          label: "浏览器打开",
          desc: "用系统浏览器打开预览",
          icon: "open_in_browser",
          kind: "browser",
          url: browserTarget
        });
      }
      if (downloadUrl) {
        methods.push({
          id: "download",
          label: "下载",
          desc: "下载到本地查看",
          icon: "download",
          kind: "download",
          url: downloadUrl
        });
      }
      return methods;
    };
    const applyOpenMethod = async (method, { externalOnly = false } = {}) => {
      if (!method) return;
      showOpenMethodMenu.value = false;
      previewMethodId.value = method.id;
      previewModalError.value = "";
      if (method.kind === "download") {
        previewDownloading.value = true;
        try {
          const item = previewItem.value || {
            data_id: previewItem.value?.data_id,
            object_id: previewItem.value?.object_id,
            name: previewModalTitle.value
          };
          if (!previewItem.value?.data_id) {
            const url = method.url || previewDownloadUrl.value;
            if (url && !/downloadData/i.test(url)) {
              await openUrl(url);
              return;
            }
            throw new Error("缺少资料信息，无法鉴权下载");
          }
          await downloadWithSession(previewItem.value);
        } catch (e) {
          previewModalError.value = formatErr(e);
        } finally {
          previewDownloading.value = false;
        }
        return;
      }
      if (method.kind === "browser" || externalOnly) {
        const url = method.url || previewModalUrl.value;
        if (!url || String(url).startsWith("data:")) {
          previewModalError.value = "当前预览无法用浏览器打开，请改用下载";
          return;
        }
        await openUrl(url);
        return;
      }
      if (method.mode) previewModalMode.value = method.mode;
      if (method.url) {
        previewModalUrl.value = method.url;
        if (method.mode === "image") {
          const rest = previewCandidates.value.filter((u) => u !== method.url);
          previewCandidates.value = [method.url, ...rest];
          previewCandidateIdx.value = 0;
        }
      }
    };
    const toggleOpenMethodMenu = () => {
      if (previewModalLoading.value) return;
      showOpenMethodMenu.value = !showOpenMethodMenu.value;
    };
    const handlePreviewDownload = async () => {
      if (!previewItem.value?.data_id) {
        previewModalError.value = "暂无下载资料";
        return;
      }
      previewDownloading.value = true;
      try {
        await downloadWithSession(previewItem.value);
      } catch (e) {
        previewModalError.value = formatErr(e);
      } finally {
        previewDownloading.value = false;
      }
    };
    const handleBrowserOpenCurrent = async () => {
      const m = previewOpenMethods.value.find((x) => x.kind === "browser") || previewOpenMethods.value.find((x) => x.kind === "embed" && x.url && !String(x.url).startsWith("data:"));
      if (m) {
        await applyOpenMethod({ ...m, kind: "browser" });
        return;
      }
      if (previewModalUrl.value && !String(previewModalUrl.value).startsWith("data:")) {
        await openUrl(previewModalUrl.value);
      } else {
        previewModalError.value = "当前无可在浏览器打开的链接";
      }
    };
    const handleOpenFolder = async (item) => {
      if (!item?.is_folder) return;
      const kind = item.folder_kind || (item.file_type === "tch-courseware" ? "tch-courseware" : "afolder");
      folderStack.value = [
        ...folderStack.value,
        {
          name: item.name || "文件夹",
          parent_data_id: item.data_id || "0",
          folder_kind: kind,
          data_name: item.name || "",
          parent_chain: folderStack.value.map((f) => f.parent_data_id).filter((id) => id && id !== "0").join(",")
        }
      ];
      filterChip.value = "all";
      await loadResources();
    };
    const handleBreadcrumb = async (index) => {
      if (index <= 0) {
        folderStack.value = [];
      } else {
        folderStack.value = folderStack.value.slice(0, index);
      }
      filterChip.value = "all";
      await loadResources();
    };
    const handlePreviewResource = async (item) => {
      if (item.is_folder) {
        await handleOpenFolder(item);
        return;
      }
      error.value = "";
      actingId.value = `p-${item.data_id}`;
      previewItem.value = item;
      previewModalTitle.value = item.name;
      previewModalLoading.value = true;
      previewModalError.value = "";
      previewModalUrl.value = "";
      previewModalOfficial.value = false;
      previewModalMode.value = fileKind(item) === "image" ? "image" : "iframe";
      previewCandidates.value = [];
      previewCandidateIdx.value = 0;
      previewDownloadUrl.value = item.download_url || "";
      previewOfficialUrl.value = "";
      previewOpenMethods.value = [];
      previewMethodId.value = "";
      showOpenMethodMenu.value = false;
      showPreviewModal.value = true;
      try {
        const res = await resolveAccess(item);
        const url = String(res?.preview_url || "").trim();
        const official = !!(res?.official_preview ?? res?.embeddable);
        const mode = String(res?.preview_mode || previewModalMode.value || "iframe").toLowerCase();
        const cands = Array.isArray(res?.preview_candidates) ? res.preview_candidates.map((u) => String(u || "").trim()).filter(Boolean) : [];
        if (url && !cands.includes(url)) cands.unshift(url);
        if ((mode === "image" || fileKind(item) === "image") && item.object_id) {
          for (const u of [
            item.thumbnail_url,
            `https://p.ananas.chaoxing.com/star3/400_400c/${item.object_id}`,
            `https://p.ananas.chaoxing.com/star3/origin/${item.object_id}`
          ]) {
            const s = String(u || "").trim();
            if (s && !cands.includes(s)) cands.push(s);
          }
        }
        const dl = String(res?.download_url || item.download_url || "");
        previewDownloadUrl.value = dl;
        previewModalOfficial.value = official;
        previewModalMode.value = mode === "image" || mode === "video" ? mode : "iframe";
        previewCandidates.value = cands;
        const officialFromCands = cands.find((u) => isOfficialPreviewPage(u)) || "";
        previewOfficialUrl.value = officialFromCands || (isOfficialPreviewPage(url) ? url : "") || "";
        const methods = buildOpenMethods({
          item,
          mode: previewModalMode.value,
          cands,
          officialUrl: previewOfficialUrl.value,
          downloadUrl: dl
        });
        previewOpenMethods.value = methods;
        if (!cands.length && !url && !dl) throw new Error("未获取到预览或下载地址");
        const defaultEmbed = methods.find((m) => m.kind === "embed") || methods.find((m) => m.kind === "download");
        if (defaultEmbed?.kind === "embed") {
          await applyOpenMethod(defaultEmbed);
        } else if (cands.length) {
          applyPreviewCandidate(0);
          previewMethodId.value = methods[0]?.id || "";
        } else if (dl) {
          previewMethodId.value = methods.find((m) => m.kind === "download")?.id || "";
          previewModalError.value = "暂无法内嵌预览，请下载或切换打开方式";
        }
        if (previewModalUrl.value.includes("star3/origin") && mode !== "image") {
          previewModalError.value = "未拿到签名预览，CDN 直链可能无权限。可切换打开方式或下载。";
        }
      } catch (e) {
        previewModalError.value = formatErr(e);
        if (previewDownloadUrl.value || item.download_url) {
          previewOpenMethods.value = buildOpenMethods({
            item,
            mode: "iframe",
            cands: [],
            officialUrl: "",
            downloadUrl: previewDownloadUrl.value || item.download_url
          });
        }
      } finally {
        previewModalLoading.value = false;
        actingId.value = "";
      }
    };
    const handleDownloadResource = async (item) => {
      error.value = "";
      actingId.value = `d-${item.data_id}`;
      try {
        await downloadWithSession(item);
      } catch (e) {
        error.value = formatErr(e);
      } finally {
        actingId.value = "";
      }
    };
    const handleRowClick = async (item) => {
      if (item.is_folder) {
        await handleOpenFolder(item);
      } else {
        await handlePreviewResource(item);
      }
    };
    const fileKind = (item) => {
      if (item.is_folder || item.folder_kind === "tch-courseware" || item.folder_kind === "afolder") {
        return item.folder_kind === "tch-courseware" ? "courseware" : "folder";
      }
      const t = `${item.file_type} ${item.name}`.toLowerCase();
      if (/\b(mp4|mov|avi|mkv|webm)\b/.test(t) || t.endsWith(".mp4")) return "video";
      if (/\b(jpg|jpeg|png|gif|webp|bmp)\b/.test(t)) return "image";
      if (/\bpdf\b/.test(t)) return "pdf";
      if (/\b(ppt|pptx)\b/.test(t)) return "ppt";
      if (/\b(doc|docx)\b/.test(t)) return "doc";
      if (/\b(xls|xlsx)\b/.test(t)) return "xls";
      if (/\b(zip|rar|7z)\b/.test(t)) return "zip";
      return "file";
    };
    const kindMeta = {
      folder: { icon: "folder", label: "文件夹", chip: "folder" },
      courseware: { icon: "folder_special", label: "教师课件", chip: "folder" },
      video: { icon: "movie", label: "视频", chip: "video" },
      image: { icon: "image", label: "图片", chip: "image" },
      pdf: { icon: "picture_as_pdf", label: "PDF", chip: "doc" },
      ppt: { icon: "slideshow", label: "演示", chip: "doc" },
      doc: { icon: "description", label: "文档", chip: "doc" },
      xls: { icon: "table_chart", label: "表格", chip: "doc" },
      zip: { icon: "folder_zip", label: "压缩包", chip: "all" },
      file: { icon: "draft", label: "文件", chip: "all" }
    };
    const filterChips = [
      { id: "all", label: "全部" },
      { id: "folder", label: "文件夹" },
      { id: "image", label: "图片" },
      { id: "video", label: "视频" },
      { id: "doc", label: "文档" }
    ];
    const filteredResources = computed(() => {
      const list = resources.value;
      const chip = filterChip.value;
      if (chip === "all") return list;
      return list.filter((item) => {
        const k = fileKind(item);
        const meta = kindMeta[k] || kindMeta.file;
        return meta.chip === chip;
      });
    });
    const metaLine = (item) => {
      const parts = [];
      if (item.created_at) parts.push(item.created_at);
      if (item.size_label && item.size_label !== "-") parts.push(item.size_label);
      return parts.join(" · ");
    };
    const boot = async () => {
      loadingBoot.value = true;
      error.value = "";
      needsRejoin.value = false;
      try {
        const remote = await fetchRemoteConfig({ force: false }).catch(() => null);
        classConfig.value = getChaoxingClassConfig(remote || void 0);
      } catch {
        classConfig.value = getChaoxingClassConfig();
      }
      loadDeclined();
      const saved = loadLastClass();
      if (saved) {
        activeClass.value = saved;
        bootPhase.value = "ready";
        loadingBoot.value = false;
        ssoHint.value = "正在连接学习通会话…";
        statusMsg.value = "正在加载资料…";
        const ssoPromise = ensureSso();
        try {
          await loadResources({ rejoinOnNotJoined: true });
        } catch (e) {
          const msg = formatErr(e);
          if (isNotJoinedSignal(msg)) {
            await enterNotJoinedState({
              openDialog: true,
              rejoin: true,
              reason: "你已不在该班级，请重新加入"
            });
          } else {
            error.value = msg;
          }
        }
        const ssoOk2 = await ssoPromise;
        if (!ssoOk2 && resources.value.length === 0) {
          bootPhase.value = "error";
          if (!error.value && ssoHint.value) {
            error.value = ssoHint.value;
          }
        }
        return;
      }
      bootPhase.value = "sso";
      ssoHint.value = "正在连接学习通会话…";
      const ssoOk = await ensureSso();
      if (!ssoOk) {
        bootPhase.value = "error";
        loadingBoot.value = false;
        return;
      }
      activeClass.value = null;
      resources.value = [];
      error.value = "";
      needsRejoin.value = false;
      bootPhase.value = "preview";
      try {
        const p = await fetchPreview();
        preview.value = p;
        activeClass.value = { ...p };
        bootPhase.value = "ready";
        loadingBoot.value = false;
        await loadResources({ rejoinOnNotJoined: false });
        if (isJoined.value) {
          saveLastClass(activeClass.value);
          statusMsg.value = resources.value.length ? `共 ${resources.value.length} 项` : "已可访问班级资料";
          return;
        }
        preview.value = p;
        if (!joinDeclined.value) {
          showJoinDialog.value = true;
        }
        bootPhase.value = "ready";
      } catch (e) {
        activeClass.value = null;
        preview.value = { ...classMeta.value, invite_code: inviteCode.value };
        bootPhase.value = "ready";
        loadingBoot.value = false;
        if (!joinDeclined.value) {
          showJoinDialog.value = true;
        }
        statusMsg.value = formatErr(e);
      }
    };
    onMounted(() => {
      void boot();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: "学习通",
          icon: "menu_book",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, createSlots({ _: 2 }, [
          isJoined.value ? {
            name: "actions",
            fn: withCtx(() => [
              createBaseVNode("button", {
                type: "button",
                class: "cx-icon-btn",
                disabled: loadingResources.value,
                title: "刷新资料",
                onClick: loadResources
              }, [
                createBaseVNode("span", {
                  class: normalizeClass(["material-symbols-outlined", { spin: loadingResources.value }])
                }, "refresh", 2)
              ], 8, _hoisted_2)
            ]),
            key: "0"
          } : void 0
        ]), 1024),
        loadingBoot.value ? (openBlock(), createElementBlock("div", _hoisted_3, [
          _cache[6] || (_cache[6] = createBaseVNode("div", { class: "cx-spinner" }, null, -1)),
          createBaseVNode("p", _hoisted_4, toDisplayString(bootPhase.value === "sso" ? "正在连接学习通会话…" : bootPhase.value === "preview" ? "正在获取班级信息…" : "首次进入需完成门户 SSO，请稍候…"), 1),
          _cache[7] || (_cache[7] = createBaseVNode("p", { class: "cx-boot-sub" }, "通过校园门户 SSO 接入，无需学习通密码", -1))
        ])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
          !ssoReady.value || ssoHint.value ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: normalizeClass(["cx-sso-chip", { ok: ssoReady.value, bad: !ssoReady.value }]),
            role: "status"
          }, [
            _cache[8] || (_cache[8] = createBaseVNode("span", { class: "cx-sso-dot" }, null, -1)),
            createBaseVNode("span", _hoisted_5, toDisplayString(ssoReady.value ? ssoHint.value || "门户已连接" : ssoHint.value || "会话异常"), 1),
            !ssoReady.value ? (openBlock(), createElementBlock("button", {
              key: 0,
              type: "button",
              class: "cx-link-btn",
              onClick: boot
            }, "重试")) : createCommentVNode("", true),
            !ssoReady.value ? (openBlock(), createElementBlock("button", {
              key: 1,
              type: "button",
              class: "cx-link-btn",
              onClick: _cache[1] || (_cache[1] = ($event) => emit("back"))
            }, "去登录")) : createCommentVNode("", true)
          ], 2)) : createCommentVNode("", true),
          error.value ? (openBlock(), createElementBlock("div", _hoisted_6, [
            createBaseVNode("p", _hoisted_7, toDisplayString(error.value), 1),
            isJoined.value ? (openBlock(), createElementBlock("button", {
              key: 0,
              type: "button",
              class: "cx-btn secondary sm",
              disabled: loadingResources.value,
              onClick: loadResources
            }, " 重试加载 ", 8, _hoisted_8)) : createCommentVNode("", true)
          ])) : createCommentVNode("", true),
          isJoined.value ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
            createBaseVNode("header", _hoisted_9, [
              createBaseVNode("div", _hoisted_10, [
                createBaseVNode("div", _hoisted_11, [
                  createBaseVNode("h2", _hoisted_12, [
                    createTextVNode(toDisplayString(courseTitle.value) + " ", 1),
                    _cache[9] || (_cache[9] = createBaseVNode("span", { class: "material-symbols-outlined cx-drop" }, "arrow_drop_down", -1))
                  ]),
                  teacherName.value ? (openBlock(), createElementBlock("p", _hoisted_13, toDisplayString(teacherName.value) + " · " + toDisplayString(statusMsg.value || `${resourceCount.value} 项`), 1)) : createCommentVNode("", true)
                ])
              ]),
              createBaseVNode("div", _hoisted_14, [
                (openBlock(), createElementBlock(Fragment, null, renderList(filterChips, (chip) => {
                  return createBaseVNode("button", {
                    key: chip.id,
                    type: "button",
                    role: "tab",
                    class: normalizeClass(["cx-chip", { active: filterChip.value === chip.id }]),
                    "aria-selected": filterChip.value === chip.id,
                    onClick: ($event) => filterChip.value = chip.id
                  }, toDisplayString(chip.label), 11, _hoisted_15);
                }), 64))
              ]),
              createBaseVNode("div", _hoisted_16, [
                createBaseVNode("span", _hoisted_17, [
                  createTextVNode(toDisplayString(currentFolder.value?.name || "智能排序") + " ", 1),
                  _cache[10] || (_cache[10] = createBaseVNode("span", { class: "material-symbols-outlined" }, "expand_more", -1))
                ]),
                createBaseVNode("span", _hoisted_18, toDisplayString(filteredResources.value.length) + " 项", 1)
              ]),
              folderStack.value.length ? (openBlock(), createElementBlock("nav", _hoisted_19, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(breadcrumbLabels.value, (label, idx) => {
                  return openBlock(), createElementBlock("button", {
                    key: `${idx}-${label}`,
                    type: "button",
                    class: normalizeClass(["cx-crumb", { current: idx === breadcrumbLabels.value.length - 1 }]),
                    disabled: idx === breadcrumbLabels.value.length - 1 || loadingResources.value,
                    onClick: ($event) => handleBreadcrumb(idx)
                  }, [
                    createTextVNode(toDisplayString(label) + " ", 1),
                    idx < breadcrumbLabels.value.length - 1 ? (openBlock(), createElementBlock("span", _hoisted_21, "chevron_right")) : createCommentVNode("", true)
                  ], 10, _hoisted_20);
                }), 128))
              ])) : createCommentVNode("", true)
            ]),
            createBaseVNode("main", _hoisted_22, [
              loadingResources.value ? (openBlock(), createElementBlock("div", _hoisted_23, [
                (openBlock(), createElementBlock(Fragment, null, renderList(5, (n) => {
                  return createBaseVNode("div", {
                    key: n,
                    class: "cx-skeleton-row"
                  });
                }), 64))
              ])) : !filteredResources.value.length ? (openBlock(), createElementBlock("div", _hoisted_24, [
                _cache[11] || (_cache[11] = createBaseVNode("span", { class: "material-symbols-outlined" }, "folder_off", -1)),
                _cache[12] || (_cache[12] = createBaseVNode("p", null, "暂无资料", -1)),
                createBaseVNode("p", _hoisted_25, toDisplayString(filterChip.value !== "all" ? "当前筛选下没有内容" : currentFolder.value ? "此文件夹为空" : "教师上传后将显示在这里"), 1),
                folderStack.value.length ? (openBlock(), createElementBlock("button", {
                  key: 0,
                  type: "button",
                  class: "cx-btn secondary",
                  onClick: _cache[2] || (_cache[2] = ($event) => handleBreadcrumb(folderStack.value.length - 1))
                }, " 返回上级 ")) : createCommentVNode("", true)
              ])) : (openBlock(true), createElementBlock(Fragment, { key: 2 }, renderList(filteredResources.value, (item) => {
                return openBlock(), createElementBlock("article", {
                  key: item.data_id || item.name + item.folder_kind,
                  class: normalizeClass(["cx-row", { folder: item.is_folder }]),
                  role: "button",
                  tabindex: "0",
                  onClick: ($event) => handleRowClick(item),
                  onKeydown: withKeys(withModifiers(($event) => handleRowClick(item), ["prevent"]), ["enter"])
                }, [
                  createBaseVNode("div", {
                    class: "cx-thumb",
                    "data-kind": fileKind(item)
                  }, [
                    showThumb(item) ? (openBlock(), createElementBlock("img", {
                      key: 0,
                      class: "cx-thumb-img",
                      src: item.thumbnail_url,
                      alt: item.name,
                      loading: "lazy",
                      referrerpolicy: "no-referrer",
                      onError: ($event) => onThumbError(item)
                    }, null, 40, _hoisted_28)) : (openBlock(), createElementBlock("span", _hoisted_29, toDisplayString(kindMeta[fileKind(item)].icon), 1))
                  ], 8, _hoisted_27),
                  createBaseVNode("div", _hoisted_30, [
                    createBaseVNode("h3", {
                      class: "cx-row-name",
                      title: item.name
                    }, toDisplayString(item.name), 9, _hoisted_31),
                    metaLine(item) ? (openBlock(), createElementBlock("p", _hoisted_32, [
                      fileKind(item) === "image" || fileKind(item) === "video" ? (openBlock(), createElementBlock("span", _hoisted_33, toDisplayString(kindMeta[fileKind(item)].label), 1)) : createCommentVNode("", true),
                      createTextVNode(" " + toDisplayString(metaLine(item)), 1)
                    ])) : item.is_folder ? (openBlock(), createElementBlock("p", _hoisted_34, toDisplayString(kindMeta[fileKind(item)].label), 1)) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("div", {
                    class: "cx-row-trail",
                    onClick: _cache[3] || (_cache[3] = withModifiers(() => {
                    }, ["stop"]))
                  }, [
                    item.is_folder ? (openBlock(), createElementBlock("span", _hoisted_35, "chevron_right")) : (openBlock(), createElementBlock("button", {
                      key: 1,
                      type: "button",
                      class: "cx-trail-btn",
                      disabled: !!actingId.value,
                      title: "下载",
                      onClick: ($event) => handleDownloadResource(item)
                    }, [
                      createBaseVNode("span", _hoisted_37, toDisplayString(actingId.value === `d-${item.data_id}` ? "progress_activity" : "download"), 1)
                    ], 8, _hoisted_36))
                  ])
                ], 42, _hoisted_26);
              }), 128)),
              _cache[13] || (_cache[13] = createBaseVNode("p", { class: "cx-secure-note" }, [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "verified_user"),
                createTextVNode(" 学习通资料经门户 SSO 安全访问 ")
              ], -1))
            ])
          ], 64)) : (openBlock(), createElementBlock("section", _hoisted_38, [
            createBaseVNode("div", _hoisted_39, [
              _cache[15] || (_cache[15] = createBaseVNode("div", { class: "cx-welcome-badge" }, "班级资料库", -1)),
              coverUrl.value ? (openBlock(), createElementBlock("div", _hoisted_40, [
                createBaseVNode("img", {
                  src: coverUrl.value,
                  alt: ""
                }, null, 8, _hoisted_41)
              ])) : (openBlock(), createElementBlock("div", _hoisted_42, [..._cache[14] || (_cache[14] = [
                createBaseVNode("span", { class: "material-symbols-outlined fill" }, "cloud", -1)
              ])])),
              createBaseVNode("h2", null, toDisplayString(courseTitle.value || "学习通班级"), 1),
              teacherName.value ? (openBlock(), createElementBlock("p", _hoisted_43, "任课教师 · " + toDisplayString(teacherName.value), 1)) : createCommentVNode("", true),
              _cache[16] || (_cache[16] = createBaseVNode("p", { class: "cx-welcome-desc" }, " 本模块提供班级课件与资料的预览、下载。邀请码由管理员远程配置，加入时无需手填。 ", -1)),
              createBaseVNode("div", _hoisted_44, [
                createBaseVNode("button", {
                  type: "button",
                  class: "cx-btn primary lg",
                  onClick: reopenJoinDialog
                }, toDisplayString(needsRejoin.value ? "重新加入班级" : "加入班级并查看资料"), 1)
              ]),
              needsRejoin.value ? (openBlock(), createElementBlock("p", _hoisted_45, toDisplayString(statusMsg.value || "检测到你已不在该班级，可重新加入后查看资料。"), 1)) : joinDeclined.value ? (openBlock(), createElementBlock("p", _hoisted_46, "你之前选择了暂不加入，可随时再次加入。")) : createCommentVNode("", true)
            ])
          ]))
        ], 64)),
        (openBlock(), createBlock(Teleport, { to: "body" }, [
          showPreviewModal.value ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "cx-preview-root",
            role: "dialog",
            "aria-modal": "true",
            "aria-label": previewModalTitle.value || "资料预览"
          }, [
            createBaseVNode("div", {
              class: "cx-preview-backdrop",
              onClick: closePreviewModal
            }),
            createBaseVNode("div", _hoisted_48, [
              createBaseVNode("header", _hoisted_49, [
                createBaseVNode("div", _hoisted_50, [
                  createBaseVNode("p", _hoisted_51, toDisplayString(previewModalOfficial.value ? "学习通官方预览" : "资料预览"), 1),
                  createBaseVNode("h3", _hoisted_52, toDisplayString(previewModalTitle.value), 1),
                  currentOpenMethod.value ? (openBlock(), createElementBlock("p", _hoisted_53, " 当前：" + toDisplayString(currentOpenMethod.value.label), 1)) : createCommentVNode("", true)
                ]),
                createBaseVNode("div", { class: "cx-preview-head-actions" }, [
                  createBaseVNode("button", {
                    type: "button",
                    class: "cx-icon-btn",
                    "aria-label": "关闭",
                    onClick: closePreviewModal
                  }, [..._cache[17] || (_cache[17] = [
                    createBaseVNode("span", { class: "material-symbols-outlined" }, "close", -1)
                  ])])
                ])
              ]),
              createBaseVNode("div", {
                class: "cx-preview-body",
                onClick: _cache[4] || (_cache[4] = ($event) => showOpenMethodMenu.value = false)
              }, [
                previewModalLoading.value ? (openBlock(), createElementBlock("div", _hoisted_54, [..._cache[18] || (_cache[18] = [
                  createBaseVNode("div", { class: "cx-spinner" }, null, -1),
                  createBaseVNode("p", null, "正在获取预览…", -1)
                ])])) : previewModalError.value && !previewModalUrl.value ? (openBlock(), createElementBlock("div", _hoisted_55, [
                  _cache[19] || (_cache[19] = createBaseVNode("span", { class: "material-symbols-outlined" }, "error", -1)),
                  createBaseVNode("p", null, toDisplayString(previewModalError.value), 1),
                  createBaseVNode("div", _hoisted_56, [
                    createBaseVNode("button", {
                      type: "button",
                      class: "cx-btn secondary",
                      onClick: withModifiers(toggleOpenMethodMenu, ["stop"])
                    }, " 切换打开方式 "),
                    previewDownloadUrl.value || previewOpenMethods.value.some((m) => m.kind === "download") ? (openBlock(), createElementBlock("button", {
                      key: 0,
                      type: "button",
                      class: "cx-btn primary",
                      disabled: previewDownloading.value,
                      onClick: withModifiers(handlePreviewDownload, ["stop"])
                    }, toDisplayString(previewDownloading.value ? "下载中…" : "下载"), 9, _hoisted_57)) : createCommentVNode("", true)
                  ])
                ])) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
                  previewModalError.value ? (openBlock(), createElementBlock("p", _hoisted_58, toDisplayString(previewModalError.value), 1)) : createCommentVNode("", true),
                  previewModalMode.value === "image" && previewModalUrl.value ? (openBlock(), createElementBlock("div", _hoisted_59, [
                    createBaseVNode("img", {
                      class: "cx-preview-image",
                      src: previewModalUrl.value,
                      alt: previewModalTitle.value,
                      referrerpolicy: "no-referrer",
                      onError: onPreviewImageError
                    }, null, 40, _hoisted_60)
                  ])) : previewModalMode.value === "video" && previewModalUrl.value ? (openBlock(), createElementBlock("video", {
                    key: 2,
                    class: "cx-preview-video",
                    src: previewModalUrl.value,
                    controls: "",
                    playsinline: ""
                  }, null, 8, _hoisted_61)) : previewModalUrl.value ? (openBlock(), createElementBlock("iframe", {
                    key: 3,
                    class: "cx-preview-frame",
                    src: previewModalUrl.value,
                    title: "资料预览",
                    allow: "fullscreen; autoplay",
                    referrerpolicy: "no-referrer-when-downgrade"
                  }, null, 8, _hoisted_62)) : (openBlock(), createElementBlock("div", _hoisted_63, [..._cache[20] || (_cache[20] = [
                    createBaseVNode("span", { class: "material-symbols-outlined" }, "visibility_off", -1),
                    createBaseVNode("p", null, "暂无内嵌预览内容", -1),
                    createBaseVNode("p", { class: "sub" }, "请使用下方「切换打开方式」或「下载」", -1)
                  ])]))
                ], 64))
              ]),
              !previewModalLoading.value ? (openBlock(), createElementBlock("footer", _hoisted_64, [
                createBaseVNode("div", _hoisted_65, [
                  createBaseVNode("div", _hoisted_66, [
                    createBaseVNode("button", {
                      type: "button",
                      class: normalizeClass(["cx-toolbar-btn method", { open: showOpenMethodMenu.value }]),
                      disabled: !previewOpenMethods.value.length,
                      onClick: withModifiers(toggleOpenMethodMenu, ["stop"])
                    }, [
                      _cache[22] || (_cache[22] = createBaseVNode("span", { class: "material-symbols-outlined" }, "swap_horiz", -1)),
                      createBaseVNode("span", _hoisted_68, [
                        _cache[21] || (_cache[21] = createBaseVNode("span", { class: "cx-toolbar-btn-label" }, "切换打开方式", -1)),
                        createBaseVNode("span", _hoisted_69, toDisplayString(currentOpenMethod.value?.label || "选择方式"), 1)
                      ]),
                      createBaseVNode("span", _hoisted_70, toDisplayString(showOpenMethodMenu.value ? "expand_less" : "expand_more"), 1)
                    ], 10, _hoisted_67),
                    showOpenMethodMenu.value ? (openBlock(), createElementBlock("div", {
                      key: 0,
                      class: "cx-open-method-menu",
                      role: "menu",
                      onClick: _cache[5] || (_cache[5] = withModifiers(() => {
                      }, ["stop"]))
                    }, [
                      _cache[23] || (_cache[23] = createBaseVNode("p", { class: "cx-open-method-menu-title" }, "选择打开方式", -1)),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(previewOpenMethods.value, (m) => {
                        return openBlock(), createElementBlock("button", {
                          key: m.id,
                          type: "button",
                          class: normalizeClass(["cx-open-method-item", { active: m.id === previewMethodId.value }]),
                          role: "menuitem",
                          onClick: ($event) => applyOpenMethod(m)
                        }, [
                          createBaseVNode("span", _hoisted_72, toDisplayString(m.icon), 1),
                          createBaseVNode("span", _hoisted_73, [
                            createBaseVNode("span", _hoisted_74, toDisplayString(m.label), 1),
                            createBaseVNode("span", _hoisted_75, toDisplayString(m.desc), 1)
                          ]),
                          m.id === previewMethodId.value ? (openBlock(), createElementBlock("span", _hoisted_76, "check")) : createCommentVNode("", true)
                        ], 10, _hoisted_71);
                      }), 128))
                    ])) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("button", {
                    type: "button",
                    class: "cx-toolbar-btn browser",
                    disabled: previewModalLoading.value,
                    title: "浏览器打开",
                    onClick: handleBrowserOpenCurrent
                  }, [..._cache[24] || (_cache[24] = [
                    createBaseVNode("span", { class: "material-symbols-outlined" }, "open_in_browser", -1),
                    createBaseVNode("span", { class: "cx-toolbar-btn-label only" }, "浏览器", -1)
                  ])], 8, _hoisted_77),
                  createBaseVNode("button", {
                    type: "button",
                    class: "cx-toolbar-btn download",
                    disabled: previewDownloading.value || !previewDownloadUrl.value && !previewItem.value,
                    onClick: handlePreviewDownload
                  }, [
                    createBaseVNode("span", _hoisted_79, toDisplayString(previewDownloading.value ? "progress_activity" : "download"), 1),
                    createBaseVNode("span", _hoisted_80, toDisplayString(previewDownloading.value ? "下载中" : "下载"), 1)
                  ], 8, _hoisted_78)
                ])
              ])) : createCommentVNode("", true)
            ])
          ], 8, _hoisted_47)) : createCommentVNode("", true)
        ])),
        (openBlock(), createBlock(Teleport, { to: "body" }, [
          showJoinDialog.value ? (openBlock(), createElementBlock("div", _hoisted_81, [
            createBaseVNode("div", {
              class: "cx-dialog-backdrop",
              onClick: markDeclined
            }),
            createBaseVNode("div", _hoisted_82, [
              createBaseVNode("div", {
                class: normalizeClass(["cx-dialog-cover", { empty: !coverUrl.value }])
              }, [
                coverUrl.value ? (openBlock(), createElementBlock("img", {
                  key: 0,
                  src: coverUrl.value,
                  alt: ""
                }, null, 8, _hoisted_83)) : (openBlock(), createElementBlock("span", _hoisted_84, "menu_book"))
              ], 2),
              createBaseVNode("p", _hoisted_85, toDisplayString(needsRejoin.value ? "重新加入" : "加入班级"), 1),
              _cache[25] || (_cache[25] = createBaseVNode("h3", { id: "cx-join-title" }, "是否加入班级？", -1)),
              createBaseVNode("p", _hoisted_86, toDisplayString(courseTitle.value || "班级"), 1),
              teacherName.value ? (openBlock(), createElementBlock("p", _hoisted_87, "教师 " + toDisplayString(teacherName.value), 1)) : createCommentVNode("", true),
              _cache[26] || (_cache[26] = createBaseVNode("p", { class: "cx-dialog-desc" }, " 加入后可浏览与下载本班资料。认证仅使用校园门户登录态，不会要求学习通密码。 ", -1)),
              createBaseVNode("div", _hoisted_88, [
                createBaseVNode("button", {
                  type: "button",
                  class: "cx-btn dialog-secondary",
                  disabled: loadingJoin.value,
                  onClick: markDeclined
                }, " 暂不加入 ", 8, _hoisted_89),
                createBaseVNode("button", {
                  type: "button",
                  class: "cx-btn dialog-primary",
                  disabled: loadingJoin.value,
                  onClick: handleJoinConfirm
                }, toDisplayString(loadingJoin.value ? "加入中…" : "加入班级"), 9, _hoisted_90)
              ])
            ])
          ])) : createCommentVNode("", true)
        ]))
      ]);
    };
  }
};
const ChaoxingClassView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-ef4345da"]]);
export {
  ChaoxingClassView as default
};
