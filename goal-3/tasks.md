# 任务清单

## Task 1: 建立测试基线与当前状态快照

- [x] 状态：已完成
- [x] 读取 `goal-3/input.md`、`goal-3/plan.md`、`goal-3/tasks.md`
- [x] 检查 git 状态，确认不覆盖已有用户改动
- [x] 为 `hbut_miner`、`hbut_memory_match`、`hbut_monopoly`、`clumsy_bird_hbut` 确认测试命令或补最小测试配置
- [x] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：创建 `goal-3` 目标文件；为四个重点小游戏补充 `npm test` 脚本，复用根目录已有 Vitest，不安装依赖、不更新锁文件；确认当前未提交改动中 `src/components/Dashboard.vue` 和 `website/public/modules/*` 属于既有工作，未回退或覆盖。
- 验证结果：分别在 `hbut_miner`、`hbut_memory_match`、`hbut_monopoly`、`clumsy_bird_hbut` 的 `project` 目录运行 `npm test`，四个命令均以退出码 0 完成；当前没有测试文件，Vitest 输出 `No test files found, exiting with code 0`。
- 剩余风险：Task 1 只建立测试入口，没有验证业务规则；后续任务必须先写失败测试再改玩法。
- 下一步：Task 2 编写湖工矿工核心规则失败测试，覆盖关卡、钩长、底部命中、道具和过关推进。

## Task 2: 湖工矿工核心规则测试

- [x] 状态：已完成
- [x] 写失败测试覆盖关卡初始化、钩长覆盖最深物品、底部物品命中、道具效果和过关推进
- [x] 运行测试确认失败原因正确
- [x] 不改 UI，仅锁定核心规则接口
- [x] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：新增 `website/modules-src/hbut_miner/project/src/game/miner.test.js`，用 Vitest 锁定矿工下一步需要实现的规则接口：`LEVELS` 多关卡配置、按关卡初始化、动态钩长覆盖最深物品、底部中心物品命中、`applyMinerItemEffect` 道具效果、达成本关目标后进入下一关。
- 验证结果：在 `website/modules-src/hbut_miner/project` 运行 `npm test`，退出码 1；5 个测试中 1 个通过、4 个失败。失败原因符合预期：`miner.LEVELS` 未导出、`applyMinerItemEffect` 未实现、当前规则没有关卡推进。
- 剩余风险：测试当前处于红灯状态，这是 Task 2 的预期产物；仓库在 Task 3 前会暂时保留矿工测试失败。
- 下一步：Task 3 实现 `LEVELS`、动态钩长、新物品效果和关卡推进，并让矿工测试转绿。

## Task 3: 湖工矿工多关卡与钩长修复

- [x] 状态：已完成
- [x] 实现 `LEVELS`、动态 `hook.maxLength`、新物品类型和过关推进
- [x] 更新矿工 UI 显示关卡、目标、时间、道具反馈
- [x] 运行矿工测试和构建
- [x] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：将湖工矿工规则改为 `LEVELS` 驱动，新增 4 个关卡、多种新物品、负分障碍、加时、倍率和长钩道具；默认钩长按当前关卡最深物品动态计算，修复底部宝物不可达；回收达标后进入下一关，最后一关才通关。同步更新页面显示关卡、目标、时间、剩余宝物、关卡名和道具/障碍颜色，并收紧竖屏布局。
- 验证结果：先运行矿工测试确认红灯，5 个测试中 4 个失败，失败原因是缺少 `LEVELS`、`applyMinerItemEffect` 和关卡推进；实现后在 `website/modules-src/hbut_miner/project` 运行 `npm test`，退出码 0，`src/game/miner.test.js` 5/5 通过；运行 `npm run build`，退出码 0，Vite 构建成功；运行 `git diff --check -- website/modules-src/hbut_miner/project/src/game/miner.js website/modules-src/hbut_miner/project/src/main.js website/modules-src/hbut_miner/project/src/style.css goal-3/tasks.md`，退出码 0，仅有 Windows 换行提示；只读复核子代理未发现规格或明显质量问题。
- 剩余风险：浏览器自动化工具当前被已有实例锁定，Task 3 未完成截图级移动端 UI 验收；代码已做竖屏布局和构建验证，后续大型全面检查-debug 循环 A 需要补 360x740、390x844、430x932 视口检查。
- 下一步：执行大型全面检查-debug 循环 A，集中检查 Task 1-3 的矿工测试、构建、UI/UX、数据一致性、安全性和回滚风险。

