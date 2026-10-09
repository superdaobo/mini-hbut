# 教师端接口文档（06）· 申请 / 工作流 / 通知

> **本文件只收录「已确认只读」的接口。**
> 写型 / 产物型接口见 `07-write-endpoints-denylist.md`，本文件不给出任何写型接口的调用方式。
>
> - 数据来源（均为已落盘的只读勘察结果，未再发起任何网络请求）：
>   `01-pages-and-paths.md`、`07-write-endpoints-denylist.md`、`08-probe-results-raw.md`
> - 抓取时间：2026-10-09　账号：教师（工号 `<教师工号>`，`currentRoleId=js`）　学期：`2026-2027-1`
> - 全部为 **GET 只读** 请求。路径均为相对教务系统站点的 `/admin/...`（本套勘察文件未记录主机名）。
> - **字段含义凡未经样本证实的，一律标注「未实测（按命名推断）」，不臆造未实测的字段或行为。**

---

## 0. 通用约定（适用于本文件全部接口）

来源：`08-probe-results-raw.md` 第 I 节。

### 0.1 响应包裹形态

| 类型 | 形态 | 出现场景 |
| --- | --- | --- |
| jqGrid 列表 | `{msg, ret, page, rows, total, totalPages, results[]}` | `qryMyApply` / `qryOperationApply` / `listRunningProcessInstaces` / `ajaxList` / `ajaxList1` |
| 裸数组 | `array(len=N)` | 字典、下拉类 |
| 错误类 | `{ret:-1, msg:"..."}` | 缺参数 / 无权限 / 业务错误 |
| HTML 页面 | 页面 HTML（可能是错误页或空壳） | `showDetail` / `showdetail` / `jsxxlist` 等 |

### 0.2 身份字段注入（解析时必须忽略）

绝大多数数组 / 对象响应的**每条记录**都会被注入以下字段：

```
currentUserId, userRoleId, dataAuth, dataXnxq, currentRoleId,
currentJsId, currentUserName, currentDepartmentId
```

末尾还有一个布尔字段 `new`。**这些不是业务字段，解析时应丢弃。**

### 0.3 分页与通用参数

- `page`、`rows`：jqGrid 分页。
- `gridtype=jqgrid`：声明以 jqGrid 结构返回（本文件列表类接口普遍需要）。
- `_search=false`、`sort`、`order`：jqGrid 排序 / 检索参数。
- 本域接口普遍带有**业务自定义查询参数**（如 `zdysq`、`zdyjb`、`zdydb`、`processInstanceId`、`showAll`），实测多以空值传入。

### 0.4 错误形态对照

| 形态 | 含义 |
| --- | --- |
| `{ret:-1,msg:"参数传输异常"}` / `"数据传输异常"}` / `"关键参数缺失"}` | 缺参数 |
| `{ret:-1,msg:"没有访问当前接口的权限!Subject does not have permission [xxx:yyy]"}` + **HTTP 401** | 无权限 |
| HTTP 404 / 500 + 页面「无法访问」 | 路径不存在或需其它 HTTP 方法 |
| HTTP 200 + 页面「报错啦 / 错误原因：…」 | 业务错误页 |

---

## 1. 申请与工作流

### 1.1 我的申请

- **方法**：`GET`
- **路径**：`/admin/activiti/myApply/qryMyApply`
- **来源页面**：`/admin/activiti/myApply/listMyApply`（我的申请 → 工作流管理 → 我的申请，菜单 M160400）

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `zdysq` | 否 | `（空值）` | 自定义申请参数；实测以空值调用成功 |
| `processInstanceId` | 否 | `（空值）` | 流程实例 ID；实测以空值调用成功 |
| `gridtype` | 是 | `jqgrid` | 实测使用值；决定返回 jqGrid 结构 |
| `page` / `rows` | 否 | `1` / `20` | jqGrid 分页（通用） |

**响应结构**

`{…total:2, results:[…]}` —— jqGrid 列表，实测 **total=2**。

**字段表**（取自 `08` H 节首条记录字段清单）

| 字段 | 说明 |
| --- | --- |
| `id` | 记录 ID |
| `processInstanceId` | 流程实例 ID |
| `processInstanceIdEnc` | 流程实例 ID 的编码形式（前端跳转用） |
| `endTime` | 结束时间 |
| `createTime` | 创建时间 |
| `definitionName` | 流程定义名称 |
| `status` | 状态 |
| `clyj` | 未实测（按命名推断，疑似「处理意见」） |
| `busiType` | 业务类型 |
| `busiTypeCode` | 业务类型编码 |
| `shzt` | 未实测（按命名推断，疑似「审核状态」） |
| `queryprotype` | 未实测（按命名推断，查询流程类型） |
| `sproleqf` | 未实测（按命名推断） |
| `version` | 版本号 |

