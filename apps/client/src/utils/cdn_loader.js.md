# CDN 资源动态加载与回退容器 (cdn_loader.js)

## 1. 模块定位与职责

由于 `tauri-app` 或 `Mpx/小程序` 等客户端包体积直接影响用户的安装和冷启动意愿，大体积的三方库（如 ECharts, markdown-it）以及动态模块被移出了 Vite 的打包流。
`cdn_loader.js` 是一个专为**挂载外部 ESM/UMD 脚本和 CSS 样式文件**设计的服务。
它不仅负责向 DOM head 注入标签，还集成了一套基于 Cache Storage (Service Worker API 级别) 的本地硬盘缓存能力和多线路 Fallback 节点降级机制。

## 2. 核心架构原理

该加载器内置了三个针对不同资源的 Promise 并发锁 Map (`scriptLoaders`, `moduleLoaders`, `styleLoaders`)，以防同一个视图组件渲染多次时，重复下载网络资源。

### 脚本降级漏斗 (The Fallback Funnel)
当调用 `loadScriptFromCdn` 时，执行链路极其稳健，分为三个安全级别层层退防（以加载 ECharts 为例）：

```mermaid
flowchart TD
    Start[请求注入 ECharts] --> CheckMap(检查 scriptLoaders 并发锁)
    CheckMap -- 命中锁 --> WaitPromise[等待现成Promise]
    WaitPromise --> Return
    
    CheckMap -- 未命中锁 --> CheckGlobal{探针: resolveGlobal()}
    CheckGlobal -- window.echarts 已存在 --> Return
    
    CheckGlobal -- 不存在 --> FetchCache[Level 1: 扫描 window.caches]
    FetchCache -- 有缓存文本 --> RunBlob[Blob URL 执行脚本]
    RunBlob --> CheckGlobal2{校验变量}
    CheckGlobal2 -- 成功 --> Return
    
    FetchCache -- 无缓存 / 执行失败 --> FetchNet[Level 2: fetch() 请求 CDN (附带 timeout)]
    FetchNet -- 请求成功 --> StoreCache[存入 caches]
    StoreCache --> RunBlob2[Blob URL 执行脚本]
    RunBlob2 --> CheckGlobal3{校验变量}
    CheckGlobal3 -- 成功 --> Return
    
    FetchNet -- 请求失败 (CORS等) --> RawDOM[Level 3: 创建 <script src="...">]
    RawDOM -- 浏览器原生命中 --> Return
    RawDOM -- onerror --> NextUrl[轮询 urls 列表的下一个 CDN 节点 (如 cdnjs -> unpkg -> npm)]
    
    NextUrl --> Start
```

## 3. 核心 API 解析

### 3.1 `loadScriptFromCdn` (针对 UMD 全局变量)
专用于加载那些直接通过 `window.XXX` 导出的传统库。利用 `Blob API` 和 `URL.createObjectURL` 可以让代码看起来像是本地加载进而提升安全性并绕开一些沙箱拦截。
```javascript
export const loadScriptFromCdn = async ({
  cacheKey,            // 'echarts'
  urls,                // ['https://cdn1...', 'https://cdn2...']
  timeoutMs = 15000,
  resolveGlobal        // () => window.echarts
} = {}) => { ... }
```

### 3.2 `importModuleFromCdn` (针对 ESM 模块)
使用原生的 Dynamic Import `import(/* @vite-ignore */ url)` 进行引入。但这种方式不支持 Cache API 接管，纯依赖浏览器内置机制（HTTP Cache-Control）并加入了自研的超时器 (`withTimeout`)。

### 3.3 `loadStyleFromCdn` (注入远程 CSS)
同样运用了 `Cache API`。网络连通时通过 `fetchTextByUrl` 拉取，拿到纯 CSS 字符串后，构建 `<style id="xxx">` 强行塞入 `<head>` 以防闪屏 (FOUC)。只有在前两者都失败时才退化至创建普通的 `<link href="..." />`。

## 4. Cache Storage 的离线强化
模块内声明了 `CDN_CACHE_NAME = 'hbut-cdn-runtime-v2'`。
即便用户没有配网 Service Worker (PWA)，只要浏览器核心支持 `window.caches` (现代 Chromium/WebView 基本都支持)，CDN 加载过一次的图表库、字体等就会长久被冻结存入磁盘。这使得该教务查询 App 获得了类似“开箱即用小游戏”的弱网、断网可用性。