## 大型全面检查-debug 循环 A（完成 Task 1-3 后执行）

- [x] 状态：已完成
- [x] 检查需求是否偏离
- [x] 检查矿工构建、测试、UI、数据一致性、安全和回滚
- [x] 修复发现的问题并记录证据

记录：
- 检查内容：复核 Task 1-3 是否仍围绕矿工规则与页面优化，没有提前改动记忆牌、大富翁、笨鸟或棋类任务；检查四个重点小游戏的 `npm test` 入口、矿工规则测试、矿工构建、`git diff --check`、矿工竖屏 UI 指标、工作区边界、安全和回滚策略。
- 修复内容：检查过程中发现 Vite 启动矿工模块会在模块目录留下未跟踪的 `vite.config.js.timestamp-*.mjs` 临时文件，污染 `git status`。已在根 `.gitignore` 增加 `vite.config.js.timestamp-*.mjs` 忽略规则，不删除用户文件、不改生产配置。
- 验证结果：在四个模块目录串行运行 `npm test`：`hbut_miner` 退出码 0，`src/game/miner.test.js` 5/5 通过；`hbut_memory_match`、`hbut_monopoly`、`clumsy_bird_hbut` 退出码 0，保持空测试基线可运行。`hbut_miner` 运行 `npm run build` 退出码 0，Vite 构建成功。`git diff --check` 针对 Task 1-3 相关文件退出码 0。使用 Chrome DevTools 移动端模拟验收矿工页面：360x740、390x844、430x932 三个竖屏视口均无横向滚动，发射按钮在可视区，画布宽高均超过 300px，文本溢出候选为空；对应画布尺寸约为 338.7x334.5、368.7x488.3、408.7x572.3。停止本地 Vite 服务后，`curl.exe -I http://127.0.0.1:5187/` 连接失败，确认没有保留开发服务。
- 剩余风险：Task A 只检查 Task 1-3；记忆牌、大富翁、笨鸟和棋类/多人在线仍按后续任务推进。矿工 UI 已通过 DOM 指标验收，但未保留截图文件到仓库；后续最终 review 可按需要再做可视化截图归档。

## Task 4: 湖工记忆牌核心规则测试

- [x] 状态：已完成
- [x] 写失败测试覆盖关卡、倒计时、评分、连击、错配惩罚、预览结束
- [x] 运行测试确认失败原因正确
- [x] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：新增 `website/modules-src/hbut_memory_match/project/src/game/memory.test.js`，用 Vitest 锁定湖工记忆牌下一步需要实现的核心规则接口：`MEMORY_LEVELS` 多关卡配置、按关卡初始化牌数/时间/预览/评分状态、预览结束隐藏卡牌、正式倒计时失败、连击加分、错配惩罚和下一次翻牌前盖回错配牌。
- 验证结果：在 `website/modules-src/hbut_memory_match/project` 运行 `npm test`，退出码 1；`src/game/memory.test.js` 5/5 失败。失败原因符合预期：当前实现未导出 `MEMORY_LEVELS`，没有预览全亮/隐藏流程，没有正式倒计时失败逻辑，没有 `combo` 和 `mistakes` 等评分字段。
- 剩余风险：测试当前处于红灯状态，这是 Task 4 的预期产物；仓库在 Task 5 前会暂时保留记忆牌测试失败。
- 下一步：Task 5 实现记忆牌关卡、倒计时、评分、连击、错配惩罚和竖屏 UI，并让记忆牌测试转绿。

## Task 5: 湖工记忆牌玩法重做与竖屏 UI

