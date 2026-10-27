# 04 · 教师端「教学任务 / 教学班 / 学生 / 成绩 / 考勤」只读接口文档

> **本文件只收录「已确认只读」的接口。**
> 收录范围 = `07-write-endpoints-denylist.md` 的 **D 类（已确认只读）** 清单
> + `08-probe-results-raw.md` 中**已实测的 GET**。
>
> **不收录**：成绩录入/修改的提交、导出（Excel/PDF）、打印/报表、写入下载中心、
> 通知/工作流写操作、监考变更、任何 `save|add|create|update|delete|submit|export|print|report|change|send|confirm` 类接口。
> 上述写型/产物型接口见 `07-write-endpoints-denylist.md` 的 A/B 类。

## 数据来源（唯一依据）

| 文件 | 用途 |
| --- | --- |
| `01-pages-and-paths.md` | 页面 → 接口路径映射（候选清单） |
| `07-write-endpoints-denylist.md` | 只读边界（D 类白名单 / A·B·C 类禁调） |
| `08-probe-results-raw.md` | 实测结果、响应结构、字段级样本（**字段与样本的唯一出处**） |

> 探测环境：2026-10-09，教师账号 `<教师工号>`（`currentRoleId=js`），学期 `2026-2027-1`。
> 本文所有「实测」列均转抄自 08 文件，**未新增任何网络请求**。
>
> **凡 08 文件未记录的字段名 / 取值 / 参数，本文一律标注「未记录」或「命名推断（未验证）」，不做臆造。**

---

## 0. 通用约定（转抄自 08 文件 I 节）

### 0.1 响应包裹形态

| 形态 | 出现场景 | 典型结构 |
| --- | --- | --- |
| jqGrid 列表 | 绝大多数 `*List` / `ajaxList*` / `query*Page` | `{msg, ret, page, rows, total, totalPages, results[]}` |
| 裸数组 | 字典 / 下拉 / 名册类 | `[ {...}, {...} ]` |
| 设置对象 | 设置 / 检查类 | `{ret, msg, extend}` 或 `{ret, msg, data}` |
| HTML 页面 | 以「页面」形式存在的入口 | HTML（页面标题见各接口） |

### 0.2 ⚠️ 身份字段注入（解析时必须忽略）

08 文件明确记录：**绝大多数数组/对象响应的每条记录**都被注入下列字段，且末尾还有一个布尔字段 `new`：

```
currentUserId, userRoleId, dataAuth, dataXnxq, currentRoleId,
currentJsId, currentUserName, currentDepartmentId, new
```

> 这些是框架注入的会话/数据权限上下文，**不是业务字段**。
> 解析时应整体过滤，且**不要**把 `new` 当作业务布尔值使用。

### 0.3 错误形态（08 文件 I 节）

| 形态 | 含义 |
| --- | --- |
| `{ret:-1,msg:"参数传输异常"}` / `"数据传输异常"` / `"关键参数缺失"}` | 缺参数 |
| `{ret:-1,msg:"没有访问当前接口的权限!Subject does not have permission [模块:子模块]"}` + **HTTP 401** | 无权限（系统存在细粒度权限点） |
| HTTP 404 / 500 + 页面「无法访问」 | 路径不存在或需其它 HTTP 方法 |
| HTTP 200 + 页面「报错啦 / 错误原因：…」 | 业务错误页 |

### 0.4 分页参数

`page`、`rows`、`gridtype=jqgrid`、`_search=false`、`sort`、`order`。
08 实测中，列表类接口统一带 `gridtype=jqgrid`。

### 0.5 `encodeId=1`

传入 `encodeId=1` 时，响应会额外附带 `encodeId` 字段（前端用于二次跳转），**可安全使用**。

### 0.6 页面型接口说明

本文中标注为「页面」的接口，其响应是 **HTML 页面**（08 实测 HTTP 200），
它们本身是入口页，**真正的数据由同页内的列表接口提供**（在对应条目中注明）。

---

## 1. 教学任务与教学班

