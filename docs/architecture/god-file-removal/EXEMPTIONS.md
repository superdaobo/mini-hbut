# 上帝文件拆除 — 豁免清单（EXEMPTIONS）

> 依据：`docs/architecture/god-file-removal/PRODUCT_PLAN.md` 与 `EXECUTION_TASKS.md`（Issue #582 / #583）。
> 红线（`check_god_files.mjs` LIMITS）：Vue 组件 ≤1500 行。
> 本清单记录「>1000 行但未超 1500 红线」的页面逐一定性结论：均未拆分，登记在案。
> 负责人：`frontend-views`；期限：**2026-08-16**（到期复核，超出红线或明确需要拆分时执行拆分）。

| 文件路径 | 行数 | 定性原因 | 负责人 | 期限 |
| --- | --- | --- | --- | --- |
| src/components/AiChatView.vue | 1393 | script 约 1390 行、模板/样式外置（templates/views/AiChatView.html）；职责单一（AI 对话流），交互高度耦合单页状态，未超 1500 红线，拆分收益低 | frontend-views | 2026-08-16 |
| src/components/ResourceShareView.vue | 1395 | script 约 1392 行、模板/样式外置；职责单一（资源共享/上传下载），未超红线 | frontend-views | 2026-08-16 |
| src/components/CourseSelectionView.vue | 1280 | script 约 1276 行、模板/样式外置；职责单一（选课列表/搜索/详情弹层），未超红线 | frontend-views | 2026-08-16 |
| src/components/ChaoxingClassView.vue | 1291 | script 约 1282 行、模板/样式外置；学习通课堂签到聚合页，已有 chaoxing_checkin 子组件，剩余 script 以状态编排为主，未超红线 | frontend-views | 2026-08-16 |
| src/components/Dashboard.vue | 1358 | script 约 1355 行、模板/样式外置；仪表盘聚合多卡片（课程/成绩/教室等），职责为「汇总入口」，未超红线 | frontend-views | 2026-08-16 |
| src/components/GlobalScheduleView.vue | 1302 | script 约 928 行；全学期课表视图（周/月切换、拖拽改课），职责单一，未超红线 | frontend-views | 2026-08-16 |
| src/components/ExportCenterView.vue | 1384 | script 约 909 行；导出中心（多格式导出/历史记录），职责单一，未超红线 | frontend-views | 2026-08-16 |
| src/components/OnlineLearningYuketangView.vue | 1319 | script 约 322 行，模板约 408 行、样式约 588 行；雨课堂学习页，脚本占比低，未超红线 | frontend-views | 2026-08-16 |
| src/components/StudentInfoView.vue | 1254 | script 约 497 行；学生信息展示页，未超红线 | frontend-views | 2026-08-16 |
| src/components/LoginV3.vue | 1218 | script 约 1001 行；登录页（多登录方式/验证码/条款），职责单一，未超红线 | frontend-views | 2026-08-16 |
| src/components/OnlineLearningChaoxingView.vue | 1230 | script 约 275 行；学习通学习页，脚本占比低，未超红线 | frontend-views | 2026-08-16 |
| src/components/LibraryView.vue | 1305 | script 约 456 行；图书馆座位/资源页，未超红线 | frontend-views | 2026-08-16 |
| src/components/ElectricityView.vue | 1159 | script 约 735 行；电费查询缴费页，职责单一，未超红线 | frontend-views | 2026-08-16 |
| src/components/NotificationView.vue | 1142 | script 约 822 行；通知中心（公告/私信 Tab），未超红线 | frontend-views | 2026-08-16 |
| src/components/GradeView.vue | 1115 | script 约 185 行，模板约 325 行、样式约 604 行；成绩页脚本占比低，未超红线 | frontend-views | 2026-08-16 |
| src/components/MeView.vue | 1067 | script 约 184 行；「我的」页聚合入口，未超红线 | frontend-views | 2026-08-16 |
| src/components/ClassroomView.vue | 1063 | script 约 738 行；教室借用页，职责单一，未超红线 | frontend-views | 2026-08-16 |
| src/components/ServiceStatsView.vue | 1062 | script 约 549 行；校园服务统计页，未超红线 | frontend-views | 2026-08-16 |
| src/components/SettingsView.vue | 1043 | script 约 1040 行、模板/样式外置；设置页为「设置项聚合 + 少量交互」，逻辑为扁平配置读写，无独立可拆领域边界，拆分收益低（Issue #583 评估结论：登记豁免） | frontend-views | 2026-08-16 |

## 说明

- 已按 Issue #582 / #583 完成拆分、不再需要条目的文件：`src/components/ForumView.vue`（999 → 约 345 行，逻辑迁 `src/features/forum/**`）、`src/components/ChaoxingHubView.vue`（1429 → 约 560 行，逻辑迁 `src/features/chaoxing/**`）。
- 其余 `src/components/**` 页面均 ≤1000 行且职责单一，按「≤1500 行且职责单一的可不列」原则不登记。
- 复核触发器：任一文件行数超过 1500 红线，或出现新的领域边界（如新子功能并入页面）时，由 frontend-views 在期限内执行拆分。
