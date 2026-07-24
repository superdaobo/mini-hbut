import { w as watch, o as onMounted, m as onBeforeUnmount, E as resolveComponent, c as createElementBlock, b as openBlock, q as createVNode, d as createBaseVNode, f as createCommentVNode, u as unref, C as withDirectives, D as vModelText, a as ref, p as withKeys, t as toDisplayString, e as computed, g as createTextVNode, l as withCtx, H as vModelCheckbox, F as Fragment, i as renderList, n as normalizeClass, j as withModifiers } from "./vue-core-DdLVj9yW.js";
import { _ as _export_sfc, a as axiosInstance } from "./app-demo-CxKBY5JQ.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import "./runtime-bridge-apFQ0nCw.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "library-view" };
const _hoisted_2 = { class: "search-panel" };
const _hoisted_3 = { class: "search-row" };
const _hoisted_4 = ["disabled"];
const _hoisted_5 = {
  key: 0,
  class: "search-ops"
};
const _hoisted_6 = { class: "select-line" };
const _hoisted_7 = { class: "checkbox-line" };
const _hoisted_8 = ["disabled"];
const _hoisted_9 = {
  key: 1,
  class: "filter-panel top-filter-panel"
};
const _hoisted_10 = { class: "chips" };
const _hoisted_11 = ["onClick"];
const _hoisted_12 = {
  key: 0,
  class: "empty-chip"
};
const _hoisted_13 = { class: "summary" };
const _hoisted_14 = {
  key: 2,
  class: "error"
};
const _hoisted_15 = { class: "content-layout" };
const _hoisted_16 = { class: "result-panel" };
const _hoisted_17 = {
  key: 0,
  class: "loading-box"
};
const _hoisted_18 = {
  key: 1,
  class: "empty-box"
};
const _hoisted_19 = {
  key: 2,
  class: "result-list"
};
const _hoisted_20 = ["onClick"];
const _hoisted_21 = { class: "book-cover-wrap" };
const _hoisted_22 = ["src", "alt", "onError"];
const _hoisted_23 = {
  key: 1,
  class: "book-cover-empty"
};
const _hoisted_24 = { class: "book-info" };
const _hoisted_25 = { class: "book-title" };
const _hoisted_26 = { class: "book-meta" };
const _hoisted_27 = { class: "book-meta" };
const _hoisted_28 = { class: "book-meta" };
const _hoisted_29 = { class: "book-badge" };
const _hoisted_30 = {
  key: 3,
  class: "pager"
};
const _hoisted_31 = ["disabled"];
const _hoisted_32 = { class: "pager-info" };
const _hoisted_33 = ["disabled"];
const _hoisted_34 = { class: "detail-card" };
const _hoisted_35 = { class: "detail-head" };
const _hoisted_36 = {
  key: 0,
  class: "loading-box"
};
const _hoisted_37 = { key: 1 };
const _hoisted_38 = {
  key: 0,
  class: "error"
};
const _hoisted_39 = { class: "detail-main" };
const _hoisted_40 = { class: "detail-cover-wrap" };
const _hoisted_41 = ["src", "alt"];
const _hoisted_42 = {
  key: 1,
  class: "detail-cover-empty"
};
const _hoisted_43 = { class: "detail-grid" };
const _hoisted_44 = { class: "detail-item" };
const _hoisted_45 = { class: "value" };
const _hoisted_46 = { class: "detail-item" };
const _hoisted_47 = { class: "value" };
const _hoisted_48 = { class: "detail-item" };
const _hoisted_49 = { class: "value" };
const _hoisted_50 = { class: "detail-item" };
const _hoisted_51 = { class: "value" };
const _hoisted_52 = { class: "detail-item" };
const _hoisted_53 = { class: "value" };
const _hoisted_54 = { class: "detail-item" };
const _hoisted_55 = { class: "value" };
const _hoisted_56 = { class: "detail-item" };
const _hoisted_57 = { class: "value" };
const _hoisted_58 = { class: "detail-item" };
const _hoisted_59 = { class: "value" };
const _hoisted_60 = { class: "holding-panel" };
const _hoisted_61 = { class: "holding-grid" };
const _hoisted_62 = { class: "detail-item" };
const _hoisted_63 = { class: "value" };
const _hoisted_64 = { class: "detail-item" };
const _hoisted_65 = { class: "value" };
const _hoisted_66 = { class: "detail-item" };
const _hoisted_67 = { class: "value" };
const _hoisted_68 = { class: "detail-item" };
const _hoisted_69 = { class: "value" };
const _hoisted_70 = {
  key: 1,
  class: "holding-list-panel"
};
const _hoisted_71 = { class: "holding-table-wrap" };
const _hoisted_72 = { class: "holding-table" };
const _hoisted_73 = { class: "holding-location" };
const _hoisted_74 = { class: "detail-desc" };
const _sfc_main = {
  __name: "LibraryView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back", "logout"],
  setup(__props, { emit: __emit }) {
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
      { key: "resourceType", title: "资源类型" },
      { key: "publisher", title: "出版社" },
      { key: "author", title: "作者" },
      { key: "discode1", title: "学科分类" },
      { key: "langCode", title: "语种" },
      { key: "countryCode", title: "出版地区" },
      { key: "locationId", title: "馆藏位置" }
    ];
    const totalPages = computed(() => {
      if (rows.value <= 0) return 0;
      return Math.ceil(total.value / rows.value);
    });
    const searchSummary = computed(() => {
      if (!keyword.value.trim()) return "请输入关键词搜索图书";
      return `“${keyword.value.trim()}” 共检索到 ${total.value} 条记录`;
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
        abstract: detail.adstract || detail.ddAbstract || base.adstract || base.ddAbstract || "暂无简介"
      };
    });
    const detailBorrowStatus = computed(() => {
      const detail = selectedBookDetail.value?.detail || {};
      const base = selectedBook.value || {};
      const status = detail.processTypeName || detail.statusName || base.processTypeName || base.statusName;
      if (status) return status;
      const orderFlag = String(holdingData.value?.orderFlag || "");
      if (orderFlag === "0") return "可借";
      if (orderFlag === "1") return "可预约";
      if (orderFlag === "2") return "不可预约";
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
        error.value = "请输入图书关键词";
        return;
      }
      loading.value = true;
      try {
        const payload = buildSearchPayload(nextPage);
        const res = await axiosInstance.post(`${API_BASE}/v2/library/search`, payload);
        const data = res.data;
        if (!data?.success) {
          error.value = data?.error || "图书检索失败";
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
        error.value = e?.response?.data?.error || e?.message || "图书检索失败";
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
          detailError.value = payload?.error || "加载图书详情失败";
          return;
        }
        selectedBookDetail.value = normalizeDetailNode(payload);
      } catch (e) {
        detailError.value = e?.response?.data?.error || e?.message || "加载图书详情失败";
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
          title: "图书查询",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }),
        createBaseVNode("section", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => keyword.value = $event),
              class: "search-input",
              type: "text",
              placeholder: "请输入书名 / 作者 / 关键词",
              onKeyup: withKeys(submitSearch, ["enter"])
            }, null, 544), [
              [vModelText, keyword.value]
            ]),
            createBaseVNode("button", {
              class: "search-btn",
              disabled: loading.value,
              onClick: submitSearch
            }, toDisplayString(loading.value ? "检索中..." : "搜索图书"), 9, _hoisted_4)
          ]),
          canShowFilters.value ? (openBlock(), createElementBlock("div", _hoisted_5, [
            createBaseVNode("label", _hoisted_6, [
              _cache[8] || (_cache[8] = createTextVNode(" 检索字段 ", -1)),
              createVNode(_component_IOSSelect, {
                modelValue: searchField.value,
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => searchField.value = $event)
              }, {
                default: withCtx(() => [..._cache[7] || (_cache[7] = [
                  createBaseVNode("option", { value: "keyWord" }, "综合", -1),
                  createBaseVNode("option", { value: "title" }, "书名", -1),
                  createBaseVNode("option", { value: "author" }, "作者", -1),
                  createBaseVNode("option", { value: "isbn" }, "ISBN", -1)
                ])]),
                _: 1
              }, 8, ["modelValue"])
            ]),
            createBaseVNode("label", _hoisted_7, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => onlyOnShelf.value = $event),
                type: "checkbox"
              }, null, 512), [
                [vModelCheckbox, onlyOnShelf.value]
              ]),
              _cache[9] || (_cache[9] = createTextVNode(" 仅显示在架馆藏 ", -1))
            ]),
            createBaseVNode("button", {
              class: "ghost-btn",
              disabled: !hasActiveFilters.value,
              onClick: clearFilters
            }, "清空筛选", 8, _hoisted_8),
            isMobile.value ? (openBlock(), createElementBlock("button", {
              key: 0,
              class: "filter-toggle",
              onClick: _cache[4] || (_cache[4] = ($event) => filterPanelOpen.value = !filterPanelOpen.value)
            }, toDisplayString(filterPanelOpen.value ? "收起筛选" : "展开筛选"), 1)) : createCommentVNode("", true)
          ])) : createCommentVNode("", true),
          showFilterPanel.value ? (openBlock(), createElementBlock("section", _hoisted_9, [
            (openBlock(), createElementBlock(Fragment, null, renderList(filterMeta, (group) => {
              return createBaseVNode("article", {
                key: group.key,
                class: "filter-group"
              }, [
                createBaseVNode("h3", null, toDisplayString(group.title), 1),
                createBaseVNode("div", _hoisted_10, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(facetOptions.value[group.key] || [], (item) => {
                    return openBlock(), createElementBlock("button", {
                      key: `${group.key}-${item.value}`,
                      class: normalizeClass(["chip", { active: selectedFilters.value[group.key].includes(item.value) }]),
                      onClick: ($event) => toggleFilter(group.key, item.value)
                    }, [
                      createBaseVNode("span", null, toDisplayString(item.label), 1),
                      createBaseVNode("small", null, toDisplayString(item.count), 1)
                    ], 10, _hoisted_11);
                  }), 128)),
                  !(facetOptions.value[group.key] || []).length ? (openBlock(), createElementBlock("span", _hoisted_12, "暂无可筛选项")) : createCommentVNode("", true)
                ])
              ]);
            }), 64))
          ])) : createCommentVNode("", true),
          createBaseVNode("p", _hoisted_13, toDisplayString(searchSummary.value), 1),
          error.value ? (openBlock(), createElementBlock("p", _hoisted_14, toDisplayString(error.value), 1)) : createCommentVNode("", true)
        ]),
        createBaseVNode("section", _hoisted_15, [
          createBaseVNode("div", _hoisted_16, [
            loading.value ? (openBlock(), createElementBlock("div", _hoisted_17, "正在检索图书...")) : !results.value.length ? (openBlock(), createElementBlock("div", _hoisted_18, toDisplayString(hasSearched.value ? "暂无检索结果" : "请输入关键词后点击“搜索图书”开始查询"), 1)) : (openBlock(), createElementBlock("div", _hoisted_19, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(results.value, (book) => {
                return openBlock(), createElementBlock("article", {
                  key: `${book.recordId || book.title}-${book.isbn}`,
                  class: "book-card",
                  onClick: ($event) => openDetail(book)
                }, [
                  createBaseVNode("div", _hoisted_21, [
                    isCoverAvailable(book) ? (openBlock(), createElementBlock("img", {
                      key: 0,
                      src: getBookCover(book),
                      alt: book.title || "封面",
                      class: "book-cover",
                      loading: "lazy",
                      referrerpolicy: "no-referrer",
                      crossorigin: "anonymous",
                      onError: ($event) => handleCoverError(book)
                    }, null, 40, _hoisted_22)) : (openBlock(), createElementBlock("div", _hoisted_23, "暂无封面"))
                  ]),
                  createBaseVNode("div", _hoisted_24, [
                    createBaseVNode("h3", _hoisted_25, toDisplayString(book.title || "-"), 1),
                    createBaseVNode("p", _hoisted_26, "作者：" + toDisplayString(book.author || "-"), 1),
                    createBaseVNode("p", _hoisted_27, "出版社：" + toDisplayString(book.publisher || "-"), 1),
                    createBaseVNode("p", _hoisted_28, [
                      createTextVNode(" 索书号：" + toDisplayString(book.callNo && book.callNo[0] || book.callNoOne || "-") + " ", 1),
                      _cache[10] || (_cache[10] = createBaseVNode("span", { class: "split" }, "|", -1)),
                      createTextVNode(" 出版年：" + toDisplayString(book.publishYear || "-"), 1)
                    ]),
                    createBaseVNode("p", _hoisted_29, "在架 " + toDisplayString(book.onShelfCountI ?? 0) + " / 馆藏 " + toDisplayString(book.physicalCount ?? 0), 1)
                  ])
                ], 8, _hoisted_20);
              }), 128))
            ])),
            totalPages.value > 1 ? (openBlock(), createElementBlock("div", _hoisted_30, [
              createBaseVNode("button", {
                class: "pager-btn",
                disabled: page.value <= 1 || loading.value,
                onClick: _cache[5] || (_cache[5] = ($event) => changePage(page.value - 1))
              }, "上一页", 8, _hoisted_31),
              createBaseVNode("span", _hoisted_32, "第 " + toDisplayString(page.value) + " / " + toDisplayString(totalPages.value) + " 页", 1),
              createBaseVNode("button", {
                class: "pager-btn",
                disabled: page.value >= totalPages.value || loading.value,
                onClick: _cache[6] || (_cache[6] = ($event) => changePage(page.value + 1))
              }, "下一页", 8, _hoisted_33)
            ])) : createCommentVNode("", true)
          ])
        ]),
        selectedBook.value ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: "detail-mask",
          onClick: withModifiers(closeDetail, ["self"])
        }, [
          createBaseVNode("div", _hoisted_34, [
            createBaseVNode("header", _hoisted_35, [
              createBaseVNode("h2", null, toDisplayString(detailBook.value.title), 1),
              createBaseVNode("button", {
                class: "close-btn",
                onClick: closeDetail
              }, "关闭")
            ]),
            detailLoading.value ? (openBlock(), createElementBlock("div", _hoisted_36, "正在加载详情...")) : (openBlock(), createElementBlock("div", _hoisted_37, [
              detailError.value ? (openBlock(), createElementBlock("p", _hoisted_38, toDisplayString(detailError.value), 1)) : createCommentVNode("", true),
              createBaseVNode("section", _hoisted_39, [
                createBaseVNode("div", _hoisted_40, [
                  getDetailCover() ? (openBlock(), createElementBlock("img", {
                    key: 0,
                    src: getDetailCover(),
                    alt: detailBook.value.title,
                    class: "detail-cover",
                    referrerpolicy: "no-referrer",
                    crossorigin: "anonymous"
                  }, null, 8, _hoisted_41)) : (openBlock(), createElementBlock("div", _hoisted_42, "暂无封面"))
                ]),
                createBaseVNode("div", _hoisted_43, [
                  createBaseVNode("article", _hoisted_44, [
                    _cache[11] || (_cache[11] = createBaseVNode("span", { class: "label" }, "ISBN", -1)),
                    createBaseVNode("span", _hoisted_45, toDisplayString(detailBook.value.isbn), 1)
                  ]),
                  createBaseVNode("article", _hoisted_46, [
                    _cache[12] || (_cache[12] = createBaseVNode("span", { class: "label" }, "作者", -1)),
                    createBaseVNode("span", _hoisted_47, toDisplayString(detailBook.value.author), 1)
                  ]),
                  createBaseVNode("article", _hoisted_48, [
                    _cache[13] || (_cache[13] = createBaseVNode("span", { class: "label" }, "出版社", -1)),
                    createBaseVNode("span", _hoisted_49, toDisplayString(detailBook.value.publisher), 1)
                  ]),
                  createBaseVNode("article", _hoisted_50, [
                    _cache[14] || (_cache[14] = createBaseVNode("span", { class: "label" }, "出版年", -1)),
                    createBaseVNode("span", _hoisted_51, toDisplayString(detailBook.value.publishYear), 1)
                  ]),
                  createBaseVNode("article", _hoisted_52, [
                    _cache[15] || (_cache[15] = createBaseVNode("span", { class: "label" }, "索书号", -1)),
                    createBaseVNode("span", _hoisted_53, toDisplayString(detailBook.value.callNo), 1)
                  ]),
                  createBaseVNode("article", _hoisted_54, [
                    _cache[16] || (_cache[16] = createBaseVNode("span", { class: "label" }, "馆藏地", -1)),
                    createBaseVNode("span", _hoisted_55, toDisplayString(detailBook.value.location), 1)
                  ]),
                  createBaseVNode("article", _hoisted_56, [
                    _cache[17] || (_cache[17] = createBaseVNode("span", { class: "label" }, "借阅状态", -1)),
                    createBaseVNode("span", _hoisted_57, toDisplayString(detailBorrowStatus.value), 1)
                  ]),
                  createBaseVNode("article", _hoisted_58, [
                    _cache[18] || (_cache[18] = createBaseVNode("span", { class: "label" }, "馆藏记录号", -1)),
                    createBaseVNode("span", _hoisted_59, toDisplayString(selectedBook.value?.recordId || "-"), 1)
                  ])
                ])
              ]),
              createBaseVNode("section", _hoisted_60, [
                _cache[23] || (_cache[23] = createBaseVNode("h3", null, "馆藏信息", -1)),
                createBaseVNode("div", _hoisted_61, [
                  createBaseVNode("article", _hoisted_62, [
                    _cache[19] || (_cache[19] = createBaseVNode("span", { class: "label" }, "在架数量", -1)),
                    createBaseVNode("span", _hoisted_63, toDisplayString(holdingData.value.onShelfCount ?? selectedBook.value?.onShelfCountI ?? 0), 1)
                  ]),
                  createBaseVNode("article", _hoisted_64, [
                    _cache[20] || (_cache[20] = createBaseVNode("span", { class: "label" }, "实体馆藏", -1)),
                    createBaseVNode("span", _hoisted_65, toDisplayString(holdingData.value.pCount ?? selectedBook.value?.physicalCount ?? 0), 1)
                  ]),
                  createBaseVNode("article", _hoisted_66, [
                    _cache[21] || (_cache[21] = createBaseVNode("span", { class: "label" }, "元数据数量", -1)),
                    createBaseVNode("span", _hoisted_67, toDisplayString(holdingData.value.metadataCount ?? "-"), 1)
                  ]),
                  createBaseVNode("article", _hoisted_68, [
                    _cache[22] || (_cache[22] = createBaseVNode("span", { class: "label" }, "预约标记", -1)),
                    createBaseVNode("span", _hoisted_69, toDisplayString(holdingData.value.orderFlag ?? "-"), 1)
                  ])
                ])
              ]),
              holdingItems.value.length ? (openBlock(), createElementBlock("section", _hoisted_70, [
                _cache[25] || (_cache[25] = createBaseVNode("h3", null, "馆藏明细", -1)),
                createBaseVNode("div", _hoisted_71, [
                  createBaseVNode("table", _hoisted_72, [
                    _cache[24] || (_cache[24] = createBaseVNode("thead", null, [
                      createBaseVNode("tr", null, [
                        createBaseVNode("th", null, "序号"),
                        createBaseVNode("th", null, "索书号"),
                        createBaseVNode("th", null, "条码号"),
                        createBaseVNode("th", null, "年代"),
                        createBaseVNode("th", null, "卷期"),
                        createBaseVNode("th", null, "馆藏地"),
                        createBaseVNode("th", null, "入藏时间"),
                        createBaseVNode("th", null, "书刊状态")
                      ])
                    ], -1)),
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
                            createBaseVNode("span", _hoisted_73, toDisplayString(formatHoldingValue(item.locationName || item.realLocationName)), 1)
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
              createBaseVNode("section", _hoisted_74, [
                _cache[26] || (_cache[26] = createBaseVNode("h3", null, "内容简介", -1)),
                createBaseVNode("p", null, toDisplayString(detailBook.value.abstract), 1)
              ])
            ]))
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const LibraryView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-e06cb5fe"]]);
export {
  LibraryView as default
};
