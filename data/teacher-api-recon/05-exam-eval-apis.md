# 教师端接口文档（05）· 考试 / 监考 / 试卷 / 评教

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
| jqGrid 列表 | `{msg, ret, page, rows, total, totalPages, results[]}` | 绝大多数 `ajaxList` / `acustomList` / `ajax*List` 接口 |
| 裸数组 | `array(len=N)` | 字典、下拉、批次、指标模板类 |
| 设置类 | `{ret, msg, extend}` | 系统设置类 |
| 错误类 | `{ret:-1, msg:"..."}` | 缺参数 / 无权限 / 业务未配置 |

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
- `encodeId=1`：让响应额外带 `encodeId` 字段（前端用于二次跳转），可安全使用。

### 0.4 错误形态对照

| 形态 | 含义 |
| --- | --- |
| `{ret:-1,msg:"参数传输异常"}` / `"数据传输异常"` / `"关键参数缺失"}` | 缺参数 |
| `{ret:-1,msg:"没有访问当前接口的权限!Subject does not have permission [xxx:yyy]"}` + **HTTP 401** | 无权限（细粒度权限点） |
| HTTP 404 / 500 + 页面「无法访问」 | 路径不存在或需其它 HTTP 方法 |
| HTTP 200 + 页面「报错啦 / 错误原因：…」 | 业务错误页 |

---

## 1. 考试与监考

### 1.1 我的监考安排

- **方法**：`GET`
- **路径**：`/admin/jsd/kwglJsdJkcx/ajaxJsjkList`
- **来源页面**：`/admin/jsd/kwglJsdJkcx`（信息查询 → 监考安排，菜单 M160106）

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `gridtype` | 是 | `jqgrid` | 实测使用值；决定返回 jqGrid 结构 |
| `page` / `rows` | 否 | `1` / `20` | jqGrid 分页（通用） |

**响应结构**

`{…total:1, results:[…]}` —— jqGrid 列表，实测 **total=1**。

**字段表**（取自 `08` H 节首条记录字段清单）

| 字段 | 说明 |
| --- | --- |
| `id` | 记录 ID |
| `xnxq` | 学期 |
| `pcid` | 批次 ID |
| `ypjks` | 未实测（按命名推断，疑似排考相关计数） |
| `xqmc` | 校区名称（样本 `"本部"`） |
| `zjk` | 监考角色（样本 `"主监考"`） |
| `ksrq` | 考试日期 |
| `kscc` | 考试场次 |
| `kcmc` | 课程名称 |
| `jsmc` | 教室名称 |
| `ksrs` | 考试人数 |
| `txbz` | 未实测（按命名推断，疑似标志位） |
| `kspcmc` | 考试批次名称 |
| `ksfs` | 考试方式 |
| `jkjsxm` | 监考教师姓名 |
| `kkyx` | 开课院系 |
| `gld` | 未实测（按命名推断） |
| `ksbj` | 考试班级 |
| `new` | 布尔标记（通用注入字段，忽略） |

**真实样本**（`08` H 节，截断）

```json
{"id":"76a6b988375f4a42b5423fbc0b9b2993","zjk":"主监考","xqmc":"本部","kspcmc":…}
```

**实测结果**：`200`，`{…total:1,results:[…]}`，**我的监考 1 条**。

**注意事项**：`08` H 节仅给出字段清单与上述截断样本，**未逐字段给出完整取值**；`ypjks`、`txbz`、`gld` 含义未实测。

---

### 1.2 任课班级考试

- **方法**：`GET`
- **路径**：`/admin/jsd/kwglJsdJkcx/ajaxJsrkjxbksList`
- **来源页面**：`/admin/jsd/kwglJsdJkcx/rkjxbkslist`（信息查询 → 班级考试信息，菜单 M160102）

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `encodeId` | 否 | `1` | 实测使用值；返回额外带 `encodeId` 字段 |
| `gridtype` | 是 | `jqgrid` | 实测使用值；决定返回 jqGrid 结构 |
| `page` / `rows` | 否 | `1` / `20` | jqGrid 分页（通用） |

**响应结构**

`{…total:1, results:[…]}` —— jqGrid 列表，实测 **total=1**。

**字段表**（取自 `08` H 节首条记录字段清单）

