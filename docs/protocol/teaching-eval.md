# 教学评教协议说明（#439）

## 状态

- **App 入口**：教务服务 → `teaching_eval`（`TeachingEvalView`）
- **后端命令**：`teaching_eval_list` / `teaching_eval_form` / `teaching_eval_submit`
- **Live 列表/提交**：教管一体化「学生评教」HTTP 路径 **尚未完成 MCP 抓包**；当前返回 `protocol_ready: false` + 友好提示，**不崩溃**
- **已就绪**：一键满分填卷逻辑、二次确认 /「不再询问」本地偏好、主观题默认短评模板

## 官方入口（人工路径）

1. 登录新融合门户 `https://e.hbut.edu.cn`
2. 进入教管一体化 / 教学质量评价 → **学生评教**
3. 开放评教时段内完成问卷提交

> 本仓库**不**在协议未定时伪造提交成功。

## 目标接口形状（待抓包替换）

| 能力 | 建议命令 | 期望响应字段 |
|------|----------|--------------|
| 列表 | `teaching_eval_list` | `items[{id,title,course_name,status,term}]`, `protocol_ready` |
| 表单 | `teaching_eval_form` | `questions[{id,kind,title,max_score,value}]` |
| 提交 | `teaching_eval_submit` | `success`, `message` |

## 写操作

- `teaching_eval_submit` 在 `protocol_ready=false` 时必须 `success=false` 并给出可读 message
- 禁止静默吞掉错误

## 本地验收

```bash
# 前端确认 UI
npx vitest run src/utils/teaching_eval_contract.spec.ts
# Rust 满分作答纯函数
cd src-tauri && cargo test teaching_eval -- --nocapture
```

## 后续

有登录态后用 MCP 浏览器在评教开放周抓 list/form/submit，替换 `src-tauri/src/modules/teaching_eval.rs` 内 TODO 并更新本文件脱敏样例。