- [x] 状态：已完成
- [x] 实现关卡推进、倒计时、评分、连击、错配惩罚和中高难度少提示卡面
- [x] 优化竖屏牌桌、指标栏、日志/结果展示
- [x] 运行记忆牌测试和构建
- [x] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：将湖工记忆牌重做为 `MEMORY_LEVELS` 驱动的 4 关限时挑战，新增预览倒计时、正式倒计时失败、得分、连击奖励、错配惩罚、关卡推进和最终通关奖励；中高难度分别收紧为分类线索和隐藏线索。同步更新页面指标栏、关卡标题、倒计时、得分、连击/错配、日志和竖屏 4 列牌桌，保证 3/4/6/8 组牌都能在竖屏内可玩。
- 验证结果：先为“完成非最终关进入下一关预览”补红灯测试，`npm test` 6/6 失败且原因符合缺少规则；实现后在 `website/modules-src/hbut_memory_match/project` 运行 `npm test`，退出码 0，`src/game/memory.test.js` 6/6 通过。运行 `npm run build`，退出码 0，Vite 构建成功。运行 `git diff --check -- goal-3/tasks.md website/modules-src/hbut_memory_match/project/src/game/memory.js website/modules-src/hbut_memory_match/project/src/game/memory.test.js website/modules-src/hbut_memory_match/project/src/main.js website/modules-src/hbut_memory_match/project/src/style.css`，退出码 0。使用 Playwright 验收 360x740、390x844、430x932：三档首关均无横向滚动，按钮在可视区，文本溢出候选为空，预览结束后牌面隐藏且卡牌可点击；390x844 下推进到第 4 关 16 张牌时仍无横向滚动，单牌约 83x110，按钮在可视区。停止本地 Vite 服务后，`curl.exe -I http://127.0.0.1:5192/ --max-time 1` 连接超时，确认没有保留本轮开发服务。
- 剩余风险：本轮已做 DOM 指标级移动端验收，没有把截图文件纳入仓库；真实 Tauri 宿主内嵌高度同步可在后续大型全面检查-debug 循环 B 或最终 review 再复测。记忆牌只改模块源码，尚未同步发布到 `website/public/modules/*`。
- 下一步：Task 6 编写湖工大富翁核心规则红灯测试，覆盖精力/压力、事件选择、卡牌效果、阶段目标、资源边界和胜负。

## Task 6: 湖工大富翁核心规则测试

- [x] 状态：已完成
- [x] 写失败测试覆盖精力/压力、事件选择、卡牌效果、阶段目标、资源边界和胜负
- [x] 运行测试确认失败原因正确
- [x] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：新增 `website/modules-src/hbut_monopoly/project/src/game/monopoly.test.js`，用 Vitest 锁定湖工大富翁下一步需要实现的进阶规则契约：`MONOPOLY_STAGES` 多阶段目标、按阶段初始化精力/压力/影响力目标、骰子回合资源边界、事件选择分支、行动卡牌效果、阶段推进和失败判定。
- 验证结果：在 `website/modules-src/hbut_monopoly/project` 运行 `npm test`，退出码 1；`src/game/monopoly.test.js` 5/5 失败。失败原因符合预期：当前实现未导出 `MONOPOLY_STAGES`，没有 `energy` / `stress` 资源字段，没有 `applyEventChoice`、`applyActionCard` 和 `resolveStageProgress` 等进阶玩法接口。
- 剩余风险：测试当前处于红灯状态，这是 Task 6 的预期产物；仓库在 Task 7 前会暂时保留大富翁测试失败。
- 下一步：执行大型全面检查-debug 循环 B，集中检查 Task 4-6 的记忆牌与大富翁规则测试、构建、UI/UX、安全、文档同步和回滚风险。

## 大型全面检查-debug 循环 B（完成 Task 4-6 后执行）

- [x] 状态：已完成
- [x] 检查记忆牌与大富翁规则是否符合计划
- [x] 检查构建、测试、UI/UX、安全、文档同步和回滚
- [x] 修复发现的问题并记录证据

