# 全局气泡横幅调度器 (Toast.vue)

## 1. 模块定位与轻量化核心

在传统的前端应用中，吐司提示往往依赖于庞大沉重的 UI 框架（比如 Element Plus / Vant），这会在初次访问的时候带来巨大的网络开销。`Toast.vue` 是一个完全脱离 UI 库束缚、仅利用 Vue `<Transition>` 与原生 CSS 打造的基础原子设施。它主要被拦截器、表单提交反馈用作最直白的消息反馈渠道。

## 2. 状态抽取分离模式 (State Decoupling)

组件内部自己没有任何业务逻辑和定时器销毁代码。真正主导它的状态机被转移到了外部的 `../utils/toast` 响应库中。

```javascript
// Toast.vue 仅做了壳子：
import { toastState } from '../utils/toast'

// 渲染
<div v-if="toastState.show" class="toast-container" :class="toastState.type">
```
这种剥离让 `fetchWithCache` 乃至底层 Axios 在遭遇例如“教务系统网关崩塌报 502”时，能直接用命令范式发出 `showToast('502', 'error')`，而不用像经典的 React Hooks 一样在每个调用的地方注入状态容器。

## 3. 毛玻璃物理材质与 CSS 动效

为了提供能够覆盖各系统默认原生 Toast（例如 iOS 系统横幅）的统一沉浸体验，应用了 GPU 加速级别的视觉属性：

```css
.toast-container {
  backdrop-filter: blur(10px); /* 磨砂玻璃质感 */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); /* 三维浮层光影 */
}

/* 多态降级色板 */
.toast-container.success { background: rgba(16, 185, 129, 0.9); }
.toast-container.error { background: rgba(239, 68, 68, 0.9); }
```

不仅在入场使用了 `.toast-fade-enter-active` 的贝塞尔曲线 `cubic-bezier(0.16, 1, 0.3, 1)`。这赋予了提示框入场时弹性跃出的反弹空间感，增强了操作成功的正反馈释放。