### 1.1 `GET /admin/jsd/jxrw/ajaxListJsJxrw` —— 我的教学任务（字段最全）

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/jsd/jxrw/ajaxListJsJxrw` |
| 方法 | **GET** |
| 只读依据 | 07 文件 D 类；08 文件 D 节已实测 |
| 所在页面 | `/admin/jsd/jxrw`（信息查询 → 教学任务） |
| 响应结构 | jqGrid：`{msg, ret, page, rows, total, totalPages, results[]}` |

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `gridtype` | 是 | `jqgrid` | 08 实测所用值；固定 jqGrid 模式 |
| `page` | 否 | `1` | 分页页码（通用分页参数，见 0.4） |
| `rows` | 否 | `20` | 每页条数（通用分页参数） |
| `_search` | 否 | `false` | jqGrid 通用参数 |
| `sort` / `order` | 否 | — | jqGrid 排序参数 |

> 08 只记录了 `?gridtype=jqgrid` 这一种调用形态；筛选类参数未记录。

**实测结果**

| 项 | 值 |
| --- | --- |
| 状态码 | 200 |
| `total` | **6**（我的教学任务 6 条） |
| 是否需参数 | 需 `gridtype=jqgrid`（08 实测形态） |

**响应字段表**（字段清单出自 08 文件 H 节「教学任务 `ajaxListJsJxrw`」）

> ⚠️ 说明：08 文件 H 节对 `ajaxListJsJxrw` **只给出了字段名清单，未给出该接口的记录级 JSON 样本**。
> 下表「类型」与「说明」中，标 **（实测）** 者取自 08 中**同域接口** `jsdQueryJxbList` 的样本值或字段清单；
> 标 **（命名推断）** 者仅依据字段名拼音缩写推测，**未经实测验证，不得据此做业务判断**。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 记录主键（实测：32 位无连字符 UUID 形态，见 `jsdQueryJxbList`） |
| `encodeid` | string | 编码 id（`encodeId=1` 时附带；用于二次跳转） |
| `vkkxxid` | string | 推测为「虚拟开课信息 id」（命名推断） |
| `kkxxdm` | string | 开课信息代码（命名推断） |
| `xnxq` | string | 学期，如 `2026-2027-1`（实测） |
| `kcdm` | string | 课程代码（命名推断；与 `jsdQueryJxbList` 的 `kcbh` 语义相近但字段名不同） |
| `kcmc` | string | 课程名称（实测，如 `计算机制图与表达-2`） |
| `zrs` | string | 推测为「责任（教师）」/ 任务书类标识（命名推断） |
| `kcxz` | string | 课程性质 / 课程修读性质（命名推断） |
| `xf` | string | 学分（实测，如 `"1.5"`，注意为**字符串**） |
| `zongxs` | string | 总学时（命名推断） |
| `llxs` | string | 理论学时（命名推断） |
| `syxs` | string | 实验学时（命名推断） |
| `shijianxs` | string | 实践学时（命名推断） |
| `ksxs` | string | **编码型字段，配有 `ksxsname` 显示名**；08 未给出取值含义（命名推断：疑为考试形式类枚举，未验证） |
| `sfsjhj` | string | 是否实践环节（命名推断，配 `sfsjhjname`） |
| `sfsjhjname` | string | `sfsjhj` 的显示名（命名推断） |
| `sjzs` | string | 实践周数（命名推断） |
| `name` | string | **教学班名称**（实测：`计算机制图与表达-2【理论】1183`） |
| `ksxsname` | string | `ksxs` 的显示名（命名推断） |
| `xstype` | string | 学时类型编码（命名推断，配 `xstypename`） |
| `xstypename` | string | `xstype` 的显示名（命名推断） |
| `isparent` | string | 是否父节点（命名推断） |
| `jxbid` | string | **教学班 id**（实测：32 位无连字符 UUID） |
| `jxbmc` | string | 教学班名称（命名推断） |
| `jxbzc` | string | **教学班组成**（实测：`25建筑学2,25建筑学1`，逗号分隔班级名） |
| `skzc` | string | 上课周次（命名推断） |
| `bjrs` | number | **班级人数**（实测：`49`，为**数字**） |
| `zcxspzid` | string | 推测为「周次-学时配置 id」（命名推断：`zc`=周次、`xs`=学时、`pz`=配置；**未验证**） |
| `jxzc` | string | 教学周次（命名推断） |
| `zxs` | string | 周学时（命名推断） |
| `zhouxs` | string | 周学时（命名推断；与 `zxs` 并存，二者区别未记录） |
| `kkxs` | string | 开课学时（命名推断） |
| `pkxs` | string | 排课学时（命名推断） |
| `jxbbh` | string | 教学班编号（命名推断） |
| `jxbjhrs` | string | 教学班计划人数（命名推断） |
| `jxjhzxs` | string | 教学计划总学时（命名推断） |
| `kckzxs` | string | 课程库/课程总学时（命名推断） |
| `djwhsftctsk` | string | **语义未确认**（08 未记录，命名无法可靠拆解；解析时建议按原样透传） |
| `cqzt1` … `cqzt13` | string | **13 个连续编号字段**。08 未记录取值。命名推断：疑为周次/阶段维度的并列状态位；因同名接口也用于**考勤页**（见 4.1），存在「出勤状态」的可能，但**未验证**。解析时按原样透传，勿做业务判断。 |
| （注入字段） | — | `currentUserId, userRoleId, dataAuth, dataXnxq, currentRoleId, currentJsId, currentUserName, currentDepartmentId, new` —— **解析时忽略**（见 0.2） |

**真实样本**

> 08 文件 H 节**未提供** `ajaxListJsJxrw` 的记录级 JSON 样本。
> 可参考同域 `jsdQueryJxbList` 的样本（见 1.4），其 `kcmc/xnxq/name/bjrs/ksxs/xf/jxbid/jxbzc` 字段名与取值形态一致。

**注意事项**

1. ⚠️ **同名不同页**：本接口在 `jsd/jxrw`（教学任务）与 `jsd/xskq`（考勤，见 4.1）**路径同名**，
   但**语义不同**（一个查教学任务，一个查考勤维度教学任务）。
   08 文件记录：两处实测 `total` 均为 6，且**返回的字段集一致**。
   接入时必须以**调用页面**区分用途，不可仅凭路径判断。
2. 数值型字段混用：`bjrs` 为数字，而 `xf` / `xs` 类为**字符串**（见 1.4 样本），解析需按类型分别处理。
3. `ksxs` 与 `ksxsname`、`sfsjhj` 与 `sfsjhjname`、`xstype` 与 `xstypename` 是**编码 + 显示名成对出现**的字段，展示优先用 `*name`。

---

### 1.2 `GET /admin/jsd/jxrw/jsdJxrws` —— 开课信息管理列表（页面）

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/jsd/jxrw/jsdJxrws` |
| 方法 | **GET** |
| 只读依据 | 08 文件 D 节已实测（HTTP 200 页面） |
| 响应结构 | **HTML 页面**，标题「开课信息管理列表」 |
| 请求参数 | 08 未记录（无参访问即返回页面） |
| 实测结果 | 200；页面标题「开课信息管理列表」 |

