# ⛔ 禁调清单与只读边界（安全红线）

> **本次勘察的唯一目的：查询。严禁任何会修改数据的调用。**
> 本文档列出**从教师端页面中提取到的全部写型/产物型接口**。
> 这些接口**在本次勘察中一次都没有被调用**，今后接入时也**不得调用**。

---

## 🔴 A 类：明确写型（严禁调用，任何情况下）

### A1. 成绩写入
| 接口 | 语义 |
| --- | --- |
| `POST /admin/jsd/jsdcjxgsq/submit` | 提交成绩修改申请 |
| `POST /admin/jsd/jsdcjxgsq/deleteCjxgsq` | 删除成绩修改申请 |
| `POST /admin/jsd/jsdcjxgsq/recordDelete` | 删除成绩修改记录 |
| `/admin/jsd/jsdcjxgsq/toCjxgPage` | 进入成绩修改编辑页 |
| `/admin/cjgl/cjlrgl/createXscjData` | **创建学生成绩数据** |
| `/admin/jsd/jsdcjlr/toTempCjlrNewPage` | 进入临时成绩录入页 |
| `/admin/jsd/jsdcjlr/changeTemplate` | 切换成绩录入模板 |
| `/admin/jsd/jsdcjlrjs/cjjssq` | 成绩解锁申请 |
| `/admin/pj/xspjjgcx/sxxspjjg` | 刷新/写入学生评教结果 |

### A2. 申请与工作流
| 接口 | 语义 |
| --- | --- |
| `/admin/activiti/myApply/chehuiProcessIng` | **撤回进行中的流程** |
| `/admin/xjgl/xsydsq/teachercreate` | 创建学生异动申请 |
| `/admin/xjgl/xsydsq/reApply` | 重新提交申请 |
| `/admin/xjgl/xsydsq/cxsq` | 撤销申请 |
| `/admin/jsd/sjgl/tjsq` | 提交（试卷）申请 |
| `/admin/jsd/sjgl/sjsc` | 试卷上传 |
| `/admin/jsd/sjgl/resetSfbk` | 重置是否被查看标记 |
| `/admin/jsd/jxrw/confirmJxrw` | 确认教学任务 |
| `/admin/jsd/jxrw/changeJxbxx` | 变更教学班信息 |
| `/admin/jsd/jxrw/sendIds` | 发送 ids（用于后续写操作） |
| `/admin/pygcgl/pygccxtj/kkxxcxdy/sendIds` | 同上 |

### A3. 监考变更
| 接口 | 语义 |
| --- | --- |
| `/admin/jsd/kwglJsdJkcx/changeJkjs` | 变更监考教师 |
| `/admin/jsd/kwglJsdJkcx/batchChangeJkjs` | 批量变更监考教师 |

### A4. 通知
| 接口 | 语义 |
| --- | --- |
| `/admin/jsd/notice/create` | 新建通知 |
| `/admin/jsd/notice/update` | 修改通知 |
| `/admin/jsd/notice/updateTopping` | 置顶/取消置顶 |
| `POST /admin/system/tzsjx/updateState` | 更新通知状态（已读等） |
| `/admin/system/tzsjx/collect` | 收藏通知 |
| `/admin/system/tzsjx/deletecollect` | 取消收藏 |
| `/admin/workcenter/message/deleteNoticeToRecycleBin` | 删除通知到回收站 |
| `/admin/workcenter/message/batchQxzd` | 批量取消置顶 |

### A5. 校历 / 基础数据
| 接口 | 语义 |
| --- | --- |
| `/admin/system/zy/xlyf/updateByZc` | 按周修改校历 |
| `/admin/system/zy/xlyf/updateByYf` | 按月修改校历 |
| `/admin/baseData/weekRemarkEdit` | 编辑周次备注 |

### A6. 教师个人信息
| 接口 | 语义 |
| --- | --- |
| `/admin/jsd/gzyjkhdj/saveJsGrsz` | 保存工作业绩考核登记 |
| `/admin/sz/szjsjbxx/updateQueryJsxxFroJsd` | **教师卡片修改**（菜单 M160109，本次未访问该页面） |

---

## 🟠 B 类：产物型（会产生服务端文件 / 下载中心记录 —— 建议一律不调用）

> 这些接口语义上是「读」，但会在**服务端产生副作用**（生成 Excel/PDF、写入下载中心、
> 创建打印记录），因此不满足「只读」要求。

