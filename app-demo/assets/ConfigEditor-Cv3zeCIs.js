import { a as ref, o as onMounted, c as createElementBlock, b as openBlock, d as createBaseVNode, g as createTextVNode, C as withDirectives, D as vModelText, H as vModelCheckbox, f as createCommentVNode, F as Fragment, i as renderList, n as normalizeClass, t as toDisplayString, e as computed, u as unref } from "./vue-core-DdLVj9yW.js";
import { r as renderMarkdown } from "./markdown-BHQqcErw.js";
import { j as fetchRemoteConfig } from "./more-modules-CsUTdMqs.js";
import { _ as _export_sfc, s as showToast } from "./app-demo-CxKBY5JQ.js";
import "./runtime-bridge-apFQ0nCw.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
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
const _hoisted_14 = { class: "form-grid" };
const _hoisted_15 = { class: "toggle" };
const _hoisted_16 = { class: "editor-card" };
const _hoisted_17 = { class: "form-grid" };
const _hoisted_18 = { class: "editor-card" };
const _hoisted_19 = { class: "tabs" };
const _hoisted_20 = ["onClick"];
const _hoisted_21 = {
  key: 0,
  class: "empty"
};
const _hoisted_22 = { class: "notice-header" };
const _hoisted_23 = ["onClick"];
const _hoisted_24 = { class: "form-grid" };
const _hoisted_25 = ["onUpdate:modelValue"];
const _hoisted_26 = ["onUpdate:modelValue"];
const _hoisted_27 = ["onUpdate:modelValue"];
const _hoisted_28 = ["onUpdate:modelValue"];
const _hoisted_29 = ["onUpdate:modelValue"];
const _hoisted_30 = { class: "markdown-editor" };
const _hoisted_31 = ["onUpdate:modelValue"];
const _hoisted_32 = ["innerHTML"];
const _hoisted_33 = { class: "editor-card" };
const _hoisted_34 = {
  key: 0,
  class: "error"
};
const _sfc_main = {
  __name: "ConfigEditor",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
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
    const tabs = [
      { key: "ticker", label: "滚动公告" },
      { key: "pinned", label: "置顶公告" },
      { key: "list", label: "公告列表" },
      { key: "confirm", label: "确认公告" }
    ];
    const currentList = computed(() => config.value.announcements[activeTab.value] || []);
    const newNotice = () => ({
      id: `notice-${Date.now()}`,
      title: "新公告",
      summary: "",
      content: "在这里填写 Markdown 正文",
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
        jsonError.value = "加载远程配置失败";
      }
    };
    const exportJson = async () => {
      ensureStruct();
      const invite = String(config.value.chaoxing_class?.invite_code || "").trim();
      if (!invite) {
        jsonError.value = "学习通邀请码不能为空";
        showToast("请填写学习通邀请码后再导出", "error");
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
        showToast("已导出 remote_config.json", "success");
        return;
      } catch {
      }
      try {
        await navigator.clipboard.writeText(data);
        showToast("导出失败，已复制 JSON 到剪贴板", "warning");
      } catch {
        showToast("导出失败，请手动复制下方 JSON", "error");
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
          }, "← 返回"),
          _cache[23] || (_cache[23] = createBaseVNode("h2", null, "配置工具", -1)),
          _cache[24] || (_cache[24] = createBaseVNode("p", null, "编辑远程配置并导出为 JSON 文件。", -1))
        ]),
        createBaseVNode("section", _hoisted_3, [
          _cache[29] || (_cache[29] = createBaseVNode("h3", null, "基础服务配置", -1)),
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("label", null, [
              _cache[25] || (_cache[25] = createTextVNode(" OCR 服务地址 ", -1)),
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
              _cache[26] || (_cache[26] = createTextVNode(" 启用 OCR ", -1))
            ]),
            createBaseVNode("label", null, [
              _cache[27] || (_cache[27] = createTextVNode(" 临时文件上传地址 ", -1)),
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
              _cache[28] || (_cache[28] = createTextVNode(" 启用临时文件服务 ", -1))
            ])
          ])
        ]),
        createBaseVNode("section", _hoisted_7, [
          _cache[36] || (_cache[36] = createBaseVNode("h3", null, "资料分享（WebDAV）", -1)),
          createBaseVNode("div", _hoisted_8, [
            createBaseVNode("label", _hoisted_9, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => config.value.resource_share.enabled = $event),
                type: "checkbox"
              }, null, 512), [
                [vModelCheckbox, config.value.resource_share.enabled]
              ]),
              _cache[30] || (_cache[30] = createTextVNode(" 启用资料分享 ", -1))
            ]),
            createBaseVNode("label", null, [
              _cache[31] || (_cache[31] = createTextVNode(" WebDAV 服务地址 ", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => config.value.resource_share.endpoint = $event),
                placeholder: "https://mini-hbut-chaoxing-webdav.hf.space"
              }, null, 512), [
                [vModelText, config.value.resource_share.endpoint]
              ])
            ]),
            createBaseVNode("label", null, [
              _cache[32] || (_cache[32] = createTextVNode(" WebDAV 用户名 ", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => config.value.resource_share.username = $event),
                placeholder: "mini-hbut"
              }, null, 512), [
                [vModelText, config.value.resource_share.username]
              ])
            ]),
            createBaseVNode("label", null, [
              _cache[33] || (_cache[33] = createTextVNode(" WebDAV 密码 ", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => config.value.resource_share.password = $event),
                placeholder: "mini-hbut"
              }, null, 512), [
                [vModelText, config.value.resource_share.password]
              ])
            ]),
            createBaseVNode("label", null, [
              _cache[34] || (_cache[34] = createTextVNode(" Office 在线预览代理 ", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => config.value.resource_share.office_preview_proxy = $event),
                placeholder: "https://view.officeapps.live.com/op/view.aspx?src="
              }, null, 512), [
                [vModelText, config.value.resource_share.office_preview_proxy]
              ])
            ]),
            createBaseVNode("label", null, [
              _cache[35] || (_cache[35] = createTextVNode(" Office 预览临时上传地址 ", -1)),
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
          _cache[43] || (_cache[43] = createBaseVNode("h3", null, "云同步（OCR 中转）", -1)),
          createBaseVNode("div", _hoisted_11, [
            createBaseVNode("label", _hoisted_12, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => config.value.cloud_sync.enabled = $event),
                type: "checkbox"
              }, null, 512), [
                [vModelCheckbox, config.value.cloud_sync.enabled]
              ]),
              _cache[37] || (_cache[37] = createTextVNode(" 启用云同步 ", -1))
            ]),
            createBaseVNode("label", null, [
              _cache[38] || (_cache[38] = createTextVNode(" 模式 ", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => config.value.cloud_sync.mode = $event),
                placeholder: "proxy"
              }, null, 512), [
                [vModelText, config.value.cloud_sync.mode]
              ])
            ]),
            createBaseVNode("label", null, [
              _cache[39] || (_cache[39] = createTextVNode(" 云同步中转地址 ", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => config.value.cloud_sync.proxy_endpoint = $event),
                placeholder: "https://mini-hbut-testocr1.hf.space/api/cloud-sync"
              }, null, 512), [
                [vModelText, config.value.cloud_sync.proxy_endpoint]
              ])
            ]),
            createBaseVNode("label", null, [
              _cache[40] || (_cache[40] = createTextVNode(" 秘钥引用（secret_ref） ", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => config.value.cloud_sync.secret_ref = $event),
                placeholder: "kv1-main"
              }, null, 512), [
                [vModelText, config.value.cloud_sync.secret_ref]
              ])
            ]),
            createBaseVNode("label", null, [
              _cache[41] || (_cache[41] = createTextVNode(" 请求超时（ms） ", -1)),
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
              _cache[42] || (_cache[42] = createTextVNode(" 同步冷却（秒） ", -1)),
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
          _cache[46] || (_cache[46] = createBaseVNode("h3", null, "学习通资料库", -1)),
          _cache[47] || (_cache[47] = createBaseVNode("p", { class: "hint" }, " 只需填写邀请码。导出并推送到远程配置后，客户端会下载并缓存该邀请码；课程名、教师、封面等由 App 根据邀请码在线解析。远程不可达时使用本地缓存/内置默认邀请码。 ", -1)),
          createBaseVNode("div", _hoisted_14, [
            createBaseVNode("label", _hoisted_15, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => config.value.chaoxing_class.enabled = $event),
                type: "checkbox"
              }, null, 512), [
                [vModelCheckbox, config.value.chaoxing_class.enabled]
              ]),
              _cache[44] || (_cache[44] = createTextVNode(" 启用学习通资料库 ", -1))
            ]),
            createBaseVNode("label", null, [
              _cache[45] || (_cache[45] = createTextVNode(" 邀请码（必填） ", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => config.value.chaoxing_class.invite_code = $event),
                placeholder: "18853572"
              }, null, 512), [
                [vModelText, config.value.chaoxing_class.invite_code]
              ])
            ])
          ])
        ]),
        createBaseVNode("section", _hoisted_16, [
          _cache[51] || (_cache[51] = createBaseVNode("h3", null, "强制更新", -1)),
          createBaseVNode("div", _hoisted_17, [
            createBaseVNode("label", null, [
              _cache[48] || (_cache[48] = createTextVNode(" 最低版本 ", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => config.value.force_update.min_version = $event),
                placeholder: "1.1.0"
              }, null, 512), [
                [vModelText, config.value.force_update.min_version]
              ])
            ]),
            createBaseVNode("label", null, [
              _cache[49] || (_cache[49] = createTextVNode(" 更新说明 ", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => config.value.force_update.message = $event),
                placeholder: "当前版本过低，请更新后继续使用。"
              }, null, 512), [
                [vModelText, config.value.force_update.message]
              ])
            ]),
            createBaseVNode("label", null, [
              _cache[50] || (_cache[50] = createTextVNode(" 下载地址 ", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[21] || (_cache[21] = ($event) => config.value.force_update.download_url = $event),
                placeholder: "https://github.com/superdaobo/mini-hbut/releases"
              }, null, 512), [
                [vModelText, config.value.force_update.download_url]
              ])
            ])
          ])
        ]),
        createBaseVNode("section", _hoisted_18, [
          createBaseVNode("div", _hoisted_19, [
            (openBlock(), createElementBlock(Fragment, null, renderList(tabs, (tab) => {
              return createBaseVNode("button", {
                key: tab.key,
                class: normalizeClass(["tab-btn", { active: activeTab.value === tab.key }]),
                onClick: ($event) => activeTab.value = tab.key
              }, toDisplayString(tab.label), 11, _hoisted_20);
            }), 64)),
            createBaseVNode("button", {
              class: "add-btn",
              onClick: addNotice
            }, "+ 新增公告")
          ]),
          !currentList.value.length ? (openBlock(), createElementBlock("div", _hoisted_21, "暂无公告")) : createCommentVNode("", true),
          (openBlock(true), createElementBlock(Fragment, null, renderList(currentList.value, (notice, index) => {
            return openBlock(), createElementBlock("div", {
              key: notice.id,
              class: "notice-editor"
            }, [
              createBaseVNode("div", _hoisted_22, [
                createBaseVNode("h4", null, toDisplayString(notice.title || "未命名公告"), 1),
                createBaseVNode("button", {
                  class: "remove-btn",
                  onClick: ($event) => removeNotice(index)
                }, "删除", 8, _hoisted_23)
              ]),
              createBaseVNode("div", _hoisted_24, [
                createBaseVNode("label", null, [
                  _cache[52] || (_cache[52] = createTextVNode(" ID ", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": ($event) => notice.id = $event
                  }, null, 8, _hoisted_25), [
                    [vModelText, notice.id]
                  ])
                ]),
                createBaseVNode("label", null, [
                  _cache[53] || (_cache[53] = createTextVNode(" 标题 ", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": ($event) => notice.title = $event
                  }, null, 8, _hoisted_26), [
                    [vModelText, notice.title]
                  ])
                ]),
                createBaseVNode("label", null, [
                  _cache[54] || (_cache[54] = createTextVNode(" 更新时间 ", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": ($event) => notice.updated_at = $event
                  }, null, 8, _hoisted_27), [
                    [vModelText, notice.updated_at]
                  ])
                ]),
                createBaseVNode("label", null, [
                  _cache[55] || (_cache[55] = createTextVNode(" 图片地址 ", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": ($event) => notice.image = $event,
                    placeholder: "https://..."
                  }, null, 8, _hoisted_28), [
                    [vModelText, notice.image]
                  ])
                ]),
                createBaseVNode("label", null, [
                  _cache[56] || (_cache[56] = createTextVNode(" 摘要 ", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": ($event) => notice.summary = $event
                  }, null, 8, _hoisted_29), [
                    [vModelText, notice.summary]
                  ])
                ])
              ]),
              createBaseVNode("div", _hoisted_30, [
                createBaseVNode("div", null, [
                  _cache[57] || (_cache[57] = createBaseVNode("h5", null, "正文（Markdown）", -1)),
                  withDirectives(createBaseVNode("textarea", {
                    "onUpdate:modelValue": ($event) => notice.content = $event,
                    rows: "6"
                  }, null, 8, _hoisted_31), [
                    [vModelText, notice.content]
                  ])
                ]),
                createBaseVNode("div", null, [
                  _cache[58] || (_cache[58] = createBaseVNode("h5", null, "预览", -1)),
                  createBaseVNode("div", {
                    class: "markdown-preview",
                    innerHTML: unref(renderMarkdown)(notice.content || "")
                  }, null, 8, _hoisted_32)
                ])
              ])
            ]);
          }), 128))
        ]),
        createBaseVNode("section", _hoisted_33, [
          _cache[59] || (_cache[59] = createBaseVNode("h3", null, "导出 JSON", -1)),
          withDirectives(createBaseVNode("textarea", {
            "onUpdate:modelValue": _cache[22] || (_cache[22] = ($event) => rawJson.value = $event),
            rows: "10",
            readonly: "",
            placeholder: "导出的 JSON 会显示在这里"
          }, null, 512), [
            [vModelText, rawJson.value]
          ]),
          createBaseVNode("div", { class: "actions" }, [
            createBaseVNode("button", {
              class: "btn-primary",
              onClick: exportJson
            }, "导出 JSON"),
            createBaseVNode("button", {
              class: "btn-secondary",
              onClick: loadRemoteConfig
            }, "重新加载")
          ]),
          jsonError.value ? (openBlock(), createElementBlock("p", _hoisted_34, toDisplayString(jsonError.value), 1)) : createCommentVNode("", true)
        ])
      ]);
    };
  }
};
const ConfigEditor = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-07677dd3"]]);
export {
  ConfigEditor as default
};