| 字段 | 说明 |
| --- | --- |
| `id` | 记录 ID |
| `kcmc` | 课程名称（样本 `"筑匠短学期实践-2（城乡调研）"`） |
| `jsmc` | 教室名称（样本 `"2-302"`） |
| `jkjs` | 监考教师（样本 `"<教师姓名>(主),<教师姓名B>"`） |
| `kssj` | 考试时间（样本 `"2026-08-30 14:30~18:00"`） |
| `ksrs` | 考试人数（样本 `23`） |
| `syrl` | 未实测（按命名推断） |
| `kkyx` | 开课院系 |
| `skyx` | 未实测（按命名推断，疑似授课院系） |
| `kspcmc` | 考试批次名称 |
| `ksrq` | 考试日期 |
| `sjbh` | 未实测（按命名推断，疑似试卷编号） |
| `bjmc` | 班级名称 |
| `jxbmc` | 教学班名称 |
| `jsname` | 教师姓名 |
| `kcbh` | 课程编号 |
| `jkjsid` | 监考教师 ID |
| `encodeId` | 二次跳转用编码（`encodeId=1` 时出现） |
| `qssj` | 起始时间 |
| `jssj` | 结束时间 |

**真实样本**（`08` H 节，截断）

```json
{"kcmc":"筑匠短学期实践-2（城乡调研）","jsmc":"2-302","jkjs":"<教师姓名>(主),<教师姓名B>","kssj":"2026-08-30 14:30~18:00","ksrs":23}
```

**实测结果**：`200`，`{…total:1,results:[…]}`，**任课班级考试 1 条**。

**注意事项**：`syrl`、`skyx`、`sjbh` 含义未实测。

---

### 1.3 排考名单管理（页面）

- **方法**：`GET`
- **路径**：`/admin/jsd/kwglJsdJkcx/detail`
- **来源页面**：`/admin/jsd/kwglJsdJkcx`（监考安排）

**请求参数**

未实测参数（`08` 中该请求未记录查询串）。

**响应结构**

**HTML 页面**，标题「排考名单管理」。非 JSON 接口。

**实测结果**：`200`，返回 HTML 页。

**注意事项**：本项为**页面**，非数据接口；如需其数据应使用 1.1 / 1.2 的 JSON 接口。`08` 未记录该页面所需的查询参数。

---

### 1.4 缓考名单查询结果

- **方法**：`GET`
- **路径**：`/admin/kw/kwhkgl/hkmdcxjg`
- **来源页面**：`/admin/kw/kwhkgl/hkrwcx`（信息查询 → 缓考任务查询，菜单 M160111）

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `lx` | 是 | `（空值，实测 `?lx=`）` | 类型参数；实测以空值调用成功 |
| `page` / `rows` | 否 | `1` / `20` | jqGrid 分页（通用） |

**响应结构**

`{…total:0}` —— jqGrid 列表，实测 **total=0**。

**字段表**

**未采集到字段样本**（`08` 未提供该接口的记录字段清单；实测返回空集，无法从样本反推字段）。

**实测结果**：`200`，`{…total:0}`（缓考名单查询结果为空）。

**注意事项**：同一来源页面还包含写型/产物型接口 `/admin/kw/kwhkgl/exportmdcx`（导出，B 类，勿调）。`lx` 的取值域未实测。

---

### 1.5 考试批次（新）

- **方法**：`GET`
- **路径**：`/admin/kw/kwkssj/getKspcNew`
- **来源页面**：`/admin/jsd/jsdcjlr/list1`（成绩录入）等页面调用

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `xnxq` | 是 | `2026-2027-1` | 学期 |

**响应结构**

**裸数组** `array(len=4)`（实测 4 条）。

**字段表**

**未采集到字段样本**（`08` 仅记录为 `array(len=4)`，未给出元素字段）。

**实测结果**：`200`，`array(len=4)`。

**注意事项**：与 1.6、1.7 属同类「考试批次」接口，路径不同；字段结构未实测。

---

### 1.6 考试批次

- **方法**：`GET`
- **路径**：`/admin/kwgl/kspc/getKspc`
- **来源页面**：`/admin/jsd/sjgl`（考试任务管理）

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `xnxq` | 是 | `2026-2027-1` | 学期 |

**响应结构**

**裸数组** `array(len=4)`（实测 4 条）。

**字段表**

**未采集到字段样本**。

**实测结果**：`200`，`array(len=4)`。

**注意事项**：与 1.5 返回条数一致（均 4 条），疑似同一批次数据的另一路径；`08` 未做交叉比对，**不能断言两者等价**。

