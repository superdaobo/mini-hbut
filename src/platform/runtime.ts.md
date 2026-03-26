# `src/platform/runtime.ts` 运行环境深度嗅探层解析

## 1. 文件概览

`src/platform/runtime.ts` 是整个多端混合型应用（Tauri、Capacitor、Web）进行环境身份自明的基石侦测模块。
虽然文件只有不到 50 行代码，但它直接决定了 `native.ts` 及整个应用的各种跨端能力（如本地存储策略、请求适配器走向、退出方式、文件读取方式）是否能够正常切换工作姿态。

它的核心返回类型即项目中最常遇到的字面量联合类型：`'tauri' | 'capacitor' | 'web'`。

### 1.1 核心职责
1. **纯 Web 嗅探 (`isCapacitorRuntime` / `hasNativeCapacitor`)**: 利用多种隐式特征识别自己是否身处于通过 Capacitor 打包生成的移动设备原生 Webview。
2. **纯桌面指纹侦测 (`isTauriRuntime`)**: 辨别自己是否处于 Tauri 的 WebKit (macOS) 或者 WebView2 (Windows) 浏览器中。
3. **输出绝对真值**: 导出一个决定性 API `detectRuntime()` 并缓存给全局享用。

---

## 2. 嗅探逻辑全景脑图

这套探查机制极高地避免了在 SSR/CSR 环境下的报错（先判定 `window`）。

```mermaid
flowchart TD
    classDef main fill:#34495e,stroke:#2c3e50,stroke-width:2px,color:#fff;
    classDef tauri fill:#f39c12,stroke:#d35400,stroke-width:2px,color:#fff;
    classDef mobile fill:#27ae60,stroke:#1e8449,stroke-width:2px,color:#fff;
    classDef pwa fill:#2980b9,stroke:#1abc9c,stroke-width:2px,color:#fff;

    Start((detectRuntime 调用)):::main
    
    CheckWindow{1. typeof window === 'undefined' ?}
    CheckWindow -->|Yes| OutWeb[判定为 'web']:::pwa
    
    CheckWindow -->|No| CheckCapacitor{2. 探测 Capacitor 指纹机制}
    CheckCapacitor -->|window.Capacitor.isNativePlatform() \n| OutCapacitor[判定为 'capacitor']:::mobile
    CheckCapacitor -->|protocol = 'capacitor:'| OutCapacitor
    
    CheckCapacitor -->|未命中| CheckTauri{3. 探测 Tauri V1/V2 特征}
    
    CheckTauri -->|window.__TAURI_INTERNALS__.invoke| OutTauri[判定为 'tauri']:::tauri
    CheckTauri -->|window.__TAURI__| OutTauri
    CheckTauri -->|protocol = 'tauri:'/ host = 'tauri.localhost'| OutTauri
    
    CheckTauri -->|全部未命中| OutWeb
```

### 2.1 架构深度解读

在不依靠 User-Agent 这种容易被伪造和污染的技术下（尤其现在国产手机疯狂魔改内核），这份文件的探查手法显得非常前沿且暴力：**“找内存中的指纹寄生变量”**。

#### a. 针对 Capacitor（原生APP）的多级深度探活

```typescript
const hasNativeCapacitor = () => {
  if (typeof window === 'undefined') return false
  const w = window as any
  const cap = w.Capacitor
  if (!cap) return false
  try {
    if (typeof cap.isNativePlatform === 'function') { return !!cap.isNativePlatform() } // 现代版本特征
  } catch {}
  try {
    if (typeof cap.getPlatform === 'function') { ... } // 中期版本特征
  } catch {}
  return !!raw && raw !== 'web' // 石器时代版本特征
}
```

针对跨平台 iOS 甚至 Android 上的各类碎片化，这里的探活像是一把“开锁万能匙”。采用 `try...catch` 多级降位打击：从现代的 API，判断到遗留版本的常量属性，滴水不漏地探测外壳宿主，哪怕宿主修改了部分 API 也躲不开这三层筛网。

#### b. Tauri V1 到 V2 升级兼容方案的无缝包容

```typescript
const isTauriRuntime = () => {
  ...
  const hasTAURIApi = !!w.__TAURI__
  const hasInternalInvoke = typeof w.__TAURI_INTERNALS__?.invoke === 'function'
  const protocol = window.location?.protocol || ''
  
  if (protocol === 'tauri:' || host === 'tauri.localhost') return true
  // Tauri v2 默认不注入 window.__TAURI__，但 __TAURI_INTERNALS__.invoke 通常可用。
  if (hasInternalInvoke) return true
  return hasTauriApi && hasInternalMarker
}
```

作者的硬核实力在这里一览无遗。不仅检测 URI Protocol，还捕捉了非常关键的变化环境：“**Tauri 2.x 版本重大安全升级，默认没收了前端在 window.__TAURI__ 裸奔暴露的问题**”。为了适配未来的或者正在升级的框架，抓住了隐匿更深的底层 IPC 函数入口 `__TAURI_INTERNALS__.invoke` 作为新世代的识别器！极大地提高了客户端版本代码跨代稳定性。

#### c. 精准的优先级漏斗

仔细看出口函数：
```typescript
export const detectRuntime = (): RuntimePlatform => {
  if (isCapacitorRuntime()) return 'capacitor'
  if (isTauriRuntime()) return 'tauri'
  return 'web'
}
```
**防御机制**：为什么要先检测 `Capacitor` 再检测 `Tauri` ？通常 `Tauri` 主要在桌面运行，但如果未来 Tauri 有意移植或污染了环境，或者在某种浏览器开启了模拟宿主时，Capacitor 是原生性最强的，故它的指纹权重被排在了最高检查位，依次过滤筛下到 Web。

---

## 3. 为什么这份文件不可或缺

如果没有此基建模块，每个涉及到底层操作的文件都要堆叠庞大重复的 `if...else`；一旦框架（如 Tauri）底层 API 稍微变更一处特征，所有的前端代码就会全军覆没或崩溃报错。
通过这一薄层 `runtime.ts` 高强度屏蔽底层波动，不仅完美服务了该三端并存项目，还成为了最稳固的跨端特征库参考代码，非常具备教科书级别的借鉴意义。