**说明**：该页面是教学任务域的入口页；其数据列表由同页的
`/admin/jsd/jxrw/ajaxListJsJxrw`（见 1.1）提供。
同页出现但**属写型/产物型、本文档不收录**的接口：`confirmJxrw`、`changeJxbxx`、`sendIds`、
`reportJsjxrws`、`reportjxrws`、`exportJsjxrws`（见 07 文件 A/B 类）。

---

### 1.3 `GET /admin/jsd/jxrw/jxbzc` —— 教学计划管理（页面）

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/jsd/jxrw/jxbzc` |
| 方法 | **GET** |
| 只读依据 | 08 文件 D 节已实测（HTTP 200 页面） |
| 响应结构 | **HTML 页面**，标题「教学计划管理」 |
| 请求参数 | 08 未记录 |
| 实测结果 | 200；页面标题「教学计划管理」 |

**说明**：教学班组成（`jxbzc`）相关页。08 未记录该页内的数据列表接口，**字段级信息缺失**。

---

### 1.4 `GET /admin/jsd/jsdcjcx/jsdQueryJxbList` —— 我的教学班列表

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/jsd/jsdcjcx/jsdQueryJxbList` |
| 方法 | **GET** |
| 只读依据 | 07 文件 D 类；08 文件 D 节已实测 |
| 所在页面 | `/admin/jsd/jsdcjcx/jsdcjcx`（信息查询 → 教学班成绩查询） |
| 响应结构 | jqGrid：`{msg, ret, page, rows, total, totalPages, results[]}` |

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `gridtype` | 是 | `jqgrid` | 08 实测所用值 |
| `page` / `rows` | 否 | `1` / `20` | 通用分页参数 |
| `_search` / `sort` / `order` | 否 | — | jqGrid 通用参数 |

> 08 只记录了 `?gridtype=jqgrid` 这一种调用形态；筛选参数未记录。

**实测结果**

| 项 | 值 |
| --- | --- |
| 状态码 | 200 |
| `total` | **4**（我的教学班 4 条） |

**响应字段表**（字段清单与样本均出自 08 文件 H 节「教学班列表 `jsdQueryJxbList`」）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `kcmc` | string | 课程名称（实测：`计算机制图与表达-2`） |
| `kcbh` | string | 课程编号（实测：`20605010A`） |
| `xnxq` | string | 学期（实测：`2026-2027-1`） |
| `id` | string | 记录主键（实测：32 位无连字符 UUID） |
| `name` | string | 教学班名称（实测：`计算机制图与表达-2【理论】1183`） |
| `bjrs` | number | 班级人数（实测：`49`，**数字**） |
| `kkxxdm` | string | 开课信息代码（在字段清单中，但**被样本截断未显示**） |
| `ksxs` | string | 编码型字段（实测值 `"1"`）；08 未给出取值含义 |
| `xf` | string | 学分（实测：`"1.5"`，**字符串**） |
| `xs` | string | 学时（实测：`"24"`，**字符串**） |
| `kkyxmc` | string | 开课院系名称（实测：`土木建筑与环境学院`） |
| **`cjfbzt`** | string | ⚠️ **成绩发布状态**（实测值 `"1"`）。**取值含义（0/1/2…）08 未记录**，接入前需另行确认。 |
| `bkbj` | string | 实测值 `"1"`。与成绩录入设置参数 `bkbj`（见 3.1，0/1/2 三档）**同名**；08 未记录其语义（命名推断：疑为「补考标记」，未验证）。 |
| `jxbid` | string | **教学班 id**（实测：32 位无连字符 UUID） |
| `jxbzc` | string | **教学班组成**（实测：`25建筑学2,25建筑学1`） |
| （注入字段） | — | 身份字段 + `new`，**解析时忽略**（见 0.2） |

**真实样本**（08 文件 H 节原文）

```json
{"kcmc":"计算机制图与表达-2","kcbh":"20605010A","xnxq":"2026-2027-1","id":"47133675a2834f758bb8b7807471435e","name":"计算机制图与表达-2【理论】1183","bjrs":49,"ksxs":"1","xf":"1.5","xs":"24","kkyxmc":"土木建筑与环境学院","cjfbzt":"1","bkbj":"1","jxbid":"0fa2a700a1d544ca809a91e70b44a6be","jxbzc":"25建筑学2,25建筑学1"}
```

**注意事项**

1. ⚠️ **`cjfbzt` = 成绩发布状态**（本接口专属语义，勿与 `bkbj` 混淆）。
2. 数量不一致：本接口 `total=4`，而同域教学任务接口（1.1）`total=6`；
   08 未说明差异原因（疑似「教学班」与「教学任务」粒度不同），**不得假定二者等值**。
3. `xf` / `xs` / `bjrs` 类型不统一（字符串 vs 数字），解析需分别处理。

---

