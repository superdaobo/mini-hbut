# CSS Bundle Size 基线记录

## 测量信息

| 项目 | 值 |
|------|-----|
| **测量日期** | 2026-05-16 |
| **项目版本** | v1.3.6 |
| **构建工具** | Vite 5.4.21 |
| **构建命令** | `npm run build` (production mode) |
| **Tailwind CSS** | v3.4.19 |
| **测量阶段** | Tailwind + shadcn-vue 集成后，组件迁移进行中 |

## 总量汇总

| 指标 | 值 |
|------|-----|
| **总 CSS Bundle Size (未压缩)** | **380,608 bytes (371.69 KB)** |
| **CSS 文件数量** | 34 |
| **150% 阈值** | **570,912 bytes (557.53 KB)** |

> ⚠️ 迁移期间，CSS bundle 总大小不得超过 **570,912 bytes (557.53 KB)**。
> 迁移完成后（移除所有遗留 CSS），CSS bundle 应小于或等于基线值 380,608 bytes。

## 各文件明细

| 文件名 | 大小 (bytes) | 大小 (KB) | 说明 |
|--------|-------------|-----------|------|
| index-BqZgKujV.css | 65,754 | 64.21 | 主入口 (legacy CSS + Tailwind base/utilities + shadcn-vue 主题变量) |
| Dashboard-CN74vbxo.css | 28,966 | 28.29 | 首页组件样式 |
| ScheduleView-qI1Y3QBT.css | 28,430 | 27.76 | 课表页样式 |
| SettingsView-CYfvCriu.css | 17,663 | 17.25 | 设置页样式 |
| CourseSelectionView-DqdfQ-sV.css | 16,625 | 16.24 | 选课页样式 |
| GradeView-B08o8v2G.css | 16,235 | 15.86 | 成绩页样式 |
| MeView-CzmSsSsY.css | 15,446 | 15.08 | 个人中心样式 |
| MoreChaoxingCheckinView-CtZ-rfvt.css | 14,715 | 14.37 | 超星签到样式 |
| NotificationView-Dq24LVoZ.css | 13,508 | 13.19 | 通知页样式 |
| GlobalScheduleView-3AvJSmFq.css | 12,878 | 12.58 | 全局课表样式 |
| AiChatView-DbkB1yzc.css | 12,701 | 12.40 | AI 聊天样式 |
| OnlineLearningYuketangView-BlaIJrGe.css | 12,217 | 11.93 | 雨课堂样式 |
| OnlineLearningChaoxingView-DRhxYuB7.css | 11,900 | 11.62 | 超星学习样式 |
| ResourceShareView-BC16Ds08.css | 11,667 | 11.39 | 资源分享样式 |
| ExportCenterView-CvuencSH.css | 9,126 | 8.91 | 导出中心样式 |
| LibraryView-4SbLYEsF.css | 9,002 | 8.79 | 图书馆样式 |
| StudentInfoView-uFpOdexl.css | 8,661 | 8.46 | 学生信息样式 |
| ClassroomView-DTitJW2m.css | 7,082 | 6.92 | 空教室样式 |
| RankingView-nvIRW3Sx.css | 6,519 | 6.37 | 排名页样式 |
| AcademicProgressView-CVeKQiE9.css | 6,394 | 6.24 | 学业进度样式 |
| CampusCodeView-CtObu_Hu.css | 5,856 | 5.72 | 校园码样式 |
| CampusMapView-D92u0m8K.css | 5,116 | 5.00 | 校园地图样式 |
| MoreShuakeView-JaoJgZ8U.css | 4,928 | 4.81 | 刷课样式 |
| ElectricityView-NNp6A3me.css | 4,839 | 4.73 | 电费查询样式 |
| ExamView-8iMn6sQ4.css | 4,762 | 4.65 | 考试安排样式 |
| MoreView-x9ygWAw7.css | 4,686 | 4.58 | 更多功能样式 |
| TrainingPlanView-CuViCmWA.css | 4,538 | 4.43 | 培养方案样式 |
| TransactionHistory-C7nmyk5o.css | 4,316 | 4.22 | 交易记录样式 |
| FeedbackView-BXxshZlK.css | 3,873 | 3.78 | 反馈页样式 |
| CalendarView-lkpoZo8X.css | 3,739 | 3.65 | 校历页样式 |
| MoreModuleHostView-CKtHfkSg.css | 3,079 | 3.01 | 模块宿主样式 |
| ConfigEditor-DRiIJfR_.css | 2,758 | 2.69 | 配置编辑器样式 |
| OfficialView-C0LUJ7NJ.css | 1,388 | 1.36 | 官方页样式 |
| layout_collision_fx-Da9aSOfv.css | 1,241 | 1.21 | 布局碰撞特效样式 |

