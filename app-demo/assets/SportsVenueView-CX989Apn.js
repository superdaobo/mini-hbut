import { o as onMounted, c as createElementBlock, b as openBlock, q as createVNode, d as createBaseVNode, l as withCtx, a as ref, t as toDisplayString, u as unref, k as createBlock, f as createCommentVNode, F as Fragment, i as renderList, j as withModifiers, g as createTextVNode, n as normalizeClass, C as withDirectives, D as vModelText, e as computed } from "./vue-core-DdLVj9yW.js";
import { b as isTauriRuntime, a as invokeNative } from "./runtime-bridge-apFQ0nCw.js";
import { _ as _export_sfc, s as showToast } from "./app-demo-CxKBY5JQ.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import { T as TEmptyState } from "./TEmptyState-BSfdOG3N.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "page" };
const _hoisted_2 = ["disabled"];
const _hoisted_3 = { class: "material-symbols-outlined" };
const _hoisted_4 = { class: "body" };
const _hoisted_5 = {
  key: 1,
  class: "card"
};
const _hoisted_6 = { class: "err" };
const _hoisted_7 = {
  key: 0,
  class: "user-bar"
};
const _hoisted_8 = { class: "list" };
const _hoisted_9 = ["onClick"];
const _hoisted_10 = { class: "stadium-top" };
const _hoisted_11 = {
  key: 0,
  class: "meta"
};
const _hoisted_12 = {
  key: 1,
  class: "meta"
};
const _hoisted_13 = ["onClick"];
const _hoisted_14 = ["onClick"];
const _hoisted_15 = {
  key: 1,
  class: "hint"
};
const _hoisted_16 = {
  key: 0,
  class: "days"
};
const _hoisted_17 = ["onClick"];
const _hoisted_18 = {
  key: 1,
  class: "days"
};
const _hoisted_19 = {
  key: 2,
  class: "cost"
};
const _hoisted_20 = {
  key: 3,
  class: "err"
};
const _hoisted_21 = {
  key: 4,
  class: "hint"
};
const _hoisted_22 = { class: "slots" };
const _hoisted_23 = ["disabled", "onClick"];
const _hoisted_24 = { class: "t" };
const _hoisted_25 = {
  key: 0,
  class: "p"
};
const _hoisted_26 = { class: "cart-bar" };
const _hoisted_27 = { class: "muted" };
const _hoisted_28 = ["disabled"];
const _hoisted_29 = {
  key: 0,
  class: "card pay-box"
};
const _hoisted_30 = ["disabled"];
const _hoisted_31 = { class: "order-top" };
const _hoisted_32 = { class: "meta" };
const _hoisted_33 = {
  key: 0,
  class: "meta"
};
const _hoisted_34 = { class: "order-actions" };
const _hoisted_35 = ["onClick"];
const _hoisted_36 = ["onClick"];
const _hoisted_37 = {
  key: 1,
  class: "hint"
};
const _sfc_main = {
  __name: "SportsVenueView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const loading = ref(true);
    const acting = ref(false);
    const error = ref("");
    const token = ref("");
    const user = ref(null);
    const stadiums = ref([]);
    const tab = ref("home");
    const selectedStadium = ref(null);
    const half = ref(0);
    const selectDate = ref("");
    const weekList = ref([]);
    const placeDetailList = ref([]);
    const costDesc = ref("");
    const enablePay = ref("1");
    const followNum = ref(0);
    const cart = ref([]);
    const orders = ref([]);
    const payPassword = ref("");
    const pendingOrder = ref(null);
    const roleId = computed(() => {
      const r = user.value?.roleId;
      if (r == null || r === "") return "";
      return String(r).trim().replace(/^["']+|["']+$/g, "");
    });
    const totalPriceFen = computed(
      () => cart.value.reduce((s, i) => s + (Number(i.price) || 0), 0)
    );
    const totalPriceYuan = computed(() => (totalPriceFen.value / 100).toFixed(2));
    const todayStr = () => {
      const t = /* @__PURE__ */ new Date();
      const m = String(t.getMonth() + 1).padStart(2, "0");
      const d = String(t.getDate()).padStart(2, "0");
      return `${t.getFullYear()}-${m}-${d}`;
    };
    const bootstrap = async () => {
      if (!isTauriRuntime()) {
        error.value = "请在客户端内使用";
        loading.value = false;
        return;
      }
      loading.value = true;
      error.value = "";
      try {
        const res = await invokeNative("sports_venue_bootstrap", {});
        if (!res?.success && !res?.token) {
          throw new Error(res?.message || "登录场馆失败");
        }
        token.value = res.token || "";
        user.value = res.user || null;
        stadiums.value = Array.isArray(res.stadiums) ? res.stadiums : [];
        if (res.message && !stadiums.value.length) {
          error.value = res.message;
        }
        selectDate.value = todayStr();
      } catch (e) {
        error.value = String(e?.message || e || "加载失败（需校园网）");
      } finally {
        loading.value = false;
      }
    };
    const openStadium = async (item, halfVal = 0) => {
      if (String(item?.stadiumType) === "2" && halfVal === 0 && arguments.length < 2) ;
      selectedStadium.value = item;
      half.value = halfVal;
      cart.value = [];
      tab.value = "detail";
      await loadDetail();
    };
    const loadDetail = async () => {
      if (!selectedStadium.value || !token.value) return;
      acting.value = true;
      error.value = "";
      try {
        const sid = selectedStadium.value?.id ?? selectedStadium.value?.stadiumId;
        const res = await invokeNative("sports_venue_detail", {
          token: token.value,
          roleId: roleId.value || null,
          stadiumId: Number(sid) || sid,
          selectDate: String(selectDate.value || todayStr()).trim(),
          half: Number(half.value) || 0
        });
        const data = res?.data || {};
        weekList.value = Array.isArray(data.weekList) ? data.weekList : [];
        placeDetailList.value = Array.isArray(data.placeDetailList) ? data.placeDetailList : [];
        costDesc.value = data.costDesc || "";
        enablePay.value = String(data.enablePay ?? "1");
        followNum.value = Number(data.followNum || 0);
      } catch (e) {
        error.value = String(e?.message || e || "加载场地失败");
        showToast(error.value);
      } finally {
        acting.value = false;
      }
    };
    const onPickDate = async (d) => {
      const date = d?.date || d?.selectDate || d;
      if (!date) return;
      selectDate.value = String(date);
      cart.value = [];
      await loadDetail();
    };
    const slotClass = (slot) => {
      if (slot?.isActive) return "slot mine";
      if (slot?.status === 0) return "slot free";
      if (slot?.status === 1) return "slot busy";
      return "slot disabled";
    };
    const toggleSlot = (placeWrap, slot, index) => {
      const place = placeWrap?.place || placeWrap;
      const list = placeWrap?.placeList || [];
      if (!place || !slot) return;
      if (slot.status === 1) {
        showToast("该时段已预约");
        return;
      }
      if (slot.status !== 0) {
        showToast("该时段不可约");
        return;
      }
      const next = list[index + 1];
      if (!next || next.status !== 0) {
        showToast("请选择完整时段");
        return;
      }
      const existIdx = cart.value.findIndex(
        (c) => c.placeId === place.id && c.list?.includes(slot.dateStr) && c.list?.includes(next.dateStr)
      );
      if (existIdx >= 0) {
        cart.value.splice(existIdx, 1);
        slot.isActive = false;
        next.isActive = false;
        return;
      }
      const price = Number(slot?.price?.price ?? slot?.price ?? 0);
      cart.value.push({
        startDateTime: slot.startTime,
        endDateTime: next.endTime,
        price,
        half: place.half ?? half.value,
        placeName: place.name,
        placeId: place.id,
        list: [slot.dateStr, next.dateStr]
      });
      slot.isActive = true;
      next.isActive = true;
    };
    const submitReserve = async () => {
      if (enablePay.value === "0") {
        showToast("暂未开放预约");
        return;
      }
      if (!cart.value.length) {
        showToast("请先选择时段");
        return;
      }
      acting.value = true;
      try {
        const res = await invokeNative("sports_venue_reserve", {
          token: token.value,
          roleId: roleId.value || null,
          payload: {
            totalPrice: totalPriceFen.value,
            stadiumId: selectedStadium.value.id,
            reserveDate: selectDate.value,
            detailList: cart.value,
            followUserList: []
          }
        });
        const data = res?.data;
        showToast("预约成功");
        pendingOrder.value = data;
        cart.value = [];
        if (data?.orderId != null) {
          tab.value = "orders";
          await loadOrders();
        } else {
          await loadDetail();
        }
      } catch (e) {
        showToast(String(e?.message || e || "预约失败"));
      } finally {
        acting.value = false;
      }
    };
    const loadOrders = async () => {
      if (!token.value) return;
      acting.value = true;
      try {
        const res = await invokeNative("sports_venue_orders", {
          token: token.value,
          roleId: roleId.value || null,
          pageNum: 1,
          pageSize: 20
        });
        const data = res?.data;
        orders.value = Array.isArray(data?.list) ? data.list : Array.isArray(data) ? data : [];
      } catch (e) {
        showToast(String(e?.message || e || "订单加载失败"));
      } finally {
        acting.value = false;
      }
    };
    const payOrder = async (order) => {
      const orderId = order?.orderId ?? order?.id;
      const price = order?.price ?? order?.totalPrice ?? totalPriceFen.value;
      if (!payPassword.value) {
        showToast("请输入校园卡密码");
        return;
      }
      acting.value = true;
      try {
        await invokeNative("sports_venue_pay", {
          token: token.value,
          roleId: roleId.value || null,
          orderId,
          price,
          password: payPassword.value
        });
        showToast("支付成功");
        payPassword.value = "";
        pendingOrder.value = null;
        await loadOrders();
      } catch (e) {
        showToast(String(e?.message || e || "支付失败"));
      } finally {
        acting.value = false;
      }
    };
    const cancelOrder = async (order) => {
      const orderId = order?.orderId ?? order?.id;
      acting.value = true;
      try {
        await invokeNative("sports_venue_cancel_pay", {
          token: token.value,
          roleId: roleId.value || null,
          orderId
        });
        showToast("已取消");
        await loadOrders();
      } catch (e) {
        showToast(String(e?.message || e || "取消失败"));
      } finally {
        acting.value = false;
      }
    };
    const backFromDetail = () => {
      tab.value = "home";
      selectedStadium.value = null;
      cart.value = [];
    };
    onMounted(bootstrap);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: "运动场馆",
          icon: "sports_soccer",
          onBack: _cache[1] || (_cache[1] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              type: "button",
              class: "icon-btn",
              disabled: loading.value || acting.value,
              onClick: _cache[0] || (_cache[0] = ($event) => tab.value === "orders" ? tab.value = "home" : (tab.value = "orders", loadOrders()))
            }, [
              createBaseVNode("span", _hoisted_3, toDisplayString(tab.value === "orders" ? "home" : "receipt_long"), 1)
            ], 8, _hoisted_2)
          ]),
          _: 1
        }),
        createBaseVNode("div", _hoisted_4, [
          loading.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 0,
            type: "loading",
            message: "连接场馆服务…"
          })) : error.value && !stadiums.value.length && tab.value === "home" ? (openBlock(), createElementBlock("section", _hoisted_5, [
            createBaseVNode("p", _hoisted_6, toDisplayString(error.value), 1),
            _cache[6] || (_cache[6] = createBaseVNode("p", { class: "hint" }, "需连接校园网", -1)),
            createBaseVNode("button", {
              type: "button",
              class: "main",
              onClick: bootstrap
            }, "重试")
          ])) : tab.value === "home" ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
            user.value ? (openBlock(), createElementBlock("div", _hoisted_7, [
              createBaseVNode("strong", null, toDisplayString(user.value.username || user.value.name || "同学"), 1),
              createBaseVNode("span", null, toDisplayString(user.value.idserial || user.value.studentId || ""), 1)
            ])) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_8, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(stadiums.value, (s) => {
                return openBlock(), createElementBlock("button", {
                  key: s.id,
                  type: "button",
                  class: "stadium",
                  onClick: ($event) => openStadium(s, 0)
                }, [
                  createBaseVNode("div", _hoisted_10, [
                    _cache[7] || (_cache[7] = createBaseVNode("span", { class: "badge" }, "运营中", -1)),
                    createBaseVNode("h3", null, toDisplayString(s.stadiumName || s.name), 1)
                  ]),
                  s.address ? (openBlock(), createElementBlock("p", _hoisted_11, toDisplayString(s.address), 1)) : createCommentVNode("", true),
                  s.openTime || s.businessHours ? (openBlock(), createElementBlock("p", _hoisted_12, toDisplayString(s.openTime || s.businessHours), 1)) : createCommentVNode("", true),
                  String(s.stadiumType) === "2" ? (openBlock(), createElementBlock("div", {
                    key: 2,
                    class: "half-row",
                    onClick: _cache[2] || (_cache[2] = withModifiers(() => {
                    }, ["stop"]))
                  }, [
                    createBaseVNode("button", {
                      type: "button",
                      class: "chip",
                      onClick: ($event) => openStadium(s, 0)
                    }, "全场", 8, _hoisted_13),
                    createBaseVNode("button", {
                      type: "button",
                      class: "chip",
                      onClick: ($event) => openStadium(s, 1)
                    }, "半场", 8, _hoisted_14)
                  ])) : createCommentVNode("", true)
                ], 8, _hoisted_9);
              }), 128))
            ]),
            !stadiums.value.length ? (openBlock(), createElementBlock("p", _hoisted_15, "暂无场馆")) : createCommentVNode("", true)
          ], 64)) : tab.value === "detail" && selectedStadium.value ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            createBaseVNode("button", {
              type: "button",
              class: "back-link",
              onClick: backFromDetail
            }, [
              _cache[8] || (_cache[8] = createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)),
              createTextVNode(" " + toDisplayString(selectedStadium.value.stadiumName || selectedStadium.value.name), 1)
            ]),
            weekList.value.length ? (openBlock(), createElementBlock("div", _hoisted_16, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(weekList.value, (d, i) => {
                return openBlock(), createElementBlock("button", {
                  key: i,
                  type: "button",
                  class: normalizeClass(["day", { on: String(d.date || d.selectDate || d) === selectDate.value }]),
                  onClick: ($event) => onPickDate(d)
                }, [
                  createBaseVNode("span", null, toDisplayString(d.week || d.weekDay || d.label || ""), 1),
                  createBaseVNode("strong", null, toDisplayString(String(d.date || d.selectDate || "").slice(5) || d), 1)
                ], 10, _hoisted_17);
              }), 128))
            ])) : (openBlock(), createElementBlock("div", _hoisted_18, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => selectDate.value = $event),
                type: "date",
                class: "date-input",
                onChange: loadDetail
              }, null, 544), [
                [vModelText, selectDate.value]
              ])
            ])),
            costDesc.value ? (openBlock(), createElementBlock("p", _hoisted_19, toDisplayString(costDesc.value), 1)) : createCommentVNode("", true),
            error.value ? (openBlock(), createElementBlock("p", _hoisted_20, toDisplayString(error.value), 1)) : createCommentVNode("", true),
            acting.value && !placeDetailList.value.length ? (openBlock(), createElementBlock("div", _hoisted_21, "加载时段…")) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(placeDetailList.value, (wrap, wi) => {
              return openBlock(), createElementBlock("div", {
                key: wi,
                class: "place-block"
              }, [
                createBaseVNode("h4", null, toDisplayString(wrap.place?.name || wrap.name || `场地 ${wi + 1}`), 1),
                createBaseVNode("div", _hoisted_22, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(wrap.placeList || [], (slot, si) => {
                    return openBlock(), createElementBlock("button", {
                      key: si,
                      type: "button",
                      class: normalizeClass(slotClass(slot)),
                      disabled: slot.status !== 0 && !slot.isActive,
                      onClick: ($event) => toggleSlot(wrap, slot, si)
                    }, [
                      createBaseVNode("span", _hoisted_24, toDisplayString((slot.startTime || "").slice(11, 16)), 1),
                      slot.price?.price != null ? (openBlock(), createElementBlock("span", _hoisted_25, " ¥" + toDisplayString((Number(slot.price.price) / 100).toFixed(0)), 1)) : createCommentVNode("", true)
                    ], 10, _hoisted_23);
                  }), 128))
                ])
              ]);
            }), 128)),
            _cache[9] || (_cache[9] = createBaseVNode("div", { class: "legend" }, [
              createBaseVNode("span", null, [
                createBaseVNode("i", { class: "free" }),
                createTextVNode("可约")
              ]),
              createBaseVNode("span", null, [
                createBaseVNode("i", { class: "busy" }),
                createTextVNode("已约")
              ]),
              createBaseVNode("span", null, [
                createBaseVNode("i", { class: "mine" }),
                createTextVNode("已选")
              ])
            ], -1)),
            createBaseVNode("div", _hoisted_26, [
              createBaseVNode("div", null, [
                createBaseVNode("strong", null, "¥" + toDisplayString(totalPriceYuan.value), 1),
                createBaseVNode("span", _hoisted_27, toDisplayString(cart.value.length) + " 段", 1)
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "main",
                disabled: acting.value || !cart.value.length,
                onClick: submitReserve
              }, toDisplayString(acting.value ? "提交中…" : "提交预约"), 9, _hoisted_28)
            ])
          ], 64)) : tab.value === "orders" ? (openBlock(), createElementBlock(Fragment, { key: 4 }, [
            createBaseVNode("div", { class: "user-bar" }, [
              _cache[10] || (_cache[10] = createBaseVNode("strong", null, "我的订单", -1)),
              createBaseVNode("button", {
                type: "button",
                class: "link",
                onClick: loadOrders
              }, "刷新")
            ]),
            pendingOrder.value ? (openBlock(), createElementBlock("div", _hoisted_29, [
              _cache[11] || (_cache[11] = createBaseVNode("p", null, "待支付订单", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => payPassword.value = $event),
                type: "password",
                class: "pwd",
                placeholder: "校园卡支付密码",
                autocomplete: "off"
              }, null, 512), [
                [vModelText, payPassword.value]
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "main",
                disabled: acting.value,
                onClick: _cache[5] || (_cache[5] = ($event) => payOrder(pendingOrder.value))
              }, " 支付 ", 8, _hoisted_30)
            ])) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(orders.value, (o, i) => {
              return openBlock(), createElementBlock("div", {
                key: i,
                class: "order"
              }, [
                createBaseVNode("div", _hoisted_31, [
                  createBaseVNode("strong", null, toDisplayString(o.stadiumName || o.placeName || "订单"), 1),
                  createBaseVNode("span", null, toDisplayString(o.statusName || o.status || ""), 1)
                ]),
                createBaseVNode("p", _hoisted_32, toDisplayString(o.reserveDate || o.createTime || ""), 1),
                o.price != null ? (openBlock(), createElementBlock("p", _hoisted_33, "¥" + toDisplayString((Number(o.price) / 100).toFixed(2)), 1)) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_34, [
                  String(o.status) === "0" || o.needPay ? (openBlock(), createElementBlock("button", {
                    key: 0,
                    type: "button",
                    class: "chip",
                    onClick: ($event) => pendingOrder.value = o
                  }, " 支付 ", 8, _hoisted_35)) : createCommentVNode("", true),
                  String(o.status) === "0" ? (openBlock(), createElementBlock("button", {
                    key: 1,
                    type: "button",
                    class: "chip ghost",
                    onClick: ($event) => cancelOrder(o)
                  }, " 取消 ", 8, _hoisted_36)) : createCommentVNode("", true)
                ])
              ]);
            }), 128)),
            !orders.value.length ? (openBlock(), createElementBlock("p", _hoisted_37, "暂无订单")) : createCommentVNode("", true)
          ], 64)) : createCommentVNode("", true)
        ])
      ]);
    };
  }
};
const SportsVenueView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-91953a03"]]);
export {
  SportsVenueView as default
};