### 1.5 `GET /admin/jsd/jsdcjcx/jsdxscjck` —— 教学班成绩查看（页面）

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/jsd/jsdcjcx/jsdxscjck` |
| 方法 | **GET** |
| 只读依据 | 07 文件 D 类；08 文件 D 节已实测（HTTP 200 页面） |
| 响应结构 | **HTML 页面**，标题「教学班成绩查看」 |
| 请求参数 | 08 未记录（无参访问即返回页面） |
| 实测结果 | 200；页面标题「教学班成绩查看」 |

**说明**：学生成绩查看页；所属页面 `/admin/jsd/jsdcjcx/jsdcjcx`。
08 未记录该页内的成绩明细列表接口，**字段级信息缺失**。

---

## 2. 学生

### 2.1 `GET /admin/xjgl/xsjbxx/xsxxcxListCustom` —— 学生信息查询（全校）

> ## ⚠️ 个人信息安全警示（必须遵守）
>
> **本接口返回学生姓名（`xm`）等个人信息。**
>
> - **仅限内部使用**，仅用于本项目的教学相关功能；
> - **不得外泄**：不得导出、上传、共享、提交到任何第三方或外部服务；
> - **不得用于非教学目的**：不得用于画像、营销、分析等任何教学之外的用途；
> - 调用与缓存须最小化，落盘需考虑脱敏/加密与访问控制。

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/xjgl/xsjbxx/xsxxcxListCustom` |
| 方法 | **GET** |
| 只读依据 | 07 文件 D 类；08 文件 D 节已实测 |
| 所在页面 | `/admin/xjgl/xsjbxx/xsxxcx`（信息查询 → 学生信息查询） |
| 响应结构 | jqGrid：`{msg, ret, page, rows, total, totalPages, results[]}` |

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `gridtype` | 是 | `jqgrid` | 08 实测所用值 |
| `page` / `rows` | 否 | `1` / `20` | 通用分页参数（**建议必传小 `rows`**，见注意事项） |
| `_search` / `sort` / `order` | 否 | — | jqGrid 通用参数 |

> 08 只记录了 `?gridtype=jqgrid` 这一种调用形态；筛选参数（学号/姓名/年级等）**未记录**。

**实测结果**

| 项 | 值 |
| --- | --- |
| 状态码 | 200 |
| `total` | **56951**（全校学生） |

**响应字段表**（出自 08 文件 H 节「学生信息 `xsxxcxListCustom`」）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 记录主键 |
| `xh` | string | **学号**（实测：`<学生学号>`） |
| `xm` | string | ⚠️ **姓名**（实测：`<学生姓名>`）—— 个人信息，见上方警示 |
| `mzdm` | string | 民族代码（命名推断） |
| `yxdm` | string | 院系代码（实测：`202`） |
| `sznj` | string | 所在年级（实测：`2016`） |
| `rxnj` | string | 入学年级（实测：`2015`） |
| `bjdm` | string | 班级代码（实测：`wbj226`） |
| `xsdqztdm` | string | 学生当前状态代码（命名推断） |
| `xz` | string | 学制（命名推断） |
| `sfzx` | string | 是否在校（命名推断） |
| `zymc` | string | 专业名称（样本中被截断，字段名在清单中） |
| `bjmc` | string | 班级名称（样本中被截断，字段名在清单中） |
| `encodeId` | string | 编码 id（用于二次跳转） |
| （注入字段） | — | 身份字段 + `new`，**解析时忽略**（见 0.2） |

**真实样本**（08 文件 H 节原文，已截断）

```json
{"xh":"<学生学号>","xm":"<学生姓名>","yxdm":"202","sznj":"2016","rxnj":"2015","bjdm":"wbj226","zymc":…,"bjmc":…}
```

**注意事项**

1. ⚠️ 返回**全校 56951 条**学生记录，**默认查询即全量**。
   接入时必须强制分页、限制 `rows`，禁止一次性拉全量。
2. ⚠️ 含 `xm`（姓名）等个人信息，遵守上方警示。
3. 08 未记录可用的筛选参数；若要按教学班/课程过滤，需另行确认参数。

---

### 2.2 `GET /admin/xjgl/xsjbxx/getZyxx` —— 专业信息

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/xjgl/xsjbxx/getZyxx` |
| 方法 | **GET** |
| 只读依据 | 07 文件 D 类；08 文件 D 节已实测 |
| 响应结构 | **裸数组** `[...]` |
| 调用页面 | 缓考任务查询、学生评教信息查询等 |

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `yxid` | **是** | 院系 id | 08 明确：需 `yxid`；**无参返回 `[]`** |
| `sznj` | 否 | `2025` | 所在年级（08 实测形态中一并传入） |

**实测结果**

| 项 | 值 |
| --- | --- |
| 状态码 | 200 |
| 结构 | `array(len=0)` —— 带 `?yxid=&sznj=`（空值）时返回空数组 |
| 是否需参数 | **需 `yxid`**，无参返回 `[]` |

**字段表**：08 **未记录**任何记录级样本或字段清单（因实测返回空数组）。**字段级信息缺失。**

**注意事项**

- 无参调用返回 `[]` 而非报错，**容易误判为「无数据」**；接入时须先取到有效 `yxid` 再调用。

---

### 2.3 `GET /admin/xjgl/xsjbxx/getBjxx` —— 班级信息

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/xjgl/xsjbxx/getBjxx` |
| 方法 | **GET** |
| 只读依据 | 07 文件 D 类；08 文件 D 节已实测 |
| 响应结构 | **裸数组** `[...]` |
| 调用页面 | 缓考任务查询等 |

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `zyid` | **是** | 专业 id | 08 明确：需 `zyid`；**无参返回 `[]`** |
| `sznj` | 否 | `2025` | 所在年级（08 实测形态中一并传入） |

**实测结果**

| 项 | 值 |
| --- | --- |
| 状态码 | 200 |
| 结构 | `array(len=0)` —— 带 `?zyid=&sznj=`（空值）时返回空数组 |
| 是否需参数 | **需 `zyid`**，无参返回 `[]` |

**字段表**：08 **未记录**记录级样本或字段清单。**字段级信息缺失。**

**注意事项**

- 与 2.2 同属**级联下拉**：院系 → 专业（`getZyxx`）→ 班级（`getBjxx`）。
- 无参返回 `[]`，勿误判为「无数据」。

