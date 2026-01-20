# 📱 前端源码 (Vue 3)

Mini-HBUT 的前端部分，使用 Vue 3 + TypeScript + Vant UI 构建。

## 📁 目录结构

```
src/
├── components/           # Vue 组件（各功能页面）
├── utils/                # 工具函数
├── assets/               # 静态资源（图片等）
├── styles/               # 全局样式
├── App.vue               # 主应用组件
├── main.ts               # 入口文件
├── style.css             # 全局样式
└── vite-env.d.ts         # TypeScript 类型声明
```

## 🧩 主要组件

| 文件 | 功能 |
|------|------|
| `Login.vue` / `LoginV3.vue` | 登录页面 |
| `Dashboard.vue` | 主页仪表盘 |
| `GradeView.vue` | 成绩查询 |
| `ScheduleView.vue` | 课表查询 |
| `ClassroomView.vue` | 空教室查询 |
| `ExamView.vue` | 考试安排 |
| `ElectricityView.vue` | 电费查询 |
| `CalendarView.vue` | 校历 |
| `RankingView.vue` | 排名查询 |
| `TrainingPlanView.vue` | 培养方案 |
| `AcademicProgressView.vue` | 学业进度 |
| `StudentInfoView.vue` | 学生信息 |
| `MeView.vue` | 个人设置 |
| `OfficialView.vue` | 官方发布 |
| `UpdateDialog.vue` | 更新弹窗 |

## 🛠️ 工具函数

| 文件 | 功能 |
|------|------|
| `api.ts` | API 请求封装 |
| `crypto.ts` | 密码加密 |
| `updater.js` | 版本更新检测 |
| `axios_adapter.js` | Axios 适配器 |

## 🎨 UI 框架

- **Vant 4** - 移动端 Vue 组件库
- 支持 Dark Mode
- 响应式设计

## 🔧 开发说明

### 添加新页面

1. 在 `components/` 创建新的 Vue 组件
2. 在 `App.vue` 添加路由/导航
3. 如需后端功能，在 `src-tauri/src/lib.rs` 添加 Tauri 命令

### 调用 Rust 后端

```typescript
import { invoke } from '@tauri-apps/api/core';

// 调用 Tauri 命令
const result = await invoke('command_name', { param1: value1 });
```

### 样式规范

- 使用 CSS Variables 支持主题切换
- 移动端优先设计
- 避免硬编码颜色值
