# 首页「今日安排」课程名称溢出与重叠 —— 修复计划

| 项 | 值 |
|---|---|
| Issue | #1011 |
| 分支 | `fix/1011-home-today-course-name-overflow` |
| Worktree | `D:\Documents\C_learn\成绩查询\wt\tauri-1011` |
| 基线 | `origin/main` @ `4a8c0dc0` |
| 状态 | 计划待批准（尚未改动任何代码） |

---

## 1. 现象

首页「今日安排」时间轴在课程名称较长时布局破裂：

1. **名称超出卡片**：已结束 / 未开始的课程，名称冲出卡片右边界直到屏幕外，同时右侧「已完成 / 未开始」状态徽标被挤出卡片、完全不可见。
2. **名称与按钮重叠**：当前进行中（高亮）的课程，名称延伸到「去上课」按钮下方被遮挡。

课名长度由教务系统决定，长课名（如「中外文化交流与互鉴-中外文化交流与互鉴专题研讨课程」）在真实数据中已出现，属所有用户都可能触发的常态问题。

---

## 2. 根因（已实测，非推测）

### 2.1 现象 1：flex 截断链缺 `min-w-0`

`Dashboard.html:191`（已完成行）与 `:241`（未开始行）的中间层包装器：

```html
<div class="flex-1 flex justify-between items-start pl-1 pr-1">
```

它自身是行 flex 容器的子项，但**没有 `min-w-0`**，于是 `min-width: auto` 生效，无法收缩到长课名（`truncate` 的 `white-space: nowrap`）的固有宽度以下，整行被撑宽并把状态徽标推出卡片。内层 `:192` / `:242` 已有 `min-w-0`，但**截断链上每一层 flex 子项都必须有**，只在内层加不足以救。

实测（卡片内容宽 480px，课名「中外文化交流与互鉴-中外文化交流与互鉴专题研讨课程（双语）」）：

| 元素 | 期望 | 实测 |
|---|---|---|
| 中间层包装器宽度 | 408px（= 480 − 24 − 48） | **523px**（超出 115px） |
| 名称盒 clientWidth / scrollWidth | 340 / 455（应截断） | **455 / 455**（未截断） |
| 「已完成」徽标右边界 | ≤ 526（卡片右边界） | **637**（溢出卡片 111px） |
| 整行 scrollWidth − clientWidth（320px 视口） | 0 | **327px** |

### 2.2 现象 2：预留宽度与覆盖层宽度不一致 + 课名无截断

- `:212` 文本区只预留 `pr-20` = **80px**；
- `:220` 右侧导轨却是 `absolute right-0` 的 `w-36` = **144px** 覆盖层；
- → 名称盒有 64px 落在导轨之下；且 `:216` 的课名**没有任何截断**（`font-bold text-xl`，既无 `truncate` 也无 `line-clamp`）。

实测：

| 场景 | 名称盒右边界 | 按钮左边界 | 重叠 |
|---|---|---|---|
| 中文「去上课」 | 430 | 436 | 0px（仅剩 6px，极脆弱） |
| 英文 "Go to class"（按钮宽 109px） | 430 | 411 | **25px** |
| 320px 窄屏 + 英文 | — | — | **25px** |
| 未补 `min-w-0` 且课名较长 | 559 | 436 | **123px** |

> 中文本地化下「看起来只是擦边」，是因为「去上课」按钮恰好只有 78px 宽；英文文案按钮变宽后立即真实重叠。

### 2.3 影响面

同款「缺 `min-w-0` 的 flex 截断链」在全仓模板中**仅上述两处**；其余 `truncate` 用法（`:59`、`:62`、`:407`、`:428`）祖先链上均有 `min-w-0`，链路完整。改动为纯前端模板层，**无 Rust / 无数据契约改动**。

---

## 3. 决策点与默认假设

> 创建 issue 时未获确认，以下为默认假设，执行前可推翻。

| # | 决策 | 默认取值 | 理由 |
|---|---|---|---|
| D1 | 进行中卡片修法 | **方案 B：结构性修复**（导轨由 absolute 覆盖层改为真实 flex 列） | 彻底消除「预留宽度必须手动跟随导轨宽度」的魔法数字耦合；中英文/各档宽度自适应；已实测几何零偏移 |
| D2 | 长课名展示 | **单行 `truncate`** | 卡片高度稳定、不随课名抖动，与上下两行处理一致 |
| D3 | 修复范围 | **仅首页今日安排**（`:191`/`:241`/`:212`/`:216`/`:220`） | 同类隐患全仓仅此两处；不做范围外重构 |
| D4 | 标签 | `bug` + `area:frontend` | 已按此创建 #1011 |