---

### 2.4 `GET /admin/system/jxzy/jsxx/getjiaosList` / `getjiaosList1` —— 教室/场地名册

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/system/jxzy/jsxx/getjiaosList`、`/admin/system/jxzy/jsxx/getjiaosList1` |
| 方法 | **GET** |
| 只读依据 | 07 文件 D 类；08 文件 C 节已实测 |
| 响应结构 | **裸数组** `[...]` |
| 调用页面 | 教室课表（`/admin/pkgl/pkglcroomkb`） |

**请求参数**：08 **未记录**（实测为无参调用）。

**实测结果**

| 接口 | 状态码 | 结构 |
| --- | --- | --- |
| `getjiaosList` | 200 | `array(len=1087)` |
| `getjiaosList1` | 200 | `array(len=1087)` |

**说明**：08 记录为「**教室 1087 条**（含体育场馆等）」。
两个接口**长度完全相同（均 1087）**，疑似同一数据源的两种形态，但
08 **未记录字段清单与样本**，**无法确认二者字段是否一致**。

**字段表**：**缺失**（08 未记录）。
可参考同域教室类字段形态（非本接口样本）：教室课表页 `ajaxListCustom` 的字段为
`id,jsbh,jsmc,jxldm,zdskrnrs,xqdm,xqmc,jxlmc,xnxq,jslx,encodeId`（见 08 文件 H 节）。

**注意事项**

1. ⚠️ **1087 条为无参全量返回**，接入时注意数据量。
2. 同域存在**三个数量不同的「教室」口径**，勿混用：
   - `getjiaosList` / `getjiaosList1`：**1087**
   - 教室课表页 `ajaxListCustom`：**547**
   - 空教室 `getZyKjs`：**191**
   08 未说明差异原因（应为不同筛选口径），**不得假定为同一集合**。

---

### 2.5 `GET /admin/pkgl/pkrwgl/getjsxx` —— 教室信息

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/pkgl/pkrwgl/getjsxx` |
| 方法 | **GET** |
| 只读依据 | 07 文件 D 类；08 文件 C 节已实测 |
| 响应结构 | **裸数组** `[...]` |
| 调用页面 | 班级课表（`/admin/pkgl/kbcx/bjkb?qx=1`） |

**请求参数**：08 **未记录**（实测为无参调用）。

**实测结果**

| 项 | 值 |
| --- | --- |
| 状态码 | 200 |
| 结构 | `array(len=1087)` —— 08 标注为「教室信息」 |

**字段表**：**缺失**（08 未记录）。

**注意事项**

- ⚠️ **命名易误导**：路径末段 `getjsxx` 字面像「教师信息」，但 08 实测返回 **1087 条**，
  与 `getjiaosList`（教室，1087 条）数量一致，08 亦标注为「教室信息」。
  接入时以 08 的记录为准（教室），**不要按「教师」语义使用**；同时该命名冲突属**待确认缺口**。

---

## 3. 成绩（只读查询类）

> 本章**只收录查询类**接口。成绩的**录入、修改、提交、导出、打印**接口
> （如 `jsdcjxgsq/submit`、`jsdcjlr/toTempCjlrNewPage`、`cjlrgl/createXscjData`、
> `jsdcjlr/exportData`、`jsdcjlr/cjprint` 等）**一律不在本文档范围内**，见 07 文件 A/B 类。

### 3.1 `GET /admin/jsd/jsdcjlr/queryCjlrsz/1?bkbj=` —— 成绩录入设置

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/jsd/jsdcjlr/queryCjlrsz/1`（路径末段 `/1` 为固定段） |
| 方法 | **GET** |
| 只读依据 | 07 文件 D 类；08 文件 E 节已实测 |
| 所在页面 | `/admin/jsd/jsdcjlr/list1`（成绩管理 → 成绩录入） |
| 响应结构 | jqGrid：`{msg, ret, page, rows, total, totalPages, results[]}` |

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `bkbj` | 是 | `0` | **三档：`0` / `1` / `2`**（08 明确三档；**各档语义未记录**） |
| `gridtype` | 是 | `jqgrid` | 08 实测所用值 |
| `page` / `rows` | 否 | `1` / `20` | 通用分页参数 |

**实测结果**

| 参数 | 状态码 | `total` |
| --- | --- | --- |
| `?bkbj=0&gridtype=jqgrid` | 200 | **0** |
| `?bkbj=1` | — | **未实测** |
| `?bkbj=2` | — | **未实测** |

**字段表**：**缺失**（08 未记录样本与字段清单；实测 `total=0`）。

**注意事项**

1. `bkbj` 与 `jsdQueryJxbList` 响应字段 `bkbj`（见 1.4）**同名**，二者关系 08 未记录。
2. 只实测了 `bkbj=0`（返回 0 条）；`1` / `2` 的行为**未知**。

---

### 3.2 `GET /admin/jsd/jsdcjlr/querycjdlr/1?bkbj=` —— 成绩录入档案

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/jsd/jsdcjlr/querycjdlr/1`（末段 `/1` 固定） |
| 方法 | **GET** |
| 只读依据 | 07 文件 D 类；08 文件 E 节已实测 |
| 所在页面 | `/admin/jsd/jsdcjlr/list1`（成绩录入） |
| 响应结构 | ⚠️ **数组（长度 2）**：`array(len=2)` —— 08 标注为「**两个分页对象**」，**不是**单一 jqGrid 对象 |

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `bkbj` | 是 | `0` | 与 3.1 同名同档（0/1/2，语义未记录） |

