# Requirements Document

## Introduction

本文档定义了 Mini-HBUT 项目前端样式系统改造的需求。目标是将现有的纯 CSS 变量 + 自定义 CSS 方案迁移到 Tailwind CSS + shadcn-vue 组件库，同时应用 DESIGN.md 中定义的 Apple 风格设计系统。改造采用渐进式策略，确保现有功能不受影响，新旧样式可以共存过渡。

## Glossary

- **Design_System**: 基于 DESIGN.md 定义的 Apple 风格设计语言，包含颜色、字体、圆角、间距、阴影等设计令牌（Design Tokens）
- **Tailwind_Config**: Tailwind CSS 的配置文件（tailwind.config.ts），用于定义项目的设计令牌映射
- **Shadcn_Component**: 基于 shadcn-vue 组件库提供的可定制化基础 UI 组件（Button、Card、Input、Dialog 等）
- **Migration_Bridge**: 迁移过渡层，允许旧 CSS 变量与新 Tailwind 工具类在同一组件中共存的兼容机制
- **Platform_Bridge**: 现有的 platform/ 目录下的跨平台桥接层，负责抹平 Tauri 和 Capacitor 的原生调用差异
- **View_Component**: src/components/ 目录下承担页面角色的顶级 Vue 组件（如 Dashboard.vue、GradeView.vue 等）
- **Base_Component**: shadcn-vue 提供的原子级 UI 组件（Button、Card、Input、Select、Dialog、Toast 等）
- **Composition_API**: Vue 3 的组合式 API，使用 `<script setup>` 语法
- **Design_Token**: 设计系统中的最小可复用单位（颜色值、字体大小、间距值等）
- **UI_PRESETS**: src/config/ui_settings.ts 中定义的主题预设集合，包含 campus_blue、graphite_night、forest_mint、sunset_orange、minimal_slate 等预设，每个预设包含 primary、secondary、background、text、muted 等颜色属性
- **Theme_Bridge**: 将 UI_PRESETS 中的主题颜色映射到 Tailwind CSS 变量的运行时桥接机制，通过动态修改 :root CSS 自定义属性实现主题切换
- **Important_Override_Strategy**: 处理遗留 CSS 中 !important 声明与 Tailwind 工具类优先级冲突的策略，通过 CSS Layer 隔离和选择性移除 !important 实现平滑过渡
- **Home_View**: 首页视图组件，展示用户信息、今日概览、常用工具网格和今日课程列表
- **Apple_Layout**: 遵循 DESIGN.md 定义的 Apple 风格布局规范，特征为 canvas-parchment 背景、白色卡片 + 18px 圆角 + 1px hairline 边框、无阴影、无装饰渐变

## Requirements

### Requirement 1: Tailwind CSS 集成

**User Story:** As a developer, I want Tailwind CSS integrated into the Vite build pipeline, so that I can use utility-first CSS classes across all components.

#### Acceptance Criteria