### 3.1 方案 B 的可行性验证（已完成）

用**真实构建产物 CSS**（`dist/assets/index-*.css`）+ 与模板逐字一致的 class 结构搭最小复现页，在 572px 视口下同页并排对照「修复前 / 修复后」卡片，逐元素测量：

| 元素 | 修复前 | 修复后 | 偏移 |
|---|---|---|---|
| 卡片 | x46 w480 h104 | x46 w480 h104 | 0 |
| 装饰插画 | x283 w243 h104 | x283 w243 h104 | **0** |
| 「去上课」按钮 | x436 w78 right514 | x436 w78 right514 | **0** |
| 倒计时 | x433 w93 | x433 w93 | **0** |
| 课名盒宽 | 308 | 311 | +3（更宽） |

结论：方案 B **不挪动任何既有元素**，仅让课名多获得 3px，同时把「名称盒侵入导轨区」的结构性缺陷消除。

---

## 4. 改动方案

单文件改动：`apps/client/src/templates/views/Dashboard.html`（另加 1 个契约 spec）。

### 4.1 已完成行 / 未开始行（现象 1）

```diff
- <div class="flex-1 flex justify-between items-start pl-1 pr-1">
+ <div class="flex-1 min-w-0 flex justify-between items-start pl-1 pr-1">
```

`:191` 与 `:241` 两处同构同改（`:193` / `:243` 的 `truncate` 保持不变，补上 `min-w-0` 后即生效）。

### 4.2 进行中卡片（现象 2）

```diff
  <div class="w-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-2xl pt-3 pb-4
-             pr-4 flex shadow-lg relative overflow-hidden">
+             flex shadow-lg relative overflow-hidden">
    <div class="absolute -right-8 -top-8 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
    <div class="w-6 ...">点</div>
    <div class="w-12 ...">时间</div>

-   <div class="flex-1 text-white relative z-10 pl-1 pr-20">
+   <div class="flex-1 min-w-0 text-white relative z-10 pl-1">
      <span class="text-[10] ...">下一节</span>
-     <h4 class="font-bold text-xl mb-1">{{ course.name }}</h4>
+     <h4 class="font-bold text-xl mb-1 truncate">{{ course.name }}</h4>
      <p v-if="course.room" ...>房间</p>
    </div>

-   <div class="absolute right-0 top-0 bottom-0 flex flex-col justify-center items-end w-36">
-     <img src="/splash/campus_illustration.webp" class="today-course-illustration" alt="" />
+   <!-- 装饰插画移出导轨、成为卡片自身子节点，保持整卡高度与锚点不变 -->
+   <img src="/splash/campus_illustration.webp" class="today-course-illustration relative z-10" alt="" />
+
+   <div class="relative z-10 flex flex-col justify-center items-end shrink-0">
      <div class="relative z-10 text-right mb-2 text-white text-xs pr-3">{{ getCourseCountdown(course) }}</div>
      <button class="relative z-10 ... mr-3" @click.stop="...">去上课</button>
    </div>
  </div>
```

四处要点：

1. **卡片去掉 `pr-4`** —— 右内边距改由导轨承担（按钮保留 `mr-3`），使按钮右边界仍是 `卡片右边界 − 12px`，与修复前逐像素一致。
2. **导轨去掉 `absolute right-0 top-0 bottom-0 w-36`，改为 `relative z-10 flex flex-col justify-center items-end shrink-0`** —— 成为真实 flex 列，宽度由内容（倒计时 / 按钮）自适应，不再需要任何魔法数字。作为 flex 项默认 `align-items: stretch`，仍整卡高 + `justify-center`，垂直居中行为不变。
3. **装饰插画移到卡片自身** —— 若留在导轨内，其 `top/bottom: 0; height: 100%` 会跟随导轨的**内容盒**高度（少了 `pt-3 + pb-4` 共 28px）而变小。移到卡片后锚点回到卡片 padding box，实测 `x283 w243 h104` 与修复前完全一致；`relative z-10` 保证叠放层级与原先（在 `z-10` 导轨内）一致。
4. **文本区 `pr-20` → `min-w-0`** —— 不再靠固定预留躲让，而是由导轨真实占位，课名在自己的盒内截断。

---

## 5. 回归护栏

按仓库既有惯例（`src/utils/*_contract.spec.ts`：`fs.readFileSync` 读源码 + 断言结构）新增一个契约 spec，例如 `src/utils/home_today_timeline_layout_contract.spec.ts`，断言：

