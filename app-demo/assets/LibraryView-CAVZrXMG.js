import { v as watch, o as onMounted, l as onBeforeUnmount, M as resolveComponent, a as openBlock, c as createElementBlock, p as createVNode, u as unref, b as createBaseVNode, K as withDirectives, L as vModelText, m as withKeys, t as toDisplayString, g as createTextVNode, k as withCtx, Q as vModelCheckbox, d as createCommentVNode, F as Fragment, f as renderList, n as normalizeClass, w as withModifiers, r as ref, h as computed } from "./vue-core-Dzs4fLAU.js";
import { _ as _export_sfc, u as useLocale, d as axiosInstance } from "./app-demo-CUOWTnz-.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import "./runtime-bridge-Dt57BD2i.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "library-view" };
const _hoisted_2 = { class: "search-panel" };
const _hoisted_3 = { class: "search-row" };
const _hoisted_4 = ["placeholder"];
const _hoisted_5 = ["disabled"];
const _hoisted_6 = {
  key: 0,
  class: "search-ops"
};
const _hoisted_7 = { class: "select-line" };
const _hoisted_8 = { value: "keyWord" };
const _hoisted_9 = { value: "title" };
const _hoisted_10 = { value: "author" };
const _hoisted_11 = { class: "checkbox-line" };
const _hoisted_12 = ["disabled"];
const _hoisted_13 = {
  key: 1,
  class: "filter-panel top-filter-panel"
};
const _hoisted_14 = { class: "chips" };
const _hoisted_15 = ["onClick"];
const _hoisted_16 = {
  key: 0,
  class: "empty-chip"
};
const _hoisted_17 = { class: "summary" };
const _hoisted_18 = {
  key: 2,
  class: "error"
};
const _hoisted_19 = { class: "content-layout" };
const _hoisted_20 = { class: "result-panel" };
const _hoisted_21 = {
  key: 0,
  class: "loading-box"
};
const _hoisted_22 = {
  key: 1,
  class: "empty-box"
};
const _hoisted_23 = {
  key: 2,
  class: "result-list"
};
const _hoisted_24 = ["onClick"];
const _hoisted_25 = { class: "book-cover-wrap" };
const _hoisted_26 = ["src", "alt", "onError"];
const _hoisted_27 = {
  key: 1,
  class: "book-cover-empty"
};
const _hoisted_28 = { class: "book-info" };
const _hoisted_29 = { class: "book-title" };
const _hoisted_30 = { class: "book-meta" };
const _hoisted_31 = { class: "book-meta" };
const _hoisted_32 = { class: "book-meta" };
const _hoisted_33 = { class: "book-badge" };
const _hoisted_34 = {
  key: 3,
  class: "pager"
};
const _hoisted_35 = ["disabled"];
const _hoisted_36 = { class: "pager-info" };
const _hoisted_37 = ["disabled"];
const _hoisted_38 = { class: "detail-card" };
const _hoisted_39 = { class: "detail-head" };
const _hoisted_40 = {
  key: 0,
  class: "loading-box"
};
const _hoisted_41 = { key: 1 };
const _hoisted_42 = {
  key: 0,
  class: "error"
};
const _hoisted_43 = { class: "detail-main" };
const _hoisted_44 = { class: "detail-cover-wrap" };
const _hoisted_45 = ["src", "alt"];
const _hoisted_46 = {
  key: 1,
  class: "detail-cover-empty"
};
const _hoisted_47 = { class: "detail-grid" };
const _hoisted_48 = { class: "detail-item" };
const _hoisted_49 = { class: "label" };
const _hoisted_50 = { class: "value" };
const _hoisted_51 = { class: "detail-item" };
const _hoisted_52 = { class: "label" };
const _hoisted_53 = { class: "value" };
const _hoisted_54 = { class: "detail-item" };
const _hoisted_55 = { class: "label" };
const _hoisted_56 = { class: "value" };
const _hoisted_57 = { class: "detail-item" };
const _hoisted_58 = { class: "label" };
const _hoisted_59 = { class: "value" };
const _hoisted_60 = { class: "detail-item" };
const _hoisted_61 = { class: "label" };
const _hoisted_62 = { class: "value" };
const _hoisted_63 = { class: "detail-item" };
const _hoisted_64 = { class: "label" };
const _hoisted_65 = { class: "value" };
const _hoisted_66 = { class: "detail-item" };
const _hoisted_67 = { class: "label" };
const _hoisted_68 = { class: "value" };
const _hoisted_69 = { class: "detail-item" };
const _hoisted_70 = { class: "label" };
const _hoisted_71 = { class: "value" };
const _hoisted_72 = { class: "holding-panel" };
const _hoisted_73 = { class: "holding-grid" };
const _hoisted_74 = { class: "detail-item" };
const _hoisted_75 = { class: "label" };
const _hoisted_76 = { class: "value" };
const _hoisted_77 = { class: "detail-item" };
const _hoisted_78 = { class: "label" };
const _hoisted_79 = { class: "value" };
const _hoisted_80 = { class: "detail-item" };
const _hoisted_81 = { class: "label" };
const _hoisted_82 = { class: "value" };
const _hoisted_83 = { class: "detail-item" };
const _hoisted_84 = { class: "label" };
const _hoisted_85 = { class: "value" };
const _hoisted_86 = {
  key: 1,
  class: "holding-list-panel"
};
const _hoisted_87 = { class: "holding-table-wrap" };
const _hoisted_88 = { class: "holding-table" };
const _hoisted_89 = { class: "holding-location" };
const _hoisted_90 = { class: "detail-desc" };
const _sfc_main = {
  __name: "LibraryView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back", "logout"],
  setup(__props, { emit: __emit }) {
    const { t } = useLocale();
    const tr = (key, params = {}) => {
      let text = t(key);
      for (const [name, value] of Object.entries(params)) {
        text = text.split(`{${name}}`).join(String(value));
      }
      return text;
    };
    const API_BASE = "/api";
    const emit = __emit;
    const loading = ref(false);
    const detailLoading = ref(false);
    const error = ref("");
    const detailError = ref("");
    const hasSearched = ref(false);
    const keyword = ref("");
    const searchField = ref("keyWord");
    const matchMode = ref("2");
    const sortField = ref("issued_sort");
    const sortClause = ref("asc");
    const onlyOnShelf = ref(false);
    const page = ref(1);
    const rows = ref(50);
    const total = ref(0);
    const results = ref([]);
    const facetResult = ref({});
    const dictData = ref({});
    const isMobile = ref(false);
    const filterPanelOpen = ref(false);
    let mobileResizeRaf = 0;
    const brokenCovers = ref(/* @__PURE__ */ new Set());
    const coverOverrides = ref(/* @__PURE__ */ new Map());
    const selectedFilters = ref({
      resourceType: [],
      publisher: [],
      author: [],
      discode1: [],
      langCode: [],
      countryCode: [],
      locationId: []
    });
    const selectedBook = ref(null);
    const selectedBookDetail = ref(null);
    const filterMeta = [
      { key: "resourceType", titleKey: "library.filter.resourceType" },
      { key: "publisher", titleKey: "library.filter.publisher" },
      { key: "author", titleKey: "library.filter.author" },
      { key: "discode1", titleKey: "library.filter.subject" },
      { key: "langCode", titleKey: "library.filter.language" },
      { key: "countryCode", titleKey: "library.filter.region" },
      { key: "locationId", titleKey: "library.filter.location" }
    ];
    const filterGroups = computed(
      () => filterMeta.map((meta) => ({ ...meta, title: t(meta.titleKey) }))
    );
    const totalPages = computed(() => {
      if (rows.value <= 0) return 0;
      return Math.ceil(total.value / rows.value);
    });
    const searchSummary = computed(() => {
      if (!keyword.value.trim()) return t("library.summary.enterKeyword");
      return tr("library.summary.found", { kw: keyword.value.trim(), n: total.value });
    });
    const canShowFilters = computed(() => hasSearched.value);
    const showFilterPanel = computed(() => canShowFilters.value && (!isMobile.value || filterPanelOpen.value));
    const hasActiveFilters = computed(
      () => Object.values(selectedFilters.value).some((arr) => Array.isArray(arr) && arr.length > 0)
    );
    const holdingData = computed(() => selectedBookDetail.value?.holding || {});
    const holdingItems = computed(() => {
      const node = selectedBookDetail.value?.holding_items;
      if (Array.isArray(node?.list)) return node.list;
      if (Array.isArray(node)) return node;
      return [];
    });
    const detailBook = computed(() => {
      const detail = selectedBookDetail.value?.detail || {};
      const base = selectedBook.value || {};
      return {
        title: detail.title || base.title || "-",
        author: detail.author || base.author || "-",
        publisher: detail.publisher || base.publisher || "-",
        publishYear: detail.publishYear || base.publishYear || "-",
        isbn: detail.isbn || base.isbn || "-",
        callNo: (Array.isArray(detail.callNo) ? detail.callNo[0] : detail.callNo) || (Array.isArray(base.callNo) ? base.callNo[0] : base.callNo) || base.callNoOne || "-",
        location: detail.locationName || detail.location || base.locationName || base.locationIdName || base.location || "-",
        abstract: detail.adstract || detail.ddAbstract || base.adstract || base.ddAbstract || t("library.desc.empty")
      };
    });
    const detailBorrowStatus = computed(() => {
      const detail = selectedBookDetail.value?.detail || {};
      const base = selectedBook.value || {};
      const status = detail.processTypeName || detail.statusName || base.processTypeName || base.statusName;
      if (status) return status;
      const orderFlag = String(holdingData.value?.orderFlag || "");
      if (orderFlag === "0") return t("library.status.available");
      if (orderFlag === "1") return t("library.status.reservable");
      if (orderFlag === "2") return t("library.status.notReservable");
      return "-";
    });
    const normalizeCoverUrl = (raw) => {
      if (!raw || typeof raw !== "string") return "";
      const url = raw.trim();
      if (!url) return "";
      if (url.startsWith("//")) return `https:${url}`;
      if (url.startsWith("/")) return `https://opac.hbut.edu.cn:8013${url}`;
      return url;
    };
    const getBookIsbn = (book = {}) => {
      const direct = String(book?.isbn || "").trim();
      if (direct) return direct;
      if (Array.isArray(book?.isbns)) {
        const first = String(book.isbns.find((item) => String(item || "").trim()) || "").trim();
        if (first) return first;
      }
      const eIsbn = String(book?.eIsbn || "").trim();
      if (eIsbn) return eIsbn;
      return "";
    };
    const buildBookcoversUrl = (isbn) => {
      const text = String(isbn || "").trim();
      if (!text) return "";
      return `https://www.bookcovers.cn/index.php?client=800512&isbn=${encodeURIComponent(text)}/cover`;
    };
    const coverKeyOf = (book) => `${book?.recordId || ""}|${getBookIsbn(book)}|${book?.title || ""}`;
    const getBookCover = (book = {}) => {
      const override = coverOverrides.value.get(coverKeyOf(book));
      if (override) return override;
      const candidates = [
        book.duxiuImageUrl,
        book.cover,
        book.coverUrl,
        book.imgUrl,
        book.imageUrl,
        book.image,
        book.picUrl
      ];
      for (const candidate of candidates) {
        const normalized = normalizeCoverUrl(candidate);
        if (normalized) return normalized;
      }
      return buildBookcoversUrl(getBookIsbn(book));
    };
    const getDetailCover = () => {
      const fromApi = normalizeCoverUrl(selectedBookDetail.value?.cover_url);
      if (fromApi) return fromApi;
      const detail = selectedBookDetail.value?.detail || {};
      const holding = selectedBookDetail.value?.holding || {};
      const fromDetail = getBookCover(detail);
      if (fromDetail) return fromDetail;
      const fromHolding = getBookCover(holding);
      if (fromHolding) return fromHolding;
      return getBookCover(selectedBook.value || {});
    };
    const formatHoldingValue = (value) => {
      if (value === null || value === void 0) return "-";
      const text = String(value).trim();
      return text ? text : "-";
    };
    const holdingStatusClass = (status) => {
      const text = String(status || "").trim();
      if (!text) return "holding-status-default";
      if (/在架|可借|available|on\s?shelf/i.test(text)) return "holding-status-available";
      if (/借出|应还|loan|borrow/i.test(text)) return "holding-status-borrowed";
      if (/预约|预订|reserve/i.test(text)) return "holding-status-reserved";
      return "holding-status-default";
    };
    const normalizeFacetEntries = (raw) => {
      if (!raw || typeof raw !== "object") return [];
      return Object.entries(raw).map(([value, count]) => ({
        value: String(value),
        count: Number(count) || 0
      })).filter((item) => item.value && item.value !== "null").sort((a, b) => b.count - a.count);
    };
    const getDictLabelMap = (key) => {
      const source = dictData.value?.[key];
      if (!Array.isArray(source)) return /* @__PURE__ */ new Map();
      const labelMap = /* @__PURE__ */ new Map();
      source.forEach((item) => {
        const code = item?.code ?? item?.value ?? item?.id;
        const name = item?.name ?? item?.label ?? item?.text;
        if (code != null && name != null) labelMap.set(String(code), String(name));
      });
      return labelMap;
    };
    const facetOptions = computed(() => {
      const output = {};
      for (const meta of filterMeta) {
        const entries = normalizeFacetEntries(facetResult.value?.[meta.key]);
        const labelMap = getDictLabelMap(meta.key);
        output[meta.key] = entries.map((entry) => ({
          value: entry.value,
          count: entry.count,
          label: labelMap.get(entry.value) || entry.value
        }));
      }
      return output;
    });
    const unwrapLibraryEnvelope = (payload) => {
      if (!payload || typeof payload !== "object") return {};
      if (payload.data && typeof payload.data === "object") {
        return payload.data;
      }
      return payload;
    };
    const normalizeSearchNode = (payload) => {
      const root = unwrapLibraryEnvelope(payload);
      if (root && typeof root === "object") {
        if (Array.isArray(root.searchResult) || root.numFound != null) return root;
        if (root.data && typeof root.data === "object") return root.data;
      }
      return {};
    };
    const normalizeDetailNode = (payload) => {
      if (!payload || typeof payload !== "object") return {};
      if (payload.detail || payload.holding) return payload;
      const root = payload.data;
      if (root && typeof root === "object" && (root.detail || root.holding)) {
        return root;
      }
      return {};
    };
    const isCoverAvailable = (book) => {
      const url = getBookCover(book);
      if (!url) return false;
      return !brokenCovers.value.has(coverKeyOf(book));
    };
    const handleCoverError = (book) => {
      const key = coverKeyOf(book);
      const current = getBookCover(book);
      const fallback = buildBookcoversUrl(getBookIsbn(book));
      if (fallback && current !== fallback) {
        const nextOverrides = new Map(coverOverrides.value);
        nextOverrides.set(key, fallback);
        coverOverrides.value = nextOverrides;
        const cleared = new Set(brokenCovers.value);
        cleared.delete(key);
        brokenCovers.value = cleared;
        return;
      }
      const next = new Set(brokenCovers.value);
      next.add(key);
      brokenCovers.value = next;
    };
    const updateMobileState = () => {
      const mobile = window.innerWidth <= 900;
      isMobile.value = mobile;
      if (!mobile) {
        filterPanelOpen.value = hasSearched.value;
      } else if (!hasSearched.value) {
        filterPanelOpen.value = false;
      }
    };
    const handleWindowResize = () => {
      if (mobileResizeRaf) return;
      mobileResizeRaf = window.requestAnimationFrame(() => {
        mobileResizeRaf = 0;
        updateMobileState();
      });
    };
    const buildSearchPayload = (nextPage = 1) => ({
      searchFieldContent: keyword.value.trim(),
      searchField: searchField.value,
      matchMode: matchMode.value,
      sortField: sortField.value,
      sortClause: sortClause.value,
      page: nextPage,
      rows: rows.value,
      onlyOnShelf: onlyOnShelf.value ? true : null,
      resourceType: [...selectedFilters.value.resourceType],
      publisher: [...selectedFilters.value.publisher],
      author: [...selectedFilters.value.author],
      discode1: [...selectedFilters.value.discode1],
      langCode: [...selectedFilters.value.langCode],
      countryCode: [...selectedFilters.value.countryCode],
      locationId: [...selectedFilters.value.locationId]
    });
    const loadDict = async () => {
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/library/dict`, {});
        const payload = res.data;
        if (payload?.success) {
          dictData.value = unwrapLibraryEnvelope(payload) || {};
        }
      } catch {
      }
    };
    const executeSearch = async (nextPage = 1, skipEmptyValidation = false) => {
      error.value = "";
      const query = keyword.value.trim();
      if (!skipEmptyValidation && !query) {
        error.value = t("library.error.enterKeyword");
        return;
      }
      loading.value = true;
      try {
        const payload = buildSearchPayload(nextPage);
        const res = await axiosInstance.post(`${API_BASE}/v2/library/search`, payload);
        const data = res.data;
        if (!data?.success) {
          error.value = data?.error || t("library.error.searchFailed");
          return;
        }
        const dataNode = normalizeSearchNode(data);
        results.value = Array.isArray(dataNode.searchResult) ? dataNode.searchResult : [];
        facetResult.value = dataNode.facetResult || {};
        total.value = Number(dataNode.numFound || 0);
        page.value = nextPage;
        hasSearched.value = true;
        filterPanelOpen.value = !isMobile.value;
      } catch (e) {
        error.value = e?.response?.data?.error || e?.message || t("library.error.searchFailed");
      } finally {
        loading.value = false;
      }
    };
    const applyFilters = async () => {
      if (!hasSearched.value || !keyword.value.trim()) return;
      await executeSearch(1, true);
    };
    const toggleFilter = async (key, value) => {
      const list = selectedFilters.value[key] || [];
      if (list.includes(value)) {
        selectedFilters.value[key] = list.filter((item) => item !== value);
      } else {
        selectedFilters.value[key] = [...list, value];
      }
      await applyFilters();
    };
    const clearFilters = async () => {
      for (const key of Object.keys(selectedFilters.value)) {
        selectedFilters.value[key] = [];
      }
      await applyFilters();
    };
    const changePage = async (target) => {
      if (target < 1 || target > totalPages.value || target === page.value) return;
      await executeSearch(target, true);
    };
    const openDetail = async (book) => {
      selectedBook.value = book;
      selectedBookDetail.value = null;
      detailError.value = "";
      detailLoading.value = true;
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/library/detail`, {
          title: book?.title || "",
          isbn: book?.isbn || "",
          record_id: book?.recordId ?? null
        });
        const payload = res.data;
        if (!payload?.success) {
          detailError.value = payload?.error || t("library.error.detailFailed");
          return;
        }
        selectedBookDetail.value = normalizeDetailNode(payload);
      } catch (e) {
        detailError.value = e?.response?.data?.error || e?.message || t("library.error.detailFailed");
      } finally {
        detailLoading.value = false;
      }
    };
    const closeDetail = () => {
      selectedBook.value = null;
      selectedBookDetail.value = null;
      detailError.value = "";
    };
    const submitSearch = async () => {
      await executeSearch(1, false);
    };
    watch(onlyOnShelf, async () => {
      await applyFilters();
    });
    onMounted(async () => {
      updateMobileState();
      window.addEventListener("resize", handleWindowResize);
      await loadDict();
    });
    onBeforeUnmount(() => {
      window.removeEventListener("resize", handleWindowResize);
      if (mobileResizeRaf) {
        window.cancelAnimationFrame(mobileResizeRaf);
        mobileResizeRaf = 0;
      }
    });
    return (_ctx, _cache) => {
      const _component_IOSSelect = resolveComponent("IOSSelect");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          icon: "local_library",
          title: unref(t)("library.title"),
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, null, 8, ["title"]),
        createBaseVNode("section", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => keyword.value = $event),
              class: "search-input",
              type: "text",
              placeholder: unref(t)("library.search.placeholder"),
              onKeyup: withKeys(submitSearch, ["enter"])
            }, null, 40, _hoisted_4), [
              [vModelText, keyword.value]
            ]),
            createBaseVNode("button", {
              class: "search-btn",
              disabled: loading.value,
              onClick: submitSearch
            }, toDisplayString(loading.value ? unref(t)("library.search.searching") : unref(t)("library.search.btn")), 9, _hoisted_5)
          ]),
          canShowFilters.value ? (openBlock(), createElementBlock("div", _hoisted_6, [
            createBaseVNode("label", _hoisted_7, [
              createTextVNode(toDisplayString(unref(t)("library.search.fieldLabel")) + " ", 1),
              createVNode(_component_IOSSelect, {
                modelValue: searchField.value,
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => searchField.value = $event)
              }, {
                default: withCtx(() => [
                  createBaseVNode("option", _hoisted_8, toDisplayString(unref(t)("library.search.field.all")), 1),
                  createBaseVNode("option", _hoisted_9, toDisplayString(unref(t)("library.search.field.title")), 1),
                  createBaseVNode("option", _hoisted_10, toDisplayString(unref(t)("library.search.field.author")), 1),
                  _cache[7] || (_cache[7] = createBaseVNode("option", { value: "isbn" }, "ISBN", -1))
                ]),
                _: 1
              }, 8, ["modelValue"])
            ]),
            createBaseVNode("label", _hoisted_11, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => onlyOnShelf.value = $event),
                type: "checkbox"
              }, null, 512), [
                [vModelCheckbox, onlyOnShelf.value]
              ]),
              createTextVNode(" " + toDisplayString(unref(t)("library.filter.onShelfOnly")), 1)
            ]),
            createBaseVNode("button", {
              class: "ghost-btn",
              disabled: !hasActiveFilters.value,
              onClick: clearFilters
            }, toDisplayString(unref(t)("library.filter.clear")), 9, _hoisted_12),
            isMobile.value ? (openBlock(), createElementBlock("button", {
              key: 0,
              class: "filter-toggle",
              onClick: _cache[4] || (_cache[4] = ($event) => filterPanelOpen.value = !filterPanelOpen.value)
            }, toDisplayString(filterPanelOpen.value ? unref(t)("library.filter.collapse") : unref(t)("library.filter.expand")), 1)) : createCommentVNode("", true)
          ])) : createCommentVNode("", true),
          showFilterPanel.value ? (openBlock(), createElementBlock("section", _hoisted_13, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(filterGroups.value, (group) => {
              return openBlock(), createElementBlock("article", {
                key: group.key,
                class: "filter-group"
              }, [
                createBaseVNode("h3", null, toDisplayString(group.title), 1),
                createBaseVNode("div", _hoisted_14, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(facetOptions.value[group.key] || [], (item) => {
                    return openBlock(), createElementBlock("button", {
                      key: `${group.key}-${item.value}`,
                      class: normalizeClass(["chip", { active: selectedFilters.value[group.key].includes(item.value) }]),
                      onClick: ($event) => toggleFilter(group.key, item.value)
                    }, [
                      createBaseVNode("span", null, toDisplayString(item.label), 1),
                      createBaseVNode("small", null, toDisplayString(item.count), 1)
                    ], 10, _hoisted_15);
                  }), 128)),
                  !(facetOptions.value[group.key] || []).length ? (openBlock(), createElementBlock("span", _hoisted_16, toDisplayString(unref(t)("library.filter.noOptions")), 1)) : createCommentVNode("", true)
                ])
              ]);
            }), 128))
          ])) : createCommentVNode("", true),
          createBaseVNode("p", _hoisted_17, toDisplayString(searchSummary.value), 1),
          error.value ? (openBlock(), createElementBlock("p", _hoisted_18, toDisplayString(error.value), 1)) : createCommentVNode("", true)
        ]),
        createBaseVNode("section", _hoisted_19, [
          createBaseVNode("div", _hoisted_20, [
            loading.value ? (openBlock(), createElementBlock("div", _hoisted_21, toDisplayString(unref(t)("library.loading")), 1)) : !results.value.length ? (openBlock(), createElementBlock("div", _hoisted_22, toDisplayString(hasSearched.value ? unref(t)("library.empty.noResult") : unref(t)("library.empty.initial")), 1)) : (openBlock(), createElementBlock("div", _hoisted_23, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(results.value, (book) => {
                return openBlock(), createElementBlock("article", {
                  key: `${book.recordId || book.title}-${book.isbn}`,
                  class: "book-card",
                  onClick: ($event) => openDetail(book)
                }, [
                  createBaseVNode("div", _hoisted_25, [
                    isCoverAvailable(book) ? (openBlock(), createElementBlock("img", {
                      key: 0,
                      src: getBookCover(book),
                      alt: book.title || unref(t)("library.cover.alt"),
                      class: "book-cover",
                      loading: "lazy",
                      referrerpolicy: "no-referrer",
                      crossorigin: "anonymous",
                      onError: ($event) => handleCoverError(book)
                    }, null, 40, _hoisted_26)) : (openBlock(), createElementBlock("div", _hoisted_27, toDisplayString(unref(t)("library.cover.fallback")), 1))
                  ]),
                  createBaseVNode("div", _hoisted_28, [
                    createBaseVNode("h3", _hoisted_29, toDisplayString(book.title || "-"), 1),
                    createBaseVNode("p", _hoisted_30, toDisplayString(unref(t)("library.meta.authorPrefix")) + toDisplayString(book.author || "-"), 1),
                    createBaseVNode("p", _hoisted_31, toDisplayString(unref(t)("library.meta.publisherPrefix")) + toDisplayString(book.publisher || "-"), 1),
                    createBaseVNode("p", _hoisted_32, [
                      createTextVNode(toDisplayString(unref(t)("library.meta.callNoPrefix")) + toDisplayString(book.callNo && book.callNo[0] || book.callNoOne || "-") + " ", 1),
                      _cache[8] || (_cache[8] = createBaseVNode("span", { class: "split" }, "|", -1)),
                      createTextVNode(" " + toDisplayString(unref(t)("library.meta.yearPrefix")) + toDisplayString(book.publishYear || "-"), 1)
                    ]),
                    createBaseVNode("p", _hoisted_33, toDisplayString(unref(t)("library.meta.onShelfPrefix")) + toDisplayString(book.onShelfCountI ?? 0) + toDisplayString(unref(t)("library.meta.collectionMiddle")) + toDisplayString(book.physicalCount ?? 0), 1)
                  ])
                ], 8, _hoisted_24);
              }), 128))
            ])),
            totalPages.value > 1 ? (openBlock(), createElementBlock("div", _hoisted_34, [
              createBaseVNode("button", {
                class: "pager-btn",
                disabled: page.value <= 1 || loading.value,
                onClick: _cache[5] || (_cache[5] = ($event) => changePage(page.value - 1))
              }, toDisplayString(unref(t)("library.pager.prev")), 9, _hoisted_35),
              createBaseVNode("span", _hoisted_36, toDisplayString(tr("library.pager.info", { page: page.value, total: totalPages.value })), 1),
              createBaseVNode("button", {
                class: "pager-btn",
                disabled: page.value >= totalPages.value || loading.value,
                onClick: _cache[6] || (_cache[6] = ($event) => changePage(page.value + 1))
              }, toDisplayString(unref(t)("library.pager.next")), 9, _hoisted_37)
            ])) : createCommentVNode("", true)
          ])
        ]),
        selectedBook.value ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: "detail-mask",
          onClick: withModifiers(closeDetail, ["self"])
        }, [
          createBaseVNode("div", _hoisted_38, [
            createBaseVNode("header", _hoisted_39, [
              createBaseVNode("h2", null, toDisplayString(detailBook.value.title), 1),
              createBaseVNode("button", {
                class: "close-btn",
                onClick: closeDetail
              }, toDisplayString(unref(t)("library.detail.close")), 1)
            ]),
            detailLoading.value ? (openBlock(), createElementBlock("div", _hoisted_40, toDisplayString(unref(t)("library.detail.loading")), 1)) : (openBlock(), createElementBlock("div", _hoisted_41, [
              detailError.value ? (openBlock(), createElementBlock("p", _hoisted_42, toDisplayString(detailError.value), 1)) : createCommentVNode("", true),
              createBaseVNode("section", _hoisted_43, [
                createBaseVNode("div", _hoisted_44, [
                  getDetailCover() ? (openBlock(), createElementBlock("img", {
                    key: 0,
                    src: getDetailCover(),
                    alt: detailBook.value.title,
                    class: "detail-cover",
                    referrerpolicy: "no-referrer",
                    crossorigin: "anonymous"
                  }, null, 8, _hoisted_45)) : (openBlock(), createElementBlock("div", _hoisted_46, toDisplayString(unref(t)("library.cover.fallback")), 1))
                ]),
                createBaseVNode("div", _hoisted_47, [
                  createBaseVNode("article", _hoisted_48, [
                    createBaseVNode("span", _hoisted_49, toDisplayString(unref(t)("library.detail.isbn")), 1),
                    createBaseVNode("span", _hoisted_50, toDisplayString(detailBook.value.isbn), 1)
                  ]),
                  createBaseVNode("article", _hoisted_51, [
                    createBaseVNode("span", _hoisted_52, toDisplayString(unref(t)("library.detail.author")), 1),
                    createBaseVNode("span", _hoisted_53, toDisplayString(detailBook.value.author), 1)
                  ]),
                  createBaseVNode("article", _hoisted_54, [
                    createBaseVNode("span", _hoisted_55, toDisplayString(unref(t)("library.detail.publisher")), 1),
                    createBaseVNode("span", _hoisted_56, toDisplayString(detailBook.value.publisher), 1)
                  ]),
                  createBaseVNode("article", _hoisted_57, [
                    createBaseVNode("span", _hoisted_58, toDisplayString(unref(t)("library.detail.publishYear")), 1),
                    createBaseVNode("span", _hoisted_59, toDisplayString(detailBook.value.publishYear), 1)
                  ]),
                  createBaseVNode("article", _hoisted_60, [
                    createBaseVNode("span", _hoisted_61, toDisplayString(unref(t)("library.detail.callNo")), 1),
                    createBaseVNode("span", _hoisted_62, toDisplayString(detailBook.value.callNo), 1)
                  ]),
                  createBaseVNode("article", _hoisted_63, [
                    createBaseVNode("span", _hoisted_64, toDisplayString(unref(t)("library.detail.location")), 1),
                    createBaseVNode("span", _hoisted_65, toDisplayString(detailBook.value.location), 1)
                  ]),
                  createBaseVNode("article", _hoisted_66, [
                    createBaseVNode("span", _hoisted_67, toDisplayString(unref(t)("library.detail.borrowStatus")), 1),
                    createBaseVNode("span", _hoisted_68, toDisplayString(detailBorrowStatus.value), 1)
                  ]),
                  createBaseVNode("article", _hoisted_69, [
                    createBaseVNode("span", _hoisted_70, toDisplayString(unref(t)("library.detail.recordId")), 1),
                    createBaseVNode("span", _hoisted_71, toDisplayString(selectedBook.value?.recordId || "-"), 1)
                  ])
                ])
              ]),
              createBaseVNode("section", _hoisted_72, [
                createBaseVNode("h3", null, toDisplayString(unref(t)("library.holdings.title")), 1),
                createBaseVNode("div", _hoisted_73, [
                  createBaseVNode("article", _hoisted_74, [
                    createBaseVNode("span", _hoisted_75, toDisplayString(unref(t)("library.holdings.onShelfCount")), 1),
                    createBaseVNode("span", _hoisted_76, toDisplayString(holdingData.value.onShelfCount ?? selectedBook.value?.onShelfCountI ?? 0), 1)
                  ]),
                  createBaseVNode("article", _hoisted_77, [
                    createBaseVNode("span", _hoisted_78, toDisplayString(unref(t)("library.holdings.physicalCount")), 1),
                    createBaseVNode("span", _hoisted_79, toDisplayString(holdingData.value.pCount ?? selectedBook.value?.physicalCount ?? 0), 1)
                  ]),
                  createBaseVNode("article", _hoisted_80, [
                    createBaseVNode("span", _hoisted_81, toDisplayString(unref(t)("library.holdings.metadataCount")), 1),
                    createBaseVNode("span", _hoisted_82, toDisplayString(holdingData.value.metadataCount ?? "-"), 1)
                  ]),
                  createBaseVNode("article", _hoisted_83, [
                    createBaseVNode("span", _hoisted_84, toDisplayString(unref(t)("library.holdings.orderFlag")), 1),
                    createBaseVNode("span", _hoisted_85, toDisplayString(holdingData.value.orderFlag ?? "-"), 1)
                  ])
                ])
              ]),
              holdingItems.value.length ? (openBlock(), createElementBlock("section", _hoisted_86, [
                createBaseVNode("h3", null, toDisplayString(unref(t)("library.holdingList.title")), 1),
                createBaseVNode("div", _hoisted_87, [
                  createBaseVNode("table", _hoisted_88, [
                    createBaseVNode("thead", null, [
                      createBaseVNode("tr", null, [
                        createBaseVNode("th", null, toDisplayString(unref(t)("library.holdingList.index")), 1),
                        createBaseVNode("th", null, toDisplayString(unref(t)("library.holdingList.callNo")), 1),
                        createBaseVNode("th", null, toDisplayString(unref(t)("library.holdingList.barcode")), 1),
                        createBaseVNode("th", null, toDisplayString(unref(t)("library.holdingList.year")), 1),
                        createBaseVNode("th", null, toDisplayString(unref(t)("library.holdingList.vol")), 1),
                        createBaseVNode("th", null, toDisplayString(unref(t)("library.holdingList.location")), 1),
                        createBaseVNode("th", null, toDisplayString(unref(t)("library.holdingList.inDate")), 1),
                        createBaseVNode("th", null, toDisplayString(unref(t)("library.holdingList.status")), 1)
                      ])
                    ]),
                    createBaseVNode("tbody", null, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(holdingItems.value, (item, idx) => {
                        return openBlock(), createElementBlock("tr", {
                          key: `${item.itemId || item.barcode || idx}`
                        }, [
                          createBaseVNode("td", null, toDisplayString(idx + 1), 1),
                          createBaseVNode("td", null, toDisplayString(formatHoldingValue(item.callNo)), 1),
                          createBaseVNode("td", null, toDisplayString(formatHoldingValue(item.barcode)), 1),
                          createBaseVNode("td", null, toDisplayString(formatHoldingValue(item.year)), 1),
                          createBaseVNode("td", null, toDisplayString(formatHoldingValue(item.vol)), 1),
                          createBaseVNode("td", null, [
                            createBaseVNode("span", _hoisted_89, toDisplayString(formatHoldingValue(item.locationName || item.realLocationName)), 1)
                          ]),
                          createBaseVNode("td", null, toDisplayString(formatHoldingValue(item.inDate)), 1),
                          createBaseVNode("td", null, [
                            createBaseVNode("span", {
                              class: normalizeClass(["holding-status", holdingStatusClass(item.processType)])
                            }, toDisplayString(formatHoldingValue(item.processType)), 3)
                          ])
                        ]);
                      }), 128))
                    ])
                  ])
                ])
              ])) : createCommentVNode("", true),
              createBaseVNode("section", _hoisted_90, [
                createBaseVNode("h3", null, toDisplayString(unref(t)("library.desc.title")), 1),
                createBaseVNode("p", null, toDisplayString(detailBook.value.abstract), 1)
              ])
            ]))
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const LibraryView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-c4b17fa9"]]);
export {
  LibraryView as default
};
