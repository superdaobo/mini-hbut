# `App.vue` 深度解析文档

## 1. 定位与核心功能
如果说 `main.ts` 是负责点火启动的电瓶，那么 `src/App.vue` 则是驱动这辆“跨端多路总线赛车”的底盘与方向盘。

在标准的 Vue 单页应用中，大家理应依赖 Vue-Router，不过这里的 `App.vue` **放弃了沉杂的官方路由方案，转而自行用组合组合式 API (Composition API) 与状态机手动揉捏了一套扁平化的路由系统** (`currentView`)。
除此之外，它的核心职能还极具宏观性：
- 掌管系统顶置遮罩层：诸如错误吐司器 (`Toast.vue`) 与 OTA 更新浮动界面 (`UpdateDialog.vue`)。
- 分流全应用界面基类：统领包括但不仅限于成绩、电费、课表图、培养方案等所有重核心业务。
- 接管原生操作系统退出的死亡审判机制，接管系统冷启动切回热启状态的数据同步。

## 2. 逻辑原理与架构关联

### 2.1 自研极简端路由控制枢纽
```javascript
const currentView = ref(initialView)
const activeTab = ref(initialTab)
const currentModule = ref(initialModule)
```
整个应用的逻辑就是根据上面的状态，借由 `v-if/v-else-if` 在 `<template>` 深处精准挂载：
`<Dashboard v-if="currentView === 'home'" />`。
这有几个极其刚硬的前向意图：
1. **防止页面切换中的重绘销毁损耗**：不用担心多端历史堆栈的异常出入。
2. **状态驻留完美化**：页面之间可以极度轻松地共享根数据 `gradeData` 或 `studentId` 的引用传递而不需要经过 Pinia 的深拷贝。

### 2.2 环境嗅探雷达
```javascript
const hasTauri = isTauriRuntime()
const isIOSLike = /iPad|iPhone|iPod/i.test(ua) || ...
const isAndroidLike = /Android/i.test(ua)
const isDesktopLike = !isIOSLike && !isAndroidLike
```
这里充当了跨平台大管家。根据不同的设备，后续会触发特定的兼容调整（例如通知系统、刘海屏头部规避、字体平滑）。

### 2.3 `Hash / History` 残留解析策略
代码开头写了一大段 `readWindowRouteSnapshot()`，主要是为了防止有些原生壳外联跳转进来，或者是通过推送栏点击打开 App 传参时，应用能够准确跳转到通知所指认的具体页面。
它捕获了类似于 `#/251023xxxx/grades` 的 URI 分发。

## 3. 代码级深度拆解

### 3.1 预取与性能管理（Prefetch mechanism）
引用的 `SCHEDULE_POPUP_PENDING_KEY` 暴露出：为了防止用户在弱网环境下点课表白屏，在首页可能就已经在某些阶段对缓存的 API `fetchWithCache` 进行了预热，在业务代码未抵达前拦截执行。

### 3.2 冷热更与底层云端调度
```javascript
import { resetCloudSyncCooldownForSession, runAutoCloudSyncAfterLogin } from './utils/cloud_sync.js'
import { checkForUpdates } from './utils/updater.js'
```
当系统发现用户为成功登录状态后，便会触发云端同步备份机制。如果是从手机后台唤醒重新切入（`onMount` 生命周期或对应的 Capacitor 级 `onResumed` 监听器），就会查杀一下教务系统的服务器是否维护中 (`jwxtMaintenanceMode`) 和判断应用的热补丁库有无下发新包。

### 3.3 Tost 与弹窗劫持
从它所依赖的 `UpdateDialog` 等组件看，这个文件就是全局挂载 DOM，任何层里子组件触发的全屏阻断交互都能直接跨事件通达到最顶层抛出警告。

## 4. 架构特殊机制分析：基于状态栈的原生劫持
如果是原生安卓应用使用原设按键返回，一般会由内向外剥离堆栈。这种纯基于变量管理的页面，安卓返回键如果直接打出 `back()` 可能直接杀破了内核退回桌面。在 `App.vue` 经常会伴随着配合 Tauri 或 Capacitor 返回指令 `invokeNative` 或 `App.addListener('backButton')` 将状态设回如 `currentView = 'home'` 而不退出，从而欺骗系统。

## 5. UI级模块化架构与数据拓扑流转图

通过附带的 Mermaid 图表，透视 `App.vue` 内部各组件装配的星像结构：

```mermaid
graph TD
    APP["App.vue (Global Logic & Store Context)"]
    
    subgraph SYSTEM_ALERTS [跨平台系统浮动警告 / 服务机制]
        TOAST(Toast.vue 错误播报)
        UPDATER(UpdateDialog.vue 热重载分发)
    end
    
    subgraph TAB_VIEWS [核心视图树 (依靠currentView轮切)]
        H[Dashboard.vue 统计首页]
        S[ScheduleView.vue 课表网格]
        M[MeView.vue 用户抽屉]
        N[NotificationView.vue 通知中心]
        
        subgraph SUB_BUSINESS [细分原子功能组件群]
            GC[GradeView.vue / 成绩单层]
            EV[ElectricityView.vue / 宿电]
            EX[ExamView.vue / 考试]
        end
    end
    
    subgraph PLATFORM_ENV [环境探测雷达组]
        Detector(IOS/Android/Tauri <br/> 探针判定池)
    end

    APP --> SYSTEM_ALERTS
    APP --> TAB_VIEWS
    APP --> PLATFORM_ENV

    H -.在用户点击后.-> GC
    H -.切换.-> EV
    
    Detector -.向内下发响应式参数.-> TAB_VIEWS
    
    classDef main fill:#e67e22,stroke:#d35400,stroke-width:2px,color:#fff
    classDef child fill:#2980b9,stroke:#2c3e50,stroke-width:2px,color:#fff
    
    class APP main
    class SYSTEM_ALERTS child
```

*(End of document. 这份文档为之后拆解任何独立页面组件扫清了父级调用的认知重度羁绊。)*