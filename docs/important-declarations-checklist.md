# !important 声明迁移清单

> 本文档记录 `src/style.css` 和 `src/styles/ui_ux_pro_max.css` 中所有 `!important` 声明。
> 用于 Tailwind CSS 迁移过程中的 CSS Layer 隔离策略参考。
>
> **Validates: Requirement 11.1**

## 概述

| 文件 | !important 出现次数 |
|------|-------------------|
| `src/style.css` | 11 |
| `src/styles/ui_ux_pro_max.css` | 136 |
| **总计** | **147** |

> 注：下表按「选择器 + 属性」维度逐条记录，部分选择器组（如多个卡片类名共享同一规则）合并为一条。

## src/style.css

| # | Selector | Property | Value | Status |
|---|----------|----------|-------|--------|
| 1 | `html, body, #app, .app-shell, .dashboard, .schedule-view, .notification-view, .me-view, .settings-view, button, input, textarea, select` | font-family | `var(--ui-font-family) !important` | active |
| 2 | `.back-btn` | background | `var(--ui-back-btn-bg) !important` | active |
| 3 | `.back-btn` | color | `var(--ui-back-btn-text) !important` | active |
| 4 | `.back-btn` | border | `1px solid var(--ui-back-btn-border) !important` | active |
| 5 | `.back-btn` | box-shadow | `var(--ui-back-btn-shadow) !important` | active |
| 6 | `.back-btn:hover` | background | `var(--ui-back-btn-hover-bg) !important` | active |
| 7 | `html.window-resizing, html.window-resizing *, html.window-resizing *::before, html.window-resizing *::after` | transition-duration | `0s !important` | active |
| 8 | `html.window-resizing, html.window-resizing *, html.window-resizing *::before, html.window-resizing *::after` | animation-duration | `0s !important` | active |
| 9 | `html.window-resizing, html.window-resizing *, html.window-resizing *::before, html.window-resizing *::after` | animation-play-state | `paused !important` | active |
| 10 | `html.window-resizing :is(.glass-card, .module-card, .dashboard-header, .today-panel, .notice-panel, .settings-section)` | backdrop-filter | `none !important` | active |
| 11 | `html.window-resizing :is(.glass-card, .module-card, .dashboard-header, .today-panel, .notice-panel, .settings-section)` | -webkit-backdrop-filter | `none !important` | active |


## src/styles/ui_ux_pro_max.css

### Dashboard Header 相关

| # | Selector | Property | Value | Status |
|---|----------|----------|-------|--------|
| 1 | `.dashboard-header .title` | color | `var(--ui-text) !important` | active |
| 2 | `.dashboard-header .title` | background | `none !important` | active |
| 3 | `.dashboard-header .title` | -webkit-text-fill-color | `currentColor !important` | active |
| 4 | `.dashboard-header .title` | text-shadow | `none !important` | active |
| 5 | `.dashboard-header .title.glitch-text::before, .dashboard-header .title.glitch-text::after` | content | `none !important` | active |
| 6 | `.app-shell > :is(.dashboard, .notification-view, .me-view) .dashboard-header:not(.dashboard-header--home)` | display | `flex !important` | active |
| 7 | `.app-shell > :is(.dashboard, .notification-view, .me-view) .dashboard-header:not(.dashboard-header--home)` | align-items | `center !important` | active |
| 8 | `.app-shell > :is(.dashboard, .notification-view, .me-view) .dashboard-header:not(.dashboard-header--home)` | justify-content | `space-between !important` | active |
| 9 | `.app-shell > :is(.dashboard, .notification-view, .me-view) .dashboard-header:not(.dashboard-header--home)` | flex-wrap | `nowrap !important` | active |
| 10 | `.app-shell > :is(.dashboard, .notification-view, .me-view) .dashboard-header:not(.dashboard-header--home) .title` | font-size | `clamp(17px, 4.4vw, 21px) !important` | active |
| 11 | `.app-shell > :is(.dashboard, .notification-view, .me-view) .dashboard-header:not(.dashboard-header--home) .title` | white-space | `nowrap !important` | active |
| 12 | `.app-shell > :is(.dashboard, .notification-view, .me-view) .dashboard-header:not(.dashboard-header--home) .title` | overflow | `hidden !important` | active |
| 13 | `.app-shell > :is(.dashboard, .notification-view, .me-view) .dashboard-header:not(.dashboard-header--home) .title` | text-overflow | `ellipsis !important` | active |
| 14 | `.app-shell > :is(.notification-view, .me-view) .dashboard-header` | justify-content | `center !important` | active |
| 15 | `.app-shell > :is(.dashboard, .notification-view, .me-view) .dashboard-header:not(.dashboard-header--home) .user-info` | flex-wrap | `nowrap !important` | active |


