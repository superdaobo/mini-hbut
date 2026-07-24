import { _ as _export_sfc, o as openExternal, s as showToast } from "./app-demo-CxKBY5JQ.js";
import { c as createElementBlock, b as openBlock, d as createBaseVNode, F as Fragment, i as renderList, h as normalizeStyle, t as toDisplayString } from "./vue-core-DdLVj9yW.js";
import "./runtime-bridge-apFQ0nCw.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "quick-links-view" };
const _hoisted_2 = { class: "subpage-header" };
const _hoisted_3 = {
  class: "links-list",
  "aria-label": "快捷链接列表"
};
const _hoisted_4 = ["onClick"];
const _hoisted_5 = { class: "link-copy" };
const _sfc_main = {
  __name: "QuickLinksView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const quickLinks = [
      {
        id: "portal",
        title: "新融合门户",
        subtitle: "湖北工业大学统一身份认证与办事入口",
        url: "https://e.hbut.edu.cn/",
        icon: "account_balance",
        iconBg: "#E8F0FE",
        iconColor: "#1A73E8"
      },
      {
        id: "chaoxing",
        title: "学习通",
        subtitle: "超星学习通网页版",
        url: "https://i.chaoxing.com/",
        icon: "school",
        iconBg: "#E6F4EA",
        iconColor: "#1E8E3E"
      }
    ];
    const handleOpenLink = async (link) => {
      const ok = await openExternal(link.url);
      if (!ok) {
        showToast(`无法打开「${link.title}」，请稍后重试`, "error");
      }
    };
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
            createBaseVNode("h1", null, "快捷链接")
          ], -1)),
          _cache[3] || (_cache[3] = createBaseVNode("span", {
            class: "header-spacer",
            "aria-hidden": "true"
          }, null, -1))
        ]),
        _cache[5] || (_cache[5] = createBaseVNode("p", { class: "intro" }, "常用校园系统入口，点击后在系统浏览器中打开。", -1)),
        createBaseVNode("section", _hoisted_3, [
          (openBlock(), createElementBlock(Fragment, null, renderList(quickLinks, (link) => {
            return createBaseVNode("button", {
              key: link.id,
              class: "link-card",
              type: "button",
              onClick: ($event) => handleOpenLink(link)
            }, [
              createBaseVNode("div", {
                class: "link-icon-box",
                style: normalizeStyle({ background: link.iconBg })
              }, [
                createBaseVNode("span", {
                  class: "material-symbols-outlined",
                  style: normalizeStyle({ color: link.iconColor })
                }, toDisplayString(link.icon), 5)
              ], 4),
              createBaseVNode("div", _hoisted_5, [
                createBaseVNode("strong", null, toDisplayString(link.title), 1),
                createBaseVNode("span", null, toDisplayString(link.subtitle), 1)
              ]),
              _cache[4] || (_cache[4] = createBaseVNode("span", { class: "material-symbols-outlined link-arrow" }, "open_in_new", -1))
            ], 8, _hoisted_4);
          }), 64))
        ])
      ]);
    };
  }
};
const QuickLinksView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-ddcf73a0"]]);
export {
  QuickLinksView as default
};
