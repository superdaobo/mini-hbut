import { r as ref, o as onMounted, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, u as unref, g as createTextVNode, K as withDirectives, L as vModelText, Q as vModelCheckbox, F as Fragment, f as renderList, n as normalizeClass, d as createCommentVNode, h as computed } from "./vue-core-Dzs4fLAU.js";
import { renderMarkdown } from "./markdown-BYynpwuf.js";
import { _ as _export_sfc, m as useI18n, $ as fetchRemoteConfig, j as showToast } from "./app-demo-CUOWTnz-.js";
import "./runtime-bridge-Dt57BD2i.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "config-editor" };
const _hoisted_2 = { class: "editor-header" };
const _hoisted_3 = { class: "editor-card" };
const _hoisted_4 = { class: "form-grid" };
const _hoisted_5 = { class: "toggle" };
const _hoisted_6 = { class: "toggle" };
const _hoisted_7 = { class: "editor-card" };
const _hoisted_8 = { class: "form-grid" };
const _hoisted_9 = { class: "toggle" };
const _hoisted_10 = { class: "editor-card" };
const _hoisted_11 = { class: "form-grid" };
const _hoisted_12 = { class: "toggle" };
const _hoisted_13 = { class: "editor-card" };
const _hoisted_14 = { class: "hint" };
const _hoisted_15 = { class: "form-grid" };
const _hoisted_16 = { class: "toggle" };
const _hoisted_17 = { class: "editor-card" };
const _hoisted_18 = { class: "form-grid" };
const _hoisted_19 = ["placeholder"];
const _hoisted_20 = { class: "editor-card" };
const _hoisted_21 = { class: "tabs" };
const _hoisted_22 = ["onClick"];
const _hoisted_23 = {
  key: 0,
  class: "empty"
};
const _hoisted_24 = { class: "notice-header" };
const _hoisted_25 = ["onClick"];
const _hoisted_26 = { class: "form-grid" };
const _hoisted_27 = ["onUpdate:modelValue"];
const _hoisted_28 = ["onUpdate:modelValue"];
const _hoisted_29 = ["onUpdate:modelValue"];
const _hoisted_30 = ["onUpdate:modelValue"];
const _hoisted_31 = ["onUpdate:modelValue"];
const _hoisted_32 = { class: "markdown-editor" };
const _hoisted_33 = ["onUpdate:modelValue"];
const _hoisted_34 = ["innerHTML"];
const _hoisted_35 = { class: "editor-card" };
const _hoisted_36 = ["placeholder"];
const _hoisted_37 = { class: "actions" };
const _hoisted_38 = {
  key: 0,
  class: "error"
};
const _sfc_main = {
  __name: "ConfigEditor",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const defaultConfig = {
      announcements: {
        ticker: [],
        pinned: [],
        list: [],
        confirm: []
      },
      force_update: {
        min_version: "",
        message: "",
        download_url: ""
      },
      ocr: {
        endpoint: "",
        enabled: true
      },
      temp_file_server: {
        schedule_upload_endpoint: "",
        enabled: true
      },
      resource_share: {
        enabled: true,
        endpoint: "https://mini-hbut-chaoxing-webdav.hf.space",
        username: "mini-hbut",
        password: "mini-hbut",
        office_preview_proxy: "https://view.officeapps.live.com/op/view.aspx?src=",
        temp_upload_endpoint: ""
      },
      cloud_sync: {
        enabled: true,
        mode: "proxy",
        proxy_endpoint: "https://mini-hbut-testocr1.hf.space/api/cloud-sync",
        secret_ref: "kv1-main",
        timeout_ms: 12e3,
        cooldown_seconds: 180
      },
      // 学习通资料库：远程配置只需邀请码；课程信息由客户端在线解析
      chaoxing_class: {
        enabled: true,
        invite_code: "18853572"
      }
    };
    const config = ref(JSON.parse(JSON.stringify(defaultConfig)));
    const activeTab = ref("ticker");
    const rawJson = ref("");
    const jsonError = ref("");
    const tabs = computed(() => [
      { key: "ticker", label: t("config.tab.ticker") },
      { key: "pinned", label: t("config.tab.pinned") },
      { key: "list", label: t("config.tab.list") },
      { key: "confirm", label: t("config.tab.confirm") }
    ]);
    const currentList = computed(() => config.value.announcements[activeTab.value] || []);
    const newNotice = () => ({
      id: `notice-${Date.now()}`,
      title: t("config.notice.newTitle"),
      summary: "",
      content: t("config.notice.newContent"),
      image: "",
      updated_at: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      pinned: activeTab.value === "pinned",
      require_confirm: activeTab.value === "confirm"
    });
    const ensureStruct = () => {
      if (!config.value.announcements) {
        config.value.announcements = { ticker: [], pinned: [], list: [], confirm: [] };
      }
      for (const key of ["ticker", "pinned", "list", "confirm"]) {
        if (!Array.isArray(config.value.announcements[key])) config.value.announcements[key] = [];
      }
      if (!config.value.force_update) {
        config.value.force_update = { min_version: "", message: "", download_url: "" };
      }
      if (!config.value.ocr) {
        config.value.ocr = { endpoint: "", enabled: true };
      }
      if (!config.value.temp_file_server) {
        config.value.temp_file_server = { schedule_upload_endpoint: "", enabled: true };
      }
      if (!config.value.resource_share) {
        config.value.resource_share = { ...defaultConfig.resource_share };
      }
      if (!config.value.cloud_sync) {
        config.value.cloud_sync = { ...defaultConfig.cloud_sync };
      }
      config.value.cloud_sync.mode = String(config.value.cloud_sync.mode || "proxy").trim() || "proxy";
      config.value.cloud_sync.proxy_endpoint = String(
        config.value.cloud_sync.proxy_endpoint || config.value.cloud_sync.endpoint || defaultConfig.cloud_sync.proxy_endpoint
      ).trim();
      config.value.cloud_sync.secret_ref = String(
        config.value.cloud_sync.secret_ref || defaultConfig.cloud_sync.secret_ref
      ).trim();
      if (!config.value.chaoxing_class || typeof config.value.chaoxing_class !== "object") {
        config.value.chaoxing_class = { ...defaultConfig.chaoxing_class };
      }
      const cx = config.value.chaoxing_class;
      cx.enabled = cx.enabled !== false;
      cx.invite_code = String(cx.invite_code || cx.inviteCode || defaultConfig.chaoxing_class.invite_code).trim();
      delete cx.course_id;
      delete cx.clazz_id;
      delete cx.course_name;
      delete cx.teacher_name;
      delete cx.cpi;
      delete cx.courseId;
      delete cx.clazzId;
      delete cx.courseName;
      delete cx.teacherName;
    };
    const addNotice = () => {
      currentList.value.push(newNotice());
    };
    const removeNotice = (index) => {
      currentList.value.splice(index, 1);
    };
    const loadRemoteConfig = async () => {
      jsonError.value = "";
      try {
        const remote = await fetchRemoteConfig();
        config.value = JSON.parse(JSON.stringify(remote || defaultConfig));
        ensureStruct();
        rawJson.value = JSON.stringify(config.value, null, 2);
      } catch {
        jsonError.value = t("config.error.loadFailed");
      }
    };
    const exportJson = async () => {
      ensureStruct();
      const invite = String(config.value.chaoxing_class?.invite_code || "").trim();
      if (!invite) {
        jsonError.value = t("config.error.inviteCodeEmpty");
        showToast(t("config.toast.inviteCodeRequired"), "error");
        return;
      }
      jsonError.value = "";
      const data = JSON.stringify(config.value, null, 2);
      rawJson.value = data;
      try {
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "remote_config.json";
        a.click();
        URL.revokeObjectURL(url);
        showToast(t("config.toast.exported"), "success");
        return;
      } catch {
      }
      try {
        await navigator.clipboard.writeText(data);
        showToast(t("config.toast.exportFailedCopied"), "warning");
      } catch {
        showToast(t("config.toast.exportFailedManual"), "error");
      }
    };
    onMounted(() => {
      loadRemoteConfig();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", _hoisted_2, [
          createBaseVNode("button", {
            class: "back-btn",
            onClick: _cache[0] || (_cache[0] = ($event) => emit("back"))
          }, toDisplayString(unref(t)("config.back")), 1),
          createBaseVNode("h2", null, toDisplayString(unref(t)("config.title")), 1),
          createBaseVNode("p", null, toDisplayString(unref(t)("config.subtitle")), 1)
        ]),
        createBaseVNode("section", _hoisted_3, [
          createBaseVNode("h3", null, toDisplayString(unref(t)("config.section.basic")), 1),
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("label", null, [
              createTextVNode(toDisplayString(unref(t)("config.label.ocrEndpoint")) + " ", 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => config.value.ocr.endpoint = $event),
                placeholder: "https://mini-hbut-testocr1.hf.space/api/ocr/recognize"
              }, null, 512), [
                [vModelText, config.value.ocr.endpoint]
              ])
            ]),
            createBaseVNode("label", _hoisted_5, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => config.value.ocr.enabled = $event),
                type: "checkbox"
              }, null, 512), [
                [vModelCheckbox, config.value.ocr.enabled]
              ]),
              createTextVNode(" " + toDisplayString(unref(t)("config.label.enableOcr")), 1)
            ]),
            createBaseVNode("label", null, [
              createTextVNode(toDisplayString(unref(t)("config.label.tempUpload")) + " ", 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => config.value.temp_file_server.schedule_upload_endpoint = $event),
                placeholder: "https://mini-hbut-testocr1.hf.space/api/temp/upload"
              }, null, 512), [
                [vModelText, config.value.temp_file_server.schedule_upload_endpoint]
              ])
            ]),
            createBaseVNode("label", _hoisted_6, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => config.value.temp_file_server.enabled = $event),
                type: "checkbox"
              }, null, 512), [
                [vModelCheckbox, config.value.temp_file_server.enabled]
              ]),
              createTextVNode(" " + toDisplayString(unref(t)("config.label.enableTempServer")), 1)
            ])
          ])
        ]),
        createBaseVNode("section", _hoisted_7, [
          createBaseVNode("h3", null, toDisplayString(unref(t)("config.section.webdav")), 1),
          createBaseVNode("div", _hoisted_8, [
            createBaseVNode("label", _hoisted_9, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => config.value.resource_share.enabled = $event),
                type: "checkbox"
              }, null, 512), [
                [vModelCheckbox, config.value.resource_share.enabled]
              ]),
              createTextVNode(" " + toDisplayString(unref(t)("config.label.enableShare")), 1)
            ]),
            createBaseVNode("label", null, [
              createTextVNode(toDisplayString(unref(t)("config.label.webdavEndpoint")) + " ", 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => config.value.resource_share.endpoint = $event),
                placeholder: "https://mini-hbut-chaoxing-webdav.hf.space"
              }, null, 512), [
                [vModelText, config.value.resource_share.endpoint]
              ])
            ]),
            createBaseVNode("label", null, [
              createTextVNode(toDisplayString(unref(t)("config.label.webdavUser")) + " ", 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => config.value.resource_share.username = $event),
                placeholder: "mini-hbut"
              }, null, 512), [
                [vModelText, config.value.resource_share.username]
              ])
            ]),
            createBaseVNode("label", null, [
              createTextVNode(toDisplayString(unref(t)("config.label.webdavPassword")) + " ", 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => config.value.resource_share.password = $event),
                placeholder: "mini-hbut"
              }, null, 512), [
                [vModelText, config.value.resource_share.password]
              ])
            ]),
            createBaseVNode("label", null, [
              createTextVNode(toDisplayString(unref(t)("config.label.officeProxy")) + " ", 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => config.value.resource_share.office_preview_proxy = $event),
                placeholder: "https://view.officeapps.live.com/op/view.aspx?src="
              }, null, 512), [
                [vModelText, config.value.resource_share.office_preview_proxy]
              ])
            ]),
            createBaseVNode("label", null, [
              createTextVNode(toDisplayString(unref(t)("config.label.officeTempUpload")) + " ", 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => config.value.resource_share.temp_upload_endpoint = $event),
                placeholder: "https://mini-hbut-testocr1.hf.space/api/temp/upload"
              }, null, 512), [
                [vModelText, config.value.resource_share.temp_upload_endpoint]
              ])
            ])
          ])
        ]),
        createBaseVNode("section", _hoisted_10, [
          createBaseVNode("h3", null, toDisplayString(unref(t)("config.section.cloudSync")), 1),
          createBaseVNode("div", _hoisted_11, [
            createBaseVNode("label", _hoisted_12, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => config.value.cloud_sync.enabled = $event),
                type: "checkbox"
              }, null, 512), [
                [vModelCheckbox, config.value.cloud_sync.enabled]
              ]),
              createTextVNode(" " + toDisplayString(unref(t)("config.label.enableCloudSync")), 1)
            ]),
            createBaseVNode("label", null, [
              createTextVNode(toDisplayString(unref(t)("config.label.mode")) + " ", 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => config.value.cloud_sync.mode = $event),
                placeholder: "proxy"
              }, null, 512), [
                [vModelText, config.value.cloud_sync.mode]
              ])
            ]),
            createBaseVNode("label", null, [
              createTextVNode(toDisplayString(unref(t)("config.label.cloudSyncEndpoint")) + " ", 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => config.value.cloud_sync.proxy_endpoint = $event),
                placeholder: "https://mini-hbut-testocr1.hf.space/api/cloud-sync"
              }, null, 512), [
                [vModelText, config.value.cloud_sync.proxy_endpoint]
              ])
            ]),
            createBaseVNode("label", null, [
              createTextVNode(toDisplayString(unref(t)("config.label.secretRef")) + " ", 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => config.value.cloud_sync.secret_ref = $event),
                placeholder: "kv1-main"
              }, null, 512), [
                [vModelText, config.value.cloud_sync.secret_ref]
              ])
            ]),
            createBaseVNode("label", null, [
              createTextVNode(toDisplayString(unref(t)("config.label.timeout")) + " ", 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => config.value.cloud_sync.timeout_ms = $event),
                type: "number",
                min: "3000",
                max: "45000",
                step: "500"
              }, null, 512), [
                [
                  vModelText,
                  config.value.cloud_sync.timeout_ms,
                  void 0,
                  { number: true }
                ]
              ])
            ]),
            createBaseVNode("label", null, [
              createTextVNode(toDisplayString(unref(t)("config.label.cooldown")) + " ", 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => config.value.cloud_sync.cooldown_seconds = $event),
                type: "number",
                min: "30",
                max: "3600",
                step: "10"
              }, null, 512), [
                [
                  vModelText,
                  config.value.cloud_sync.cooldown_seconds,
                  void 0,
                  { number: true }
                ]
              ])
            ])
          ])
        ]),
        createBaseVNode("section", _hoisted_13, [
          createBaseVNode("h3", null, toDisplayString(unref(t)("config.section.chaoxing")), 1),
          createBaseVNode("p", _hoisted_14, toDisplayString(unref(t)("config.chaoxing.hint")), 1),
          createBaseVNode("div", _hoisted_15, [
            createBaseVNode("label", _hoisted_16, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => config.value.chaoxing_class.enabled = $event),
                type: "checkbox"
              }, null, 512), [
                [vModelCheckbox, config.value.chaoxing_class.enabled]
              ]),
              createTextVNode(" " + toDisplayString(unref(t)("config.label.enableChaoxing")), 1)
            ]),
            createBaseVNode("label", null, [
              createTextVNode(toDisplayString(unref(t)("config.label.inviteCode")) + " ", 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => config.value.chaoxing_class.invite_code = $event),
                placeholder: "18853572"
              }, null, 512), [
                [vModelText, config.value.chaoxing_class.invite_code]
              ])
            ])
          ])
        ]),
        createBaseVNode("section", _hoisted_17, [
          createBaseVNode("h3", null, toDisplayString(unref(t)("config.section.forceUpdate")), 1),
          createBaseVNode("div", _hoisted_18, [
            createBaseVNode("label", null, [
              createTextVNode(toDisplayString(unref(t)("config.label.minVersion")) + " ", 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => config.value.force_update.min_version = $event),
                placeholder: "1.1.0"
              }, null, 512), [
                [vModelText, config.value.force_update.min_version]
              ])
            ]),
            createBaseVNode("label", null, [
              createTextVNode(toDisplayString(unref(t)("config.label.updateMessage")) + " ", 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => config.value.force_update.message = $event),
                placeholder: unref(t)("config.placeholder.forceUpdateMessage")
              }, null, 8, _hoisted_19), [
                [vModelText, config.value.force_update.message]
              ])
            ]),
            createBaseVNode("label", null, [
              createTextVNode(toDisplayString(unref(t)("config.label.downloadUrl")) + " ", 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[21] || (_cache[21] = ($event) => config.value.force_update.download_url = $event),
                placeholder: "https://github.com/superdaobo/mini-hbut/releases"
              }, null, 512), [
                [vModelText, config.value.force_update.download_url]
              ])
            ])
          ])
        ]),
        createBaseVNode("section", _hoisted_20, [
          createBaseVNode("div", _hoisted_21, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(tabs.value, (tab) => {
              return openBlock(), createElementBlock("button", {
                key: tab.key,
                class: normalizeClass(["tab-btn", { active: activeTab.value === tab.key }]),
                onClick: ($event) => activeTab.value = tab.key
              }, toDisplayString(tab.label), 11, _hoisted_22);
            }), 128)),
            createBaseVNode("button", {
              class: "add-btn",
              onClick: addNotice
            }, toDisplayString(unref(t)("config.action.addNotice")), 1)
          ]),
          !currentList.value.length ? (openBlock(), createElementBlock("div", _hoisted_23, toDisplayString(unref(t)("config.notice.empty")), 1)) : createCommentVNode("", true),
          (openBlock(true), createElementBlock(Fragment, null, renderList(currentList.value, (notice, index) => {
            return openBlock(), createElementBlock("div", {
              key: notice.id,
              class: "notice-editor"
            }, [
              createBaseVNode("div", _hoisted_24, [
                createBaseVNode("h4", null, toDisplayString(notice.title || unref(t)("config.notice.unnamed")), 1),
                createBaseVNode("button", {
                  class: "remove-btn",
                  onClick: ($event) => removeNotice(index)
                }, toDisplayString(unref(t)("config.notice.delete")), 9, _hoisted_25)
              ]),
              createBaseVNode("div", _hoisted_26, [
                createBaseVNode("label", null, [
                  _cache[23] || (_cache[23] = createTextVNode(" ID ", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": ($event) => notice.id = $event
                  }, null, 8, _hoisted_27), [
                    [vModelText, notice.id]
                  ])
                ]),
                createBaseVNode("label", null, [
                  createTextVNode(toDisplayString(unref(t)("config.label.title")) + " ", 1),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": ($event) => notice.title = $event
                  }, null, 8, _hoisted_28), [
                    [vModelText, notice.title]
                  ])
                ]),
                createBaseVNode("label", null, [
                  createTextVNode(toDisplayString(unref(t)("config.label.updatedAt")) + " ", 1),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": ($event) => notice.updated_at = $event
                  }, null, 8, _hoisted_29), [
                    [vModelText, notice.updated_at]
                  ])
                ]),
                createBaseVNode("label", null, [
                  createTextVNode(toDisplayString(unref(t)("config.label.image")) + " ", 1),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": ($event) => notice.image = $event,
                    placeholder: "https://..."
                  }, null, 8, _hoisted_30), [
                    [vModelText, notice.image]
                  ])
                ]),
                createBaseVNode("label", null, [
                  createTextVNode(toDisplayString(unref(t)("config.label.summary")) + " ", 1),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": ($event) => notice.summary = $event
                  }, null, 8, _hoisted_31), [
                    [vModelText, notice.summary]
                  ])
                ])
              ]),
              createBaseVNode("div", _hoisted_32, [
                createBaseVNode("div", null, [
                  createBaseVNode("h5", null, toDisplayString(unref(t)("config.label.content")), 1),
                  withDirectives(createBaseVNode("textarea", {
                    "onUpdate:modelValue": ($event) => notice.content = $event,
                    rows: "6"
                  }, null, 8, _hoisted_33), [
                    [vModelText, notice.content]
                  ])
                ]),
                createBaseVNode("div", null, [
                  createBaseVNode("h5", null, toDisplayString(unref(t)("config.label.preview")), 1),
                  createBaseVNode("div", {
                    class: "markdown-preview",
                    innerHTML: unref(renderMarkdown)(notice.content || "")
                  }, null, 8, _hoisted_34)
                ])
              ])
            ]);
          }), 128))
        ]),
        createBaseVNode("section", _hoisted_35, [
          createBaseVNode("h3", null, toDisplayString(unref(t)("config.section.export")), 1),
          withDirectives(createBaseVNode("textarea", {
            "onUpdate:modelValue": _cache[22] || (_cache[22] = ($event) => rawJson.value = $event),
            rows: "10",
            readonly: "",
            placeholder: unref(t)("config.export.placeholder")
          }, null, 8, _hoisted_36), [
            [vModelText, rawJson.value]
          ]),
          createBaseVNode("div", _hoisted_37, [
            createBaseVNode("button", {
              class: "btn-primary",
              onClick: exportJson
            }, toDisplayString(unref(t)("config.action.exportJson")), 1),
            createBaseVNode("button", {
              class: "btn-secondary",
              onClick: loadRemoteConfig
            }, toDisplayString(unref(t)("config.action.reload")), 1)
          ]),
          jsonError.value ? (openBlock(), createElementBlock("p", _hoisted_38, toDisplayString(jsonError.value), 1)) : createCommentVNode("", true)
        ])
      ]);
    };
  }
};
const ConfigEditor = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-b49fac10"]]);
export {
  ConfigEditor as default
};
