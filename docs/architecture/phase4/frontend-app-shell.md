# 阶段 4A：AppShell 与 Pinia 单一真相

## 目标

阶段 4A 采用渐进式收敛，而不是一次性重写约五千行的 App.vue。Pinia 作为跨组件状态唯一来源，AppShell 作为全局壳层上下文边界；现有页面渲染链保持不变。

## Store 边界

- auth：学号、用户 UUID、登录派生状态与会话清理。
- navigation：当前视图、主 Tab、模块名与导航方向。
- lifecycle：前后台时刻、恢复阶段和硬重载预算。
- update：检查状态、版本信息、强制更新元数据和错误。
- grade：成绩快照、离线标记、同步时间与刷新状态。

## 渐进迁移规则

1. 新状态必须先进入对应 Store，禁止在组件中新增第二份全局 ref。
2. App.vue 可通过 storeToRefs 暂时保留原变量名，避免大规模模板改写。
3. 迁移期间只允许单向兼容适配，不允许 Store 与本地 ref 双向 watch。
4. AppShell 不增加 DOM 包装，避免改变安全区、滚动和底栏布局。
5. 每个后续页面拆分必须独立提交并运行 typecheck、Vitest 与构建。

## 回滚

本阶段没有数据库和协议变更。回滚时可恢复 App.vue 与 main.ts，并删除 src/stores、src/shell；页面数据和原生状态不会受影响。