记录：
- 检查内容：复核 Task 4-6 是否仍围绕记忆牌与大富翁规则测试和页面优化，没有提前实现 Task 7 的大富翁生产玩法，也没有扩大到笨鸟、棋类或多人在线。检查范围包括记忆牌绿灯测试与构建、大富翁红灯测试与构建、两个页面的 360x740 / 390x844 / 430x932 竖屏 UI 指标、工作区边界、安全和回滚策略。
- 修复内容：本轮未发现必须修改的代码问题；未改生产配置、密钥、认证、支付或发布目录。仅补充本检查记录。
- 验证结果：`hbut_memory_match/project` 运行 `npm test` 退出码 0，`src/game/memory.test.js` 6/6 通过；运行 `npm run build` 退出码 0。`hbut_monopoly/project` 运行 `npm test` 退出码 1，`src/game/monopoly.test.js` 5/5 失败，失败原因符合 Task 6 预期：缺少 `MONOPOLY_STAGES`、`energy` / `stress`、`applyEventChoice`、`applyActionCard`、`resolveStageProgress`；运行 `npm run build` 退出码 0。使用 Playwright 检查记忆牌构建预览：360x740、390x844、430x932 均无横向滚动，按钮在可视区，文本溢出候选为空，牌桌尺寸分别约 327x391、353x495、393x583。使用 Playwright 检查大富翁构建预览：360x740、390x844、430x932 均无横向滚动，投骰和重开按钮在可视区，文本溢出候选为空，棋盘尺寸分别约 315x334、345x434、385x540。停止本地预览服务后，`curl.exe -I http://127.0.0.1:5193/ --max-time 1` 和 `curl.exe -I http://127.0.0.1:5194/ --max-time 1` 均连接超时，确认没有保留本轮预览服务。
- 剩余风险：大富翁红灯测试是预期状态，需要 Task 7 实现生产玩法后转绿；记忆牌和大富翁当前只检查模块源码与构建产物，尚未同步发布到 `website/public/modules/*`，真实 Tauri 宿主内嵌高度同步留到后续最终 review 或发布同步阶段复测。

## Task 7: 湖工大富翁玩法重做与竖屏 UI

- [ ] 状态：未完成
- [ ] 实现回合选择、精力/压力、事件池、卡牌/道具、阶段目标和据点投资
- [ ] 优化移动端棋盘/路径、事件卡和结果反馈
- [ ] 运行大富翁测试和构建
- [ ] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 8: 笨鸟先飞缩放修复与竖屏验收

- [ ] 状态：未完成
- [ ] 写测试或可验证脚本覆盖 Canvas 尺寸策略
- [ ] 修复 Tauri 内嵌时页面过小和双重缩放
- [ ] 优化竖屏画面主体占比
- [ ] 运行构建并做移动端视口验收
- [ ] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 9: 公开多人在线服务调研与选型

- [ ] 状态：未完成
- [ ] 联网查询公开 P2P/实时服务/开源多人游戏框架
- [ ] 比较移动端浏览器兼容性、免费额度、密钥需求、隐私风险、服务稳定性
- [ ] 选定默认方案和降级方案
- [ ] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：
- 验证结果：
- 剩余风险：
- 下一步：

## 大型全面检查-debug 循环 C（完成 Task 7-9 后执行）

- [ ] 状态：未完成
- [ ] 检查前三个游戏和笨鸟修复是否与计划一致
- [ ] 检查在线服务选型是否安全可落地
- [ ] 检查构建、测试、UI/UX、安全、数据一致性、文档和回滚
- [ ] 修复发现的问题并记录证据

记录：
- 检查内容：
- 修复内容：
- 验证结果：
- 剩余风险：

## Task 10: 新增湖工五子棋单机模块

- [ ] 状态：未完成
- [ ] 新建 `website/modules-src/hbut_gomoku`
- [ ] 实现移动端优先的五子棋棋盘、落子、胜负判断、重开和本地双人模式
- [ ] 添加核心规则测试和构建
- [ ] 注册模块 manifest/catalog 所需源配置
- [ ] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 11: 五子棋多人在线对战

- [ ] 状态：未完成
- [ ] 接入 Task 9 选定的默认在线方案
- [ ] 实现房间创建、加入、同步落子、断线提示、冲突/重复消息处理
- [ ] 保留本地单机和本地双人降级模式
- [ ] 运行规则测试、联机双标签页验收和构建
- [ ] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 12: 全量最终 review、构建与验收

- [ ] 状态：未完成
- [ ] 从 C 端体验、代码质量、安全、数据一致性、权限、错误处理、测试、构建、文档、回滚全面检查
- [ ] 运行所有涉及模块构建
- [ ] 使用移动端视口验收关键页面
- [ ] 修复已知高风险问题
- [ ] 标记 goal 完成

记录：
- 完成内容：
- 验证结果：
- 剩余风险：
- 下一步：
