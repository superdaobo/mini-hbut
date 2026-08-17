# 极致响应式多态视觉中枢 (ui_ux_pro_max.css)

## 1. 模块设计哲理

如果说 `main.css` 是打地基，那 `ui_ux_pro_max.css` 则是构建了一座摩天大楼的玻璃外墙。它是本系统 UI 自适应（Responsive）和高级材质化（Material Design / Glassmorphism）的核心。
该样式表引入了大量的 `clamp()` 流体数学函数，旨在让不同设备（从折叠屏到 4K 宽屏显示器）都能呈现同样的布局张力。

## 2. 三向环境背景发生器 (.app-shell)

这个类接管了全站组件的最外层挂载。不仅提供了极为复杂的环境底色渐变，还挂载了根据 Vue `data-ui-decor` 实时切换的环境纹理图（Mesh 渐变和 Grain 噪点）：

```css
html[data-ui-decor='mesh'] .app-shell::before {
  background:
    linear-gradient(transparent 96%, color-mix(in oklab, var(--ui-primary) 12%, transparent) 100%),
    linear-gradient(90deg, transparent 96%, color-mix(in oklab, var(--ui-secondary) 11%, transparent) 100%);
  background-size: 22px 22px, 22px 22px;
}
```
这段通过 `oklab` 色域的高阶函数混色（目前只有最新的 WebKit 支持）确保了系统在高色域苹果屏幕上背景的自然过渡，去除了色带断层。

## 3. 动态流体布局与安全边界

通过 `clamp` 为各组件定制动态张力：
```css
:root {
  --ux-header-title-size: clamp(20px, 2.2vw, 28px);
  --ux-page-x: clamp(10px, 2.2vw, 22px);
  --ux-bottom-safe: calc(128px + env(safe-area-inset-bottom));
}
```
并且深度融合了 `env(safe-area-inset-bottom)` 来避开 iOS 全面屏底部的“小白条”返回栏，使得 Web 表现得比原生 App 还要符合边距直觉。

## 4. 路由挂载黑箱与特权隔离

不是所有的界面都要遵从留白设定。课表界面因为需要占据整个屏幕以铺设 11 节课：
```css
.app-shell > .schedule-view {
  width: 100% !important;
  max-width: none !important;
  margin-inline: 0 !important;
  padding-inline: 0 !important;
}
```
这种精细到粒度组件控制级的覆盖网络（`[class$='-view']:not(.schedule-view)`），让开发者不必在每一个 Vue 组件中写入令人恶心的重复 CSS，极大减轻了单文件代码的冗余程度。