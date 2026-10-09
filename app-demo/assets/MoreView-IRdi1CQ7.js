import { u as resolveModuleChannel, v as fetchModuleCatalog, w as getLocalModuleState, x as fetchModuleManifest, y as deleteModuleState, z as deleteCachedManifestSnapshot, A as prepareModuleBundle, r as resolveModuleHostPreviewSource, d as canUseLocalModuleBridgePreview, e as isLocalModuleBridgePreviewUrl } from "./more-modules-yxgAg-Rh.js";
import { a as isTauriRuntime, d as invokeNative } from "./runtime-bridge-gQMtwwk6.js";
import { _ as _export_sfc, b as useLocale, c as useAuthStore, bl as normalizeModuleCenterChannel, bm as buildModuleCenterCards, al as fetchRemoteConfig, bn as reconcileGameIdentityOnBoot, bo as trackModuleOpen, bp as appendIdentityQueryParams, bq as DEFAULT_GOMOKU_RELAY_API } from "./app-demo-DztvWo2z.js";
import { r as resolveGamePlatformApiBase, a as resolveGameRankApiBase, p as peekGameOpen, c as consumeGameOpen } from "./pending_open-CJJALk6R.js";
import { a as appendModuleEnvQueryParams, r as resolveBuildAppVersion } from "./module_context-cd5EIzI-.js";
import { o as onMounted, r as ref, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, u as unref, d as createCommentVNode, h as computed } from "./vue-core-D-44rohN.js";
import "./debug-tools-CyNtADDO.js";
import "./capture-YhmA9GNe.js";
const _hoisted_1 = { class: "more-view antialiased max-w-[520px] mx-auto relative min-h-screen bg-[#f0f4f8]" };
const _hoisted_2 = { class: "grid grid-cols-[44px_1fr_44px] items-center px-4 pt-4 pb-4 sticky top-0 bg-[#f0f4f8]/90 backdrop-blur z-50" };
const _hoisted_3 = { class: "text-center font-bold text-base tracking-wide text-gray-800" };
const _hoisted_4 = { class: "px-4 pb-6" };
const _hoisted_5 = {
  class: "panel-forward",
  "aria-live": "polite"
};
const _hoisted_6 = {
  key: 0,
  class: "panel-forward__spinner",
  "aria-hidden": "true"
};
const _hoisted_7 = {
  key: 1,
  class: "panel-forward__icon",
  "aria-hidden": "true"
};
const _hoisted_8 = { class: "panel-forward__text" };
const _hoisted_9 = {
  key: 3,
  class: "panel-forward__detail"
};
const STUDENT_PROFILE_STORAGE_PREFIX = "hbu_more_module_student_profile:";
const INCOMPATIBLE_CACHE_MESSAGE_KEY = "more.msg.incompatibleCache";
const PANEL_MODULE_ID = "more_panel";
const PANEL_CATALOG_WAIT_MS = 5e3;
const _sfc_main = {
  __name: "MoreView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back", "navigate"],
  setup(__props, { emit: __emit }) {
    const { t } = useLocale();
    const tr = (key, params = {}) => {
      let text = t(key);
      for (const [name, value] of Object.entries(params)) {
        text = text.split(`{${name}}`).join(String(value));
      }
      return text;
    };
    const props = __props;
    const emit = __emit;
    const moduleLoading = ref(true);
    const moduleError = ref("");
    const moduleChannel = ref("main");
    const moduleCardsSource = ref([]);
    const moduleStates = ref({});
    const moduleBusyKey = ref("");
    const activeLaunchSurface = ref("classic");
    const safeText = (value) => String(value ?? "").trim();
    const authStore = useAuthStore();
    const sessionVerified = computed(() => authStore.sessionVerified === true);
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
      "hbut_match3",
      // #1002：总面板虽是「面板」而非游戏，但同样需要宿主上下文 ——
      // 缺 host_origin 就只能用 '*' 作 targetOrigin；缺 theme 会与 App 主题割裂；
      // 缺 catalog_url 时面板经 bridge 预览无法推导游戏清单地址。
      "more_panel"
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
      return resolveGameRankApiBase();
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
        appendIdentityQueryParams(url, profile, sessionVerified.value);
        const rankApiBase = resolveGameRankApi();
        if (rankApiBase) url.searchParams.set("rank_api", rankApiBase);
        if (moduleId === "hbut_gomoku") {
          const gomokuRelayApi = resolveGomokuRelayApi();
          if (gomokuRelayApi) url.searchParams.set("gomoku_api", gomokuRelayApi);
        }
        appendModuleEnvQueryParams(url, {
          appVersion: resolveBuildAppVersion(),
          hostOrigin: window.location.origin,
          // G10 兜底：非特殊 scheme（tauri: / capacitor:）下 location.origin === 'null'，
          // 必须把 location 对象一并交给注入层，才能退化为 `${protocol}//${host}`（而不是空）。
          hostLocation: window.location
        });
        if (moduleId === "more_panel") {
          const platformApi = safeText(resolveGamePlatformApiBase()).replace(/\/+$/, "");
          if (platformApi) url.searchParams.set("game_platform_api", platformApi);
          const gameList = moduleCards.value.filter((item) => safeText(item?.id) && safeText(item.id) !== "more_panel").map((item) => ({
            id: safeText(item.id),
            name: safeText(item.name) || safeText(item.id),
            icon: safeText(item.icon) || "🎮"
          }));
          if (gameList.length) {
            try {
              url.searchParams.set("game_list", JSON.stringify(gameList));
            } catch {
            }
          }
          const isDark = typeof document !== "undefined" && Boolean(document.documentElement?.classList?.contains("dark"));
          url.searchParams.set("theme", isDark ? "dark" : "light");
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
      const openUrlWithContext = appendModuleContextQuery(
        moduleId,
        safeText(sessionPayload.open_url),
        sessionMeta?.preview_profile || readCachedStudentProfile(),
        runtimeTag
      ) || safeText(sessionPayload.open_url);
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
          // #1002 回归修复：宿主对「游乐场发起」的对局会走 HTTPS-first ——
          // `launch_surface==='game_center'` 时 `resolveGameCenterLaunchUrl` 会返回远端
          // `open_url` 原文并**整体丢弃**挂在 `preview_url` 上的注入参数（身份 / rank_api）。
          // 结果是游戏内排行榜报「当前没有登录信息，无法读取排行榜」。
          // 因此 open_url 必须携带**同一套**上下文，否则「最终加载哪个 URL」决定了身份在不在。
          open_url: openUrlWithContext,
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
          manifest_checked_at: sessionPayload.manifest_checked_at,
          // #905：标记本次启动来自湖工游乐场（宿主据此走远端 HTTPS 优先 + origin 白名单）
          launch_surface: safeText(sessionMeta?.launch_surface || activeLaunchSurface.value) || "classic"
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
          setModuleState(item.id, { status: "ready", message: t("more.state.enterModule") });
          continue;
        }
        const local = getLocalModuleState(item.id);
        if (safeText(local?.version)) {
          setModuleState(item.id, {
            status: "ready",
            channel: safeText(local?.channel || moduleChannel.value),
            version: safeText(local.version),
            source: safeText(local?.source || "cache"),
            message: t("more.state.cacheReady")
          });
        } else {
          setModuleState(item.id, {
            status: "not_downloaded",
            channel: moduleChannel.value,
            message: t("more.state.needDownload")
          });
        }
      }
    };
    const handleOpenInternalModule = (moduleItem) => {
      const targetView = safeText(moduleItem?.view);
      if (!targetView) return;
      emit("navigate", targetView);
    };
    const handleOpenRemoteModule = async (moduleItem) => {
      const moduleId = safeText(moduleItem?.id);
      if (!moduleId) return;
      if (!sessionVerified.value) reconcileGameIdentityOnBoot(false);
      const profile = moduleId === "hecheng_hugongda" ? await ensureStudentProfile() : readCachedStudentProfile();
      if (!safeText(moduleItem?.manifest_url)) {
        setModuleState(moduleId, {
          status: "failed",
          channel: moduleChannel.value,
          message: t("more.msg.manifestMissing")
        });
        return;
      }
      moduleBusyKey.value = moduleId;
      const openPreparedModule = async (manifest, initialMessageKey, initialMessageParams = {}, sessionMeta = {}) => {
        setModuleState(moduleId, {
          status: "checking",
          channel: moduleChannel.value,
          message: tr(initialMessageKey, initialMessageParams)
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
          message: prepared.launch_mode === "cache" ? t("more.msg.cacheHit") : t("more.msg.updatedAndOpened"),
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
          message: cachedManifest ? t("more.msg.checkingRemote") : t("more.msg.fetchingManifest")
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
              await openPreparedModule(cachedManifest, "more.msg.verifyingCache", {}, {
                manifest_url: safeText(remoteManifest.url || moduleItem.manifest_url),
                manifest_checked_at: (/* @__PURE__ */ new Date()).toISOString()
              });
              return;
            } catch {
              setModuleState(moduleId, {
                status: "checking",
                channel: moduleChannel.value,
                message: t("more.msg.cacheInvalidReprepare")
              });
            }
          }
          setModuleState(moduleId, {
            status: "downloading",
            channel: moduleChannel.value,
            source: cachedManifest ? "download" : "",
            message: cachedManifest ? t("more.msg.newVersionUpdating") : t("more.msg.downloadingPrepare"),
            version: remoteVersion
          });
          await openPreparedModule(
            remoteManifest,
            cachedManifest ? "more.msg.newVersionUpdating" : "more.msg.downloadingPrepare",
            {},
            {
              manifest_url: safeText(remoteManifest.url || moduleItem.manifest_url),
              manifest_checked_at: (/* @__PURE__ */ new Date()).toISOString()
            }
          );
          return;
        }
        if (cachedManifest) {
          if (!isManifestVersionCompatible(cachedManifest, moduleItem?.min_compatible_version)) {
            throw new Error(t(INCOMPATIBLE_CACHE_MESSAGE_KEY));
          }
          try {
            await openPreparedModule(cachedManifest, "more.msg.remoteFailFallbackCache");
            return;
          } catch (cachedError) {
            if (cachedError?.code !== "MODULE_REMOTE_UNAVAILABLE") throw cachedError;
            deleteModuleState(moduleId);
            deleteCachedManifestSnapshot(moduleItem.manifest_url);
            setModuleState(moduleId, {
              status: "checking",
              channel: moduleChannel.value,
              message: t("more.msg.fetchingManifest")
            });
            const refreshedManifest = await fetchModuleManifest(moduleItem.manifest_url, { allowCache: false });
            await openPreparedModule(refreshedManifest, "more.msg.downloadingPrepare", {}, {
              manifest_url: safeText(refreshedManifest.url || moduleItem.manifest_url),
              manifest_checked_at: (/* @__PURE__ */ new Date()).toISOString()
            });
            return;
          }
        }
        throw remoteManifestError || new Error(t("more.msg.manifestFetchFailed"));
      } catch (err) {
        setModuleState(moduleId, {
          status: "failed",
          channel: moduleChannel.value,
          message: safeText(err?.message || err) || t("more.msg.openFailed")
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
    let catalogLoadPromise = null;
    onMounted(async () => {
      const preferredChannel = normalizeModuleCenterChannel(await resolveModuleChannel(), "main");
      applyModuleCards(buildModuleCenterCards({ channel: preferredChannel }), preferredChannel);
      moduleLoading.value = false;
      void ensureStudentProfile();
      catalogLoadPromise = loadModuleCatalog({ silent: true });
      if (peekGameOpen()) {
        await ensureModuleCardsReady();
        await consumeGameCenterIntent();
        return;
      }
      await launchPanel();
    });
    const consumeGameCenterIntent = async () => {
      const pendingModuleId = consumeGameOpen();
      if (!pendingModuleId) return;
      await ensureModuleCardsReady();
      const target = moduleCards.value.find((item) => item.id === pendingModuleId);
      if (!target) return;
      activeLaunchSurface.value = "game_center";
      try {
        await handleModuleClick(target);
      } finally {
        activeLaunchSurface.value = "classic";
      }
    };
    const ensureModuleCardsReady = async () => {
      if (moduleCards.value.length) return;
      for (let attempt = 0; attempt < 15; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (moduleCards.value.length) return;
      }
    };
    const forwardingHint = ref(
      peekGameOpen() ? t("more.panel.openingGame") : t("more.panel.loading")
    );
    const panelForwardFailed = ref(false);
    const launchPanel = async () => {
      panelForwardFailed.value = false;
      moduleError.value = "";
      try {
        if (catalogLoadPromise) {
          await Promise.race([
            catalogLoadPromise.catch(() => void 0),
            new Promise((resolve) => setTimeout(resolve, PANEL_CATALOG_WAIT_MS))
          ]);
        }
        const target = moduleCards.value.find((item) => item.id === PANEL_MODULE_ID);
        if (!target) {
          panelForwardFailed.value = true;
          moduleError.value = t("more.panel.missing");
          return;
        }
        activeLaunchSurface.value = "classic";
        await handleModuleClick(target);
        const state = readModuleState(PANEL_MODULE_ID);
        if (safeText(state?.status) === "failed") {
          panelForwardFailed.value = true;
          moduleError.value = safeText(state?.message);
        }
      } catch (error) {
        panelForwardFailed.value = true;
        moduleError.value = String(error && error.message || error || "");
      }
    };
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
          createBaseVNode("span", _hoisted_3, toDisplayString(unref(t)("more.panel.title")), 1),
          _cache[2] || (_cache[2] = createBaseVNode("span", { "aria-hidden": "true" }, null, -1))
        ]),
        createBaseVNode("main", _hoisted_4, [
          createBaseVNode("section", _hoisted_5, [
            !panelForwardFailed.value ? (openBlock(), createElementBlock("span", _hoisted_6)) : (openBlock(), createElementBlock("span", _hoisted_7, "⚠️")),
            createBaseVNode("p", _hoisted_8, toDisplayString(panelForwardFailed.value ? unref(t)("more.panel.failed") : forwardingHint.value || unref(t)("more.panel.loading")), 1),
            panelForwardFailed.value ? (openBlock(), createElementBlock("button", {
              key: 2,
              type: "button",
              class: "panel-forward__retry",
              onClick: launchPanel
            }, toDisplayString(unref(t)("common.retry")), 1)) : createCommentVNode("", true),
            moduleError.value ? (openBlock(), createElementBlock("p", _hoisted_9, toDisplayString(moduleError.value), 1)) : createCommentVNode("", true)
          ])
        ])
      ]);
    };
  }
};
const MoreView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-77105f63"]]);
export {
  MoreView as default
};