### B1. 导出 Excel
`/admin/xjgl/xftj/exportData`、`/admin/system/export/urlExport`、
`/admin/xkgl/xkmdgl/export/batchExport2ExcelByJxbid`、`/admin/xkgl/xkmdgl/export/axzb`、
`/admin/xkgl/xkmdgl/export/xsqdbByJxb`、`/admin/xkgl/xkmdgl/export/xsqdbByXzb`、
`/admin/xkgl/xkrwgl/export/exportXscjjfcByJxbid`、`/admin/xkgl/xkrwgl/export/dcjfc`、
`/admin/jsd/jsdcjlr/exportData`、`/admin/jsd/jxrw/exportJsjxrws`、
`/admin/jsd/qxzkb/exportDataList`、`/admin/jsd/qxzkb/exportTjxxMx`、
`/admin/jsd/xskq/exportData`、`/admin/jsd/sjgl/`（`/admin/kw/sjgl/exportSysj`）、
`/admin/pkgl/kbcx/bjkb/exportbjkbList`、`/admin/pkgl/kbcx/bjkb/exportbjkbList2`、
`/admin/pkgl/pkglcroomkb/exportExcel`、`/admin/system/zy/xlgl/exportXl`、
`/admin/system/zy/xlgl/exportNewXl`、`/admin/system/zy/xlgl/exportXlbb`、
`/admin/system/zy/xlgl/exportXlbbToDownloadCenter`、`/admin/baseData/exportXlType`、
`/admin/pj/xspjjk/acustomListWwcpjxsExport`、`/admin/pj/thpjcx/exportHzDataAsyn`、
`/admin/pj/thpjcx/exportEjDataAsyn`、`/admin/pj/thpjcx/getExportPyxx`

### B2. 写入下载中心
`/admin/activiti/dbsy/exportDataToDownloadCenter`、`/admin/activiti/myApply/exportDataToDownloadCenter`

### B3. 打印 / 报表
`/admin/pkgl/pkgljskb/report`、`/admin/pkgl/pkgljskb/jskbprint`、
`/admin/pkgl/kbcx/bjkb/report`、`/admin/pkgl/pkglcroomkb/reportclassroomkb`、
`/admin/pkgl/pkglcroomkb/reportclassroomkb2`、`/admin/jsd/jxrw/reportJsjxrws`、
`/admin/jsd/jxrw/reportjxrws`、`/admin/jsd/jsdcjlr/cjprint`、
`/admin/jsd/qxzkb/skrwprint`、`/admin/system/jxzy/jsxx/printData`、
`/admin/cjgl/cjlrgl/printbbdyReqparamkey`、`/admin/api/raqsoft/printbbdyReqparamkey`、
`/admin/activiti/myApply/printCJXGBB`

### B4. 其它产物
`/admin/system/attachment/downloadFile`、`/admin/pygcgl/kckkcxxjxdg/wordToPdf`、
`/admin/api/jumpToGezida`、`/admin/jsd/kwglJsdJkcx/jumpMenu`

---

## 🟡 C 类：语义可疑（不推荐调用，需逐个人工确认）

| 接口 | 可疑点 |
| --- | --- |
| `GET /admin/pj/xspjjgcx/checkRefresh` | ⚠️ **本次勘察中曾误调 1 次**。名字像查询，但返回 `{"ret":0,"msg":"刷新完成","data":"100%"}` —— **会触发服务端重算/刷新该教师的学生评教结果缓存**。影响仅限本账号自身缓存，未写入任何业务数据；但已不满足「纯只读」，**接入时禁止调用** |
| `POST /admin/jsd/sjgl/checkScrq` | POST + check，可能记录检查时间 |
| `POST /admin/system/fields/doTransFields` | `do*` 前缀，可能是字段值转换写回 |
| `POST /admin/jsd/kwglJsdJkcx/getZkKsrwByJxbid` | POST 但语义为 get（读）；因是 POST 未探测 |
| `POST /admin/system/jxzy/jsxx/getSzInfo` / `getZcByXnxq` / `getXqrqxx` | 同上（POST + get 语义） |
| `POST /admin/jsd/sjgl/checkScrq`、`POST /admin/pkgl/jyjs/checkJysjfw` | POST + check |

---

## 🟢 D 类：本次已确认只读（可安全调用）

> 完整结果见 `08-probe-results-raw.md`。以下为**已实测调用且无副作用**的 GET 接口清单。