**实测结果**

| 参数 | 状态码 | 结构 |
| --- | --- | --- |
| `?bkbj=0` | 200 | `array(len=2)`（两个分页对象） |

**字段表**：**缺失**（08 未记录元素内部字段）。

**注意事项**

- ⚠️ **响应不是 jqGrid 单对象，而是「两个分页对象」的数组**。
  接入时**不要**按 `{results:[]}` 解析，需按数组逐元素处理。
- 08 未记录两个元素的差异（疑似「理论/实践」或「两份档案」），**语义待确认**。

---

### 3.3 `GET /admin/jsd/jsdcjxgsq/listCjxgsq/1?kslx=` —— 成绩修改申请列表

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/jsd/jsdcjxgsq/listCjxgsq/1`（末段 `/1` 固定） |
| 方法 | **GET** |
| 只读依据 | 07 文件 D 类；08 文件 E 节已实测 |
| 所在页面 | `/admin/jsd/jsdcjxgsq/list1`（成绩管理 → 成绩修改） |
| 响应结构 | jqGrid：`{msg, ret, page, rows, total, totalPages, results[]}` |

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `kslx` | 是 | `0` | **三档：`0` / `1` / `2`**；08 仅标注 **`0` = 待提交**，`1` / `2` 语义**未记录** |
| `gridtype` | 是 | `jqgrid` | 08 实测所用值 |
| `page` / `rows` | 否 | `1` / `20` | 通用分页参数 |

**实测结果**

| 参数 | 状态码 | `total` |
| --- | --- | --- |
| `?kslx=0&gridtype=jqgrid` | 200 | **0**（待提交，无记录） |
| `?kslx=1&gridtype=jqgrid` | 200 | **4** |
| `?kslx=2&gridtype=jqgrid` | 200 | **0** |

**字段表**：08 **未提供** `listCjxgsq` 的字段清单（`total=4` 时 `results` 内容未记录）。**字段级信息缺失。**

**注意事项**

1. 该接口是**成绩修改申请**的**只读列表**；对应的**提交/删除**
   （`/admin/jsd/jsdcjxgsq/submit`、`deleteCjxgsq`、`recordDelete`）为**写型**，见 07 文件 A1，**严禁调用**。
2. `kslx=1` 时有数据（4 条），**`0` / `2` 为 0 条**；三个状态的真实语义仅 `0`（待提交）有记录。
3. 相关（未单独探测）接口：`GET /admin/jsd/jsdcjxgsq/getCjxgjlByJxbid?kslx=&gridtype=jqgrid`
   —— 08 标注为「**未单独探测**」，本文档不列为已确认只读。

---

### 3.4 `GET /admin/cjgl/cjjdxkz/checkXz` —— 成绩阶段控制检查

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/cjgl/cjjdxkz/checkXz` |
| 方法 | **GET** |
| 只读依据 | 08 文件 E 节已实测（返回 `{ret:0}`） |
| 所在页面 | `/admin/jsd/jsdcjlr/list1`（成绩录入） |
| 响应结构 | 设置对象：`{ret:0}` |

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `gnym` | 是 | — | 08 实测形态为 `?gnym=&gnan=`（**功能页面 / 功能按钮**类参数，语义未记录） |
| `gnan` | 是 | — | 同上 |

**实测结果**

| 项 | 值 |
| --- | --- |
| 状态码 | 200 |
| 响应 | `{ret:0}` |
| 是否需参数 | 08 实测传入 `gnym` / `gnan`（空值亦可返回 `{ret:0}`） |

**字段表**：响应仅 `ret`（08 未记录其它字段）。**无业务字段。**

**注意事项**

- 名为 `check*`，08 实测**无副作用**（返回 `{ret:0}`，HTTP 200），
  但 07 文件接入规则建议对 `check*` 词根保持警惕；本接口已列入 08 实测只读范围。
- `ret:0` 的具体含义（通过/未通过）08 **未记录**。

---

### 3.5 `GET /admin/cjgl/cjxgsjsz/checkCjxgXz` —— 成绩修改设置检查

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/cjgl/cjxgsjsz/checkCjxgXz` |
| 方法 | **GET** |
| 只读依据 | 08 文件 E 节已实测（返回 `{ret:0}`） |
| 所在页面 | `/admin/jsd/jsdcjxgsq/list1`（成绩修改） |
| 响应结构 | 设置对象：`{ret:0}` |

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `xnxq` | 是 | `2026-2027-1` | 学期 |

**实测结果**

| 项 | 值 |
| --- | --- |
| 状态码 | 200 |
| 响应 | `{ret:0}` |

**字段表**：响应仅 `ret`。**无业务字段。**

**注意事项**

- `ret:0` 含义（是否允许修改成绩）08 **未记录**，仅记录「检查」语义。

---

### 3.6 `GET /admin/xjgl/xftj/getxftjlist` —— 学分统计

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/xjgl/xftj/getxftjlist` |
| 方法 | **GET** |
| 只读依据 | 07 文件 D 类；08 文件 E 节已实测 |
| 所在页面 | `/admin/xjgl/xftj`（学籍管理 → 学业情况 → 学分统计） |
| 响应结构 | jqGrid：`{msg, ret, page, rows, total, totalPages, results[]}` |

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `encodeId` | 否 | `1` | 08 实测所用值；使响应附带 `encodeId` 字段（见 0.5） |
| `gridtype` | 是 | `jqgrid` | 08 实测所用值 |
| `page` / `rows` | 否 | `1` / `20` | 通用分页参数 |

**实测结果**