### Schedule View 相关

| # | Selector | Property | Value | Status |
|---|----------|----------|-------|--------|
| 16 | `.app-shell > .schedule-view` | width | `100% !important` | active |
| 17 | `.app-shell > .schedule-view` | max-width | `none !important` | active |
| 18 | `.app-shell > .schedule-view` | margin-inline | `0 !important` | active |
| 19 | `.app-shell > .schedule-view` | padding-inline | `0 !important` | active |
| 20 | `.app-shell > .schedule-view` | padding-top | `0 !important` | active |

### View Header 相关

| # | Selector | Property | Value | Status |
|---|----------|----------|-------|--------|
| 21 | `:is(.view-header, .t-page-header, .app-header, .grade-header, .elec-header, .qxzkb-header, .trans-header)` | border | `1px solid var(--ux-card-border) !important` | active |
| 22 | `:is(.view-header, .t-page-header, .app-header, .grade-header, .elec-header, .qxzkb-header, .trans-header)` | background | `linear-gradient(155deg, ...) !important` | active |
| 23 | `:is(.view-header, .t-page-header, .app-header, .grade-header, .elec-header, .qxzkb-header, .trans-header)` | box-shadow | `var(--ux-card-shadow) !important` | active |
| 24 | `:is(.view-header, .t-page-header, .app-header, .grade-header, .elec-header, .qxzkb-header, .trans-header)` | display | `grid !important` | active |
| 25 | `:is(.view-header, .t-page-header, .app-header, .grade-header, .elec-header, .qxzkb-header, .trans-header)` | grid-template-columns | `minmax(90px, 124px) 1fr minmax(90px, 124px) !important` | active |
| 26 | `:is(.view-header, .t-page-header, .app-header, .grade-header, .elec-header, .qxzkb-header, .trans-header)` | align-items | `center !important` | active |
| 27 | `:is(.view-header, .t-page-header, .app-header, .grade-header, .elec-header, .qxzkb-header, .trans-header)` | gap | `8px !important` | active |
| 28 | `:is(.view-header, ...) > h1, :is(.view-header, ...) > .title` | margin | `0 !important` | active |
| 29 | `:is(.view-header, ...) > h1, :is(.view-header, ...) > .title` | justify-self | `center !important` | active |
| 30 | `:is(.view-header, ...) > h1, :is(.view-header, ...) > .title` | text-align | `center !important` | active |
| 31 | `:is(.view-header, ...) > h1, :is(.view-header, ...) > .title` | display | `inline-flex !important` | active |
| 32 | `:is(.view-header, ...) > h1, :is(.view-header, ...) > .title` | align-items | `center !important` | active |
| 33 | `:is(.view-header, ...) > h1, :is(.view-header, ...) > .title` | justify-content | `center !important` | active |
| 34 | `:is(.view-header, ...) > h1, :is(.view-header, ...) > .title` | gap | `10px !important` | active |
| 35 | `:is(.view-header, ...) > h1, :is(.view-header, ...) > .title` | font-size | `var(--ux-header-title-size) !important` | active |
| 36 | `:is(.view-header, ...) > h1, :is(.view-header, ...) > .title` | font-weight | `800 !important` | active |
| 37 | `:is(.view-header, ...) > h1, :is(.view-header, ...) > .title` | line-height | `1.2 !important` | active |
| 38 | `:is(.view-header, ...) > h1, :is(.view-header, ...) > .title` | color | `var(--ui-text) !important` | active |
| 39 | `:is(.view-header, ...) .back-btn, :is(.view-header, ...) .header-btn` | border-radius | `12px !important` | active |


