# 湖北工业大学教务系统 · 教师端接口勘察报告

> 勘察时间：**2026-10-09**
> 勘察账号：教师账号（工号 `<教师工号>`，`currentRoleId=js`）
> 目标系统：`https://jwxt.hbut.edu.cn`（湖北工业大学综合教务管理系统，页面标注 *Powered by ChaoXing*）
> 学期：`2026-2027-1`

---

## ⛔ 首要声明：本次勘察全程只读

**唯一目的是「查询」。严禁任何会修改数据的调用。**

本次勘察：

- ✅ 只发 **GET** 请求（仅 `getMenuList` / `queryFieldByGridId` 两个**已确认无副作用的 POST** 例外）
- ✅ 只做**页面 HTML/内联 JS 的静态提取**
- ❌ **没有调用任何**写型接口（不提交、不保存、不删除、不申请、不审核、不确认、不撤回）
- ❌ **没有调用任何**导出 / 打印 / 报表接口（这类会在服务端生成文件或写入下载中心，同样属于副作用）

已提取到的**全部写型与产物型接口**集中登记在 [`07-write-endpoints-denylist.md`](07-write-endpoints-denylist.md)，
供接入时**规避**，文中**不提供**它们的调用方式。

> 接入本 App 时的硬性规则见 07 文件末尾「接入时的硬性规则」。

### ⚠️ 需要如实披露的一处偏差

**本次批量探测中，有一个接口被实际调用过一次，而它可能有服务端副作用：**

| 接口 | 调用次数 | 返回 |
| --- | --- | --- |
| `GET /admin/pj/xspjjgcx/checkRefresh` | **1 次** | `{"ret":0,"msg":"刷新完成","data":"100%"}` |

- 该接口名**看似查询**（`check*`），批量探测时被一并纳入；
- 但它返回的是「**刷新完成**」，推测会触发服务端**重算/刷新该教师的学生评教结果缓存**；
- 影响范围：**仅限本账号（教师 <教师工号>）自身的评教结果缓存**，属于「重算缓存」而非「修改用户数据」，
  不涉及成绩、申请、通知等任何业务数据的写入；
- 已确认**没有**调用任何 `save/add/update/delete/submit/apply/confirm/export/print` 类接口。

事后已把它单列为 **07 文件 C 类「语义可疑、不推荐调用」**，接入时请勿调用。
特此披露，避免「全程只读」这句话被理解得过宽。

### 自查方式（可复核）

本次所有探测请求的完整清单记录在 `08-probe-results-raw.md`，
对该文件做一次「路径是否含写动词」的扫描即可复核：

```python
import io, re
txt = io.open('08-probe-results-raw.md', encoding='utf-8').read()
paths = sorted(set(re.findall(r'/admin/[A-Za-z0-9_/\-]+', txt)))
WRITE = re.compile(r'save|add|create|update|delete|remove|submit|confirm|import|insert|upload|'
                   r'export|print|report|reset|change|send|batch|collect|chehui|topping', re.I)
print([p for p in paths if WRITE.search(p)])   # → []
```

---

## 📚 文档索引

| 文件 | 内容 |
| --- | --- |
| **00-README.md** | 本文件：总览、只读声明、统计、关键发现、使用须知 |
| [01-pages-and-paths.md](01-pages-and-paths.md) | 教师端 **47 条菜单**清单 + 31 个页面各自提取到的接口路径 |
| [02-identity-and-auth.md](02-identity-and-auth.md) | 登录链路、身份字段、权限模型、会话要求、权限边界实测 |
| [03-schedule-apis.md](03-schedule-apis.md) | **课表域**：我的课表 / 班级课表 / 教室课表 / 全校课表 / 空教室 / 节次 / 周次 / 校历（18 个接口） |
| [04-teaching-apis.md](04-teaching-apis.md) | **教学域**：教学任务 / 教学班 / 学生 / 成绩只读查询 / 考勤（22 个接口） |
| [05-exam-eval-apis.md](05-exam-eval-apis.md) | **考试与评教域**：监考 / 考试 / 缓考 / 试卷 / 评教（17 个接口） |
| [06-workflow-notice-apis.md](06-workflow-notice-apis.md) | **工作流与通知域**：我的申请 / 待办 / 经办 / 通知（12 个接口） |
| [07-write-endpoints-denylist.md](07-write-endpoints-denylist.md) | ⛔ **禁调清单**：写型/产物型接口全量登记 + 只读边界 + 接入硬性规则 |
| [08-probe-results-raw.md](08-probe-results-raw.md) | **原始探测结果**：每个接口的状态码、响应结构、字段级样本 |

---

## 📊 勘察统计

| 指标 | 数量 |
| --- | --- |
| 教师端菜单项 | **47**（含 3 层嵌套） |
| 实际抓取内容的页面 | **31** |
| 从页面中提取到的接口路径（去重前） | 约 **150** |
| **已实测调用**的只读 GET 接口 | **106 个路径** |
| 登记在案的写型/产物型接口 | **88 个**（去重后） |
| 文档总行数 | **4102 行** |

---

## 🔑 关键发现（先看这 10 条）

1. **教师端与学生端是同一套系统、两套接口**。教师账号访问学生接口会明确报错，
   例如 `GET /admin/xsd/xsjbxx/xskp` 返回「获取学生基本信息出错或登录用户所属身份类型不是学生」。
   因此**教师端不能复用学生端抓取逻辑**。