---

### 1.7 考试批次（另一路径）

- **方法**：`GET`
- **路径**：`/admin/kw/kwkssj/getKspc`
- **来源页面**：`/admin/jsd/sjgl/sysjList`（剩余试卷）

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `xnxq` | 是 | `2026-2027-1` | 学期 |

**响应结构**

**未单独取结构** —— `08` 中该行响应结构列记为 `—`。

**字段表**

**无**（未采集）。

**实测结果**：`200`（`08` 记录状态为 200，但未记录响应结构）。

**注意事项**：**如实说明**——本条在 `08` 中仅登记为「考试批次（另一路径）」且状态 200，**未单独抓取响应结构**，字段与元素数量均未知，使用前需重新实测。

---

## 2. 试卷

### 2.1 剩余试卷

- **方法**：`GET`
- **路径**：`/admin/jsd/sjgl/ajaxSysj`
- **来源页面**：`/admin/jsd/sjgl/sysjList`（信息查询 → 剩余试卷，菜单 M160114）

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `gridtype` | 是 | `jqgrid` | 实测使用值 |
| `page` / `rows` | 否 | `1` / `20` | jqGrid 分页（通用） |

**响应结构**

`{…total:0}` —— jqGrid 列表，实测 **total=0**。

**字段表**

**未采集到字段样本**（实测返回空集）。

**实测结果**：`200`，`{…total:0}`。

**注意事项**：同页面存在 `/admin/kw/sjgl/exportSysj`（导出，B 类，勿调）。

---

### 2.2 考试任务管理列表

- **方法**：`GET`
- **路径**：`/admin/jsd/sjgl/ajaxOwnList`
- **来源页面**：`/admin/jsd/sjgl`（信息查询 → 试卷管理，菜单 M160112）

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `gridtype` | 是 | `jqgrid` | 实测使用值 |
| `page` / `rows` | 否 | `1` / `20` | jqGrid 分页（通用） |

**响应结构**

`{ret:-1, msg:"请联系管理员设置需上传资料类型！"}` —— **业务未配置**。

**字段表**

**无**（接口未返回数据，仅返回业务错误）。

**实测结果**：`200`，`{"ret":-1,"msg":"请联系管理员设置需上传资料类型！"}`。

**注意事项**：**如实记录为「业务未配置」**——该接口本身可访问（HTTP 200），但服务端因**未配置「需上传资料类型」**而拒绝返回列表。这是**环境 / 配置问题**，不是接口错误，也不是权限问题（未返回 401）。接入时应对该 `ret:-1` 做降级处理，不要把消息当成可解析的数据。

---

### 2.3 试卷分析列表

- **方法**：`GET`
- **路径**：`/admin/jsd/sjfx/jsdlistsjfx`
- **来源页面**：`/admin/jsd/sjfx/list`（试卷分析，菜单 M1607）

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `gridtype` | 是 | `jqgrid` | 实测使用值 |
| `page` / `rows` | 否 | `1` / `20` | jqGrid 分页（通用） |

**响应结构**

`{…total:0}` —— jqGrid 列表，实测 **total=0**。

**字段表**

**未采集到字段样本**（实测返回空集）。

**实测结果**：`200`，`{…total:0}`。

**注意事项**：同页面另有 `/admin/jsd/sjfx`（页面）与 `/admin/system/jcsj/bmsj/getKkjysList`（教研室，基础数据）。

---

## 3. 评教

### 3.1 学生评教信息查询

- **方法**：`GET`
- **路径**：`/admin/pj/xspjxxcx/acustomList`
- **来源页面**：`/admin/pj/xspjxxcx`（信息查询 → 评教信息查看，菜单 M160110）

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `gridtype` | 是 | `jqgrid` | 实测使用值 |
| `page` / `rows` | 否 | `1` / `20` | jqGrid 分页（通用） |

**响应结构**

`{…total:0}` —— jqGrid 列表，实测 **total=0**。

**字段表**

**未采集到字段样本**（实测返回空集）。

**实测结果**：`200`，`{…total:0}`。

**注意事项**：同页面包含下拉类只读接口 `/admin/pj/zbmbwh/getZbmbxx`（见 3.2）、`/admin/xjgl/xsjbxx/getZyxx`、`/admin/system/jcsj/bjxx/getBjList`、`/admin/system/dict/getDictList`。

---

### 3.2 评教指标模板