### Back Button / Header Button 相关

| # | Selector | Property | Value | Status |
|---|----------|----------|-------|--------|
| 40 | `.app-shell :is(.back-btn, .header-btn)` | display | `inline-flex !important` | active |
| 41 | `.app-shell :is(.back-btn, .header-btn)` | align-items | `center !important` | active |
| 42 | `.app-shell :is(.back-btn, .header-btn)` | justify-content | `center !important` | active |
| 43 | `.app-shell :is(.back-btn, .header-btn)` | min-width | `90px !important` | active |
| 44 | `.app-shell :is(.back-btn, .header-btn)` | height | `42px !important` | active |
| 45 | `.app-shell :is(.back-btn, .header-btn)` | padding | `0 14px !important` | active |
| 46 | `.app-shell :is(.back-btn, .header-btn)` | border-radius | `12px !important` | active |
| 47 | `.app-shell :is(.back-btn, .header-btn)` | border | `1px solid color-mix(...) !important` | active |
| 48 | `.app-shell :is(.back-btn, .header-btn)` | background | `color-mix(in oklab, var(--ui-primary-soft) 62%, #fff 38%) !important` | active |
| 49 | `.app-shell :is(.back-btn, .header-btn)` | color | `var(--ui-text) !important` | active |
| 50 | `.app-shell :is(.back-btn, .header-btn)` | font-size | `14px !important` | active |
| 51 | `.app-shell :is(.back-btn, .header-btn)` | font-weight | `700 !important` | active |
| 52 | `.app-shell :is(.back-btn, .header-btn)` | line-height | `1 !important` | active |
| 53 | `.app-shell :is(.back-btn, .header-btn)` | box-shadow | `0 8px 18px color-mix(...) !important` | active |
| 54 | `.app-shell :is(.back-btn, .header-btn):hover` | background | `color-mix(in oklab, var(--ui-primary-soft) 74%, #fff 26%) !important` | active |

### View Header 隐藏元素

| # | Selector | Property | Value | Status |
|---|----------|----------|-------|--------|
| 55 | `:is(.view-header, ...) :is(.logout-btn, .header-btn.danger, .student-id, .student-number, .student-no, .user-info)` | display | `none !important` | active |


### Card 组件相关

| # | Selector | Property | Value | Status |
|---|----------|----------|-------|--------|
| 56 | `:is(.glass-card, .module-card, .search-card, .filter-card, .result-card, .summary-card, .stats-card, .info-card, .list-card, .setting-card, .settings-section, .today-panel, .notice-panel, .results-info, .room-card, .calendar-card, .exam-item, .course-card, .transaction-card, .book-card, .resource-card, .t-card)` | border-radius | `var(--ux-card-radius) !important` | active |
| 57 | (同上) | border | `1px solid var(--ux-card-border) !important` | active |
| 58 | (同上) | box-shadow | `var(--ux-card-shadow) !important` | active |
| 59 | (同上) | transition | `transform ... ease, box-shadow ... ease !important` | active |
| 60 | `html[data-ui-card='glass'] :is(.glass-card, .module-card, ...)` | background | `linear-gradient(154deg, ...) !important` | active |
| 61 | `html[data-ui-card='solid'] :is(.glass-card, .module-card, ...)` | background | `color-mix(in oklab, #ffffff 94%, var(--ui-primary) 6%) !important` | active |
| 62 | `html[data-ui-card='outline'] :is(.glass-card, .module-card, ...)` | background | `color-mix(in oklab, #ffffff 70%, transparent) !important` | active |
| 63 | `html[data-ui-card='outline'] :is(.glass-card, .module-card, ...)` | border-width | `1.5px !important` | active |
| 64 | `:is(.glass-card, .module-card, .room-card, .settings-section, .book-card, .resource-card, .t-card--hoverable):not(.disabled):not(.bottom-tab-bar):hover` | box-shadow | `var(--ux-card-shadow-hover) !important` | active |

