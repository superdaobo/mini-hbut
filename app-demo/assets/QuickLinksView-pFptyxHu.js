import { _ as _export_sfc, u as useLocale, o as openExternal, j as showToast } from "./app-demo-CUOWTnz-.js";
import { a as openBlock, c as createElementBlock, b as createBaseVNode, u as unref, t as toDisplayString, F as Fragment, f as renderList, e as normalizeStyle } from "./vue-core-Dzs4fLAU.js";
import "./runtime-bridge-Dt57BD2i.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "quick-links-view" };
const _hoisted_2 = { class: "subpage-header" };
const _hoisted_3 = ["aria-label"];
const _hoisted_4 = { class: "header-copy" };
const _hoisted_5 = { class: "header-kicker" };
const _hoisted_6 = { class: "intro" };
const _hoisted_7 = ["aria-label"];
const _hoisted_8 = ["onClick"];
const _hoisted_9 = { class: "link-copy" };
const _sfc_main = {
  __name: "QuickLinksView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const { t } = useLocale();
    const emit = __emit;
    const quickLinks = [
      {
        id: "portal",
        title: "home.quick_links.portal.title",
        subtitle: "home.quick_links.portal.subtitle",
        url: "https://e.hbut.edu.cn/",
        icon: "account_balance",
        iconBg: "#E8F0FE",
        iconColor: "#1A73E8"
      },
      {
        id: "chaoxing",
        title: "home.quick_links.chaoxing.title",
        subtitle: "home.quick_links.chaoxing.subtitle",
        url: "https://i.chaoxing.com/",
        icon: "school",
        iconBg: "#E6F4EA",
        iconColor: "#1E8E3E"
      }
    ];
    const handleOpenLink = async (link) => {
      const ok = await openExternal(link.url);
      if (!ok) {
        showToast(t("home.quick_links.openFailed").replace("{name}", t(link.title)), "error");
      }
    };
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", _hoisted_2, [
          createBaseVNode("button", {
            class: "back-button",
            type: "button",
            onClick: _cache[0] || (_cache[0] = ($event) => emit("back")),
            "aria-label": unref(t)("home.quick_links.back")
          }, [..._cache[1] || (_cache[1] = [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)
          ])], 8, _hoisted_3),
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("span", _hoisted_5, toDisplayString(unref(t)("home.quick_links.kicker")), 1),
            createBaseVNode("h1", null, toDisplayString(unref(t)("home.quick_links.title")), 1)
          ]),
          _cache[2] || (_cache[2] = createBaseVNode("span", {
            class: "header-spacer",
            "aria-hidden": "true"
          }, null, -1))
        ]),
        createBaseVNode("p", _hoisted_6, toDisplayString(unref(t)("home.quick_links.intro")), 1),
        createBaseVNode("section", {
          class: "links-list",
          "aria-label": unref(t)("home.quick_links.listAria")
        }, [
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
              createBaseVNode("div", _hoisted_9, [
                createBaseVNode("strong", null, toDisplayString(unref(t)(link.title)), 1),
                createBaseVNode("span", null, toDisplayString(unref(t)(link.subtitle)), 1)
              ]),
              _cache[3] || (_cache[3] = createBaseVNode("span", { class: "material-symbols-outlined link-arrow" }, "open_in_new", -1))
            ], 8, _hoisted_8);
          }), 64))
        ], 8, _hoisted_7)
      ]);
    };
  }
};
const QuickLinksView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-0490e6bf"]]);
export {
  QuickLinksView as default
};
