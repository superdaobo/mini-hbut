# 组件迁移指南

> 本文档定义了将 Mini-HBUT 项目中的 View 组件从遗留 CSS 样式迁移到 Tailwind CSS + shadcn-vue 的标准流程。

## 目录

- [迁移流程（5 步）](#迁移流程5-步)
- [CSS Class 映射表](#css-class-映射表)
- [验证清单](#验证清单)
- [注意事项](#注意事项)

---

## 迁移流程（5 步）

### 第 1 步：依赖设置（Dependency Setup）

确认项目基础设施已就绪，无需重复安装：

1. **确认 Tailwind CSS 已配置**
   - `tailwind.config.ts` 存在且从 `src/config/design-tokens.ts` 导入设计令牌
   - `postcss.config.js` 已配置 `tailwindcss` 和 `autoprefixer` 插件
   - `src/index.css` 已声明 `@layer legacy, tailwind` 层顺序

2. **确认 shadcn-vue 组件可用**
   - `src/components/ui/` 目录下包含所需组件（Button, Card, Input 等）
   - `components.json` 配置正确，`@/components/ui` 别名可解析

3. **确认设计令牌源**
   - `src/config/design-tokens.ts` 包含所有颜色、字体、间距、圆角令牌
   - Tailwind 配置已正确映射这些令牌为工具类

> 💡 如果以上均已就绪，直接进入第 2 步。

---

### 第 2 步：Class 替换（Class Replacement）

将组件模板中的遗留 CSS class 替换为等效的 Tailwind 工具类：

1. **识别遗留 class**
   - 在组件 `<template>` 中搜索遗留 class（如 `.glass-card`, `.btn`, `.back-btn` 等）
   - 参考下方 [CSS Class 映射表](#css-class-映射表) 找到对应的 Tailwind 工具类组合

2. **逐一替换**
   - 将 `class="glass-card"` 替换为 `class="bg-white rounded-lg border border-hairline p-lg shadow-none"`
   - 将 `class="btn"` 替换为 `class="bg-primary text-on-primary rounded-pill px-[22px] py-[11px] text-body"`
   - 保持元素结构不变，仅替换 class 属性值

3. **处理组合 class**
   - 如果一个元素同时使用多个遗留 class，逐个替换并合并 Tailwind 类
   - 使用 `tailwind-merge` 处理可能的类冲突

4. **移除 scoped style 中的对应规则**
   - 如果组件 `<style scoped>` 中定义了被替换 class 的样式规则，一并移除

---

### 第 3 步：组件替换（Component Substitution）

将自定义 HTML 结构替换为语义等价的 shadcn-vue 组件：

1. **按钮替换**
   ```vue
   <!-- 遗留写法 -->
   <button class="btn">确认</button>
   
   <!-- 迁移后 -->
   <Button variant="default">确认</Button>
   ```

2. **卡片替换**
   ```vue
   <!-- 遗留写法 -->
   <div class="glass-card">
     <h3>标题</h3>
     <p>内容</p>
   </div>
   
   <!-- 迁移后 -->
   <Card class="shadow-none">
     <CardHeader>
       <CardTitle>标题</CardTitle>
     </CardHeader>
     <CardContent>
       <p>内容</p>
     </CardContent>
   </Card>
   ```

3. **输入框替换**
   ```vue
   <!-- 遗留写法 -->
   <input class="search-input" type="text" />
   
   <!-- 迁移后 -->
   <Input class="rounded-pill h-[44px]" type="text" />
   ```

4. **无 shadcn-vue 对应的元素**
   - 对于没有语义等价 shadcn-vue 组件的元素（如自定义网格、特殊布局），保留原生 HTML 并使用 Tailwind 工具类

5. **导入声明**
   ```typescript
   import { Button } from '@/components/ui/button'
   import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
   import { Input } from '@/components/ui/input'
   ```

---

### 第 4 步：样式清理（Style Cleanup）

确保组件完全脱离遗留 CSS 依赖：

1. **移除遗留 class 引用**
   - 全局搜索组件文件，确认零遗留 CSS class 残留
   - 检查动态 class 绑定（`:class="{ 'glass-card': condition }"` 等）

2. **移除 `<style>` 中的遗留规则**
   - 删除 `<style scoped>` 中引用遗留 CSS 变量（如 `var(--ui-xxx)`）的规则
   - 删除不再需要的 `@import` 语句

3. **验证无遗留依赖**
   - 临时注释掉 `src/index.css` 中 `@layer legacy` 的导入
   - 确认组件在无遗留 CSS 的情况下仍正确渲染
   - 恢复注释（其他未迁移组件仍需遗留 CSS）

4. **清理无用代码**
   - 移除组件中不再使用的 CSS 变量引用
   - 移除空的 `<style>` 块

---

### 第 5 步：验证（Verification）

完成迁移后的全面验证：

1. **构建验证**
   ```bash
   npm run build
   ```
   - 确认构建成功，无错误或警告

2. **运行测试**
   ```bash
   npm run test
   ```
   - 确认所有现有单元测试和集成测试通过
   - 事件处理器行为不变，数据绑定渲染内容不变

3. **视觉检查**
   - 亮色模式：背景为 canvas-parchment (#f5f5f7)，卡片为白色 + hairline 边框 + 18px 圆角
   - 暗色模式：背景为 surface-tile-1 (#272729)，文字为 on-dark (#ffffff)
   - 无 glass-morphism、渐变背景、box-shadow 等禁止元素

4. **无障碍验证**
   - 键盘导航焦点指示器可见（primary-focus #0071e3, 2px solid outline）
   - Tab 顺序遵循视觉阅读顺序
   - 颜色对比度满足 WCAG AA（正文 ≥ 4.5:1，大字 ≥ 3:1）

5. **跨平台验证**（如条件允许）
   - Tauri 桌面端（Windows WebView2 / macOS WebKit）渲染正常
   - Capacitor 移动端（Android Chrome 90+ / iOS Safari 15+）渲染正常

---

## CSS Class 映射表

以下表格列出遗留 CSS class 到 Tailwind 工具类的对应关系。所有 Tailwind 类均基于 `src/config/design-tokens.ts` 中定义的设计令牌。

| 遗留 Class | Tailwind 等效类 | 说明 |
|---|---|---|
| `.glass-card` | `bg-white rounded-lg border border-hairline p-lg shadow-none` | Apple store-utility-card 规范卡片，无阴影无毛玻璃 |
| `.btn` | `bg-primary text-on-primary rounded-pill px-[22px] py-[11px] text-body` | 主操作按钮（button-primary） |
| `.back-btn` | `bg-white text-primary border border-primary rounded-pill px-[22px] py-[11px]` | 次要操作按钮（button-secondary-pill） |
| `.module-card` | `bg-white rounded-lg border border-hairline p-sm` | 工具网格中的模块卡片 |
| `.module-grid` | `grid grid-cols-4 gap-sm` | 4 列工具网格布局 |
| `.module-name` | `text-caption tracking-tight-md` | 模块标签文字（14px） |
| `.dashboard-header` | `h-[52px] flex items-center px-lg` | 首页顶部导航栏 |
| `.bottom-tab-bar` | `fixed bottom-0 w-full flex items-center justify-around h-[70px]` | 底部标签导航栏 |
| `.settings-section` | `bg-white rounded-lg border border-hairline p-lg` | 设置页分组卡片 |
| `.view-header` | `h-[52px] flex items-center justify-between px-lg` | 通用页面头部 |
| `.today-panel` | `bg-white rounded-lg border border-hairline p-lg` | 今日概览卡片 |
| `.notice-panel` | `bg-white rounded-lg border border-hairline p-lg` | 通知卡片 |

### 补充映射

| 遗留 Class / 样式 | Tailwind 等效类 | 说明 |
|---|---|---|
| `.search-input` | `rounded-pill h-[44px] px-lg border border-hairline bg-white` | 搜索输入框（pill 圆角） |
| `background: var(--gradient-bg)` | `bg-canvas-parchment` | 页面背景（纯色替代渐变） |
| `backdrop-filter: blur(...)` | 移除，不替换 | Apple 设计规范禁止毛玻璃效果 |
| `box-shadow: ...` (卡片) | `shadow-none` | Apple 设计规范卡片无阴影 |

---

## 验证清单

每个迁移完成的组件必须通过以下验证项：

### ✅ 代码层面

- [ ] **零遗留 CSS class 引用** — 组件模板和样式中不包含任何遗留 class（如 `.glass-card`, `.btn`, `.back-btn` 等）
- [ ] **零遗留 CSS 变量引用** — 不使用 `var(--ui-xxx)` 等遗留自定义属性
- [ ] **无 Tailwind `!important` 修饰符** — 不使用 `!` 前缀（如 `!bg-white`），除非作为临时过渡措施并记录在迁移清单中

### ✅ 功能层面

- [ ] **事件处理器完整** — 所有 `@click`, `@input`, `@change` 等事件处理器未被移除或破坏，产生与迁移前相同的结果
- [ ] **数据绑定正确** — 所有 `v-model`, `:value`, `{{ }}` 插值渲染与迁移前相同的内容
- [ ] **无 console 错误** — 浏览器控制台无 JavaScript 错误或 Vue 警告

### ✅ 构建层面

- [ ] **构建通过** — `npm run build` 成功完成，无错误
- [ ] **测试通过** — `npm run test` 所有现有测试通过，无需修改测试代码

### ✅ 视觉层面

- [ ] **符合 Apple 设计规范** — 视觉外观符合 DESIGN.md 定义的 Apple 风格：
  - 背景：canvas-parchment (#f5f5f7) 纯色
  - 卡片：白色 + 18px 圆角 + 1px hairline 边框 + 无阴影
  - 按钮：pill 形状或 sm 圆角
  - 字体：SF Pro 字体栈，正确的字号和字重
  - 颜色：单一蓝色强调 (#0066cc)，近黑文字 (#1d1d1f)
- [ ] **无禁止视觉元素** — 不包含以下任何效果：
  - ❌ glass-morphism (`backdrop-filter: blur()`)
  - ❌ 渐变背景 (`linear-gradient` / `radial-gradient`)
  - ❌ 卡片或按钮阴影 (`box-shadow`)
  - ❌ 彩色图标背景
  - ❌ 多色渐变文字

---

## 注意事项

### CSS Layer 优先级

迁移期间，遗留 CSS 和 Tailwind CSS 通过 `@layer` 机制共存：

```
@layer legacy    → 低优先级（遗留样式，含 !important 也不会穿透）
@layer tailwind  → 高优先级（Tailwind 工具类）
无 layer 样式    → 最高优先级（仅用于 overrides.css 特殊情况）
```

这意味着：
- 即使遗留 CSS 中使用了 `!important`，Tailwind 层的普通工具类也能覆盖它
- 迁移后的组件无需使用 `!important` 来覆盖遗留样式

### 渐进式迁移原则

- 一次只迁移一个组件，确保其他组件不受影响
- 迁移期间遗留 CSS 文件保持不变，直到所有引用该 class 的组件均已迁移
- 当所有组件迁移完成后，可安全移除 `@layer legacy` 块和遗留 CSS 文件

### Platform Bridge 保护

- `src/platform/` 目录在整个迁移过程中 **不得修改**
- 迁移仅涉及样式层，不影响跨平台桥接逻辑