### Module Grid 相关

| # | Selector | Property | Value | Status |
|---|----------|----------|-------|--------|
| 65 | `.module-grid` | display | `grid !important` | active |
| 66 | `.module-grid` | grid-template-columns | `repeat(4, minmax(0, 1fr)) !important` | active |
| 67 | `.module-grid` | gap | `clamp(10px, 1.2vw, 14px) !important` | active |
| 68 | `.module-card .module-name` | font-size | `clamp(0.94rem, 2.2vw, 1.08rem) !important` | active |
| 69 | `.module-card .module-name` | line-height | `1.26 !important` | active |
| 70 | `.module-card .module-name` | font-weight | `700 !important` | active |

### Icon 样式相关

| # | Selector | Property | Value | Status |
|---|----------|----------|-------|--------|
| 71 | `html[data-ui-icon='line'] .module-card .module-icon` | background | `transparent !important` | active |
| 72 | `html[data-ui-icon='line'] .module-card .module-icon` | border | `none !important` | active |
| 73 | `html[data-ui-icon='line'] .module-card .module-icon` | box-shadow | `none !important` | active |
| 74 | `html[data-ui-icon='mono'] .module-card .module-icon, html[data-ui-icon='mono'] .module-card .module-icon svg` | color | `var(--ui-text) !important` | active |
| 75 | `html[data-ui-icon='mono'] .module-card .module-icon, html[data-ui-icon='mono'] .module-card .module-icon svg` | stroke | `currentColor !important` | active |


### 表单元素相关

| # | Selector | Property | Value | Status |
|---|----------|----------|-------|--------|
| 76 | `.app-shell :is(input, select, textarea)` | border-radius | `var(--ux-card-radius-sm) !important` | active |
| 77 | `.app-shell :is(input, select, textarea)` | border | `1px solid color-mix(...) !important` | active |
| 78 | `.app-shell :is(input, select, textarea)` | background | `rgba(255, 255, 255, 0.94) !important` | active |
| 79 | `.app-shell :is(input, select, textarea)` | color | `var(--ui-text) !important` | active |
| 80 | `.app-shell :is(input, select, textarea):focus` | border-color | `var(--ui-primary) !important` | active |
| 81 | `.app-shell :is(input, select, textarea):focus` | box-shadow | `0 0 0 3px color-mix(...) !important` | active |

### Pill 相关

| # | Selector | Property | Value | Status |
|---|----------|----------|-------|--------|
| 82 | `.kpi-pill, .meta-pill, .head-pill, .status-pill` | border-radius | `999px !important` | active |

### Button 相关

| # | Selector | Property | Value | Status |
|---|----------|----------|-------|--------|
| 83 | `:is(.back-btn, .header-btn, .tab-btn, .query-btn, .download-btn, .font-btn, .preview-btn, .btn, .action-btn)` | border-radius | `var(--ux-card-radius-sm) !important` | active |
| 84 | `:is(.back-btn, .header-btn, .tab-btn, .query-btn, .download-btn, .font-btn, .preview-btn, .btn, .action-btn)` | font-weight | `700 !important` | active |

### Bottom Tab Bar 相关