**真实样本**

`08` H 节给出的是**字段清单**，未给出该接口的完整取值样本；`08` G 节记录为 `{…total:2,results:[…]}`。

**实测结果**：`200`，`{…total:2,results:[…]}`，**我的申请 2 条**。

**注意事项**：`clyj`、`shzt`、`queryprotype`、`sproleqf` 含义未实测。同页面存在写型接口 `/admin/activiti/myApply/chehuiProcessIng`（**撤回进行中的流程**，A 类，勿调）与 `/admin/activiti/myApply/viewDetail`（见 1.5）。

---

### 1.2 我的经办

- **方法**：`GET`
- **路径**：`/admin/activiti/myApply/qryOperationApply`
- **来源页面**：`/admin/activiti/myApply/operationApply`（我的申请 → 工作流管理 → 我的经办）

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `zdyjb` | 否 | `（空值）` | 自定义经办参数；实测以空值调用成功 |
| `gridtype` | 是 | `jqgrid` | 实测使用值 |
| `page` / `rows` | 否 | `1` / `20` | jqGrid 分页（通用） |

**响应结构**

`{…total:2}` —— jqGrid 列表，实测 **total=2**。

**字段表**

**未采集到字段样本**（`08` 仅记录为 `{…total:2}`，未给出记录字段清单）。

**实测结果**：`200`，`{…total:2}`，**我的经办 2 条**。

**注意事项**：字段结构未实测；与 1.1「我的申请」字段可能不同，使用前需实测。同页面存在写型 / 产物型接口 `/admin/activiti/myApply/exportDataToDownloadCenter`（B 类，勿调）。

---

### 1.3 我的待办

- **方法**：`GET`
- **路径**：`/admin/activiti/dbsy/listRunningProcessInstaces`
- **来源页面**：`/admin/activiti/dbsy/toDbsyPage`（我的申请 → 工作流管理 → 我的待办，菜单 M160401）

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `zdydb` | 否 | `（空值）` | 自定义待办参数；实测以空值调用成功 |
| `showAll` | 否 | `（空值）` | 是否显示全部；实测以空值调用成功 |
| `processInstanceId` | 否 | `（空值）` | 流程实例 ID；实测以空值调用成功 |
| `gridtype` | 是 | `jqgrid` | 实测使用值 |
| `page` / `rows` | 否 | `1` / `20` | jqGrid 分页（通用） |

**响应结构**

`{…total:0}` —— jqGrid 列表，实测 **total=0**。

**字段表**

**未采集到字段样本**（实测返回空集）。

**实测结果**：`200`，`{…total:0}`（我的待办为空）。

**注意事项**：同页面存在产物型接口 `/admin/activiti/dbsy/exportDataToDownloadCenter`（B 类，勿调），以及实测失败的两个跳转方法（见 1.5）。

---

### 1.4 学生异动申请详情

- **方法**：`GET`
- **路径**：`/admin/xjgl/xsydsq/showDetail`
- **来源页面**：`/admin/xjgl/xsydsq/teacherlist`（我的申请 → 学生异动申请，菜单 M160006）

**请求参数**

未实测到可用参数（直接 GET 返回错误页）。

**响应结构**

**错误页**（HTTP 200 + 页面「报错啦 / 错误原因：…」形态）。

**字段表**

**无**（未返回数据）。

**实测结果**：`200`，**返回错误页**。

**注意事项**：**如实记录为「需参数」**——该接口需要业务参数（如申请单 ID）才能返回详情页；本次以无参调用失败。同页面存在写型接口 `/admin/xjgl/xsydsq/teachercreate`（创建申请）、`/admin/xjgl/xsydsq/reApply`（重新提交）、`/admin/xjgl/xsydsq/cxsq`（撤销）——**全部为 A 类，勿调**。同页面的 `/admin/xjgl/xsydsq/qryXsydsqByBzr`（按班主任查询）本次**未探测**。

---

### 1.5 实测失败的跳转 / 详情方法（需其它方法或参数）

以下接口在 `08` 中**实测失败**，均**不能**按当前 GET 形态使用，**如实记录如下**：