```
/admin/api/getSetting
/admin/api/getZclistByXnxq
/admin/api/getRqListByWeek
/admin/system/gridfield/getTranslation
/admin/system/gridfield/queryFieldByGridId        (POST，纯列配置查询)
/admin/system/dict/getDictList
/admin/system/jcsj/xnxq/getSfcztqz
/admin/system/jcsj/zysj/getZyList
/admin/system/jcsj/zysj/getZyListByBjNjZyYxAuth
/admin/system/jcsj/bjxx/getbjxxList
/admin/system/jcsj/bjxx/getbjxxList1
/admin/system/jcsj/bjxx/getBjList
/admin/system/jcsj/zyfx/getZyfxList
/admin/system/jcsj/bmsj/getKkjysList
/admin/system/jcsj/bmsj/getJysListForTeacher
/admin/system/jcsj/bmsj/getKkjysListNoAuth
/admin/system/zy/xlgl/getData/{xnxq}
/admin/system/zy/xlgl/selectRows/{xnxq}
/admin/system/zy/xlgl/selectJxzxsj/{xnxq}
/admin/system/zy/xlgl/selectJxzxsjXq/{xnxq}
/admin/system/systemxlzc/getZcbzbyxq/{xnxq}
/admin/zy/xlxx/getBz/{xnxq}
/admin/pkgl/pkgljskb/getJskbByXqid
/admin/pkgl/kbcx/bjkb/qryBjxx
/admin/pkgl/pkglcroomkb/ajaxListCustom
/admin/pkgl/pkjssz/getJxlList
/admin/pkgl/pkglqxzkb/getJcinfo
/admin/pkgl/pkrwgl/getjsxx
/admin/jsd/qxzkb/queryQxkbPage
/admin/jsd/qxzkb/xkrsxq
/admin/jsd/jxrw/ajaxListJsJxrw
/admin/jsd/jsdcjcx/jsdQueryJxbList
/admin/jsd/jsdcjcx/jsdxscjck
/admin/jsd/xskq/ajaxListJsJxrw
/admin/jsd/kwglJsdJkcx/ajaxJsjkList
/admin/jsd/kwglJsdJkcx/ajaxJsrkjxbksList
/admin/jsd/jsdcjxgsq/listCjxgsq/1
/admin/jsd/jsdcjlr/queryCjlrsz/1
/admin/jsd/jsdcjlr/querycjdlr/1
/admin/jsd/sjfx/jsdlistsjfx
/admin/jsd/sjgl/ajaxSysj
/admin/jsd/notice/ajaxList1
/admin/kw/kwhkgl/hkmdcxjg
/admin/kw/kwkssj/getKspcNew
/admin/kwgl/kspc/getKspc
/admin/system/jxzy/jsxx/getZyKjs
/admin/system/jxzy/jsxx/getXnxqInformation
/admin/system/jxzy/jsxx/getjiaosList
/admin/system/jxzy/jsxx/getjiaosList1
/admin/xjgl/xsjbxx/xsxxcxListCustom
/admin/xjgl/xsjbxx/getZyxx
/admin/xjgl/xsjbxx/getBjxx
/admin/xjgl/xftj/getxftjlist
/admin/pj/xspjxxcx/acustomList
/admin/pj/zbmbwh/getZbmbxx
/admin/pj/xspjjgcx/acustomList
/admin/pj/xspjjgcx/getZbmbxx
/admin/pj/thpjcx/acustomList
/admin/pj/thpjcx/getThpjZbmbList
/admin/activiti/myApply/qryMyApply
/admin/activiti/myApply/qryOperationApply
/admin/activiti/dbsy/listRunningProcessInstaces
/admin/system/tzsjx/ajaxList
```

---

## 🚫 E 类：教师无权限（401）

| 接口 | 响应 |
| --- | --- |
| `GET /admin/pkgl/pkgljsjyhmd/checkHmdInTime` | `{"ret":-1,"msg":"没有访问当前接口的权限!Subject does not have permission [pkgl:pkgljsjyhmd]"}` |

> 说明系统存在**细粒度权限点**（形如 `模块:子模块`）。教师账号并非拥有菜单即拥有全部接口。

---

## 接入时的硬性规则（建议写进代码规范）

1. **只用 GET**（除 `getMenuList` / `queryFieldByGridId` 这两个已确认的纯查询 POST）。
2. 任何路径命中下列词根即**拒绝调用**：
   `save|add|create|update|edit|modify|delete|remove|submit|apply|confirm|audit|approve|reject|import|insert|upload|export|print|report|reset|change|send|batch|collect|chehui|reApply|cxsq|record|unlock|topping|doTrans`
3. 任何**非 GET** 请求默认拒绝，需逐个白名单。
4. 需要「导出」时，在**客户端**用已获取的 JSON 自行生成文件，而不是调服务端 export。