| 参数 | 状态码 | `total` |
| --- | --- | --- |
| `?encodeId=1&gridtype=jqgrid` | 200 | **0** |

**字段表**：**缺失**（08 未记录样本与字段清单）。

**注意事项**

1. 返回 `total=0`，**疑为需按学生/教学班维度传入查询条件**，但 08 未记录筛选参数。
2. 同页存在的 `/admin/xjgl/xftj/exportData` 为**导出型（B 类）**，**禁止调用**（见 07 文件 B1）。

---

### 3.7 `GET /admin/xjgl/xftj/getBjgKcxx` —— 不及格课程（页面）

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/xjgl/xftj/getBjgKcxx` |
| 方法 | **GET** |
| 只读依据 | 08 文件 E 节已实测（HTTP 200 页面） |
| 响应结构 | **HTML 页面**，标题「学分统计列表」（08 标注：不及格课程信息页） |
| 请求参数 | 08 未记录 |
| 实测结果 | 200；页面标题「学分统计列表」 |

**说明**：所属页面 `/admin/xjgl/xftj`（学分统计）。
页面数据由同页 `getxftjlist`（见 3.6）等提供；08 **未记录**该页内的不及格课程明细列表接口。

---

### 3.8 `GET /admin/cjgl/cjfbgl/xscjxxck` —— 查看待发布成绩（页面）

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/cjgl/cjfbgl/xscjxxck` |
| 方法 | **GET** |
| 只读依据 | 08 文件 E 节已实测（HTTP 200 页面） |
| 响应结构 | **HTML 页面**，标题「查看待发布成绩」 |
| 请求参数 | 08 未记录 |
| 实测结果 | 200；页面标题「查看待发布成绩」 |

**说明**：成绩发布管理（`cjfbgl`）下的查看页。08 **未记录**该页内的成绩明细列表接口，**字段级信息缺失**。

---

### 3.9 `GET /admin/cjgl/cjlrgl/detailPage` —— 教学班人数（页面）

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/cjgl/cjlrgl/detailPage` |
| 方法 | **GET** |
| 只读依据 | 08 文件 E 节已实测（HTTP 200 页面） |
| 响应结构 | **HTML 页面**，标题「教学班人数」 |
| 请求参数 | 08 未记录 |
| 实测结果 | 200；页面标题「教学班人数」 |

**说明**：所属页面 `/admin/jsd/jsdcjlr/list1`（成绩录入）。
08 **未记录**该页内的人数明细列表接口。
同页的 `/admin/cjgl/cjlrgl/createXscjData` 为**创建学生成绩数据（写型，A 类）**，**严禁调用**。

---

## 4. 考勤

### 4.1 `GET /admin/jsd/xskq/ajaxListJsJxrw` —— 考勤-教学任务

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/jsd/xskq/ajaxListJsJxrw` |
| 方法 | **GET** |
| 只读依据 | 07 文件 D 类；08 文件 D 节已实测 |
| 所在页面 | `/admin/jsd/xskq`（学生考勤统计（老师）） |
| 响应结构 | jqGrid：`{msg, ret, page, rows, total, totalPages, results[]}` |

**请求参数**

| 参数名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `gridtype` | 是 | `jqgrid` | 08 实测所用值 |
| `page` / `rows` | 否 | `1` / `20` | 通用分页参数 |
| `_search` / `sort` / `order` | 否 | — | jqGrid 通用参数 |

**实测结果**

| 项 | 值 |
| --- | --- |
| 状态码 | 200 |
| `total` | **6**（考勤-教学任务 6 条） |

**响应字段表**

> ⚠️ 08 文件 D 节记录：本接口与 `jsd/jxrw/ajaxListJsJxrw`（见 1.1）
> **实测返回的字段集一致**。
> 因此字段清单请**直接参照 1.1 的字段表**（含 `cqzt1..cqzt13`、`zcxspzid`、`ksxsname` 等），
> 08 **未单独提供**本路径的字段清单或样本。

**注意事项**

1. ⚠️ **同名不同页（关键）**：本接口与 `/admin/jsd/jxrw/ajaxListJsJxrw` **路径同名**，
   但**语义不同**：
   - `/admin/jsd/jxrw/ajaxListJsJxrw` → **教学任务**（信息查询 → 教学任务）
   - `/admin/jsd/xskq/ajaxListJsJxrw` → **考勤维度教学任务**（学生考勤统计页）

   08 记录：两处 `total` 均为 6，**字段集一致**。
   接入时必须按**调用页面**区分用途，**不可仅凭路径/字段判断语义**。
2. 08 未记录两者的 `results` 内容是否逐条相同（仅记录「字段集一致」）。

---

