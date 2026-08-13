# js/ —— guest-js 封装（#611）

前端调用插件 7 个 API 的 TS 封装。**独立于 `src/platform/`（契约定义由 #609 独占）；不参与主前端构建。**

```ts
import * as bg from "…/tauri-plugin-hbut-background/js";

await bg.configure({ schema: 1, enabled: true, intervalMinutes: 30, business: ["grades"], scope });
await bg.syncContext({ schema: 1, scope, business: ["grades"], updatedAt: new Date().toISOString() });
const state = await bg.getState();        // 真实 platform/source
await bg.runNow({ forceSynthetic: true }); // JS→Rust→native→state/event→JS 闭环
const { events } = await bg.consumeEvents();
await bg.clearContext(scope);              // 账号退出/切换
```

调用路径：`invoke('plugin:hbut-background|<command>')`（Tauri 2 插件 IPC 命名）。
安全约束：本封装只传递非敏感控制信息；认证材料禁止经由此处（#608 红线 2）。
