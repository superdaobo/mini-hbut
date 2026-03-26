# 图形资源跨端缓存解析与防抖代理 (image_cache.ts)

## 1. 模块定位与职责

在包含大量图片的系统里（如图书馆馆藏封面、教务处验证码、校园新闻大图），如果每次启动应用都拉取图片，会由于弱网环境导致严重的页面空鼓。
`image_cache.ts` 构建了一套同时适配 **Web浏览器环境**和 **Tauri 原生桌面环境**的 `TTL` (生存时间) 图片缓存代理器。当上层组件（如 `CacheImage.vue`）索要一张图时，它能根据当前 OS 走不同的本地介质存储。

## 2. 跨平台路由隔离

当页面请求 `resolveCachedImage({ cacheKey: "banner_1", url: "https://xxx/a.png" })`：

```mermaid
graph TD
    Request[触发 resolveCachedImage] --> Lock{inFlight 存在同一并发锁吗？}
    Lock -- 是 --> Wait[等待先行的 Promise 解析]
    Lock -- 否 --> EnvCheck{运行在 Tauri ?}
    
    EnvCheck -- Web/手机H5 --> FlowWeb[纯 Web 模式 (依赖 HTTP Cache)]
    EnvCheck -- Windows/Mac --> FlowTauri[Tauri IPC 本地文件化]

    FlowWeb --> CheckTTL[检查 LocalStorage 的 Meta.updatedAt 是否过期]
    CheckTTL -- 没过期 --> URLReturn(直接返回原始 URL 被动命中浏览器缓存)
    CheckTTL -- 已过期 --> updateTime[刷新 updated时间] --> URLReturn

    FlowTauri --> CheckLocal[读取 localStorage 本地绝对路径 path]
    CheckLocal -- 存在且没过期 --> convertLocal[toNativeFileSrc(`asset://localhost/%..`)]
    CheckLocal -- 缺失或过期 --> rustRPC[Tauri invoke('cache_remote_image')]
    rustRPC -.-> Rust[Rust 爬虫下载二进制保存到 AppData]
    rustRPC --> writeFile[保存下发的新本地 path 到 LocalStorage] --> convertLocal
```

## 3. 核心并发控制锁 (`inFlight` Map)

在 Vue 的 `v-for` 列表中，如果同一个图片（例如默认空头像图片）被渲染 100 次，就有可能导致 `resolveCachedImage` 瞬间发射 100 个 IPC 命令，塞爆 Rust 通道或后端服务器连接数。
所以代码包含了一把并发去重锁：

```typescript
const inFlight = new Map<string, Promise<string>>()
// 如果当前 URL 和 Key 正在飞行 (未 Resolved)，则直接拿到那个未完成的 Promise
if (!inFlight.has(key)) {
  inFlight.set(key, (async () => {
       try { ... return src; }
       finally { inFlight.delete(key) }
  })())
}
return inFlight.get(key)!
```
这是非常经典的 JavaScript 闭包单例池模式——**合并重复请求，化一百为一。**

## 4. Meta 数据设计
该模块在浏览器端或者 Tauri 端都在维护一个 `hbu_image_cache_meta_v1:{cacheKey}` 的键对，记录着 `url` 以及 `updatedAt` 时间戳。并且暴露了 `ttlHours: 默认 24*7` 的重校验机制。
如果发现远端图片的 URL 被 CMS（内容管理系统）替换了 (`meta.url !== url`)，此时缓存机制会被打破强制重新下载落地，确保应用不出现死缓存脏数据。