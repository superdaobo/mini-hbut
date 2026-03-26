# `src/utils/api.js` 前端请求管控与多级缓存网络解析

## 1. 文件概览

`src/utils/api.js` 是前端 Vue 在对接后端接口与实现无网络离线环境时的"前端大脑"。作为网络中心枢纽，它掌控着从 TTL（Time-To-Live）过期设计、容量限制清理、持久化本地落地，再到异常兜底的核心职责。
它的存在屏蔽了大量的网络波动异常，确保即便在教务系统崩溃时，学生依然能查看到带有 `[离线缓存]` 标签的课表。

### 1.1 核心职责与机制
1. **多重 TTL 生命期校验**: 将缓存按照不同要求细分拦截时长（从30秒到七天不等），防止高频无效请求。
2. **二层缓存架构体系 (Memory + LocalStorage)**: 先查内存命中，次查缓存表。在请求密集和网络不稳时提供极速响应。
3. **Storage 配额保护系统**: 检测 Local Storage 的 "QuotaExceededError" (配额满)，并搭载 LRU-类似（Least Recently Used）强制驱逐旧数据算法。
4. **教务熔断守护拦截**: 监听网络异常，智能截获 "系统维护"、"暂无课表"等关键判定参数。

---

## 2. 缓存体系数据流

以下为请求缓存命中逻辑与驱逐清理的核心工作流展示：

```mermaid
stateDiagram-v2
    direction TB
    
    Start((发起数据请求)) --> CheckMemory: 命中 getCachedData API
    CheckMemory --> ValidateMemoryTTL: Memory中存在键值?
    
    ValidateMemoryTTL --> ReturnCache[返回内存数据]: 存在且 TTL 鲜活
    ValidateMemoryTTL --> CheckStorage: TTL过期 或 没找到
    
    CheckStorage --> ValidateStorageTTL: LocalStorage存在?
    ValidateStorageTTL --> RehydrateMemory[反写入内存映射并返回]: 存在且 TTL 鲜活
    ValidateStorageTTL --> FetchAPI[发送远端真实请求]: 过期或缺失
    
    FetchAPI --> Success[请求成功]
    FetchAPI --> NetworkError[网络故障与系统维护]
    
    Success --> SetCacheLimitCheck: setCachedData(最新载荷)
    
    SetCacheLimitCheck --> CheckQuota{检查容量或条目是否超限?}
    CheckQuota --> TrimCache[激活 trimLocalCacheStorage 删旧]: 超限/满载
    CheckQuota --> SaveStorage[存入 LocalStorage]: 未超限
    
    TrimCache --> SaveStorage
    
    NetworkError --> FallbackCache[查找过期兜底缓存 getBestCachedEntry]: 激活离线模式
    FallbackCache --> OutputOffline[附加 offline:true 下发至组件]
```

### 2.1 架构深度解读

本文件的核心目的只有一个任务：**保障在极端状态下的数据输出（包括离线与系统卡顿限流）**。

#### a. 灵活的回退机制与维度防护
使用 `getBestCachedEntry` 和 `deriveFallbackPrefixes` 构建了精准细致的前缀拆分前溯查询。例如 `schedule:2024:first` 若失效，不再降级查其他学期内容（导致数据乱入污染），而是用严格逻辑阻断；而其他的字典数据，则逐层剔除了 `:` 层级去查找任意可用的泛型备份数据，非常智能。

#### b. 配额危机与异常急救（Quota Eviction）
```javascript
const enforceLocalCacheCountLimit = () => {
  const entries = collectCacheEntries()
  const overflow = entries.length - MAX_LOCAL_CACHE_ENTRIES
  if (overflow <= 0) return
  trimLocalCacheStorage(overflow)
}
```
对于前端 SPA，LocalStorage 上限常常只有 5MB。本文件直接把这个限制当做了第一级优先级管理。采用记录入库 `timestamp` 进行排序的“最旧淘汰法”，一旦总数超越 `MAX_LOCAL_CACHE_ENTRIES` (220条) 或触发 DOM 被拒写入 `isQuotaExceededError`，就无情截断过期信息。这种自动化内存清理保护了客户端的长期稳定性。

#### c. 精准的异常白名单判定
```javascript
const noScheduleHints = ['暂无可用课表', '暂无课表', '无课表', '假期', 'vacation', 'no schedule']
```
遇到接口异常不一味判定成网络崩溃。这个白名单在拦截报错消息分析时起到了判别作用：当教务本来因为寒暑假本身返回无课表时，不引起系统误报“教务离线了”，而是正常的反馈业务态。

---

## 3. 对项目全局的影响与技术选型

如果说 `db.rs` 负责了真正体积巨大的后台离线仓储，那么 `api.js` 则是一个具备“高热度防护功能”的城墙（拦截高频刷新压力，以及作为第一手前线数据展示）。
它们两者形成了：
1. **L1 Cache (一级缓存)**: `api.js` Map (JS运行时高速映射，无需进行 `JSON.parse` 操作的大规模反序列化，极大解放 CPU 响应速度)。
2. **L2 Cache (二级缓存)**: `api.js` 的 `LocalStorage` (满足基础的刷新和关闭再开的小规模网络配置存储和基础快速读取功能，空间 5MB)。
3. **L3 Cache (三级持久层)**: 降维下探后端 `db.rs` 中的 Rust IPC （用来存储历史漫长体积庞大动辄百KB的用户个人大容量重型档案、考试记录、过往三年详细查询历史）。

这种经典的 “冰火协同” 三级联动构建模式把性能压榨到了极致，打造了近乎本地原生 App 的极致丝滑顺畅体感，堪称这个架构体系中最优秀与出彩的中间件设计典范。