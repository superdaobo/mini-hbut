# 智慧迎新协议（实测 · 只读）

> Issue #457 / #460  
> 抓取：2026-07-24 MCP Playwright **手机 UA** + 融合门户已登录会话  
> 范围：**只读展示**；`save` / `update` / `upload` **不做**

## 1. 入口链（必须手机 UA）

| 步骤 | URL / 动作 |
|------|------------|
| 1 | iPhone UA 打开 `https://e.hbut.edu.cn/stu/index.html` |
| 2 | 办事大厅 → **综合** → **智慧迎新**（同级：智慧宿管/学管/离校） |
| 3 | 落地 SPA：`https://stu.hbut.edu.cn/app/welcome/#/welcome/index` |

PC 办事大厅搜「迎新」无结果。

## 2. 鉴权（idaas）

```
GET auth.hbut.edu.cn/authserver/login?service=https://stu.hbut.edu.cn/app/welcome/
  → 302 + ticket
POST https://stu.hbut.edu.cn/account/sys/user/idaas/login
  body: { "ticket":"ST-…", "platform":"welcome", "appKey":"welcome", "type":1 }
  → data.token
后续 Header: token: <data.token>
```

`$appKey = "welcome"`（前端 `app.*.js`）。

## 3. 学生端路由（只读页）

| 路由 | 标题 | 说明 |
|------|------|------|
| `#/welcome/index` | 首页 | 卡片入口 + 网报须知 |
| `#/welcome/flyer` | 启动页 | 常空白/图 |
| `#/welcome/student/basicInfo` | 新生信息 | 多子步骤 |
| `#/welcome/student/teacher` | 我的老师 | 辅导员/班导师 |
| `#/welcome/student/dormitory` | 我的宿舍 | 床位 |
| `#/welcome/student/entryTest` | 入学测试 | 状态只读 |
| `#/welcome/student/forecast/index` | 在线预报到 | 事项列表 |
| `#/welcome/student/live` | 现场报到 | 链接/状态 |
| `#/welcome/student/czzn` | 操作指南 | 静态说明 |
| `#/welcome/statistics/*` | 报到统计 | 汇总数字 |

**写操作页（App 不实现提交）**：`ybd` 行程、`jxf` 军训服、`travel` 乘车区间、`green` 绿色通道等带「提交」的表单。

## 4. 只读 API（实测 200）

| Method | Path | 用途 |
|--------|------|------|
| POST | `/account/sys/user/idaas/login` | 换 token |
| GET | `/account/base/student/myInfo` | 个人信息 |
| GET | `/account/base/student/config/myInfo` | 信息填写步骤进度 |
| GET | `/account/base/teacher/myTeacher` | counselor + classTeacher |
| GET | `/dormitory-accommodation/dormitory/student/bed/myInfo` | 宿舍床位 |
| GET | `/account/base/student/family/myInfo` | 家庭成员 |
| GET | `/account/base/student/experience/myInfo` | 学习经历 |
| GET | `/account/base/student/award/myInfo` | 奖励处分 |
| GET | `/account/base/student/relation/myInfo` | 社会关系 |
| GET | `/account/base/student/brief/myInfo` | 基本情况简介 |
| GET | `/welcome-forecast/student/forecast/myInfo` | 预报到事项 |
| GET | `/welcome-forecast/student/forecast/isComplete` | 预报到是否完成 |
| GET | `/welcome-forecast/test/isComplete` | 入学测试 |
| GET | `/welcome-forecast/test/isPass` | 入学测试通过 |
| GET | `/welcome-forecast/transport/myInfo` | 报到行程（只读展示） |
| GET | `/welcome-forecast/travel/range/myInfo` | 乘车优惠 |
| GET | `/welcome-forecast/green/apply/myInfo` | 绿色通道 |
| GET | `/welcome-live/student-link/myLink` | 现场报到链接 |
| GET | `/account/sys/dict/listByType?type=currentYear` | 当前学年 |

### 禁止写接口（摘录）

`*/save`、`*/update`、`*/saveOrUpdate`、`/account/sys/static/upload`、`/welcome-forecast/test/saveTest` 等。

## 5. App 聚合 DTO

命令：

- `smart_orientation_list_panels`
- `smart_orientation_list_messages`（config 步骤 + forecast 事项 + 测试状态）
- `smart_orientation_profile_blocks`（profile / mentor / counselor / dorm）

Header：`token`（非 Authorization）。

## 6. Fixtures

脱敏样例：`src-tauri/tests/fixtures/smart-orientation/`

- `student_myInfo.json` / `myTeacher.json` / `bed_myInfo.json` / `config_myInfo.json` / `forecast_myInfo.json`

生产默认 **不** 用 fixture 顶替真实字段；`MINI_HBUT_ORIENTATION_DEMO=1` 时开发回落。