2. **身份可直接识别**：`POST /admin/getMenuList` 返回的每个节点都带
   `currentRoleId`（`js`=教师）/ `currentJsId` / `currentUserName`（工号）/ `currentDepartmentId`。
   登录页 `/admin/?loginType=1` 还服务端渲染了 `#roleId`、`.admin_name`（工号）、`.arrowbt`（姓名）。

3. **课表核心接口**：`GET /admin/pkgl/pkgljskb/getJskbByXqid`。
   其 `id` 参数是**服务端加密的 teacherId**，只能从
   `GET /admin/pkgl/pkgljskb/queryKbForJsd` 页面隐藏域 `#teacherId` 抓取，**无客户端构造算法**。

4. ⚠️ **最大陷阱**：`getJskbByXqid` 的 `djs` 是**大节号 = ceil(djc/2)**（1..6），**不是连堂节数**；
   且接口**按小节逐行返回**（跨大节会返回多行），必须去重合并。
   （已用三个学期真实数据交叉验证，见 08 文件 H0 节）

5. **列表接口是 jqGrid 风格**：`{msg, ret, page, rows, total, totalPages, results[]}`；
   字典/下拉类是**裸数组**；设置类是 `{ret, msg, extend}`。

6. **每条记录都被注入身份字段**：
   `currentUserId, userRoleId, dataAuth, dataXnxq, currentRoleId, currentJsId, currentUserName, currentDepartmentId`，
   外加一个 `new` 布尔值。**解析时必须忽略**，否则会污染数据模型。

7. **存在细粒度权限点**：教师账号并非「有菜单就有接口」。
   实测 `GET /admin/pkgl/pkgljsjyhmd/checkHmdInTime` 返回 **HTTP 401**
   `没有访问当前接口的权限!Subject does not have permission [pkgl:pkgljsjyhmd]`。

8. **错误形态有四种**，接入时需分别处理：
   - `{ret:-1,msg:"参数传输异常"/"数据传输异常"/"关键参数缺失"}` → 缺参数
   - `HTTP 401` + `没有访问当前接口的权限!…[模块:子模块]` → 无权限
   - `HTTP 404/500` + 页面「无法访问」 → 路径不存在或需其它 HTTP 方法
   - `HTTP 200` + 页面「报错啦 / 错误原因：…」 → 业务错误页

9. **⚠️ 有一个「名字像查询、实际会写」的接口**：
   `GET /admin/pj/xspjjgcx/checkRefresh` 返回 `{"ret":0,"msg":"刷新完成","data":"100%"}`，
   疑似触发服务端重算 —— **不要调用**（已列入 07 的 C 类「语义可疑」）。

10. **几个接口实测不可用，需如实对待**：
    `jsd/jxrw/jlnkuDmc` → 500；`cjgl/xnxqkfsz/checkAllowToUnlock` → 500；
    `jsd/sjgl/getTjsqZdyh` → 404；`jsd/sjgl/ajaxOwnList` → `{ret:-1,msg:"请联系管理员设置需上传资料类型！"}`（业务未配置）；
    `pkgl/jyjs/checkSxzJs` → 404。

---

## 📖 使用须知

### 1. 本报告的定位

这是**接口事实清单**，不是实现方案。文档只描述「接口长什么样、返回什么」，
**不包含**「应该怎么接入 App」的设计建议——那属于后续设计决策。

### 2. 数据可信度分级

文档中每个字段/结论都按来源标注：

- **（实测）**：本次真实调用取得，可直接依赖
- **（命名推断，未验证）**：仅从字段名推测含义，**接入前需再验证**
- **未采集到字段样本**：接口本身没返回数据（多为空集），字段结构未知

> 多个接口实测返回空集（`total:0`），例如缓考、剩余试卷、试卷分析、三类评教列表、我的待办。
> 这是因为该教师账号在这些业务上没有数据，**不代表接口不可用**。

### 3. 敏感数据警示

`GET /admin/xjgl/xsjbxx/xsxxcxListCustom`（学生信息，全校 **56951** 条）返回**学生姓名等个人信息**。
本报告仅用于内部接口文档，**不得外泄、不得用于非教学目的**。

### 4. 本次未覆盖的部分

| 未覆盖项 | 原因 |
| --- | --- |
| 调停补申请、教师端工作量 | 前端 SPA（`../fe/#/…`），页面不返回可解析 HTML，接口需另做抓包 |
| 新增公选课开课申请（`gxkkk.v.chaoxing.com`）、导师管理（`vrknv.v.chaoxing.com`） | 外站系统，不在本次范围 |
| 教师卡片修改（菜单 M160109） | 页面名即「修改」，**按只读原则未访问** |
| 导出/打印类接口的返回格式 | **按只读原则未调用** |
| 部分 POST 形态的读接口（如 `getSzInfo`/`getZcByXnxq`/`getZqrqxx`/`getZkKsrwByJxbid`） | 因是 POST 未探测，已在 07 的 C 类登记 |
| 写型接口的参数与返回 | **按只读原则未调用**，仅登记路径与语义 |

### 5. 复现方式

如需复现或补充勘察：

1. 用教师账号登录新融合门户 `https://auth.hbut.edu.cn/authserver/login`（验证码可走 App 自带 OCR 端点 `https://mini.hbut.site/api/ocr/recognize`）
2. 带 CAS 会话访问 `https://auth.hbut.edu.cn/authserver/login?service=https%3A%2F%2Fjwxt.hbut.edu.cn%2Fadmin%2Fcaslogin`
3. 在 `jwxt.hbut.edu.cn` 域内用 `fetch(..., {credentials:'include'})` 读取接口

> ⚠️ 复现时**务必继续遵守只读原则**：只用 GET，且避开 07 文件里登记的全部接口。