- `Dashboard.html` 中所有 `flex-1 flex justify-between` 包装器均带 `min-w-0`（现象 1 不再回归）；
- 进行中卡片的课名元素带 `truncate`、其父级带 `min-w-0`（现象 2 不再回归）；
- 进行中卡片不存在「`absolute` 定位的固定宽导轨 + 文本区固定 `pr-*` 预留」这一耦合组合（防止有人再把导轨改回覆盖层却忘记同步预留宽度）。

> 取舍：这是**结构性契约**而非布局断言（jsdom 不做布局计算，仓库也未引入 Playwright 依赖，无法在 CI 里真测像素）。它能挡住「有人把 `min-w-0` / `truncate` 删掉」，挡不住「新增第三种写法」。真实布局验证走第 6 节的量化复现页，二者互补。

---

## 6. 验证方式

### 6.1 量化复现（主证据，已跑通）

- 用真实构建产物 `apps/client/dist/assets/index-*.css` + 与模板逐字一致的 class 结构搭最小复现页；
- `python -m http.server` 起本地静态服务，Playwright 在 320 / 375 / 572 / 768 / 1080px 视口下测量 `clientWidth` / `scrollWidth` / `getBoundingClientRect()`；
- 判定：时间轴各行 `scrollWidth === clientWidth`（无横向溢出）、名称盒右边界 ≤ 导轨左边界、按钮完整可见。
- 复现页（**未跟踪的临时脚手架**，位于被 gitignore 的 `apps/client/dist/`）：
  - `dist/repro-timeline.html` —— 单卡量化测量
  - `dist/repro-compare.html` —— 修复前/后并排对照

### 6.2 视觉保真

- 修复前/后同页并排截图逐元素比对（第 3.1 节表格），要求**既有元素零位移**。

### 6.3 文案与宽度矩阵

- 中文 / English 两种文案 × 320 / 375 / 572 / 768 / 1080px 五档宽度，共 10 组，均需无溢出无重叠。
- 英文尤其重要：`Go to class` 按钮比「去上课」宽 31px，是现象 2 的真实触发器。

### 6.4 CI

```bash
cd apps/client
npm run typecheck     # vue-tsc --noEmit
npm run test          # vitest run（含新增契约 spec 与既有 Dashboard.spec.ts）
npm run build         # vite build
```

---

## 7. 回滚方案

单文件模板改动 + 1 个新增 spec，无数据/契约变更：

- 回滚 = `git revert <commit>` 或直接恢复 `Dashboard.html` 到 `4a8c0dc0` 版本；
- 无数据库迁移、无 Rust 改动、无配置变更，回滚无残留副作用；
- 影响面仅首页今日安排卡片的视觉呈现。

---

## 8. 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| 方案 B 改动进行中卡片的 DOM 结构，可能影响其他依赖该结构的样式/测试 | 中 | 已逐元素实测几何零偏移；改后跑 `npm run test` 全量 + 契约 spec |
| 装饰插画叠放层级变化导致视觉细微差异 | 低 | 已实测插画盒 `x283 w243 h104` 完全一致；插画加 `relative z-10` 保持原层级；实现阶段再做像素级前后比对 |
| 契约 spec 断言的是实现写法，未来重构会误报 | 低 | 断言聚焦「`min-w-0` / `truncate` 是否在位」这类不变量，不断言具体 class 顺序 |
| 窄屏（320px）下英文按钮占宽较大，课名可用宽度偏小 | 低 | 导轨内容自适应，课名在剩余空间内截断，不会溢出；属可接受降级 |

---

## 9. 任务拆分

| # | 任务 | 依赖 | 验证 |
|---|---|---|---|
| T1 | 已完成 / 未开始行补 `min-w-0`（`:191`、`:241`） | — | 复现页：徽标回到卡片内、行无溢出 |
| T2 | 进行中卡片结构修复（`:202`/`:212`/`:216`/`:220` + 插画移位） | — | 复现页：重叠 0、几何零偏移 |
| T3 | 新增布局契约 spec | T1、T2 | `npm run test` 通过；故意删 `min-w-0` 时 spec 变红 |
| T4 | 中英 × 五档宽度矩阵量化验证 | T1、T2 | 10 组全绿 |
| T5 | `typecheck` + 全量 `test` + `build` | T1–T3 | 三条命令全通过 |
| T6 | 提交 + 开 PR（body 关联 #1011） | T1–T5 | CI `PR Gate` 绿 |

> T1 与 T2 无依赖，可并行改同一文件的不同区块；T3 起串行。
