# Mini-HBUT v1.4.0 更新说明

发布日期：2026-05-25

---

## 🎯 新功能

### 💬 校园论坛

- **广场**：支持按分类（校园广场 / 学习互助 / 生活服务 / 软件反馈）浏览帖子，热门帖子优先展示
- **发帖**：支持 Markdown 编辑，可上传图片附件
- **投票**：管理员可发起投票，用户参与打分
- **通知**：回复、点赞、系统通知实时推送
- **个人中心**：查看/编辑个人资料、我的帖子、我的回复、我的收藏
- **管理后台**：举报处理、用户管理、封禁管理、徽章授予、数据备份
- 论坛身份随学生账号自动切换
- 头像上传支持图片托管服务
- 前端 API 缓存层，减少重复请求

### 📱 学习通签到助手

- 支持**普通签到**、**位置签到**、**拍照签到**、**二维码签到**、**手势签到**五种模式
- 二维码签到支持屏幕选区和实时解码（rqrr 库）
- 签到活动列表与历史记录查询
- 会话状态横幅实时显示
- Tauri 后端完整实现协议层、拦截器、飞行中任务管理、日志记录
- 桌面端支持屏幕截图（xcap）与二维码识别

### 🌤️ 天气查询

- 调用 Open-Meteo 免费 API 获取湖北工业大学实时天气
- 显示当前温度、天气状况、湿度、风力、AQI
- 提供未来 3 天天气预报 + 未来 24 小时逐时预报
- 温度柱状图可视化（预报温度范围和颜色驱动）
- 天气图标色调柔和化处理
- 内置 5 分钟缓存，避免频繁请求

### 🎮 小游戏模块中心

- **更多**页面全新模块中心架构，支持远程配置动态管理游戏列表
- **跳出湖工大**：3D 跳一跳风格校园跳跃游戏（Vue 3 + Three.js）
  - 13 种湖工大建筑物 3D 建模（图书馆、工科楼、体育馆、南门、北门、食堂、教学楼、实验楼、行政楼、活动中心、宿舍、地铁站、南湖桥）
  - 蓄力跳跃系统 + 连击倍率 + 完美着陆判定
  - 排行榜（班级 / 全校）
  - 自适应性能降级（低帧率自动关闭阴影/粒子）
  - 相机跟随 + 3D 校园场景
- **湖工五子棋**：支持单机人机对战和在线双人对战，排行榜
- **湖工记忆牌**：记忆翻牌小游戏，关卡进阶玩法
- **湖工矿工**：矿工挖掘小游戏，关卡规则重做
- **湖工大富翁**：校园大富翁玩法重做，进阶规则
- **2048 湖工大版**：经典数字合并游戏
- **笨鸟先飞**：Flappy Bird 风格，优化游戏体验
- **合成湖工大**：合成类小游戏
- 各游戏模块在移动端 iframe 中稳定运行
- stale remote config 下游戏模块仍可见

### 🎨 全新设计系统

- 引入 **Tailwind CSS** + **shadcn-vue** 组件库，统一 UI 风格
- 新增 80+ 个 UI 组件（Button、Card、Dialog、DropdownMenu、Select、Sheet、Tabs、Avatar、Badge、Input、ScrollArea、Separator、Sonner 等）
- **CSS 设计令牌系统**（design-tokens.ts）：主题色、圆角、字体、间距、动效统一管理
- 渐变背景 + 毛玻璃效果
- **深色模式**完整支持（dark-mode.css，1857 行样式）
- Material Symbols 图标字体（替代 Emoji 图标），提供更专业的视觉效果
- Font Awesome 7 图标库集成
- MiSans / HarmonyOS Sans SC 等现代中文字体栈

### 📚 网站文档系统

- 全新的开发者文档站点（React 构建）
- 覆盖 15 个文档板块：快速开始、用户指南、校园生活、教务服务、社区通知、模块系统、扩展开发、设置数据、架构与数据流、Tauri 平台、构建发布、安全隐私、开发者概述、故障排除、参考索引
- 文档搜索与导航功能
- 文档内容自动化测试脚本

### 🔔 桌面原生通知增强

- Windows 平台使用 `notify-rust` 发送原生通知，支持 AppUserModelID
- 通知支持 ID、channel、target_view 等完整参数
- 新增 `send_local_notification_native` Tauri 命令
- 通知点击可跳转到指定页面

