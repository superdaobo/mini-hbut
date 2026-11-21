## TL;DR

修复三个 P0 可用性缺陷（生产 CSP 拦截腾讯地图 key 校验 / Release 不启 4399 本地桥 / 校园助手把上游软错误当正文），修掉移动端定位失准（Android 无定位权限 + 坐标未转 GCJ-02，实测偏 589 m），把「校园地图（照片版）」与「校园导览（腾讯版）」拆成两个独立模块，并重做校园导览与小塔出行的前端。

Closes #1375
Closes #1367
Closes #1368
Closes #1369
Closes #1370
Closes #1371
Closes #1372
Closes #1373
Closes #1374

## 各 Sub Issue 完成情况

| Issue | 内容 | 关键证据 |
|---|---|---|
| #1367 | CSP 放行 `apikey.map.qq.com` | 契约 5/5；headless 实测 apikey 从 BLOCKED 变放行 |
| #1368 | Release 启用 4399 桥 | `cargo check` 通过；18 前端测试；Android 编入 bridge |
| #1369 | 校园助手软错误识别 | `cargo test ai::tests` 4/4；spec 5/5 |
| #1370 | 定位权限 + 坐标纠偏 | 注入脚本幂等实测；坐标 15+37 测试 |
| #1371 | 照片版校园地图 | 组件 6/6；UI 全 token 化 |
| #1372 | 模块拆分 | typecheck 0 错误；50/50；三语 i18n |
| #1373 | 校园导览重设计 | 35 测试；三档截图无溢出 |
| #1374 | 小塔出行拆分 | 965 → 248 行；26 测试 |

## 关键决策

1. **Android Release 编入 bridge** —— 发现 `mobile-slim` 不含 `bridge`，桥根本不编译进 APK，只改开关函数对 Android 无效。改为 `mobile-slim+bridge`，统一三端；安全面靠既有 loopback 绑定 + 主窗口令牌 + CORS 白名单守住。
2. **扩展既有 `--ui-*` token 体系**，不新建第二套 —— `index.css` 已有含缩放系数、中文字体栈、动效曲线的成熟体系，比 design-system 通用模板更贴合。
3. **自写非模态三档抽屉** —— 现成 `ui/sheet` 基于 reka-ui Dialog 是模态的（全屏遮罩），会把地图盖住。
4. **App.vue 用动态 component 合并两个视图分支** —— 把行数从 806 压回 797（基线 799，god-files 上限 800），消除本次引入的规模违规。

## 顺带修的使用体验问题

- **公告弹窗窄屏溢出**：远程 `v-html` 长链接没有换行约束，375px 下把卡片撑破、「我已知晓」被挤出视口
- **小塔副标题 `[object Object]`**：塔接口 `msg` 偶尔是嵌套对象，被直接塞进 `mapErrors`
- **暗色白块**：`map-theme.css` 5 处硬编码浅色只被 `prefers-color-scheme` 兜底、不被 `html.dark` 覆盖，在「手动暗色 + 系统浅色」下全变白块
- **电量角标不可读**：`html.dark .towergo-view em` 把绿/红底角标压成浅蓝

## 验证

| 项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 0 错误 |
| `npx vitest run` | 410 spec / 4380 tests，仅 2 个基线失败 |
| `cargo check --features mobile-full,bridge` | ✅ |
| `cargo test --lib` | 885 passed / 0 failed |
| `cargo clippy --lib` | ✅ exit 0 |
| `check:all` | 前 10 步全过，第 11 步因基线 spec 中断 |
| 三页三档截图 | 9 张，`scrollWidth == 视口宽`，溢出元素全空 |

**两个基线失败**（非本次引入，主仓库 HEAD 原样复现）：
- `ios_deep_link_scheme_patch.spec.ts` —— Node 24 本地解析怪癖，CI 用 Node 22
- `bottom_tab_bar_safe_area.spec.ts` —— 需预构建 `dist/index.html`

## 未完成 / 需人工确认

- **真机验证（T17）**：Android 权限弹窗、定位精度 < 50 m、三页地图渲染 —— 需要真机，本地无法完成。建议装 APK 后按 `goal-22/tasks.md` T17 清单逐项过。
- 腾讯地图底图本身两主题都是亮色（要真变暗需调 SDK `mapStyleId`），属功能改动，本轮未做。
- 技术债：`html.dark .towergo-view em` 规则过宽，正确修法是收窄为 `.tg-tabs button em` 并恢复模板 `<em>`；本轮选择绕开而非改 3915 行全局补丁。

## 回滚

每个 Task 独立 commit，可按 commit 粒度回滚：
- `3a15514a` P0 修复 + 模块拆分
- `7fba7484` 设计 token + 抽屉
- `7e8bea5b` 三页重设计
- `d6c7ce1c` 暗色 + 体验修复
- `bf4002cc` cargo fmt + 清理
- `d4965052` 验收截图

CSP 与桥两处是单点改动，可单独 revert。