| # | Selector | Property | Value | Status |
|---|----------|----------|-------|--------|
| 85 | `.bottom-tab-bar` | top | `auto !important` | active |
| 86 | `.bottom-tab-bar` | inset-block-start | `auto !important` | active |
| 87 | `.bottom-tab-bar` | height | `auto !important` | active |
| 88 | `.bottom-tab-bar` | min-height | `70px !important` | active |
| 89 | `.bottom-tab-bar` | max-height | `106px !important` | active |
| 90 | `html[data-ui-nav='floating'] .bottom-tab-bar` | border-radius | `20px !important` | active |
| 91 | `html[data-ui-nav='floating'] .bottom-tab-bar` | border | `1px solid rgba(148, 163, 184, 0.3) !important` | active |
| 92 | `html[data-ui-nav='floating'] .bottom-tab-bar` | box-shadow | `0 16px 30px rgba(15, 23, 42, 0.18) !important` | active |
| 93 | `html[data-ui-nav='pill'] .bottom-tab-bar` | border-radius | `999px !important` | active |
| 94 | `html[data-ui-nav='pill'] .bottom-tab-bar` | padding-inline | `14px !important` | active |
| 95 | `html[data-ui-nav='pill'] .tab-item` | border-radius | `999px !important` | active |
| 96 | `html[data-ui-nav='compact'] .bottom-tab-bar` | width | `min(640px, calc(100% - 26px)) !important` | active |
| 97 | `html[data-ui-nav='compact'] .bottom-tab-bar` | padding | `8px 12px !important` | active |
| 98 | `html[data-ui-nav='compact'] .bottom-tab-bar` | bottom | `calc(10px + env(safe-area-inset-bottom)) !important` | active |
| 99 | `html[data-ui-nav='compact'] .tab-item` | gap | `2px !important` | active |
| 100 | `html[data-ui-nav='compact'] .tab-item` | padding | `6px 4px !important` | active |


### Graphite Night 暗色主题相关

| # | Selector | Property | Value | Status |
|---|----------|----------|-------|--------|
| 101 | `html[data-theme='graphite_night'] :is(input, select, textarea), html[data-theme='graphite_night'] :is(.bottom-tab-bar, .exit-dialog-card, .font-modal-card)` | background | `rgba(15, 23, 42, 0.82) !important` | active |
| 102 | (同上) | color | `#e2e8f0 !important` | active |
| 103 | `html[data-theme='graphite_night'] :is(.glass-card, .module-card, ..., .input-area)` | background | `linear-gradient(160deg, rgba(15, 23, 42, 0.86), rgba(30, 41, 59, 0.82)) !important` | active |
| 104 | (同上) | border-color | `color-mix(in oklab, var(--ui-primary) 28%, rgba(148, 163, 184, 0.28)) !important` | active |
| 105 | `html[data-theme='graphite_night'] .app-shell :is(.mode-panel, .status-panel, ..., .input-area)` | background | `linear-gradient(160deg, rgba(15, 23, 42, 0.84), rgba(30, 41, 59, 0.8)) !important` | active |
| 106 | (同上) | border-color | `color-mix(in oklab, var(--ui-primary) 26%, rgba(148, 163, 184, 0.28)) !important` | active |
| 107 | `html[data-theme='graphite_night'] .app-shell .dashboard .notice-panel .ticker-card` | background | `var(--ticker-card-bg, linear-gradient(135deg, #60a5fa, #3b82f6)) !important` | active |
| 108 | (同上) | color | `#ffffff !important` | active |
| 109 | `html[data-theme='graphite_night'] .app-shell .dashboard .notice-panel :is(.ticker-card-title, .ticker-card-sub)` | background | `transparent !important` | active |
| 110 | (同上) | background-image | `none !important` | active |
| 111 | (同上) | box-shadow | `none !important` | active |
| 112 | (同上) | color | `#ffffff !important` | active |
| 113 | (同上) | text-shadow | `none !important` | active |
| 114 | (同上) | filter | `none !important` | active |
| 115 | `html[data-theme='graphite_night'] .app-shell .schedule-view .courses-grid .day-column > .course-card` | background | `var(--course-bg, rgba(255, 255, 255, 0.92)) !important` | active |
| 116 | (同上) | color | `var(--course-text, #0f172a) !important` | active |
| 117 | (同上) | border-color | `var(--course-border, rgba(148, 163, 184, 0.55)) !important` | active |
| 118 | `html[data-theme='graphite_night'] .app-shell :is(.glass-card, .module-card, ..., .input-area)` | color | `#dbe6f7 !important` | active |
| 119 | `html[data-theme='graphite_night'] .app-shell :is(a, .link, [class*='link'])` | color | `#93c5fd !important` | active |
| 120 | `html[data-theme='graphite_night'] :is(.today-item-name, .module-name, .title, h1, h2, h3)` | color | `#e2e8f0 !important` | active |
| 121 | `html[data-theme='graphite_night'] .app-shell :is(...) :is(p, small, li, h4, h5, h6)` | color | `#dbe6f7 !important` | active |
| 122 | `html[data-theme='graphite_night'] .app-shell :is(...) :is(strong, b)` | color | `#f8fbff !important` | active |
| 123 | `html[data-theme='graphite_night'] .app-shell :is(input, select, textarea, option)` | color | `#e2e8f0 !important` | active |
| 124 | (同上) | background | `rgba(15, 23, 42, 0.82) !important` | active |
| 125 | (同上) | border-color | `rgba(148, 163, 184, 0.3) !important` | active |
| 126 | `html[data-theme='graphite_night'] .app-shell :is(.page-tag, .semester-tag, ..., .ios26-select-text)` | color | `#e7f0ff !important` | active |
| 127 | (同上) | border-color | `color-mix(in oklab, var(--ui-primary) 30%, rgba(148, 163, 184, 0.28)) !important` | active |
| 128 | `html[data-theme='graphite_night'] .app-shell :is(.page-tag, .semester-tag, ..., .ios26-select-trigger)` | background | `linear-gradient(160deg, rgba(15, 23, 42, 0.78), rgba(30, 41, 59, 0.74)) !important` | active |
| 129 | `html[data-theme='graphite_night'] .app-shell ::placeholder` | color | `#9fb0cb !important` | active |

