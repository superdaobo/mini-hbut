# Implementation Plan: Frontend Vue3 + Tailwind CSS + shadcn-vue Migration

## Overview

将 Mini-HBUT 项目前端样式系统从纯 CSS 变量 + 自定义 CSS 方案迁移到 Tailwind CSS + shadcn-vue 组件库。采用渐进式策略，通过 CSS Layer 隔离实现新旧样式共存，引入 Apple 风格设计系统作为统一设计令牌源。实现语言为 TypeScript + Vue 3 (Composition API)。

## Tasks

- [x] 1. 基础设施搭建：Tailwind CSS + PostCSS + shadcn-vue 集成
  - [x] 1.1 安装 Tailwind CSS、PostCSS、Autoprefixer 依赖并创建 postcss.config.ts 配置文件
    - 安装 `tailwindcss`, `postcss`, `autoprefixer` 为 devDependencies
    - 创建 `postcss.config.ts`，配置 tailwindcss 和 autoprefixer 插件
    - _Requirements: 1.1, 1.3_

  - [x] 1.2 创建设计令牌文件 `src/config/design-tokens.ts`
    - 定义 `colors`, `fontFamily`, `fontSize`, `spacing`, `borderRadius`, `letterSpacing`, `boxShadow` 常量，使用 `as const` 断言
    - 导出类型 `DesignColors`, `DesignSpacing`, `DesignBorderRadius`, `DesignFontSize`
    - 所有值严格来自 DESIGN.md 规范
    - _Requirements: 3.1, 3.3, 3.6_

  - [x] 1.3 创建 `tailwind.config.ts` 配置文件
    - 从 `src/config/design-tokens.ts` 导入令牌并映射到 Tailwind theme.extend
    - 配置 `darkMode: ["class"]`
    - 配置 content 路径为 `./index.html` 和 `./src/**/*.{vue,js,ts,jsx,tsx}`
    - 定义动态主题色使用 `hsl(var(--xxx) / <alpha-value>)` 格式
    - 配置响应式断点：mobile (320px), tablet (768px), desktop (1200px)
    - 配置 focus-visible ring 工具类使用 primary-focus (#0071e3)
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 5.1, 5.5, 7.5, 8.1, 10.4, 12.7_

  - [x] 1.4 创建 CSS 入口文件 `src/index.css` 并配置 CSS Layer 隔离
    - 声明 `@layer legacy, tailwind` 层顺序
    - 在 `@layer legacy` 中导入 `style.css` 和 `ui_ux_pro_max.css`
    - 在 `@layer tailwind` 中引入 `@tailwind base`, `@tailwind components`, `@tailwind utilities`
    - 在 `@layer base` 中定义 shadcn-vue 主题 CSS 自定义属性（:root 和 .dark）
    - _Requirements: 4.1, 4.4, 11.2, 11.4_

  - [x] 1.5 修改 `src/main.ts` 入口文件的 CSS 导入顺序
    - 将 CSS 导入替换为新的 `index.css` 入口
    - 确保遗留 CSS 和 Tailwind CSS 均被正确加载
    - _Requirements: 4.1, 4.2_

  - [x] 1.6 安装并配置 shadcn-vue：创建 `components.json` 配置文件
    - 安装 `radix-vue`, `class-variance-authority`, `clsx`, `tailwind-merge` 依赖
    - 创建 `components.json` 配置 shadcn-vue CLI
    - 配置 `@/components/ui` 别名路径
    - _Requirements: 2.1_

  - [x] 1.7 添加 shadcn-vue 基础组件到 `src/components/ui/` 目录
    - 添加 13 个必需组件：Button, Card, Input, Select, Dialog, Toast (Sonner), Tabs, Badge, Avatar, Separator, ScrollArea, Sheet, DropdownMenu
    - 每个组件作为独立子目录存在
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 2. Checkpoint - 确保基础设施搭建完成
  - Ensure all tests pass, ask the user if questions arise.
  - 验证 `npm run build` 成功，Tailwind CSS 正确生成
  - 验证 shadcn-vue 组件可正常导入和渲染

- [x] 3. 主题桥接与暗色模式实现
  - [x] 3.1 创建 `src/utils/theme-bridge.ts` 主题桥接模块
    - 实现 `hexToHsl(hex: string): string` 颜色转换函数
    - 实现 `transformPresetToAppleDesign(preset: UiPreset): Record<string, string>` 转换函数
    - 实现 `applyThemePreset(presetKey: string): void` 应用主题函数
    - 实现 `initThemeBridge(): void` 初始化函数（读取 Pinia 持久化偏好，首次绘制前注入 CSS 变量）
    - 管理 `dark` class 的添加/移除逻辑
    - 处理 OS `prefers-color-scheme` 检测作为默认值
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 8.1, 8.5, 8.6, 8.7_

  - [ ]* 3.2 编写 Property Test: CSS Layer Override 保证 Tailwind 优先级
    - **Property 1: CSS Layer Override Guarantees Tailwind Priority**
    - **Validates: Requirements 4.4, 11.5**
    - 使用 fast-check 生成任意 CSS 属性名和值对，验证 @layer tailwind 层的样式始终覆盖 @layer legacy 层的 !important 样式

  - [ ]* 3.3 编写 Property Test: WCAG AA 对比度验证
    - **Property 2: WCAG AA Contrast Ratio for Design System Color Pairings**
    - **Validates: Requirements 10.2, 8.4**
    - 使用 fast-check 对所有 Design_System 文字/背景颜色配对计算对比度，验证满足 WCAG 2.1 AA 标准

  - [ ]* 3.4 编写 Property Test: Theme Bridge 映射完整性
    - **Property 3: Theme Bridge Mapping Completeness**
    - **Validates: Requirements 12.1, 12.8**
    - 使用 fast-check 生成任意符合 UiPreset 接口的对象，验证 transformPresetToAppleDesign 返回所有必需 CSS 变量键且值为有效 HSL 格式

  - [ ]* 3.5 编写 Property Test: 主题切换更新所有变量
    - **Property 4: Theme Preset Switch Updates All Variables**
    - **Validates: Requirements 12.2**
    - 使用 fast-check 生成任意两个不同的 preset key，验证切换后所有 CSS 变量均反映新 preset 的值

  - [ ]* 3.6 编写 Property Test: Apple 美学转换规则
    - **Property 5: Apple Aesthetic Transformation Rules**
    - **Validates: Requirements 12.4, 12.5**
    - 使用 fast-check 验证 light/vivid/neutral 类别 preset 的 --primary 为 #0066cc 的 HSL 等价值，dark 类别为 #2997ff 的 HSL 等价值，且 --background 不含渐变关键词

  - [x] 3.7 在应用入口集成 Theme Bridge 初始化
    - 在 `src/main.ts` 中调用 `initThemeBridge()` 确保首次绘制前完成主题应用
    - 连接 Pinia store 的主题偏好持久化
    - _Requirements: 12.6, 8.5, 8.6_

- [x] 4. Checkpoint - 确保主题系统正常工作
  - Ensure all tests pass, ask the user if questions arise.
  - 验证主题切换在 100ms 内完成，无页面重载
  - 验证暗色模式正确应用 dark palette

- [x] 5. !important 覆盖策略与迁移工具
  - [x] 5.1 创建 !important 声明清单文档
    - 扫描 `style.css` 和 `ui_ux_pro_max.css` 中所有 !important 声明
    - 记录选择器名、属性、当前值到迁移清单
    - _Requirements: 11.1_

  - [x] 5.2 创建 `src/styles/overrides.css` 特殊覆盖文件
    - 处理无法通过 @layer 隔离解决的特殊情况（inline styles 或第三方库约束）
    - 每条规则附带注释说明原因
    - _Requirements: 11.7_

  - [x] 5.3 创建迁移指南文档
    - 定义 5 步迁移流程：依赖设置 → class 替换 → 组件替换 → 样式清理 → 验证
    - 包含至少 10 个遗留 CSS class 到 Tailwind 工具类的映射表（含 .glass-card, .btn, .back-btn）
    - _Requirements: 6.1, 6.2_

- [x] 6. 首页 (Dashboard.vue) Apple 风格改造
  - [x] 6.1 改造 Dashboard.vue 页面骨架和背景
    - 替换渐变背景为 `bg-canvas-parchment` 纯色
    - 应用通用页面骨架结构（Header 52px + Content Area + Bottom Tab Bar）
    - 移除所有 glass-morphism、渐变装饰、彩色图标背景
    - _Requirements: 13.7, 13.11_

  - [x] 6.2 实现首页 Header 和用户信息卡片
    - Header: "HBUT 校园助手" tagline (21px/600) + "首页" primary 指示器
    - 用户卡片: 学号（中间位掩码）+ "湖北工业大学" + 三个 pill 按钮（配置/同步/退出）
    - 卡片样式: `bg-white rounded-lg border border-hairline p-lg shadow-none`
    - _Requirements: 13.1, 13.2, 13.8_

  - [x] 6.3 实现首页"今日概览"卡片
    - 时间问候语（早上好/下午好/晚上好）
    - 校园插图、今日课程数 badge、下节课信息（课程名/时间/地点/进行中状态）
    - _Requirements: 13.3, 13.8, 13.9_

  - [x] 6.4 实现首页工具网格（2×4 布局）
    - 8 个工具入口：成绩查询, 考试安排, 空教室, 课表, 校园码, 校历, 图书馆, 更多
    - 单色图标 (ink #1d1d1f 或 primary #0066cc) + caption 标签 (14px)
    - Grid gap: spacing-sm (12px)
    - _Requirements: 13.4, 13.9_

  - [x] 6.5 实现首页"今日课程"列表和底部导航栏
    - 课程列表：课程名 + 时间段 + 地点，或"今日课程已结束"占位
    - 底部导航：4 tabs（首页/课表/通知/我的），active=primary, inactive=ink-muted-48
    - _Requirements: 13.5, 13.6_

  - [ ]* 6.6 编写首页组件单元测试
    - 验证卡片样式符合 store-utility-card 规范
    - 验证工具网格渲染 8 个入口
    - 验证底部导航 active/inactive 状态
    - _Requirements: 13.1-13.11_

- [x] 7. Checkpoint - 确保首页改造完成
  - Ensure all tests pass, ask the user if questions arise.
  - 验证首页在亮色/暗色模式下均正确渲染
  - 验证无遗留 glass-morphism 或渐变效果

- [x] 8. 迁移参考模板与验证
  - [x] 8.1 创建一个完整迁移参考组件模板
    - 选择一个中等复杂度的 View_Component 作为模板
    - 确保零遗留 CSS class 引用，所有样式通过 Tailwind 工具类或 shadcn-vue 组件 props 表达
    - 替换自定义 HTML 为对应 shadcn-vue 组件（Button, Card, Input 等）
    - _Requirements: 6.3, 6.4, 6.5_

  - [x] 8.2 验证迁移组件的行为一致性
    - 确保所有事件处理器产生相同结果
    - 确保所有数据绑定渲染相同内容
    - 确保无 console 错误
    - _Requirements: 6.5, 6.6_

- [x] 9. 跨平台兼容性与构建优化
  - [x] 9.1 配置 Vite 构建确保跨平台兼容
    - 验证 es2020 baseline 目标配置
    - 添加 CSS env() safe-area-inset 支持和 @supports 降级
    - 确保 Vite manual chunk splitting 策略保持不变（runtime-bridge, vue-core）
    - _Requirements: 7.1, 7.2, 7.4, 7.6, 7.7, 9.4_

  - [x] 9.2 记录 CSS bundle size 基线并配置 purge 验证
    - 记录当前 CSS bundle size 作为基线
    - 验证 Tailwind purge 正确排除未使用的工具类
    - 确保迁移期间 CSS bundle 不超过基线 150%
    - _Requirements: 9.1, 9.2, 9.6_

  - [ ]* 9.3 编写构建产物集成测试
    - 验证 CSS bundle size 回归
    - 验证 @layer legacy, tailwind 声明存在
    - 验证 chunk 分割策略未被破坏
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 10. 无障碍访问与最终验证
  - [x] 10.1 验证 shadcn-vue 组件 ARIA 属性保留
    - 确保所有 shadcn-vue 组件保留默认 ARIA 属性
    - 验证键盘导航（Tab, Shift+Tab, Arrow, Enter, Space）焦点指示器可见
    - 验证 tab 顺序遵循视觉阅读顺序
    - _Requirements: 10.1, 10.3, 10.5_

  - [x] 10.2 验证 Platform Bridge 层未被修改
    - 确认 `src/platform/` 目录下无文件被修改
    - 确认 Platform_Bridge 公共 API、文件结构和内部逻辑保持不变
    - _Requirements: 7.3_

  - [ ]* 10.3 编写无障碍访问单元测试
    - 验证 focus-visible ring 样式正确应用
    - 验证颜色对比度满足 WCAG AA
    - _Requirements: 10.2, 10.3, 10.4_

- [x] 11. Final Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.
  - 验证完整构建流程无错误
  - 验证主题切换、暗色模式、跨平台兼容性均正常

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties defined in the design document
- Unit tests validate specific examples and edge cases
- 本实现计划仅覆盖基础设施搭建和首页改造，其余页面（GradeView, ScheduleView 等）的改造将在后续迭代中按相同模式进行
- Platform Bridge 层（src/platform/）在整个迁移过程中不得修改
- 迁移期间新旧样式通过 CSS Layer 共存，确保现有功能不受影响

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.6"] },
    { "id": 2, "tasks": ["1.4", "1.7"] },
    { "id": 3, "tasks": ["1.5"] },
    { "id": 4, "tasks": ["3.1", "5.1"] },
    { "id": 5, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "5.2", "5.3"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2", "6.3", "6.4"] },
    { "id": 8, "tasks": ["6.5", "6.6"] },
    { "id": 9, "tasks": ["8.1", "9.1", "9.2"] },
    { "id": 10, "tasks": ["8.2", "9.3", "10.1", "10.2"] },
    { "id": 11, "tasks": ["10.3"] }
  ]
}
```