---

## 🛠️ 优化与修复

### iOS 端

- **底部导航栏安全区修复**（多次迭代）：消除安全区双重计入导致的导航栏突出，锚定到视口底部
- **Edge-to-Edge WebView**：新增 `EdgeToEdgeBridgeViewController`，patch 脚本自动注入
- 恢复底部导航栏 v1.3.6 基线实现，导航栏上下内边距对称
- 修复 iOS 底部 Tab 安全区圆角显示

### Android 端

- 修复 Android 构建命令 `--target` 语法错误
- 移除 Android 构建中无效的 `--apk` 标志
- Widget 资源复制加入缺失的 `colors` 和 `drawable` 文件
- 小组件布局优化（电费/考试/课程行间距调整）

### 更新下载

- 下载源列表重新排序
- 移除官方更新下载源
- 更新弹窗交互优化

### 游戏模块优化

- 笨鸟先飞：修复竖屏缩放问题
- 跳出湖工大：跳跃物理和落点判定稳定化
- 游戏模块在移动端 iframe 中稳定性修复
- 合成湖工大模块：添加空 postcss.config.js 修复网站构建
- stale remote config 下游戏模块可见性修复

### 前端框架升级

- 新增 `@vueuse/core` 工具库
- 新增 `vue-sonner` Toast 通知组件
- 新增 `reka-ui` 无头 UI 组件库
- 新增 `class-variance-authority` + `clsx` + `tailwind-merge` 样式工具链

### 通知页面

- 大量重构优化，关键信息色彩增强

---

## 🏗️ 工程改进

- **测试基础设施大幅增强**：新增 80+ 个单元测试文件
  - `src/utils/forum_api.spec.ts`：论坛 API 契约测试
  - `src/utils/forum_cache.spec.ts`：论坛缓存测试
  - `src/utils/forum_view_identity_contract.spec.ts`：论坛身份切换测试
  - `src/utils/theme-bridge.spec.ts`：主题桥接测试
  - `src/utils/weather_visuals.spec.ts`：天气可视化测试
  - `src/utils/updater_download_sources.spec.ts`：下载源测试
  - `src/platform/adapters/*.spec.ts`：平台适配器测试
  - `src/styles/bottom_tab_bar_safe_area.spec.ts`：底部安全区测试
  - `src/styles/home_dashboard_contract.spec.ts`：首页合约测试
  - 各游戏核心规则红灯测试
  - 游戏模块合约测试
- **Rust 端测试增强**：引入 `proptest` 属性测试、`wiremock` HTTP mock、`tempfile` 临时文件
- **Clippy lint 规则**：`unwrap_used = "warn"`、`expect_used = "warn"`
- **新增工程脚本**：
  - `scripts/build_font_subset.mjs`：字体子集构建
  - `scripts/check-design-tokens.mjs`：设计令牌检查
  - `scripts/check-frontend-safety.mjs`：前端安全检查
  - `scripts/patch_tauri_ios_edge_to_edge.mjs`：iOS Edge-to-Edge 自动注入
  - `scripts/test-docs-developer-content.mjs`：文档内容测试
  - `scripts/test-docs-ia.mjs`：文档信息架构测试
  - `scripts/test-docs-user-content.mjs`：文档用户内容测试
- **CI/CD 优化**：GitHub Actions 多个 workflow 更新
- `remote_config.json` 扩展：新增 `module_center` 配置节
- `capacitor-plugin-mini-hbut-widget` 插件更新（Widget 数据存储、刷新调度增强）
- `build_android_apk.py` 新增，支持自动化 Android APK 构建
- 新工具模块：`src-tauri/src/utils/mask.rs`（数据脱敏）、`src-tauri/src/utils/truncate.rs`（文本截断）
- 前端工具模块：`home_search.js`（首页搜索）、`module_center.js`（模块中心）、`night_mode.ts`（夜间模式）、`theme-bridge.ts`（主题桥接）、`ui_settings.ts`（UI 设置）

---

## 📦 文件变更统计

- 733 个文件变更
- +97,592 行新增 / -7,453 行删除
- 核心源码（src/、src-tauri/src/、website/src/）：232 个文件，+30,412 行 / -6,571 行