### 4.2 `GET /admin/jsd/xskq/jcwdxskq` —— 教师维度学生考勤（页面）

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/jsd/xskq/jcwdxskq` |
| 方法 | **GET** |
| 只读依据 | 08 文件 D 节已实测（HTTP 200 页面） |
| 响应结构 | **HTML 页面** |
| 请求参数 | 08 未记录 |
| 实测结果 | 200；页面标题 08 未单独记录（标注为「教师维度学生考勤」） |

**说明**：所属页面 `/admin/jsd/xskq`。页面数据入口为同页 `ajaxListJsJxrw`（见 4.1）。
同页 `/admin/jsd/xskq/exportData` 为**导出型（B 类）**，**禁止调用**。

---

### 4.3 `GET /admin/jsd/xskq/xswdxskq` —— 学生维度考勤（页面）

| 项 | 值 |
| --- | --- |
| 路径 | `/admin/jsd/xskq/xswdxskq` |
| 方法 | **GET** |
| 只读依据 | 08 文件 D 节已实测（HTTP 200 页面） |
| 响应结构 | **HTML 页面**，标题「学生考勤管理列表」 |
| 请求参数 | 08 未记录 |
| 实测结果 | 200；页面标题「学生考勤管理列表」 |

**说明**：所属页面 `/admin/jsd/xskq`。08 **未记录**该页内的学生考勤明细列表接口，**字段级信息缺失**。

---

## 5. 数据矛盾与缺口（本次汇总）

### 5.1 数据矛盾 / 需注意的不一致

| # | 事项 | 说明 |
| --- | --- | --- |
| 1 | **同名接口双语义** | `/admin/jsd/jxrw/ajaxListJsJxrw`（教学任务）与 `/admin/jsd/xskq/ajaxListJsJxrw`（考勤）路径同名、`total` 均 6、字段集一致，但**语义不同**。仅凭路径无法区分，必须绑定调用页面。 |
| 2 | **教学任务 vs 教学班数量不一致** | `jsd/jxrw/ajaxListJsJxrw` `total=6`，`jsdcjcx/jsdQueryJxbList` `total=4`。08 未说明差异（疑似「教学任务」与「教学班」粒度不同）。 |
| 3 | **「教室」三个口径** | `getjiaosList`/`getjiaosList1` = **1087**；教室课表页 `ajaxListCustom` = **547**；空教室 `getZyKjs` = **191**。08 未说明筛选差异。 |
| 4 | **`getjsxx` 命名与数据不符** | 路径名像「教师信息」，实测返回 **1087 条**（与教室一致），08 标注为「教室信息」。 |
| 5 | **`getjiaosList` 与 `getjiaosList1` 完全同长** | 均为 1087，疑似同源；但 08 未记录字段，**无法确认是否等价**。 |
| 6 | **同名参数 `bkbj`** | `queryCjlrsz/querycjdlr` 的参数 `bkbj`（0/1/2）与 `jsdQueryJxbList` 响应字段 `bkbj`（实测 `"1"`）同名，关系未记录。 |
| 7 | **字段类型混用** | `bjrs` 为数字，而 `xf` / `xs` 为字符串（见 1.4 样本）。 |
| 8 | **`zxs` 与 `zhouxs` 并存** | 08 未记录二者区别。 |

### 5.2 缺口（08 未记录，需后续确认）

| # | 缺口 |
| --- | --- |
| 1 | `ajaxListJsJxrw` **无记录级 JSON 样本**，仅有字段名清单；`cqzt1..cqzt13`、`zcxspzid`、`ksxs`/`ksxsname`、`djwhsftctsk`、`vkkxxid`、`zrs` 等**取值与语义未确认**。 |
| 2 | `cjfbzt`（成绩发布状态）**取值映射（0/1/2…）未记录**。 |
| 3 | `bkbj`（0/1/2）、`kslx`（0/1/2）**仅 `kslx=0` 标注为「待提交」**，其余档语义未记录。 |
| 4 | `queryCjlrsz` / `querycjdlr` / `listCjxgsq` / `getxftjlist` / `getjiaosList` / `getjsxx` / `getZyxx` / `getBjxx` **均无字段清单**。 |
| 5 | `querycjdlr` 返回的「两个分页对象」**两元素差异未记录**。 |
| 6 | `checkXz`（`gnym`/`gnan`）与 `checkCjxgXz`（`xnxq`）的 `ret:0` **业务含义未记录**。 |
| 7 | 页面型接口 `jsdJxrws`、`jxbzc`、`jsdxscjck`、`getBjgKcxx`、`xscjxxck`、`detailPage`、`jcwdxskq`、`xswdxskq` **内部数据列表接口均未记录**（除已单独收录者）。 |
| 8 | `xsxxcxListCustom` 的**筛选参数未记录**（仅记录 `gridtype=jqgrid`）。 |
| 9 | `getCjxgjlByJxbid`（成绩修改记录）08 标注为「**未单独探测**」，**未列入已确认只读**。 |
| 10 | 权限边界：08 记录了存在**细粒度权限点**（例：`GET /admin/pkgl/pkgljsjyhmd/checkHmdInTime` → HTTP 401）。本文档所列接口在**教师账号**下已实测通过，**其它角色/权限变更后的可用性未验证**。 |

### 5.3 已确认的「同名/易混淆」清单（接入时重点防护）

| 路径 | 所属页面 | 语义 |
| --- | --- | --- |
| `/admin/jsd/jxrw/ajaxListJsJxrw` | 信息查询 → 教学任务 | 教学任务 |
| `/admin/jsd/xskq/ajaxListJsJxrw` | 学生考勤统计（老师） | 考勤-教学任务 |

---

## 6. 附：本文档的只读边界（转抄自 07 文件）

1. **只用 GET**（例外：`getMenuList` / `queryFieldByGridId` 两个已确认的纯查询 POST，**不在本文档收录范围**）。
2. 路径命中以下词根即**拒绝调用**：
   `save|add|create|update|edit|modify|delete|remove|submit|apply|confirm|audit|approve|reject|import|insert|upload|export|print|report|reset|change|send|batch|collect|chehui|reApply|cxsq|record|unlock|topping|doTrans`
3. 任何**非 GET** 请求默认拒绝，需逐个白名单。
4. 需要「导出」时，**在客户端用已获取的 JSON 自行生成文件**，而不是调服务端 export。
5. ⚠️ 涉及学生个人信息的接口（如 2.1）须遵守其安全警示：**仅内部使用、不得外泄、不得用于非教学目的**。