### 响应式媒体查询相关

| # | Selector | Property | Value | Status |
|---|----------|----------|-------|--------|
| 130 | `@media (max-width: 640px) .module-grid` | gap | `8px !important` | active |
| 131 | `@media (max-width: 640px) :is(.view-header, .app-header, ...)` | grid-template-columns | `minmax(80px, auto) 1fr minmax(80px, auto) !important` | active |
| 132 | `@media (max-width: 640px) :is(.view-header, .app-header, ...)` | padding | `10px !important` | active |
| 133 | `@media (max-width: 640px) :is(.view-header, ...) > h1, :is(.view-header, ...) > .title` | font-size | `var(--ux-header-title-size-mobile) !important` | active |
| 134 | `@media (max-width: 640px) .module-card .module-name` | font-size | `clamp(12px, 3.2vw, 14px) !important` | active |

### Reduced Motion 相关

| # | Selector | Property | Value | Status |
|---|----------|----------|-------|--------|
| 135 | `@media (prefers-reduced-motion: reduce) :is(.glass-card, .module-card, .room-card, .settings-section, .book-card, .resource-card, .btn, .back-btn, .header-btn)` | transition | `none !important` | active |
| 136 | (同上) | animation | `none !important` | active |


## 迁移策略说明

### CSS Layer 隔离方案

所有上述 `!important` 声明将被包裹在 `@layer legacy` 中。根据 CSS 规范：

- `@layer legacy` 中的 `!important` 声明 **不会穿透** 到更高优先级的 `@layer tailwind` 层
- Tailwind 工具类无需使用 `!important` 即可覆盖遗留样式
- 层顺序声明：`@layer legacy, tailwind`

### 迁移优先级

1. **高优先级**（影响全局布局）：font-family、card border-radius/border/shadow、form elements
2. **中优先级**（影响特定组件）：back-btn、header、module-grid
3. **低优先级**（主题特定）：graphite_night 暗色主题覆盖（迁移到 Tailwind dark mode 后自动失效）
4. **保留不动**（功能性）：window-resizing 性能优化、prefers-reduced-motion 无障碍

### Status 字段说明

| Status | 含义 |
|--------|------|
| `active` | 当前生效，尚未迁移 |
| `overridden` | 已被 Tailwind @layer 覆盖，但遗留代码仍存在 |
| `removed` | 对应组件已完成迁移，该声明已从源码中移除 |