- **方法**：`GET`
- **路径**：`/admin/pj/zbmbwh/getZbmbxx`
- **来源页面**：`/admin/pj/xspjxxcx`（评教信息查看）

**请求参数**

未实测参数（`08` 中该请求未记录查询串）。

**响应结构**

**裸数组** `array(len=0)`（实测空）。

**字段表**

**未采集到字段样本**（实测返回空数组）。

**实测结果**：`200`，`array(len=0)`。

**注意事项**：与 3.4 的 `/admin/pj/xspjjgcx/getZbmbxx` 是**两个不同路径**的「指标模板」接口，返回值均为空数组；`08` 未做字段比对。

---

### 3.3 学生评价结果查询

- **方法**：`GET`
- **路径**：`/admin/pj/xspjjgcx/acustomList`
- **来源页面**：`/admin/pj/xspjjgcx`（信息查询 → 学生评价结果查询）

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `gridtype` | 是 | `jqgrid` | 实测使用值 |
| `page` / `rows` | 否 | `1` / `20` | jqGrid 分页（通用） |

**响应结构**

`{…total:0, data:0.0}` —— jqGrid 列表，实测 **total=0**，且顶层带 `data:0.0`（疑似汇总值）。

**字段表**

**未采集到字段样本**（实测返回空集）。

**实测结果**：`200`，`{…total:0,data:0.0}`。

**注意事项**：同页面存在 **语义可疑** 接口 `/admin/pj/xspjjgcx/checkRefresh`（见第 4 节），以及写型接口 `/admin/pj/xspjjgcx/sxxspjjg`（A 类，勿调）。

---

### 3.4 指标模板（学生评价结果页）

- **方法**：`GET`
- **路径**：`/admin/pj/xspjjgcx/getZbmbxx`
- **来源页面**：`/admin/pj/xspjjgcx`（学生评价结果查询）

**请求参数**

未实测参数。

**响应结构**

**裸数组** `array(len=0)`（实测空）。

**字段表**

**未采集到字段样本**（实测返回空数组）。

**实测结果**：`200`，`array(len=0)`。

**注意事项**：与 3.2 同名不同路径；使用前建议实测确认参数与字段。

---

### 3.5 同行评教结果

- **方法**：`GET`
- **路径**：`/admin/pj/thpjcx/acustomList`
- **来源页面**：`/admin/pj/thpjcx`（信息查询 → 同行评教结果查询）

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `gridtype` | 是 | `jqgrid` | 实测使用值 |
| `page` / `rows` | 否 | `1` / `20` | jqGrid 分页（通用） |

**响应结构**

`{…total:0}` —— jqGrid 列表，实测 **total=0**。

**字段表**

**未采集到字段样本**（实测返回空集）。

**实测结果**：`200`，`{…total:0}`。

**注意事项**：同页面存在导出类接口 `/admin/pj/thpjcx/exportHzDataAsyn`、`/admin/pj/thpjcx/exportEjDataAsyn`、`/admin/pj/thpjcx/getExportPyxx`（B 类产物型，勿调）。

---

### 3.6 同行评教指标模板

- **方法**：`GET`
- **路径**：`/admin/pj/thpjcx/getThpjZbmbList`
- **来源页面**：`/admin/pj/thpjcx`（同行评教结果查询）

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `xnxq` | 是 | `2026-2027-1` | 学期 |

**响应结构**

**裸数组** `array(len=0)`（实测空）。

**字段表**

**未采集到字段样本**（实测返回空数组）。

**实测结果**：`200`，`array(len=0)`。

**注意事项**：`xnxq` 是否必须未单独验证（实测带了该参数）。

---

## 4. ⚠️ 语义可疑接口（不推荐调用）

> 以下接口**名字像查询**，但实测行为表明**可能触发服务端重算 / 写回**，
> 因此**不满足「只读」要求**，**不得**当作安全只读接口使用。

### 4.1 `GET /admin/pj/xspjjgcx/checkRefresh`（语义可疑）

- **来源页面**：`/admin/pj/xspjjgcx`（学生评价结果查询）

| 项 | 内容 |
| --- | --- |
| 方法 | `GET` |
| 路径 | `/admin/pj/xspjjgcx/checkRefresh` |
| 实测状态 | `200` |
| 实测响应 | `{"ret":0,"msg":"刷新完成","data":"100%"}` |

