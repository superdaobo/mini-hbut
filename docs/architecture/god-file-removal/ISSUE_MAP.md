# Phase 5 Issue 与依赖映射

父任务：[Issue #571](https://github.com/superdaobo/mini-hbut/issues/571)

| 代号 | Issue | 领域 | 依赖 | 主要写入所有者 |
|---|---:|---|---|---|
| A | #572 | 基线、特征测试、规模与职责守卫 | B 的模型预检可并行，编码前必须完成 | `baseline-guardian` |
| B | #573 | 免费 DeepSeek 路由、Worktree、写入锁与回退 | 无 | 主 Agent |
| C | #574 | App 启动壳层与 Coordinator | A、B | `frontend-app-shell` |
| D | #575 | Pinia 生产接入与 AppViewHost | C | `frontend-app-shell` |
| E | #576 | Tauri Command Transport | A、B | `rust-tauri-transport` |
| F | #577 | HTTP Router/Handler Transport | A、B | `rust-http-transport` |
| G | #578 | Application Service 与超限 Rust 领域模块 | E、F 的公开契约；可先做内部无冲突部分 | `rust-application` |
| H | #579 | 数据库职责和仓储边界 | A、B | `rust-db` |
| I | #580 | 四个 runtime.js 的 TypeScript 迁移 | A、B | `typescript-migration` |
| J | #581 | ScheduleView 拆分 | C、D 的 App 接口稳定 | `frontend-schedule` |
| K | #582 | ForumView 拆分 | C、D 的 App 接口稳定 | `frontend-forum` |
| L | #583 | Settings、Chaoxing 与其他超限页面/模块 | C、D 的 App 接口稳定 | `frontend-feature-views` |
| M | #584 | 兼容层清理、完整测试、安全审查和 PR | C–L | 主 Agent + 只读 Review Agent |

## 波次

```text
B ──→ A
      ├─→ C ─→ D ─┬─→ J
      │            ├─→ K
      │            └─→ L
      ├─→ E ─┐
      ├─→ F ─┴─→ G
      ├─→ H
      └─→ I
C–L ─────────────→ M
```

## 集成顺序

1. B：冻结模型路由、回退证据、Worktree 和 `write_paths`。
2. A：落地迁移债务和严格守卫。
3. 并行集成 H、I、E、F、C；每次 cherry-pick 后运行对应定向检查。
4. 集成 D/G 并处理跨 Transport/Application 的接口冲突。
5. 并行集成 J/K/L；页面 Agent 不得修改 App 入口。
6. M 清零 `god_file_debt.json`，运行严格检查、完整测试和安全审查后创建 PR。
