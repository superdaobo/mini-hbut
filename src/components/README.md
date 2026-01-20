# 🧩 Vue 组件

Mini-HBUT 的所有页面组件。

## 📊 功能页面

### 核心功能

| 组件 | 描述 | 依赖的 Tauri 命令 |
|------|------|-------------------|
| `GradeView.vue` | 成绩查询，支持按学期筛选、GPA 计算 | `get_grades_by_term` |
| `ScheduleView.vue` | 课表查询，当前周高亮 | `get_schedule` |
| `ClassroomView.vue` | 空教室查询，按时间段/教学楼筛选 | `get_classrooms` |
| `ExamView.vue` | 考试安排，倒计时提醒 | `get_exams` |
| `CalendarView.vue` | 校历查询，当前周标注 | `get_calendar` |

### 扩展功能

| 组件 | 描述 | 依赖的 Tauri 命令 |
|------|------|-------------------|
| `ElectricityView.vue` | 宿舍电费查询 | `get_electricity` |
| `RankingView.vue` | 班级/专业/年级排名 | `get_ranking` |
| `TrainingPlanView.vue` | 培养方案详情 | `get_training_plan` |
| `AcademicProgressView.vue` | 学业完成进度 | `get_academic_progress` |
| `StudentInfoView.vue` | 学生个人信息 | `get_student_info` |

### 系统页面

| 组件 | 描述 |
|------|------|
| `Login.vue` | 统一身份认证登录 |
| `LoginV3.vue` | V3 版本登录页面 |
| `Dashboard.vue` | 主页仪表盘，功能入口 |
| `MeView.vue` | 个人中心，退出登录等 |
| `OfficialView.vue` | 官方发布公告 (内嵌网页) |
| `UpdateDialog.vue` | 版本更新提示弹窗 |
| `Progress.vue` | 进度条组件 |

### 辅助组件

| 组件 | 描述 |
|------|------|
| `HelloWorld.vue` | 示例组件 (可删除) |
| `AcademicTreeNode.vue` | 学业进度树节点组件 |

## 🔧 开发规范

### 组件模板

```vue
<template>
  <div class="page-container">
    <!-- 页面内容 -->
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';

// 数据
const loading = ref(false);
const data = ref([]);

// 加载数据
const loadData = async () => {
  loading.value = true;
  try {
    data.value = await invoke('command_name');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    loading.value = false;
  }
};

onMounted(loadData);
</script>

<style scoped>
.page-container {
  padding: 16px;
}
</style>
```

### 命名规范

- 组件文件名使用 PascalCase + `View` 后缀
- 功能页面: `XXXView.vue`
- 对话框组件: `XXXDialog.vue`
- 通用组件: 直接命名

### 样式规范

- 使用 `scoped` 避免样式污染
- 遵循移动端优先原则
- 支持暗色模式