1. WHEN the project is built with Vite, THE Tailwind_Config SHALL process all files matching the content paths `./index.html` and `./src/**/*.{vue,js,ts,jsx,tsx}` and generate corresponding utility CSS
2. THE Tailwind_Config SHALL extend the default theme with the custom color, spacing, border-radius, typography, and shadow tokens defined in DESIGN.md, preserving the token names as Tailwind utility class suffixes (e.g., `text-primary`, `p-md`, `rounded-pill`)
3. WHEN a View_Component uses Tailwind utility classes, THE build system SHALL generate only the CSS classes actually used in the final bundle (tree-shaking unused utilities via Tailwind's content-based purge)
4. THE Tailwind_Config SHALL extend the default theme with the following color tokens: primary (#0066cc), primary-focus (#0071e3), primary-on-dark (#2997ff), ink (#1d1d1f), canvas (#ffffff), canvas-parchment (#f5f5f7), surface-pearl (#fafafc), surface-tile-1 (#272729), surface-tile-2 (#2a2a2c), surface-tile-3 (#252527), surface-black (#000000)
5. THE Tailwind_Config SHALL define custom spacing tokens matching the Design_System: xxs (4px), xs (8px), sm (12px), md (17px), lg (24px), xl (32px), xxl (48px), section (80px)
6. THE Tailwind_Config SHALL define custom border-radius tokens: none (0px), xs (5px), sm (8px), md (11px), lg (18px), pill (9999px), full (9999px)
7. THE Tailwind_Config SHALL define custom font-family tokens: `display` using the stack `"SF Pro Display", "system-ui", "-apple-system", "Inter", "sans-serif"` and `text` using the stack `"SF Pro Text", "system-ui", "-apple-system", "Inter", "sans-serif"`
8. WHEN the Vite build completes, THE Tailwind_Config SHALL produce a CSS output where unused utility classes are excluded, and the total generated CSS for Tailwind utilities does not exceed 50KB uncompressed for a typical component set

### Requirement 2: shadcn-vue 组件库集成

**User Story:** As a developer, I want shadcn-vue components available in the project, so that I can build UI with consistent, accessible, and customizable base components.

#### Acceptance Criteria

1. WHEN a developer imports a Shadcn_Component, THE build system SHALL resolve the component from the `@/components/ui` alias (mapping to `src/components/ui/` directory), and the import SHALL succeed without additional path configuration beyond the existing `components.json` and Vite alias setup
2. THE Shadcn_Component library SHALL include at minimum the following 13 components, each present as a dedicated file in `src/components/ui/`: Button, Card, Input, Select, Dialog, Toast (Sonner), Tabs, Badge, Avatar, Separator, ScrollArea, Sheet, DropdownMenu
3. THE Shadcn_Component theme SHALL be customized via CSS custom properties defined in `src/index.css` (`:root` scope), using HSL color values for `--primary`, `--secondary`, `--background`, `--foreground`, `--card`, `--border`, `--muted`, `--accent`, `--destructive` and a `--radius` token for border-radius, matching the project's Design_System color palette
4. WHEN a Shadcn_Component Button is rendered with variant "default", THE Button SHALL apply `bg-primary text-primary-foreground` classes, resolving background color from `--primary` and text color from `--primary-foreground` CSS variables; the border-radius SHALL be derived from the `--radius` token via Tailwind's `rounded-md` utility (computed as `calc(var(--radius) - 2px)`)
5. WHEN a Shadcn_Component Card is rendered, THE Card SHALL apply `rounded-xl` border-radius (computed as `calc(var(--radius) + 4px)`) and a `1px solid` border using the `--border` CSS variable color, with no hardcoded hex color values in the component source
6. THE Shadcn_Component library SHALL support both light mode and dark mode by toggling the `dark` class on the root HTML element (as configured in `tailwind.config.js` with `darkMode: ["class"]`), and all color tokens SHALL resolve to their respective light/dark values without requiring component-level conditional logic

### Requirement 3: 设计令牌映射层

**User Story:** As a developer, I want a single source of truth for design tokens, so that DESIGN.md specifications are consistently applied across Tailwind config and shadcn-vue theme.

#### Acceptance Criteria

1. THE Design_System SHALL define all design tokens in a single TypeScript configuration file using `as const` assertions and explicit type annotations, where no other file in the project defines or overrides token values
2. WHEN the Tailwind_Config is loaded, THE configuration SHALL import design tokens from the shared TypeScript configuration file and map them to the corresponding Tailwind theme extension keys (colors, fontSize, fontFamily, fontWeight, lineHeight, letterSpacing, spacing, borderRadius, boxShadow)
3. THE Design_Token file SHALL export typed readonly constants for: colors (as hex strings), typography (font-family as string arrays, font-size as rem values, font-weight as numeric values, line-height as unitless ratios, letter-spacing as em values), spacing (as rem values), border-radius (as rem or px values), and shadows (as CSS box-shadow strings)
4. WHEN a Design_Token value is updated in the shared configuration file, THE change SHALL propagate to both Tailwind utility classes and Shadcn_Component styles after a single build or dev-server reload, requiring no edits to any other file
5. THE Design_System SHALL expose design tokens as CSS custom properties (variables) on the `:root` element, so that Shadcn_Component styles consume token values through these CSS variables
6. IF the Design_Token file contains a value that does not conform to its declared TypeScript type, THEN THE build process SHALL fail with a type error indicating the invalid token name and expected format

### Requirement 4: 渐进式迁移兼容

**User Story:** As a developer, I want old CSS variables and new Tailwind classes to coexist, so that I can migrate components incrementally without breaking existing functionality.

#### Acceptance Criteria

1. WHILE the Migration_Bridge is active (both legacy CSS files and Tailwind CSS entry are imported in the application's main entry point), THE build system SHALL load the legacy CSS variables (style.css, ui_ux_pro_max.css) within a CSS layer named "legacy" and the Tailwind CSS output within a CSS layer named "tailwind", with the layer order declared as `@layer legacy, tailwind`
2. WHEN a View_Component uses legacy CSS variable classes (e.g., .glass-card, .btn, .back-btn), THE component SHALL render with computed style values (background, border-radius, padding, color, box-shadow) identical to those produced when only legacy CSS is loaded, with no visible layout shift or style difference
3. WHEN a View_Component is migrated to use Tailwind utility classes, THE component SHALL render correctly when the legacy CSS files (style.css, ui_ux_pro_max.css) are excluded from the build, verifying zero dependency on legacy CSS variables
4. IF a CSS specificity conflict occurs between legacy styles (in the "legacy" layer) and Tailwind utilities (in the "tailwind" layer) on the same element, THEN THE Migration_Bridge SHALL resolve the conflict in favor of Tailwind utilities, because the "tailwind" layer is declared after the "legacy" layer in the `@layer` order
5. WHEN all View_Components have been migrated to Tailwind utility classes, THE Migration_Bridge SHALL allow removal of the legacy CSS file imports and the `@layer legacy` declaration without causing any style regression in the application

### Requirement 5: 字体系统配置

**User Story:** As a developer, I want the Apple-style typography system configured, so that all text renders with the correct font family, size, weight, and letter-spacing.

#### Acceptance Criteria

1. THE Tailwind_Config SHALL define custom font-size utilities that match the Design_System typography scale: hero-display (56px), display-lg (40px), display-md (34px), lead (28px), lead-airy (24px), tagline (21px), body-strong (17px), body (17px), caption (14px), button-large (18px), fine-print (12px), nav-link (12px)
2. WHEN text uses the body font-size utility, THE rendered text SHALL display at 17px with font-weight 400, line-height 1.47, and letter-spacing -0.374px
3. WHEN text uses the hero-display font-size utility, THE rendered text SHALL display at 56px with font-weight 600, line-height 1.07, and letter-spacing -0.28px
4. THE font-family stack SHALL resolve to SF Pro on Apple platforms (via system-ui, -apple-system) and fall back to Inter on non-Apple platforms
5. THE Tailwind_Config SHALL define custom letter-spacing utilities for negative tracking values: tight-sm (-0.12px), tight-md (-0.224px), tight-lg (-0.374px), tight-display (-0.28px)

### Requirement 6: 组件迁移模板与规范

**User Story:** As a developer, I want a documented migration pattern, so that I can consistently convert existing components from legacy CSS to Tailwind + shadcn-vue.

#### Acceptance Criteria

1. THE project SHALL provide a migration guide document that defines at least 5 sequential steps for converting a View_Component from legacy CSS to Tailwind + shadcn-vue, covering: dependency setup, class replacement, component substitution, style cleanup, and verification
2. THE migration guide SHALL include a mapping table covering at least 10 legacy CSS classes (including .glass-card, .btn, .back-btn) to equivalent Tailwind utility class combinations that produce the same visual layout and spacing
3. THE migration guide SHALL include at least one fully migrated reference component as a template, where "fully migrated" means the component contains zero legacy CSS class references and all styling is expressed through Tailwind utility classes or shadcn-vue component props
4. WHEN a View_Component is migrated, THE component SHALL replace custom HTML elements with corresponding Shadcn_Component primitives (Button, Card, Input) wherever a semantically equivalent shadcn-vue component exists, while retaining plain HTML with Tailwind classes for elements that have no shadcn-vue counterpart
5. WHEN a View_Component is migrated, THE component SHALL maintain the same user-facing behavior as the pre-migration version: all event handlers produce the same outcomes, all data bindings render the same content, and all existing unit/integration tests pass without modification (visual appearance may differ in minor styling details such as border-radius or shadow intensity but layout structure and spacing must remain consistent)
6. WHEN a View_Component migration is completed, THE migrated component SHALL pass a verification checklist confirming: zero remaining legacy CSS class usages, no removed or broken event handlers, and successful rendering without console errors

### Requirement 7: 跨平台兼容性保持

**User Story:** As a developer, I want the new styling system to work across Tauri desktop and Capacitor mobile, so that the app renders consistently on all target platforms.

#### Acceptance Criteria

1. WHEN the application is built for Tauri 2 desktop, THE Tailwind CSS output SHALL render without layout breakage or missing styles in the Tauri WebView (WebView2 on Windows, WebKit on macOS), targeting the es2020 baseline defined in vite.config.ts
2. WHEN the application is built for Capacitor 6 mobile (Android/iOS), THE Tailwind CSS output SHALL render without layout breakage or missing styles in Android WebView (Chrome 90+) and iOS WKWebView (Safari 15+)
3. THE Platform_Bridge layer (platform/ directory) SHALL remain unchanged during the frontend migration — no modifications to its public API, file structure, or internal logic
4. WHEN Tailwind CSS uses viewport-relative units (vh, vw, dvh), THE layout SHALL apply CSS environment variables (env(safe-area-inset-top), env(safe-area-inset-bottom), env(safe-area-inset-left), env(safe-area-inset-right)) to prevent content from being obscured by the status bar, notch, or navigation bar on mobile platforms
5. THE Tailwind_Config SHALL include responsive breakpoints for desktop (max-width: 1200px) and mobile (320px-428px) viewports, with at minimum a mobile breakpoint at 320px, a tablet breakpoint at 768px, and a desktop breakpoint at 1200px
6. IF a Shadcn_Component uses CSS features unsupported by the minimum target WebView engines (WebView2 for Windows, Safari 15+ for macOS/iOS, Chrome 90+ for Android), THEN THE build system SHALL include a PostCSS fallback or polyfill that produces equivalent visual output in the target engine
7. IF a target WebView does not support CSS env() variables, THEN THE layout SHALL fall back to a default safe-area padding of 0px without causing layout shifts or content overflow

### Requirement 8: 暗色模式支持

**User Story:** As a developer, I want dark mode support built into the design token system, so that the app can switch between light and dark themes using the Design_System's defined surface colors.

#### Acceptance Criteria

1. THE Tailwind_Config SHALL support a dark mode strategy using CSS class-based toggling (class="dark" on root element)
2. WHILE dark mode is active, THE surface colors SHALL apply the Design_System dark palette: surface-tile-1 (#272729), surface-tile-2 (#2a2a2c), surface-tile-3 (#252527)
3. WHILE dark mode is active, THE text colors SHALL apply on-dark (#ffffff) for primary text and body-muted (#cccccc) for secondary text
4. WHILE dark mode is active, THE primary action color SHALL apply primary-on-dark (#2997ff), maintaining a minimum contrast ratio of 4.5:1 against dark surface backgrounds per WCAG AA
5. THE dark mode toggle SHALL persist user preference via the existing Pinia state management store, and the preference SHALL survive page reloads and new sessions
6. WHEN the app loads and no user preference is stored, THE Tailwind_Config SHALL default to light mode unless the user's operating system reports prefers-color-scheme: dark, in which case dark mode SHALL be applied
7. WHEN the user activates the dark mode toggle, THE Tailwind_Config SHALL apply the theme switch within 100ms with no full-page reload

### Requirement 9: 构建产物优化

**User Story:** As a developer, I want the Tailwind CSS build output to be optimized, so that the final bundle size remains small and does not regress from the current CSS size.

#### Acceptance Criteria

1. WHEN the project is built for production, THE Tailwind CSS output SHALL be purged of unused utility classes by scanning all files matching the configured content paths (index.html and src/**/*.{vue,js,ts,jsx,tsx})
2. WHILE both legacy CSS and Tailwind CSS coexist in the project, THE final CSS bundle size (uncompressed, sum of all .css assets) SHALL not exceed 150% of the pre-migration CSS bundle size baseline recorded before Tailwind integration begins
3. WHEN all components are fully migrated (no legacy CSS files remain in the source tree), THE final CSS bundle size (uncompressed) SHALL be smaller than or equal to the pre-migration CSS bundle size baseline
4. THE Vite build configuration SHALL maintain the existing manual chunk splitting strategy, preserving at minimum the runtime-bridge and vue-core chunks as defined in vite.config.ts
5. WHEN a single-file change triggers a Tailwind CSS incremental recompilation during development, THE build system SHALL complete the CSS hot-reload update within 5 seconds
6. WHEN the migration begins, THE team SHALL record the current total CSS bundle size (uncompressed sum of all production .css assets in bytes) as the baseline reference for criteria 2 and 3

### Requirement 10: 无障碍访问基线

**User Story:** As a developer, I want the migrated components to maintain accessibility standards, so that all users can interact with the application regardless of ability.

#### Acceptance Criteria

1. WHEN a Shadcn_Component is rendered in the DOM, THE component SHALL preserve all default ARIA attributes provided by the shadcn-vue library (Radix Vue primitives) without removal or override, unless explicitly replaced with an equally or more descriptive ARIA attribute
2. THE color contrast ratio between text and background SHALL meet WCAG 2.1 AA standards (minimum 4.5:1 for normal text below 18pt/14pt-bold, minimum 3:1 for large text at or above 18pt/14pt-bold) for all Design_System color pairings used in the application
3. WHEN a user navigates via keyboard using Tab, Shift+Tab, Arrow keys, Enter, or Space, THE focus indicator SHALL be visible on the currently focused interactive element using the primary-focus color (#0071e3) with a 2px solid outline and a minimum 2px offset from the element edge, ensuring a contrast ratio of at least 3:1 against adjacent background colors
4. THE Tailwind_Config SHALL include a focus-visible ring utility class that applies the Design_System focus style (2px solid #0071e3 outline with 2px offset) to all interactive elements including buttons, links, form inputs, selects, checkboxes, radio buttons, and custom Shadcn_Component triggers
5. WHEN a user navigates via keyboard, THE application SHALL maintain a logical tab order following the visual reading order (left-to-right, top-to-bottom), and all interactive elements reachable by pointer SHALL also be reachable and operable via keyboard alone

### Requirement 11: !important 覆盖策略

**User Story:** As a developer, I want a clear strategy to handle legacy CSS `!important` declarations, so that Tailwind utility classes can override legacy styles during and after migration without specificity conflicts.

#### Acceptance Criteria

1. THE Important_Override_Strategy SHALL identify and catalog all `!important` declarations in legacy CSS files (style.css, ui_ux_pro_max.css) into a migration checklist, recording the selector name, property, and current value for each occurrence
2. WHEN the Migration_Bridge is active, THE Important_Override_Strategy SHALL wrap all legacy CSS containing `!important` declarations within a `@layer legacy` block, ensuring that Tailwind utilities in the higher-priority `@layer tailwind` layer can override legacy styles regardless of `!important` usage in the legacy layer
3. WHEN a View_Component is migrated to Tailwind utility classes, THE migrated component SHALL NOT use Tailwind's `!important` modifier (the `!` prefix on utility classes) except as a documented temporary measure during active migration of that specific component, and all temporary `!important` usages SHALL be tracked in the migration checklist for later removal
4. THE Important_Override_Strategy SHALL provide a Tailwind plugin or PostCSS configuration that applies `@layer` isolation to legacy CSS imports, so that legacy `!important` declarations (such as `.back-btn { background: var(--ui-back-btn-bg) !important }` and `font-family: var(--ui-font-family) !important`) do not prevent Tailwind utilities from taking effect on the same elements
5. WHEN a legacy CSS class using `!important` (e.g., `.back-btn`, global `font-family !important`) is replaced by Tailwind utility classes on a migrated component, THE migrated component SHALL render with the Tailwind-specified values without requiring `!important` on the Tailwind side, verified by computed style inspection showing the Tailwind value takes precedence
6. WHEN all View_Components referencing a specific legacy `!important` selector have been migrated, THE Important_Override_Strategy SHALL allow removal of that legacy selector from the CSS source without causing style regressions in any remaining unmigrated components
7. IF a legacy `!important` declaration cannot be overridden via `@layer` isolation alone (due to inline styles or third-party library constraints), THEN THE Important_Override_Strategy SHALL document the specific case and provide an explicit override rule in a dedicated `src/styles/overrides.css` file with a comment explaining the reason

### Requirement 12: 主题色动态对接 UI_PRESETS

**User Story:** As a user, I want the Tailwind/shadcn-vue theme colors to dynamically reflect my selected theme preset, so that switching themes in settings immediately updates the entire application's visual appearance.

#### Acceptance Criteria

1. THE Theme_Bridge SHALL map each UI_PRESETS entry (campus_blue, graphite_night, forest_mint, sunset_orange, minimal_slate) to a set of CSS custom properties consumed by Tailwind and Shadcn_Component styles, including at minimum: `--primary`, `--secondary`, `--background`, `--foreground`, `--muted`, `--card`, `--border`, `--accent`
2. WHEN the user selects a different theme preset in the settings interface, THE Theme_Bridge SHALL update all mapped CSS custom properties on the `:root` element within 100ms, causing all Tailwind utility classes and Shadcn_Component styles referencing these variables to reflect the new theme colors without a page reload
3. THE Theme_Bridge SHALL inject theme colors exclusively through CSS custom properties at runtime (via JavaScript modifying `document.documentElement.style` or toggling a data attribute), and SHALL NOT require Tailwind CSS recompilation or build-time configuration changes to switch themes
4. THE Theme_Bridge SHALL transform each UI_PRESETS color palette to conform to the Design_System's Apple aesthetic before injection: primary color SHALL be mapped to a single blue accent (#0066cc for light themes, #2997ff for dark themes), background SHALL be a flat solid color (canvas #ffffff or canvas-parchment #f5f5f7 for light themes, surface-tile-1 #272729 for dark themes) with no gradient values, and surface colors SHALL use white (#ffffff) for cards with 1px hairline border (#e0e0e0)
5. WHEN the graphite_night preset is selected, THE Theme_Bridge SHALL apply the Design_System dark mode palette (primary-on-dark #2997ff, surface-tile-1 #272729 background, on-dark #ffffff text) and add the `dark` class to the root HTML element; WHEN a light-category preset is selected, THE Theme_Bridge SHALL remove the `dark` class and apply the light palette
6. THE Theme_Bridge SHALL persist the selected theme preset identifier in the existing Pinia state management store, and WHEN the application loads, THE Theme_Bridge SHALL read the persisted preset and apply the corresponding CSS custom properties before the first meaningful paint
7. THE Tailwind_Config SHALL define all theme-dependent color utilities (bg-primary, text-primary, border-primary, bg-background, text-foreground, bg-card, text-muted, border-border) using `var()` references to CSS custom properties rather than hardcoded hex values, enabling runtime theme switching without CSS regeneration
8. WHEN a new UI_PRESETS entry is added to `src/config/ui_settings.ts`, THE Theme_Bridge SHALL support the new preset without requiring changes to the Tailwind_Config or Shadcn_Component theme files, provided the new preset follows the existing UiPreset type interface

### Requirement 13: 首页 Apple 风格布局改造

**User Story:** As a user, I want the home page redesigned with a clean Apple-style layout, so that I can quickly access key information and tools in a visually calm, well-organized interface.

#### Acceptance Criteria

1. THE Home_View SHALL render a top header section containing the application title "HBUT 校园助手" in the Design_System tagline typography (21px, weight 600) and a "首页" tab indicator using the primary color (#0066cc), with no decorative gradients or background imagery in the header area
2. THE Home_View SHALL render a user information card displaying: the student ID (with middle digits masked as asterisks for privacy), the school name "湖北工业大学", and three action buttons (配置, 同步, 退出) styled as pill-shaped secondary buttons using the Design_System button-secondary-pill component specification
3. THE Home_View SHALL render a "今日概览" card containing: a time-based greeting message (早上好/下午好/晚上好), a campus illustration image, today's total course count as a numeric badge, and the next upcoming course information including course name, time, location, and an "进行中" status indicator when applicable
4. THE Home_View SHALL render a tools grid section with a 2-row × 4-column layout containing 8 tool entries (成绩查询, 考试安排, 空教室, 课表, 校园码, 校历, 图书馆, 更多), where each entry displays a monochrome icon (using ink color #1d1d1f or primary color #0066cc) and a label in caption typography (14px), with no colored icon backgrounds or gradient decorations
5. THE Home_View SHALL render a "今日课程" section displaying either a list of today's courses (each showing course name, time period, and location) or a "今日课程已结束" placeholder message when no remaining courses exist for the current day
6. THE Home_View SHALL render a bottom navigation bar with 4 tabs (首页, 课表, 通知, 我的), where the active tab displays its icon and label in primary color (#0066cc) and inactive tabs display in ink-muted-48 color (#7a7a7a)
7. THE Home_View background SHALL use the canvas-parchment color (#f5f5f7) as a flat solid background with no gradients, no glass-morphism effects, and no decorative mesh or radial-gradient overlays
8. WHEN a card is rendered in the Home_View, THE card SHALL apply: white (#ffffff) background, 18px border-radius (rounded-lg token), 1px solid hairline border (#e0e0e0), 24px internal padding (spacing-lg token), and zero box-shadow — matching the Design_System store-utility-card specification
9. THE Home_View SHALL use the Design_System spacing tokens consistently: 24px (lg) for card internal padding, 12px (sm) for spacing between elements within a card, 17px (md) for spacing between cards in the vertical stack, and 12px (sm) for grid gaps between tool entries
10. THE Home_View SHALL use the Design_System typography consistently: 21px weight-600 for section titles (tagline token), 17px weight-400 for body text (body token), 14px weight-400 for captions and tool labels (caption token), and the font-family stack SHALL resolve to SF Pro on Apple platforms with Inter as the fallback on other platforms
11. THE Home_View SHALL NOT use any of the following legacy visual treatments: glass-morphism (backdrop-filter blur on cards), multi-color gradient backgrounds, colored icon backgrounds with rounded squares, box-shadow on cards, or decorative radial-gradient overlays