**判定**：方法名为 `checkRefresh`（像「检查刷新状态」），但返回体为 `msg:"刷新完成"` + `data:"100%"`，**疑似会触发服务端重新计算学生评教结果**（`sxxspjjg` 同类语义）。

**结论**：归入「**语义可疑、不推荐调用**」。**不要**把它当作安全只读接口；本文件将其单列于此，仅作警示，**不提供调用方式建议**。

**关联**：同页面的 `/admin/pj/xspjjgcx/sxxspjjg` 已被 `07` 明确列为 **A 类写型**（刷新/写入学生评教结果）。

---

## 5. 本域写型 / 产物型接口（勿调，详见 07）

以下接口出现在本域相关页面中，**均为写型或产物型**，已登记于 `07-write-endpoints-denylist.md`。
**本文件不给出其调用方式**，此处仅作「不要碰」提示：

| 接口 | 类别 | 语义 |
| --- | --- | --- |
| `/admin/pj/xspjjgcx/sxxspjjg` | A 类写型 | 刷新/写入学生评教结果 |
| `/admin/jsd/sjgl/tjsq` | A 类写型 | 提交（试卷）申请 |
| `/admin/jsd/sjgl/sjsc` | A 类写型 | 试卷上传 |
| `/admin/jsd/sjgl/resetSfbk` | A 类写型 | 重置是否被查看标记 |
| `/admin/jsd/kwglJsdJkcx/changeJkjs` | A 类写型 | 变更监考教师 |
| `/admin/jsd/kwglJsdJkcx/batchChangeJkjs` | A 类写型 | 批量变更监考教师 |
| `/admin/kw/sjgl/exportSysj` | B 类产物型 | 导出剩余试卷 |
| `/admin/pj/xspjjk/acustomListWwcpjxsExport` | B 类产物型 | 评教结果导出 |
| `/admin/pj/thpjcx/exportHzDataAsyn` | B 类产物型 | 同行评教汇总导出 |
| `/admin/pj/thpjcx/exportEjDataAsyn` | B 类产物型 | 同行评教二级导出 |
| `/admin/pj/thpjcx/getExportPyxx` | B 类产物型 | 导出评语信息 |
| `/admin/jsd/kwglJsdJkcx/jumpMenu` | B 类产物型 | 跳转菜单 |

> 完整禁调清单与接入硬性规则见 `07-write-endpoints-denylist.md`。

---

## 6. 覆盖清单速查

| # | 接口 | 状态 | 数据 |
| --- | --- | --- | --- |
| 1 | `GET /admin/jsd/kwglJsdJkcx/ajaxJsjkList` | 200 | 1 条，字段较全 |
| 2 | `GET /admin/jsd/kwglJsdJkcx/ajaxJsrkjxbksList` | 200 | 1 条，字段较全 |
| 3 | `GET /admin/jsd/kwglJsdJkcx/detail` | 200 | HTML 页面 |
| 4 | `GET /admin/kw/kwhkgl/hkmdcxjg` | 200 | 0 条，字段未采集 |
| 5 | `GET /admin/kw/kwkssj/getKspcNew` | 200 | 数组 4 条，字段未采集 |
| 6 | `GET /admin/kwgl/kspc/getKspc` | 200 | 数组 4 条，字段未采集 |
| 7 | `GET /admin/kw/kwkssj/getKspc` | 200 | **结构未单独采集** |
| 8 | `GET /admin/jsd/sjgl/ajaxSysj` | 200 | 0 条，字段未采集 |
| 9 | `GET /admin/jsd/sjgl/ajaxOwnList` | 200 | **业务未配置**（`ret:-1`） |
| 10 | `GET /admin/jsd/sjfx/jsdlistsjfx` | 200 | 0 条，字段未采集 |
| 11 | `GET /admin/pj/xspjxxcx/acustomList` | 200 | 0 条，字段未采集 |
| 12 | `GET /admin/pj/zbmbwh/getZbmbxx` | 200 | 空数组 |
| 13 | `GET /admin/pj/xspjjgcx/acustomList` | 200 | 0 条，`data:0.0` |
| 14 | `GET /admin/pj/xspjjgcx/getZbmbxx` | 200 | 空数组 |
| 15 | `GET /admin/pj/thpjcx/acustomList` | 200 | 0 条，字段未采集 |
| 16 | `GET /admin/pj/thpjcx/getThpjZbmbList` | 200 | 空数组 |
| — | `GET /admin/pj/xspjjgcx/checkRefresh` | 200 | **语义可疑，勿调** |