| 接口 | 实测状态 | 说明 |
| --- | --- | --- |
| `GET /admin/activiti/myApply/viewDetail` | **404** | 无法访问；**需 POST 或参数** |
| `GET /admin/activiti/dbsy/toTaskTrace` | **404** | 无法访问；**需其它方法或参数** |
| `GET /admin/activiti/dbsy/toTaskMain` | **404** | 无法访问；**需其它方法或参数** |
| `GET /admin/activiti/dbsy/toPlblPage` | **500** | 无法访问；**需其它方法或参数** |

**请求参数**：未实测到可用参数。

**响应结构**：HTTP 404 / 500 + 页面「无法访问」。

**字段表**：**无**（未返回数据）。

**实测结果**：如上表。

**注意事项**：这些路径从页面内联 JS 提取，语义为「进入详情 / 任务轨迹 / 任务主页 / 批量处理页」，
很可能是**页面跳转方法**，需要 POST 表单或携带 `processInstanceId` / 任务 ID 等参数。
**本文件不臆造其调用方式**；如需使用，须另行实测确认方法与参数。

---

## 2. 通知

### 2.1 通知收件箱

- **方法**：`GET`
- **路径**：`/admin/system/tzsjx/ajaxList`
- **来源页面**：`/admin/system/tzsjx`（通知管理 → 通知收件箱，菜单 M1605）

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `gridtype` | 是 | `jqgrid` | 实测使用值 |
| `page` / `rows` | 否 | `1` / `20` | jqGrid 分页（通用） |

**响应结构**

`{…total:15, results:[…]}` —— jqGrid 列表，实测 **total=15**。

**字段表**（取自 `08` H 节首条记录字段清单）

| 字段 | 说明 |
| --- | --- |
| `id` | 记录 ID |
| `title` | 标题；**含 HTML**（如 `<span class='label label-primary'>置顶</span>`），需 strip |
| `releaseDate` | 发布日期 |
| `noticeType` | 通知类型（编码） |
| `content` | 正文内容 |
| `noticeTypeName` | 通知类型名称 |
| `dqstatus` | 未实测（按命名推断，疑似「读取状态」） |
| `collectstatus` | 未实测（按命名推断，疑似「收藏状态」） |
| `sfzd` | 未实测（按命名推断，疑似「是否置顶」） |
| `sfsq` | 未实测（按命名推断，疑似「是否申请/已读」） |
| `sfxshd` | 未实测（按命名推断，疑似「是否需手动回复」） |

**真实样本**

`08` H 节给出的是**字段清单**，未给出该接口的完整取值样本；`08` G 节记录为 `{…total:15,results:[…]}`。

**实测结果**：`200`，`{…total:15,results:[…]}`，**通知收件箱 15 条**。

**注意事项**：`title` 字段**混有 HTML 标签**，前端需先 strip 再展示。同页面存在多个**写型**接口（`collect` 收藏、`deletecollect` 取消收藏、`updateState` 更新状态、`deleteNoticeToRecycleBin` 删除、`batchQxzd` 批量取消置顶）——**全部 A 类，勿调**。

---

### 2.2 通知详情

- **方法**：`GET`
- **路径**：`/admin/system/tzsjx/showdetail`
- **来源页面**：`/admin/system/tzsjx`（通知收件箱）

**请求参数**

未实测到可用参数（直接 GET 返回错误页）。

**响应结构**

**错误页**（HTTP 200 + 页面错误）。

**字段表**

**无**（未返回数据）。

**实测结果**：`200`，**返回错误页**。

**注意事项**：**如实记录为「需参数」**——需通知 ID 等业务参数才能返回详情；本次以无参调用失败。

---

### 2.3 我发布的通知

- **方法**：`GET`
- **路径**：`/admin/jsd/notice/ajaxList1`
- **来源页面**：`/admin/jsd/notice/list`（通知管理，菜单 M1602）

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `gridtype` | 是 | `jqgrid` | 实测使用值 |
| `page` / `rows` | 否 | `1` / `20` | jqGrid 分页（通用） |

**响应结构**

`{…total:0}` —— jqGrid 列表，实测 **total=0**。

**字段表**

**未采集到字段样本**（实测返回空集）。

**实测结果**：`200`，`{…total:0}`（当前教师未发布通知）。

**注意事项**：同页面存在写型接口 `/admin/jsd/notice/create`（新建）、`/admin/jsd/notice/update`（修改）、`/admin/jsd/notice/updateTopping`（置顶/取消置顶）——**全部 A 类，勿调**。

---

## 3. 移动端 / 教师查询

### 3.1 教师查询

- **方法**：`GET`
- **路径**：`/admin/jwxtgld/jscx/jsxxlist`
- **来源页面**：`/admin/jwxtgld/jscx/list`（移动端 → 教师查询，菜单 M2306）