## Tailwind Purge 验证

### 验证结果：✅ Purge 正常工作

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 未使用的 `.prose` 类 | ❌ 未包含 | 正确排除 |
| 未使用的 `.animate-ping` 类 | ❌ 未包含 | 正确排除 |
| 未使用的 `.animate-bounce` 类 | ❌ 未包含 | 正确排除 |
| 未使用的 `.skew-*` 类 | ❌ 未包含 | 正确排除 |
| 未使用的 `.backdrop-blur` 类 | ❌ 未包含 | 正确排除 |
| 已使用的 `.flex` 类 | ✅ 已包含 | 正确保留 |
| 已使用的 `.rounded` 类 | ✅ 已包含 | 正确保留 |
| 已使用的 `.border` 类 | ✅ 已包含 | 正确保留 |
| 已使用的 `.bg-*` 类 | ✅ 已包含 | 正确保留 |
| 已使用的 `.text-*` 类 | ✅ 已包含 | 正确保留 |
| 已使用的 `.dark` 选择器 | ✅ 已包含 | 正确保留 |
| `@layer` 声明 | ✅ 存在 (3处) | CSS Layer 隔离正常 |

### 说明

- Tailwind CSS 的 `content` 配置扫描 `./index.html` 和 `./src/**/*.{vue,js,ts,jsx,tsx}`
- 仅生成项目中实际使用的工具类
- CSS 自定义属性声明（`--tw-backdrop-hue-rotate` 等）属于 Tailwind base 层的正常重置，不是未使用的工具类

## Bundle 组成说明

当前 CSS bundle 包含以下内容：

1. **Legacy CSS** (`@layer legacy`)
   - `style.css` — 原有全局样式 + CSS 变量
   - `ui_ux_pro_max.css` — 原有 UI 增强样式（含 !important 声明）

2. **Tailwind CSS** (`@layer tailwind`)
   - `@tailwind base` — 重置 + CSS 自定义属性声明
   - `@tailwind components` — 组件层（当前为空）
   - `@tailwind utilities` — 已使用的工具类

3. **shadcn-vue 主题变量** (`@layer base`)
   - `:root` 和 `.dark` 下的 HSL 颜色自定义属性
   - `--radius` 等布局令牌

4. **组件级 scoped CSS**
   - 各 View 组件的 `<style scoped>` 样式（按 Vite code-splitting 分割为独立 chunk）

## 迁移阈值规则

| 阶段 | 规则 | 阈值 |
|------|------|------|
| 迁移进行中（新旧共存） | 总 CSS ≤ 基线 × 150% | ≤ 570,912 bytes (557.53 KB) |
| 迁移完成（移除遗留 CSS） | 总 CSS ≤ 基线 | ≤ 380,608 bytes (371.69 KB) |

## 后续操作

- 每次 PR 合并前运行 `npm run build` 并检查 CSS 总大小
- 如超过 150% 阈值，需排查是否有未 purge 的 Tailwind 类或重复样式
- 组件迁移完成后逐步移除 legacy CSS 文件，最终 bundle 应小于基线
