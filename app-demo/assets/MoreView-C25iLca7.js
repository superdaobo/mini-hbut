import { _ as _export_sfc, ai as trackModuleOpen, a6 as getCloudSyncRuntimeConfig } from "./app-demo-CxKBY5JQ.js";
import { T as TStatusBadge } from "./TStatusBadge-8FuTyS87.js";
import { E as normalizeModuleCenterChannel, H as resolveModuleChannel, J as buildModuleCenterCards, j as fetchRemoteConfig, K as fetchModuleCatalog, L as getLocalModuleState, M as fetchModuleManifest, O as prepareModuleBundle, r as resolveModuleHostPreviewSource, o as canUseLocalModuleBridgePreview, p as isLocalModuleBridgePreviewUrl } from "./more-modules-CsUTdMqs.js";
import { b as isTauriRuntime, a as invokeNative } from "./runtime-bridge-apFQ0nCw.js";
import { o as onMounted, a as ref, c as createElementBlock, b as openBlock, d as createBaseVNode, n as normalizeClass, y as createStaticVNode, f as createCommentVNode, F as Fragment, i as renderList, q as createVNode, t as toDisplayString, u as unref, e as computed } from "./vue-core-DdLVj9yW.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "more-view antialiased max-w-[520px] mx-auto relative min-h-screen bg-[#f0f4f8]" };
const _hoisted_2 = { class: "grid grid-cols-[44px_1fr_44px] items-center px-4 pt-4 pb-4 sticky top-0 bg-[#f0f4f8]/90 backdrop-blur z-50" };
const _hoisted_3 = ["disabled"];
const _hoisted_4 = { class: "px-4 space-y-5 pb-6" };
const _hoisted_5 = { class: "grid grid-cols-2 gap-3" };
const _hoisted_6 = ["data-module-id", "disabled", "onClick"];
const _hoisted_7 = { class: "flex justify-between items-center mb-2" };
const _hoisted_8 = { class: "w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-lg" };
const _hoisted_9 = { class: "min-h-[52px]" };
const _hoisted_10 = { class: "block text-sm font-bold text-gray-800" };
const _hoisted_11 = { class: "text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed" };
const _hoisted_12 = { class: "mt-2 pt-2 border-t border-gray-100" };
const _hoisted_13 = { class: "text-[11px] text-gray-400" };
const _hoisted_14 = { class: "block text-[11px] text-gray-400 mt-0.5" };
const _hoisted_15 = {
  key: 0,
  class: "text-red-500 font-semibold text-sm px-1"
};
const _hoisted_16 = {
  key: 1,
  class: "text-center py-10 text-gray-400 text-sm"
};
const STUDENT_PROFILE_STORAGE_PREFIX = "hbu_more_module_student_profile:";
const DEFAULT_GAME_RANK_API = "https://mini-hbut-testocr1.hf.space/api/game-rank";
const DEFAULT_GOMOKU_RELAY_API = "https://mini-hbut-ocr-service.hf.space/api/gomoku-relay";
const INCOMPATIBLE_CACHE_MESSAGE = "当前缓存版本存在已知布局问题，请联网更新后再打开。";
const _sfc_main = {
  __name: "MoreView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back", "navigate"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const moduleLoading = ref(true);
    const refreshing = ref(false);
    const moduleError = ref("");
    const moduleChannel = ref("main");
    const moduleCardsSource = ref([]);
    const moduleStates = ref({});
    const moduleBusyKey = ref("");
    const safeText = (value) => String(value ?? "").trim();
    const safeParseJson = (raw, fallback = null) => {
      try {
        return JSON.parse(raw || "");
      } catch {
        return fallback;
      }
    };
    const safeNumber = (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
    const CONTEXT_AWARE_GAME_MODULE_IDS = /* @__PURE__ */ new Set([
      "hecheng_hugongda",
      "jump_out_hbut",
      "hbut_2048",
      "clumsy_bird_hbut",
      "hbut_monopoly",
      "hbut_miner",
      "hbut_memory_match",
      "hbut_gomoku",
      "hbut_stack",
      "hbut_parking",
      "hbut_match3"
    ]);
    const buildStudentProfileStorageKey = (studentId) => {
      const sid = safeText(studentId || props.studentId);
      return sid ? `${STUDENT_PROFILE_STORAGE_PREFIX}${sid}` : "";
    };
    const buildEmptyStudentProfile = (studentId = "") => ({
      student_id: safeText(studentId || props.studentId),
      name: "",
      class_name: "",
      major: "",
      school_name: "湖北工业大学"
    });
    const extractStudentProfilePayload = (payload) => {
      if (!payload || typeof payload !== "object") return {};
      return payload?.data && typeof payload.data === "object" ? payload.data : payload;
    };
    const normalizeStudentProfile = (payload, fallbackStudentId = "") => {
      const source = extractStudentProfilePayload(payload);
      return {
        student_id: safeText(
          source?.student_id || source?.studentId || source?.xh || source?.XH || fallbackStudentId || props.studentId
        ),
        name: safeText(
          source?.name || source?.student_name || source?.studentName || source?.xm || source?.XM
        ),
        class_name: safeText(
          source?.class_name || source?.className || source?.class || source?.bjmc || source?.BJMC
        ),
        major: safeText(source?.major || source?.major_name || source?.majorName || source?.zymc),
        school_name: safeText(source?.school_name || source?.schoolName) || "湖北工业大学"
      };
    };
    const mergeStudentProfiles = (...profiles) => {
      const merged = buildEmptyStudentProfile();
      for (const item of profiles) {
        const profile = normalizeStudentProfile(item, merged.student_id || props.studentId);
        if (!profile.student_id && !profile.name && !profile.class_name && !profile.major) continue;
        merged.student_id = merged.student_id || profile.student_id;
        merged.name = merged.name || profile.name;
        merged.class_name = merged.class_name || profile.class_name;
        merged.major = merged.major || profile.major;
        merged.school_name = merged.school_name || profile.school_name || "湖北工业大学";
      }
      return merged;
    };
    const persistStudentProfile = (profile) => {
      const normalized = normalizeStudentProfile(profile, props.studentId);
      const sid = safeText(normalized.student_id || props.studentId);
      if (!sid) return normalized;
      const storageKey = buildStudentProfileStorageKey(sid);
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(normalized));
      }
      return normalized;
    };
    const unwrapCachedStudentProfilePayload = (payload) => {
      if (!payload || typeof payload !== "object") return payload;
      return payload?.data && typeof payload.data === "object" ? payload.data : payload;
    };
    const readCachedStudentProfile = () => {
      const sid = safeText(props.studentId);
      const empty = buildEmptyStudentProfile(sid);
      const storageKey = buildStudentProfileStorageKey(sid);
      const custom = storageKey ? safeParseJson(localStorage.getItem(storageKey), null) : null;
      if (!sid) return mergeStudentProfiles(empty, custom);
      const direct = unwrapCachedStudentProfilePayload(
        safeParseJson(localStorage.getItem(`cache:studentinfo:${sid}`), null)
      );
      const legacy = unwrapCachedStudentProfilePayload(
        safeParseJson(localStorage.getItem(`cache:student_info:${sid}`), null)
      );
      return mergeStudentProfiles(empty, custom, direct, legacy);
    };
    const ensureStudentProfile = async () => {
      const cached = readCachedStudentProfile();
      if (cached.student_id && cached.class_name) return cached;
      if (!isTauriRuntime()) return cached;
      try {
        const payload = await invokeNative("fetch_student_info");
        const merged = mergeStudentProfiles(cached, payload);
        return persistStudentProfile(merged);
      } catch {
        return cached;
      }
    };
    const resolveGameRankApi = () => {
      try {
        const runtime = getCloudSyncRuntimeConfig();
        const endpoint = safeText(runtime?.proxyEndpoint || runtime?.endpoint);
        if (endpoint) {
          return endpoint.replace(/\/cloud-sync$/i, "/game-rank");
        }
      } catch {
      }
      return DEFAULT_GAME_RANK_API;
    };
    const resolveGomokuRelayApi = () => DEFAULT_GOMOKU_RELAY_API;
    const compareModuleVersion = (left, right) => {
      const a = safeText(left);
      const b = safeText(right);
      if (!a && !b) return 0;
      if (!a) return -1;
      if (!b) return 1;
      return a.localeCompare(b, void 0, {
        numeric: true,
        sensitivity: "base"
      });
    };
    const isManifestVersionCompatible = (manifest, minVersion = "") => {
      const currentVersion = safeText(manifest?.version);
      const requiredVersion = safeText(minVersion || manifest?.min_compatible_version);
      if (!requiredVersion) return true;
      if (!currentVersion) return false;
      return compareModuleVersion(currentVersion, requiredVersion) >= 0;
    };
    const appendModuleContextQuery = (moduleId, rawUrl, profile = readCachedStudentProfile(), runtimeTag = "module-host") => {
      const previewUrl = safeText(rawUrl);
      if (!previewUrl || !CONTEXT_AWARE_GAME_MODULE_IDS.has(moduleId)) return previewUrl;
      try {
        const url = new URL(previewUrl, window.location.origin);
        url.searchParams.set("from", "mini_hbut");
        url.searchParams.set("runtime", safeText(runtimeTag) || "module-host");
        url.searchParams.set("student_id", safeText(profile.student_id));
        url.searchParams.set("player_name", safeText(profile.name));
        url.searchParams.set("class_name", safeText(profile.class_name));
        url.searchParams.set("major", safeText(profile.major));
        url.searchParams.set("school_name", safeText(profile.school_name));
        url.searchParams.set("rank_api", resolveGameRankApi());
        if (moduleId === "hbut_gomoku") {
          url.searchParams.set("gomoku_api", resolveGomokuRelayApi());
        }
        return url.toString();
      } catch {
        return previewUrl;
      }
    };
    const buildCachedManifestSnapshot = (moduleItem) => {
      const local = getLocalModuleState(moduleItem?.id);
      if (!local || typeof local !== "object") return null;
      const version = safeText(local?.version);
      const packageUrl = safeText(local?.package_url);
      const entryPath = safeText(local?.requested_entry_path || local?.entry_path || "index.html");
      if (!version || !packageUrl || !entryPath) return null;
      return {
        module_id: safeText(moduleItem?.id),
        module_name: safeText(local?.module_name || moduleItem?.name || moduleItem?.module_name || moduleItem?.id),
        version,
        package_url: packageUrl,
        package_urls: Array.isArray(local?.package_urls) ? local.package_urls : [],
        package_sha256: safeText(local?.package_sha256),
        entry_path: entryPath,
        min_compatible_version: safeText(local?.min_compatible_version || moduleItem?.min_compatible_version),
        channel: safeText(local?.channel || moduleItem?.channel),
        open_url: safeText(local?.open_url || "")
      };
    };
    const emitPreparedModuleNavigate = (moduleItem, prepared, manifest, sessionMeta = {}) => {
      const moduleId = safeText(prepared?.module_id || moduleItem?.id);
      const sessionPayload = {
        module_id: moduleId,
        module_name: safeText(prepared?.module_name || moduleItem?.name || manifest?.module_name || moduleId),
        preview_url: safeText(prepared?.preview_url || manifest?.open_url),
        version: safeText(prepared?.version || manifest?.version),
        min_compatible_version: safeText(prepared?.min_compatible_version || manifest?.min_compatible_version),
        channel: safeText(prepared?.channel || moduleChannel.value),
        local_ready: prepared?.local_ready !== false,
        source: safeText(prepared?.source || ""),
        preview_mode: safeText(prepared?.preview_mode || prepared?.previewMode || ""),
        open_url: safeText(prepared?.open_url || manifest?.open_url),
        package_url: safeText(prepared?.package_url || manifest?.package_url),
        package_urls: Array.isArray(prepared?.package_urls) ? prepared.package_urls : Array.isArray(manifest?.package_urls) ? manifest.package_urls : [],
        entry_path: safeText(prepared?.requested_entry_path || prepared?.entry_path || manifest?.entry_path || "index.html"),
        resolved_entry_path: safeText(prepared?.resolved_entry_path || ""),
        local_preview_url: safeText(prepared?.local_preview_url || ""),
        site_root_path: safeText(prepared?.site_root_path || ""),
        bundle_zip_path: safeText(prepared?.bundle_zip_path || ""),
        cache_dir: safeText(prepared?.cache_dir || ""),
        bundle_path: safeText(prepared?.bundle_path || ""),
        manifest_url: safeText(sessionMeta?.manifest_url || manifest?.url || moduleItem?.manifest_url),
        manifest_checked_at: safeText(sessionMeta?.manifest_checked_at || "")
      };
      const resolvedSource = resolveModuleHostPreviewSource(sessionPayload);
      const resolvedPreviewUrl = safeText(resolvedSource.resolvedPreviewUrl);
      const previewMode = safeText(
        resolvedSource.sourceKind && resolvedSource.sourceKind !== "invalid" ? resolvedSource.sourceKind : ""
      );
      const runtimeTag = previewMode === "capacitor-local" ? "capacitor-local" : previewMode === "tauri-local" ? "tauri-local" : previewMode === "remote-site" ? "remote-site" : "module-host";
      const previewUrl = appendModuleContextQuery(
        moduleId,
        safeText(
          (() => {
            const fallback = canUseLocalModuleBridgePreview() ? sessionPayload.preview_url || manifest?.open_url : "";
            const candidate = resolvedPreviewUrl || fallback;
            if (!canUseLocalModuleBridgePreview() && isLocalModuleBridgePreviewUrl(candidate)) return "";
            return candidate;
          })()
        ),
        sessionMeta?.preview_profile || readCachedStudentProfile(),
        runtimeTag
      );
      const invalidReason = safeText(
        sessionPayload.invalid_reason || sessionMeta?.invalid_reason || (!previewUrl && !canUseLocalModuleBridgePreview() && safeText(sessionPayload.preview_mode) === "tauri-local" ? "tauri-bridge-blocked" : "")
      );
      void trackModuleOpen({
        moduleId,
        loadMode: previewMode || sessionPayload.preview_mode || "remote-site",
        launchMode: safeText(prepared?.launch_mode || prepared?.source || ""),
        moduleVersion: sessionPayload.version,
        channel: sessionPayload.channel
      });
      emit("navigate", {
        view: "more_module_host",
        payload: {
          module_id: moduleId,
          module_name: sessionPayload.module_name,
          preview_url: previewUrl,
          version: sessionPayload.version,
          min_compatible_version: sessionPayload.min_compatible_version,
          channel: sessionPayload.channel,
          local_ready: sessionPayload.local_ready,
          source: sessionPayload.source,
          preview_mode: previewMode,
          invalid_reason: invalidReason,
          open_url: sessionPayload.open_url,
          package_url: sessionPayload.package_url,
          package_urls: sessionPayload.package_urls,
          entry_path: sessionPayload.entry_path,
          resolved_entry_path: safeText(sessionPayload.resolved_entry_path || resolvedSource.resolvedEntryPath),
          local_preview_url: safeText(sessionPayload.local_preview_url || resolvedSource.localPreviewUrl),
          site_root_path: safeText(sessionPayload.site_root_path || resolvedSource.siteRootPath),
          bundle_zip_path: safeText(sessionPayload.bundle_zip_path || resolvedSource.bundleZipPath),
          cache_dir: sessionPayload.cache_dir,
          bundle_path: sessionPayload.bundle_path,
          manifest_url: sessionPayload.manifest_url,
          manifest_checked_at: sessionPayload.manifest_checked_at
        }
      });
    };
    const applyModuleCards = (items, channel) => {
      moduleChannel.value = normalizeModuleCenterChannel(channel);
      moduleCardsSource.value = Array.isArray(items) ? items.filter(Boolean) : [];
      bootstrapModuleState();
    };
    const moduleCards = computed(() => {
      return [...moduleCardsSource.value].filter((item) => item && safeText(item.id)).sort((a, b) => safeNumber(a.order, 999) - safeNumber(b.order, 999));
    });
    const readModuleState = (moduleId) => {
      const map = moduleStates.value || {};
      return map[moduleId] && typeof map[moduleId] === "object" ? map[moduleId] : { status: "not_downloaded", message: "" };
    };
    const setModuleState = (moduleId, patch) => {
      moduleStates.value = {
        ...moduleStates.value,
        [moduleId]: {
          ...readModuleState(moduleId) || {},
          ...patch && typeof patch === "object" ? patch : {}
        }
      };
    };
    const bootstrapModuleState = () => {
      for (const item of moduleCards.value) {
        const current = readModuleState(item.id);
        if (current.status && current.status !== "not_downloaded") continue;
        if (item.kind !== "remote") {
          setModuleState(item.id, { status: "ready", message: "点击进入模块" });
          continue;
        }
        const local = getLocalModuleState(item.id);
        if (safeText(local?.version)) {
          setModuleState(item.id, {
            status: "ready",
            channel: safeText(local?.channel || moduleChannel.value),
            version: safeText(local.version),
            source: safeText(local?.source || "cache"),
            message: "本地缓存可用"
          });
        } else {
          setModuleState(item.id, {
            status: "not_downloaded",
            channel: moduleChannel.value,
            message: "首次使用需下载"
          });
        }
      }
    };
    const resolveModuleBadgeType = (_moduleItem, state) => {
      const status = safeText(state?.status);
      if (status === "ready") return "success";
      if (status === "checking" || status === "downloading") return "info";
      if (status === "failed") return "danger";
      if (status === "locked") return "warning";
      return "muted";
    };
    const resolveModuleStatusText = (_moduleItem, state) => {
      const status = safeText(state?.status);
      if (status === "checking") return "检查更新";
      if (status === "downloading") return "下载中";
      if (status === "ready") return "已就绪";
      if (status === "failed") return "打开失败";
      if (status === "locked") return "未解锁";
      return "未下载";
    };
    const resolveModuleSourceText = (value) => {
      const source = safeText(value).toLowerCase();
      if (source === "cache") return "缓存";
      if (source === "download") return "下载";
      if (source === "in_app") return "内嵌";
      if (source === "remote") return "官网";
      return "";
    };
    const formatModuleChannelLabel = (value) => {
      const channel = safeText(value).toLowerCase();
      if (channel === "latest") return "最新包";
      if (channel === "dev") return "测试渠道";
      if (channel === "main") return "正式渠道";
      return channel ? `渠道 ${channel}` : "";
    };
    const resolveModuleMetaLine = (state) => {
      const parts = [];
      const channelLabel = formatModuleChannelLabel(state?.channel || moduleChannel.value);
      if (channelLabel) parts.push(channelLabel);
      if (safeText(state?.version)) parts.push(`v${safeText(state.version)}`);
      return parts.join(" · ") || "正式渠道";
    };
    const resolveModuleDetailLine = (state) => {
      const parts = [];
      const sourceLabel = resolveModuleSourceText(state?.source);
      if (sourceLabel) parts.push(`来源 ${sourceLabel}`);
      const message = safeText(state?.message);
      if (message) parts.push(message);
      return parts.join(" · ") || "点击进入";
    };
    const handleOpenInternalModule = (moduleItem) => {
      const targetView = safeText(moduleItem?.view);
      if (!targetView) return;
      emit("navigate", targetView);
    };
    const handleOpenRemoteModule = async (moduleItem) => {
      const moduleId = safeText(moduleItem?.id);
      if (!moduleId) return;
      const profile = moduleId === "hecheng_hugongda" ? await ensureStudentProfile() : readCachedStudentProfile();
      if (!safeText(moduleItem?.manifest_url)) {
        setModuleState(moduleId, {
          status: "failed",
          channel: moduleChannel.value,
          message: "模块清单未发布"
        });
        return;
      }
      moduleBusyKey.value = moduleId;
      const openPreparedModule = async (manifest, initialMessage = "检查更新中", sessionMeta = {}) => {
        setModuleState(moduleId, {
          status: "checking",
          channel: moduleChannel.value,
          message: initialMessage
        });
        const prepared = await prepareModuleBundle({
          channel: moduleChannel.value,
          moduleInfo: moduleItem,
          manifest
        });
        setModuleState(moduleId, {
          status: "ready",
          channel: safeText(prepared.channel || moduleChannel.value),
          source: safeText(prepared.source || ""),
          message: prepared.launch_mode === "cache" ? "已命中本地缓存" : "已更新并内嵌打开",
          version: safeText(prepared.version || manifest.version)
        });
        emitPreparedModuleNavigate(moduleItem, prepared, manifest, {
          ...sessionMeta,
          preview_profile: profile
        });
      };
      try {
        const cachedManifest = buildCachedManifestSnapshot(moduleItem);
        let remoteManifest = null;
        let remoteManifestError = null;
        setModuleState(moduleId, {
          status: "checking",
          channel: moduleChannel.value,
          message: cachedManifest ? "检查线上版本中" : "获取模块清单中"
        });
        try {
          remoteManifest = await fetchModuleManifest(moduleItem.manifest_url);
        } catch (error) {
          remoteManifestError = error;
        }
        if (remoteManifest) {
          const cachedVersion = safeText(cachedManifest?.version);
          const remoteVersion = safeText(remoteManifest.version);
          const cachedSha = safeText(cachedManifest?.package_sha256);
          const remoteSha = safeText(remoteManifest.package_sha256);
          const cachedMinCompatible = safeText(cachedManifest?.min_compatible_version);
          const remoteMinCompatible = safeText(remoteManifest.min_compatible_version);
          const canUseCache = cachedManifest && cachedVersion && cachedVersion === remoteVersion && isManifestVersionCompatible(cachedManifest, remoteManifest.min_compatible_version) && cachedMinCompatible === remoteMinCompatible && (!remoteSha || !cachedSha || cachedSha === remoteSha);
          if (canUseCache) {
            try {
              await openPreparedModule(cachedManifest, "命中最新缓存中", {
                manifest_url: safeText(remoteManifest.url || moduleItem.manifest_url),
                manifest_checked_at: (/* @__PURE__ */ new Date()).toISOString()
              });
              return;
            } catch {
              setModuleState(moduleId, {
                status: "checking",
                channel: moduleChannel.value,
                message: "本地缓存失效，重新准备最新版本"
              });
            }
          }
          setModuleState(moduleId, {
            status: "downloading",
            channel: moduleChannel.value,
            source: cachedManifest ? "download" : "",
            message: cachedManifest ? "发现新版本，更新本地包" : "下载并准备本地包",
            version: remoteVersion
          });
          await openPreparedModule(
            remoteManifest,
            cachedManifest ? "发现新版本，更新本地包" : "下载并准备本地包",
            {
              manifest_url: safeText(remoteManifest.url || moduleItem.manifest_url),
              manifest_checked_at: (/* @__PURE__ */ new Date()).toISOString()
            }
          );
          return;
        }
        if (cachedManifest) {
          if (!isManifestVersionCompatible(cachedManifest, moduleItem?.min_compatible_version)) {
            throw new Error(INCOMPATIBLE_CACHE_MESSAGE);
          }
          await openPreparedModule(cachedManifest, "线上检查失败，回退本地缓存");
          return;
        }
        throw remoteManifestError || new Error("模块清单获取失败");
      } catch (err) {
        setModuleState(moduleId, {
          status: "failed",
          channel: moduleChannel.value,
          message: safeText(err?.message || err) || "模块打开失败"
        });
      } finally {
        moduleBusyKey.value = "";
      }
    };
    const handleModuleClick = async (moduleItem) => {
      if (!moduleItem) return;
      if (moduleItem.kind === "internal") {
        handleOpenInternalModule(moduleItem);
        return;
      }
      await handleOpenRemoteModule(moduleItem);
    };
    const loadModuleCatalog = async ({ silent = false } = {}) => {
      if (!silent) moduleLoading.value = true;
      moduleError.value = "";
      const preferredChannel = normalizeModuleCenterChannel(await resolveModuleChannel(), "main");
      if (!moduleCardsSource.value.length) {
        applyModuleCards(buildModuleCenterCards({ channel: preferredChannel }), preferredChannel);
      }
      let targetChannel = preferredChannel;
      let configuredModules = [];
      let catalogModules = [];
      try {
        const remoteConfig = await fetchRemoteConfig({ force: false });
        const configChannel = normalizeModuleCenterChannel(remoteConfig?.module_center?.channel, preferredChannel);
        targetChannel = configChannel;
        const rawModules = Array.isArray(remoteConfig?.module_center?.modules) ? remoteConfig.module_center.modules : [];
        configuredModules = rawModules;
      } catch {
      }
      try {
        const catalogPayload = await fetchModuleCatalog(targetChannel);
        moduleChannel.value = normalizeModuleCenterChannel(targetChannel, preferredChannel);
        catalogModules = Array.isArray(catalogPayload?.catalog?.modules) ? catalogPayload.catalog.modules : [];
      } catch (err) {
        moduleError.value = "";
        moduleChannel.value = normalizeModuleCenterChannel(targetChannel, preferredChannel);
        catalogModules = [];
      }
      const resolvedChannel = normalizeModuleCenterChannel(moduleChannel.value || targetChannel, preferredChannel);
      const merged = buildModuleCenterCards({
        channel: resolvedChannel,
        configuredModules,
        catalogModules
      });
      applyModuleCards(merged, resolvedChannel);
      if (!silent) moduleLoading.value = false;
    };
    const refreshModules = async () => {
      refreshing.value = true;
      await loadModuleCatalog({ silent: true });
      refreshing.value = false;
    };
    onMounted(async () => {
      const preferredChannel = normalizeModuleCenterChannel(await resolveModuleChannel(), "main");
      applyModuleCards(buildModuleCenterCards({ channel: preferredChannel }), preferredChannel);
      moduleLoading.value = false;
      void ensureStudentProfile();
      void loadModuleCatalog({ silent: true });
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", _hoisted_2, [
          createBaseVNode("button", {
            class: "w-9 h-9 rounded-full bg-white flex items-center justify-center card-shadow text-gray-500 hover:text-gray-700 transition-colors",
            onClick: _cache[0] || (_cache[0] = ($event) => emit("back"))
          }, [..._cache[1] || (_cache[1] = [
            createBaseVNode("svg", {
              class: "w-5 h-5",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              "stroke-width": "2",
              "stroke-linecap": "round",
              "stroke-linejoin": "round"
            }, [
              createBaseVNode("path", { d: "M19 12H5" }),
              createBaseVNode("path", { d: "M12 19l-7-7 7-7" })
            ], -1)
          ])]),
          _cache[3] || (_cache[3] = createBaseVNode("div", { class: "flex items-center justify-center gap-2" }, [
            createBaseVNode("div", { class: "w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center" }, [
              createBaseVNode("span", { class: "text-lg" }, "🧩")
            ]),
            createBaseVNode("span", { class: "font-bold text-lg tracking-wide text-gray-800" }, "模块中心")
          ], -1)),
          createBaseVNode("button", {
            class: normalizeClass(["w-9 h-9 rounded-full bg-white flex items-center justify-center card-shadow text-gray-500 hover:text-blue-500 transition-colors", { "animate-spin": refreshing.value }]),
            disabled: refreshing.value,
            onClick: refreshModules
          }, [..._cache[2] || (_cache[2] = [
            createStaticVNode('<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-v-b053fa18><path d="M23 4v6h-6" data-v-b053fa18></path><path d="M1 20v-6h6" data-v-b053fa18></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" data-v-b053fa18></path><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" data-v-b053fa18></path></svg>', 1)
          ])], 10, _hoisted_3)
        ]),
        createBaseVNode("main", _hoisted_4, [
          createBaseVNode("div", _hoisted_5, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(moduleCards.value, (item) => {
              return openBlock(), createElementBlock("button", {
                key: item.id,
                class: "bg-white rounded-2xl p-3 card-shadow text-left transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed",
                "data-module-id": item.id,
                disabled: moduleBusyKey.value === item.id,
                onClick: ($event) => handleModuleClick(item)
              }, [
                createBaseVNode("div", _hoisted_7, [
                  createBaseVNode("span", _hoisted_8, toDisplayString(item.icon || "📦"), 1),
                  createVNode(unref(TStatusBadge), {
                    type: resolveModuleBadgeType(item, readModuleState(item.id)),
                    text: resolveModuleStatusText(item, readModuleState(item.id))
                  }, null, 8, ["type", "text"])
                ]),
                createBaseVNode("div", _hoisted_9, [
                  createBaseVNode("strong", _hoisted_10, toDisplayString(item.name), 1),
                  createBaseVNode("p", _hoisted_11, toDisplayString(item.description || "模块说明缺失"), 1)
                ]),
                createBaseVNode("div", _hoisted_12, [
                  createBaseVNode("span", _hoisted_13, toDisplayString(resolveModuleMetaLine(readModuleState(item.id))), 1),
                  createBaseVNode("small", _hoisted_14, toDisplayString(resolveModuleDetailLine(readModuleState(item.id))), 1)
                ])
              ], 8, _hoisted_6);
            }), 128))
          ]),
          moduleError.value ? (openBlock(), createElementBlock("p", _hoisted_15, toDisplayString(moduleError.value), 1)) : createCommentVNode("", true),
          moduleLoading.value ? (openBlock(), createElementBlock("div", _hoisted_16, "正在加载模块中心...")) : createCommentVNode("", true)
        ])
      ]);
    };
  }
};
const MoreView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-b053fa18"]]);
export {
  MoreView as default
};
