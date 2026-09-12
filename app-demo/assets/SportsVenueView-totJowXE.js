import { o as onMounted, a as openBlock, c as createElementBlock, p as createVNode, k as withCtx, b as createBaseVNode, t as toDisplayString, u as unref, j as createBlock, F as Fragment, d as createCommentVNode, f as renderList, w as withModifiers, g as createTextVNode, n as normalizeClass, K as withDirectives, L as vModelText, r as ref, h as computed } from "./vue-core-Dzs4fLAU.js";
import { a as isTauriRuntime, d as invokeNative } from "./runtime-bridge-Dt57BD2i.js";
import { _ as _export_sfc, u as useLocale, j as showToast } from "./app-demo-CUOWTnz-.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import { T as TEmptyState } from "./TEmptyState-BwJ_g5G7.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "page" };
const _hoisted_2 = ["disabled"];
const _hoisted_3 = { class: "material-symbols-outlined" };
const _hoisted_4 = { class: "body" };
const _hoisted_5 = {
  key: 1,
  class: "card"
};
const _hoisted_6 = { class: "err" };
const _hoisted_7 = { class: "hint" };
const _hoisted_8 = {
  key: 0,
  class: "user-bar"
};
const _hoisted_9 = { class: "list" };
const _hoisted_10 = ["onClick"];
const _hoisted_11 = { class: "stadium-top" };
const _hoisted_12 = { class: "badge" };
const _hoisted_13 = {
  key: 0,
  class: "meta"
};
const _hoisted_14 = {
  key: 1,
  class: "meta"
};
const _hoisted_15 = ["onClick"];
const _hoisted_16 = ["onClick"];
const _hoisted_17 = {
  key: 1,
  class: "hint"
};
const _hoisted_18 = {
  key: 0,
  class: "days"
};
const _hoisted_19 = ["onClick"];
const _hoisted_20 = {
  key: 1,
  class: "days"
};
const _hoisted_21 = {
  key: 2,
  class: "cost"
};
const _hoisted_22 = {
  key: 3,
  class: "err"
};
const _hoisted_23 = {
  key: 4,
  class: "hint"
};
const _hoisted_24 = { class: "slots" };
const _hoisted_25 = ["disabled", "onClick"];
const _hoisted_26 = { class: "t" };
const _hoisted_27 = {
  key: 0,
  class: "p"
};
const _hoisted_28 = { class: "legend" };
const _hoisted_29 = { class: "cart-bar" };
const _hoisted_30 = { class: "muted" };
const _hoisted_31 = ["disabled"];
const _hoisted_32 = { class: "user-bar" };
const _hoisted_33 = {
  key: 0,
  class: "card pay-box"
};
const _hoisted_34 = ["placeholder"];
const _hoisted_35 = ["disabled"];
const _hoisted_36 = { class: "order-top" };
const _hoisted_37 = { class: "meta" };
const _hoisted_38 = {
  key: 0,
  class: "meta"
};
const _hoisted_39 = { class: "order-actions" };
const _hoisted_40 = ["onClick"];
const _hoisted_41 = ["onClick"];
const _hoisted_42 = {
  key: 1,
  class: "hint"
};
const _sfc_main = {
  __name: "SportsVenueView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const { t } = useLocale();
    const tr = (key, params = {}) => {
      let text = t(key);
      for (const [name, value] of Object.entries(params)) {
        text = text.split(`{${name}}`).join(String(value));
      }
      return text;
    };
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
      const t2 = /* @__PURE__ */ new Date();
      const m = String(t2.getMonth() + 1).padStart(2, "0");
      const d = String(t2.getDate()).padStart(2, "0");
      return `${t2.getFullYear()}-${m}-${d}`;
    };
    const bootstrap = async () => {
      if (!isTauriRuntime()) {
        error.value = t("venue.error.clientOnly");
        loading.value = false;
        return;
      }
      loading.value = true;
      error.value = "";
      try {
        const res = await invokeNative("sports_venue_bootstrap", {});
        if (!res?.success && !res?.token) {
          throw new Error(res?.message || t("venue.error.venueLoginFailed"));
        }
        token.value = res.token || "";
        user.value = res.user || null;
        stadiums.value = Array.isArray(res.stadiums) ? res.stadiums : [];
        if (res.message && !stadiums.value.length) {
          error.value = res.message;
        }
        selectDate.value = todayStr();
      } catch (e) {
        error.value = String(e?.message || e || t("venue.error.loadFailed"));
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
        error.value = String(e?.message || e || t("venue.error.loadCourtsFailed"));
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
        showToast(t("venue.toast.slotBooked"));
        return;
      }
      if (slot.status !== 0) {
        showToast(t("venue.toast.slotUnavailable"));
        return;
      }
      const next = list[index + 1];
      if (!next || next.status !== 0) {
        showToast(t("venue.toast.needContinuous"));
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
        showToast(t("venue.toast.bookingClosed"));
        return;
      }
      if (!cart.value.length) {
        showToast(t("venue.toast.selectSlotFirst"));
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
        showToast(t("venue.toast.reserveSuccess"));
        pendingOrder.value = data;
        cart.value = [];
        if (data?.orderId != null) {
          tab.value = "orders";
          await loadOrders();
        } else {
          await loadDetail();
        }
      } catch (e) {
        showToast(String(e?.message || e || t("venue.toast.reserveFailed")));
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
        showToast(String(e?.message || e || t("venue.toast.orderLoadFailed")));
      } finally {
        acting.value = false;
      }
    };
    const payOrder = async (order) => {
      const orderId = order?.orderId ?? order?.id;
      const price = order?.price ?? order?.totalPrice ?? totalPriceFen.value;
      if (!payPassword.value) {
        showToast(t("venue.toast.enterCardPassword"));
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
        showToast(t("venue.toast.paySuccess"));
        payPassword.value = "";
        pendingOrder.value = null;
        await loadOrders();
      } catch (e) {
        showToast(String(e?.message || e || t("venue.toast.payFailed")));
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
        showToast(t("venue.toast.cancelled"));
        await loadOrders();
      } catch (e) {
        showToast(String(e?.message || e || t("venue.toast.cancelFailed")));
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
          title: unref(t)("venue.title"),
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
        }, 8, ["title"]),
        createBaseVNode("div", _hoisted_4, [
          loading.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 0,
            type: "loading",
            message: unref(t)("venue.state.connecting")
          }, null, 8, ["message"])) : error.value && !stadiums.value.length && tab.value === "home" ? (openBlock(), createElementBlock("section", _hoisted_5, [
            createBaseVNode("p", _hoisted_6, toDisplayString(error.value), 1),
            createBaseVNode("p", _hoisted_7, toDisplayString(unref(t)("venue.state.campusNetworkRequired")), 1),
            createBaseVNode("button", {
              type: "button",
              class: "main",
              onClick: bootstrap
            }, toDisplayString(unref(t)("venue.btn.retry")), 1)
          ])) : tab.value === "home" ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
            user.value ? (openBlock(), createElementBlock("div", _hoisted_8, [
              createBaseVNode("strong", null, toDisplayString(user.value.username || user.value.name || unref(t)("venue.user.fallbackName")), 1),
              createBaseVNode("span", null, toDisplayString(user.value.idserial || user.value.studentId || ""), 1)
            ])) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_9, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(stadiums.value, (s) => {
                return openBlock(), createElementBlock("button", {
                  key: s.id,
                  type: "button",
                  class: "stadium",
                  onClick: ($event) => openStadium(s, 0)
                }, [
                  createBaseVNode("div", _hoisted_11, [
                    createBaseVNode("span", _hoisted_12, toDisplayString(unref(t)("venue.badge.open")), 1),
                    createBaseVNode("h3", null, toDisplayString(s.stadiumName || s.name), 1)
                  ]),
                  s.address ? (openBlock(), createElementBlock("p", _hoisted_13, toDisplayString(s.address), 1)) : createCommentVNode("", true),
                  s.openTime || s.businessHours ? (openBlock(), createElementBlock("p", _hoisted_14, toDisplayString(s.openTime || s.businessHours), 1)) : createCommentVNode("", true),
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
                    }, toDisplayString(unref(t)("venue.chip.full")), 9, _hoisted_15),
                    createBaseVNode("button", {
                      type: "button",
                      class: "chip",
                      onClick: ($event) => openStadium(s, 1)
                    }, toDisplayString(unref(t)("venue.chip.half")), 9, _hoisted_16)
                  ])) : createCommentVNode("", true)
                ], 8, _hoisted_10);
              }), 128))
            ]),
            !stadiums.value.length ? (openBlock(), createElementBlock("p", _hoisted_17, toDisplayString(unref(t)("venue.empty.stadiums")), 1)) : createCommentVNode("", true)
          ], 64)) : tab.value === "detail" && selectedStadium.value ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            createBaseVNode("button", {
              type: "button",
              class: "back-link",
              onClick: backFromDetail
            }, [
              _cache[6] || (_cache[6] = createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)),
              createTextVNode(" " + toDisplayString(selectedStadium.value.stadiumName || selectedStadium.value.name), 1)
            ]),
            weekList.value.length ? (openBlock(), createElementBlock("div", _hoisted_18, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(weekList.value, (d, i) => {
                return openBlock(), createElementBlock("button", {
                  key: i,
                  type: "button",
                  class: normalizeClass(["day", { on: String(d.date || d.selectDate || d) === selectDate.value }]),
                  onClick: ($event) => onPickDate(d)
                }, [
                  createBaseVNode("span", null, toDisplayString(d.week || d.weekDay || d.label || ""), 1),
                  createBaseVNode("strong", null, toDisplayString(String(d.date || d.selectDate || "").slice(5) || d), 1)
                ], 10, _hoisted_19);
              }), 128))
            ])) : (openBlock(), createElementBlock("div", _hoisted_20, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => selectDate.value = $event),
                type: "date",
                class: "date-input",
                onChange: loadDetail
              }, null, 544), [
                [vModelText, selectDate.value]
              ])
            ])),
            costDesc.value ? (openBlock(), createElementBlock("p", _hoisted_21, toDisplayString(costDesc.value), 1)) : createCommentVNode("", true),
            error.value ? (openBlock(), createElementBlock("p", _hoisted_22, toDisplayString(error.value), 1)) : createCommentVNode("", true),
            acting.value && !placeDetailList.value.length ? (openBlock(), createElementBlock("div", _hoisted_23, toDisplayString(unref(t)("venue.loading.slots")), 1)) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(placeDetailList.value, (wrap, wi) => {
              return openBlock(), createElementBlock("div", {
                key: wi,
                class: "place-block"
              }, [
                createBaseVNode("h4", null, toDisplayString(wrap.place?.name || wrap.name || tr("venue.place.fallback", { n: wi + 1 })), 1),
                createBaseVNode("div", _hoisted_24, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(wrap.placeList || [], (slot, si) => {
                    return openBlock(), createElementBlock("button", {
                      key: si,
                      type: "button",
                      class: normalizeClass(slotClass(slot)),
                      disabled: slot.status !== 0 && !slot.isActive,
                      onClick: ($event) => toggleSlot(wrap, slot, si)
                    }, [
                      createBaseVNode("span", _hoisted_26, toDisplayString((slot.startTime || "").slice(11, 16)), 1),
                      slot.price?.price != null ? (openBlock(), createElementBlock("span", _hoisted_27, " ¥" + toDisplayString((Number(slot.price.price) / 100).toFixed(0)), 1)) : createCommentVNode("", true)
                    ], 10, _hoisted_25);
                  }), 128))
                ])
              ]);
            }), 128)),
            createBaseVNode("div", _hoisted_28, [
              createBaseVNode("span", null, [
                _cache[7] || (_cache[7] = createBaseVNode("i", { class: "free" }, null, -1)),
                createTextVNode(toDisplayString(unref(t)("venue.legend.free")), 1)
              ]),
              createBaseVNode("span", null, [
                _cache[8] || (_cache[8] = createBaseVNode("i", { class: "busy" }, null, -1)),
                createTextVNode(toDisplayString(unref(t)("venue.legend.booked")), 1)
              ]),
              createBaseVNode("span", null, [
                _cache[9] || (_cache[9] = createBaseVNode("i", { class: "mine" }, null, -1)),
                createTextVNode(toDisplayString(unref(t)("venue.legend.selected")), 1)
              ])
            ]),
            createBaseVNode("div", _hoisted_29, [
              createBaseVNode("div", null, [
                createBaseVNode("strong", null, "¥" + toDisplayString(totalPriceYuan.value), 1),
                createBaseVNode("span", _hoisted_30, toDisplayString(tr("venue.cart.slotCount", { n: cart.value.length })), 1)
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "main",
                disabled: acting.value || !cart.value.length,
                onClick: submitReserve
              }, toDisplayString(acting.value ? unref(t)("venue.btn.submitting") : unref(t)("venue.btn.submitBooking")), 9, _hoisted_31)
            ])
          ], 64)) : tab.value === "orders" ? (openBlock(), createElementBlock(Fragment, { key: 4 }, [
            createBaseVNode("div", _hoisted_32, [
              createBaseVNode("strong", null, toDisplayString(unref(t)("venue.orders.title")), 1),
              createBaseVNode("button", {
                type: "button",
                class: "link",
                onClick: loadOrders
              }, toDisplayString(unref(t)("venue.orders.refresh")), 1)
            ]),
            pendingOrder.value ? (openBlock(), createElementBlock("div", _hoisted_33, [
              createBaseVNode("p", null, toDisplayString(unref(t)("venue.pay.pendingOrder")), 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => payPassword.value = $event),
                type: "password",
                class: "pwd",
                placeholder: unref(t)("venue.pay.cardPasswordPlaceholder"),
                autocomplete: "off"
              }, null, 8, _hoisted_34), [
                [vModelText, payPassword.value]
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "main",
                disabled: acting.value,
                onClick: _cache[5] || (_cache[5] = ($event) => payOrder(pendingOrder.value))
              }, toDisplayString(unref(t)("venue.btn.pay")), 9, _hoisted_35)
            ])) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(orders.value, (o, i) => {
              return openBlock(), createElementBlock("div", {
                key: i,
                class: "order"
              }, [
                createBaseVNode("div", _hoisted_36, [
                  createBaseVNode("strong", null, toDisplayString(o.stadiumName || o.placeName || unref(t)("venue.order.fallback")), 1),
                  createBaseVNode("span", null, toDisplayString(o.statusName || o.status || ""), 1)
                ]),
                createBaseVNode("p", _hoisted_37, toDisplayString(o.reserveDate || o.createTime || ""), 1),
                o.price != null ? (openBlock(), createElementBlock("p", _hoisted_38, "¥" + toDisplayString((Number(o.price) / 100).toFixed(2)), 1)) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_39, [
                  String(o.status) === "0" || o.needPay ? (openBlock(), createElementBlock("button", {
                    key: 0,
                    type: "button",
                    class: "chip",
                    onClick: ($event) => pendingOrder.value = o
                  }, toDisplayString(unref(t)("venue.btn.pay")), 9, _hoisted_40)) : createCommentVNode("", true),
                  String(o.status) === "0" ? (openBlock(), createElementBlock("button", {
                    key: 1,
                    type: "button",
                    class: "chip ghost",
                    onClick: ($event) => cancelOrder(o)
                  }, toDisplayString(unref(t)("venue.btn.cancel")), 9, _hoisted_41)) : createCommentVNode("", true)
                ])
              ]);
            }), 128)),
            !orders.value.length ? (openBlock(), createElementBlock("p", _hoisted_42, toDisplayString(unref(t)("venue.empty.orders")), 1)) : createCommentVNode("", true)
          ], 64)) : createCommentVNode("", true)
        ])
      ]);
    };
  }
};
const SportsVenueView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-8af2847c"]]);
export {
  SportsVenueView as default
};