**请求参数**

**需参数**（未实测到可用参数；直接 GET 返回空壳页）。

**响应结构**

**HTML**，实测约 **1.4 KB 空壳**。

**字段表**

**无**（未返回数据）。

**实测结果**：`200`，返回 HTML 空壳（1.4KB）。

**注意事项**：**如实记录为「需参数」**——该接口需业务查询参数才能返回教师列表；本次以无参调用仅得到空壳页。同页面另有 `/admin/jwxtgld/jscx/getJscxYxxx`（本次**未探测**）。

---

## 4. ⚠️ 本域写型接口（最多，仅作「不要碰」提示）

> **本域是全套勘察中写型接口最集中的一域。**
> 以下接口**在本次勘察中一次都没有被调用**，**今后接入时也不得调用**。
> 列出它们**只是为了让你知道「不要碰」**，**本文件不给出这些写接口的调用方式**。
>
> 完整登记与接入硬性规则见 → **`07-write-endpoints-denylist.md`**。

### 4.1 申请 / 工作流（A 类写型）

| 接口 | 语义 |
| --- | --- |
| `/admin/activiti/myApply/chehuiProcessIng` | **撤回进行中的流程** |
| `/admin/xjgl/xsydsq/teachercreate` | **创建学生异动申请** |
| `/admin/xjgl/xsydsq/reApply` | **重新提交申请** |
| `/admin/xjgl/xsydsq/cxsq` | **撤销申请** |

### 4.2 通知（A 类写型）

| 接口 | 语义 |
| --- | --- |
| `/admin/jsd/notice/create` | 新建通知 |
| `/admin/jsd/notice/update` | 修改通知 |
| `/admin/jsd/notice/updateTopping` | 置顶 / 取消置顶 |
| `POST /admin/system/tzsjx/updateState` | 更新通知状态（已读等） |
| `/admin/system/tzsjx/collect` | 收藏通知 |
| `/admin/system/tzsjx/deletecollect` | 取消收藏 |
| `/admin/workcenter/message/deleteNoticeToRecycleBin` | 删除通知到回收站 |
| `/admin/workcenter/message/batchQxzd` | 批量取消置顶 |

### 4.3 产物型（B 类，会产生服务端文件 / 下载中心记录）

| 接口 | 语义 |
| --- | --- |
| `/admin/activiti/dbsy/exportDataToDownloadCenter` | 写入下载中心 |
| `/admin/activiti/myApply/exportDataToDownloadCenter` | 写入下载中心 |
| `/admin/activiti/myApply/printCJXGBB` | 打印成绩修改报表 |

> 另：本域来源页面中还出现 `/admin/system/fields/doTransFields`（C 类语义可疑，`do*` 前缀疑似字段值转换写回）、
> `/admin/pygcgl/kckkcxxjxdg/wordToPdf`（B 类产物）、`/admin/checkImage/index`（实测 404）。
> 全部详见 `07-write-endpoints-denylist.md`。

---

## 5. 覆盖清单速查

| # | 接口 | 状态 | 数据 |
| --- | --- | --- | --- |
| 1 | `GET /admin/activiti/myApply/qryMyApply` | 200 | 2 条，字段较全 |
| 2 | `GET /admin/activiti/myApply/qryOperationApply` | 200 | 2 条，字段未采集 |
| 3 | `GET /admin/activiti/dbsy/listRunningProcessInstaces` | 200 | 0 条，字段未采集 |
| 4 | `GET /admin/xjgl/xsydsq/showDetail` | 200 | **错误页（需参数）** |
| 5 | `GET /admin/activiti/myApply/viewDetail` | **404** | **需 POST 或参数** |
| 6 | `GET /admin/activiti/dbsy/toTaskTrace` | **404** | **需其它方法或参数** |
| 7 | `GET /admin/activiti/dbsy/toTaskMain` | **404** | **需其它方法或参数** |
| 8 | `GET /admin/activiti/dbsy/toPlblPage` | **500** | **需其它方法或参数** |
| 9 | `GET /admin/system/tzsjx/ajaxList` | 200 | 15 条，字段较全 |
| 10 | `GET /admin/system/tzsjx/showdetail` | 200 | **错误页（需参数）** |
| 11 | `GET /admin/jsd/notice/ajaxList1` | 200 | 0 条，字段未采集 |
| 12 | `GET /admin/jwxtgld/jscx/jsxxlist` | 200 | **HTML 空壳 1.4KB（需参数）** |
