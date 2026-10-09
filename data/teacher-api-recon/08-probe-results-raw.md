# 原始探测结果（只读 GET）

> 探测时间：2026-10-09　账号：教师 <教师工号>（`currentRoleId=js`）　学期：2026-2027-1
> **全部为 GET 只读请求**；未调用任何写型/导出/打印接口。
> `shape` 为响应结构摘要；`sample` 为响应片段（截断）。

## A. 基础/框架类

| 接口 | 状态 | 响应结构 | 说明 |
| --- | --- | --- | --- |
| `GET /admin/system/jcsj/zysj/getZyList` | 200 | `array(len=0)` | 专业列表；**无参数返回空** |
| `GET /admin/system/jcsj/bjxx/getbjxxList` | 200 | `array(len=0)` | 班级列表；无参数返回空 |
| `GET /admin/system/jcsj/bjxx/getbjxxList1` | 200 | `array(len=0)` | 同上（另一变体） |
| `GET /admin/system/jcsj/zyfx/getZyfxList` | 200 | `array(len=0)` | 专业方向；无参数返回空 |
| `GET /admin/system/jcsj/bjxx/getBjList` | 200 | `array(len=0)` | 班级列表；需 `zyid`/`njdm` |
| `GET /admin/system/jcsj/bmsj/getKkjysList?kkyxid=` | 200 | `array(len=0)` | 开课教研室；需 `kkyxid` |
| `GET /admin/system/jcsj/bmsj/getJysListForTeacher` | 200 | `array(len=0)` | 教师可见教研室 |
| `GET /admin/system/jcsj/bmsj/getKkjysListNoAuth` | 200 | `array(len=0)` | 无鉴权教研室列表 |
| `GET /admin/system/jcsj/zysj/getZyListByBjNjZyYxAuth` | 200 | `array(len=0)` | 按权限的专业列表 |
| `GET /admin/system/jcsj/xnxq/getSfcztqz` | 200 | `{ret:0,msg,data:{sfcztqz,xnxq}}` | 是否设置提前周：`{"sfcztqz":"0","xnxq":"2026-2027-1"}` |
| `GET /admin/system/dict/getDictList?groupCode=ZD_PYCC` | 200 | `array(len=8)` | 数据字典（培养层次） |
| `GET /admin/system/dict/getDictInfo` | 200 | 单对象（含身份字段） | 字典详情；需参数 |
| `GET /admin/system/xtsz/getParam?key=` | 200 | `{ret:-1,msg:"关键参数缺失"}` | 系统参数；**需 `key`** |
| `GET /admin/api/getSetting` | 200 | `{ret:0,msg,extend:{SYSTEM_XLXSMZDYT:"1"}}` | 系统设置 |
| `GET /admin/system/gridfield/getTranslation` | 200 | `{ret:0,msg,extend:{transMap:{…}}}` | 列名字典（"借用理由"→"借用说明" 等） |
| `GET /admin/system/gridfield/queryFieldByGridId?gridId=<X>Grid&gridurl=` | 200 | 列配置 | **POST**（纯查询，无副作用）；每页网格都要调 |

## B. 学期 / 周次 / 校历

| 接口 | 状态 | 响应结构 | 说明 |
| --- | --- | --- | --- |
| `GET /admin/api/getZclistByXnxq?xnxq=&role=&userId=&xqid=` | 200 | `{ret:0,data:{jcsjszList:[…]}}` | **节次时间设置**（11 小节）。字段：`kssj/jssj/jc/pkjcszid/djs/sjd`；`djs` = **大节号**，`sjd` = 时段(`sw`=上午) |
| `GET /admin/api/getRqListByWeek?xnxq=&week=` | 200 | `array(len=7)` | 指定周的 7 天日期。字段：`xnxqh/nfyf/zc/rq/xqbh/xqmc/lunarCalendar` |
| `GET /admin/system/zy/xlgl/getData/{xnxq}` | 200 | `array(len=27)` | 校历逐周：`xnxqh/ny/zc/monday…sunday/*remark` |
| `GET /admin/system/zy/xlgl/selectRows/{xnxq}` | 200 | `array(len=6)` 如 `[2,5,5,6,5,4]` | 校历行数配置 |
| `GET /admin/system/zy/xlgl/selectJxzxsj/{xnxq}` | 200 | `array(len=11)` | 教学周设置（11 条） |
| `GET /admin/system/zy/xlgl/selectJxzxsjXq/{xnxq}` | 200 | `{}` | 空对象（无数据） |
| `GET /admin/system/systemxlzc/getZcbzbyxq/{xnxq}` | 200 | `array(len=1)` | 周次备注 |
| `GET /admin/zy/xlxx/getBz/{xnxq}` | 200 | 单对象 | 校历备注 |
| `GET /admin/pkgl/jyjs/getZcXqJC?xnxq=` | 200 | **空响应(len=0)** | 需其它参数 |
| `GET /admin/pkgl/jyjs/getXnxqByJcxx?xnxq=` | 200 | `array(len=11)` | 按节次取学期信息 |
| `GET /admin/pkgl/jyjs/checkSxzJs?xnxq=&zcStr=&ids=` | **404** | 无法访问 | 路径需其它形态 |
| `GET /admin/pkgl/pkgljsjyhmd/checkHmdInTime` | **401** | `{ret:-1,msg:"没有访问当前接口的权限!Subject does not have permission [pkgl:pkgljsjyhmd]"}` | **教师无权限** |
| `GET /admin/kw/kwkssj/getKspcNew?xnxq=` | 200 | `array(len=4)` | 考试批次（新） |
| `GET /admin/kwgl/kspc/getKspc?xnxq=` | 200 | `array(len=4)` | 考试批次 |
| `GET /admin/kw/kwkssj/getKspc?xnxq=` | 200 | — | 考试批次（另一路径） |

## C. 课表类

| 接口 | 状态 | 响应结构 | 说明 |
| --- | --- | --- | --- |
| `GET /admin/pkgl/pkgljskb/getJskbByXqid?xnxq=&id=<teacherId>&xqdm=&isjsd=0&sftqz=0&xsqbkb=0&zc=` | 200 | `{ret:0,data:[…]}` | **教师本人课表**（核心）。`id` 来自 `/admin/pkgl/pkgljskb/queryKbForJsd` 页面隐藏域 `#teacherId` |
| `GET /admin/pkgl/pkgljskb/ajaxJskbList?xnxq=&jsid=` | 200 | `{ret:-1,msg:"参数传输异常"}` | 需 `jsid`（教师编码 id） |
| `GET /admin/pkgl/pkgljskb/getJxbzcxq?xnxq=&jxbid=` | 200 | `{ret:-1,msg:"数据传输错误"}` | 需有效 `jxbid` |
| `GET /admin/pkgl/kbcx/bjkb/qryBjxx?qx=1&showLastRxnf=&kyzt=&gridtype=jqgrid` | 200 | `{msg,ret:0,page,rows,total:712,results:[…]}` | **班级列表 712 条** |
| `GET /admin/pkgl/pkglcroomkb/ajaxListCustom?gridtype=jqgrid` | 200 | `{…total:547,results:[…]}` | **教室列表 547 条** |
| `GET /admin/pkgl/pkglcroomkb/isOK?checkType=` | 200 | 纯文本 `-1` | 权限检查 |
| `GET /admin/pkgl/kbcx/bjkb/isOK?checkType=` | 200 | 纯文本 `-1` | 权限检查 |
| `GET /admin/jsd/qxzkb/queryQxkbPage?qx=0&yskb=0&gridtype=jqgrid` | 200 | `{…total:6495,results:[…]}` | **全校课表 6495 条** |
| `GET /admin/jsd/qxzkb/tjskqk` | 200 | `{ret:-1,msg:"数据传输异常"}` | 上课情况统计；需参数 |
| `GET /admin/jsd/qxzkb/xkrsxq` | 200 | HTML 页（教学计划管理） | 选课人数详情页 |
| `GET /admin/pkgl/pkjssz/getJxlList?xqdm=` | 200 | `array(len=35)` | **教学楼 35 条** |
| `GET /admin/pkgl/pkglqxzkb/getJcinfo?xnxq=` | 200 | `{ret:0,data:[…11]}` | **节次信息**（含 `sjdmc`=上午/下午/晚上） |
| `GET /admin/system/jxzy/jsxx/getZyKjs?gridtype=jqgrid` | 200 | `{…total:191,results:[…]}` | **空教室 191 条** |
| `GET /admin/system/jxzy/jsxx/getSzInfo` | 200 | 单对象（开关配置） | 时段配置 |
| `GET /admin/system/jxzy/jsxx/getXnxqInformation?xnxq=` | 200 | `{"0":[…7天…],"1":…}` | 按周的日期（键为周次） |
| `GET /admin/system/jxzy/jsxx/getjiaosList1` | 200 | `array(len=1087)` | **教室 1087 条**（含体育场馆等） |
| `GET /admin/system/jxzy/jsxx/getjiaosList` | 200 | `array(len=1087)` | 同上 |
| `GET /admin/pkgl/pkrwgl/getjsxx` | 200 | `array(len=1087)` | 教室信息 |

## D. 教学任务 / 教学班 / 学生

| 接口 | 状态 | 响应结构 | 说明 |
| --- | --- | --- | --- |
| `GET /admin/jsd/jxrw/ajaxListJsJxrw?gridtype=jqgrid` | 200 | `{…total:6,results:[…]}` | **我的教学任务 6 条** |
| `GET /admin/jsd/jxrw/jsdJxrws` | 200 | HTML 页「开课信息管理列表」 | 教学任务页 |
| `GET /admin/jsd/jxrw/jxbzc` | 200 | HTML 页「教学计划管理」 | 教学班组成页 |
| `GET /admin/jsd/jxrw/jlnkuDmc` | **500** | 无法访问 | — |
| `GET /admin/jsd/jsdcjcx/jsdQueryJxbList?gridtype=jqgrid` | 200 | `{…total:4,results:[…]}` | **我的教学班 4 条**（含 `cjfbzt` 成绩发布状态） |
| `GET /admin/jsd/jsdcjcx/jsdxscjck` | 200 | HTML 页「教学班成绩查看」 | 学生成绩查看页 |
| `GET /admin/sz/szjsjbxx/ckkc` | **Failed to fetch** | — | 需 POST 或其它形态 |
| `GET /admin/sz/szjsjbxx/queryJsxxFroJsd` | 200 | HTML 页「教师卡片」 | 教师卡片页 |
| `GET /admin/xjgl/xsjbxx/xsxxcxListCustom?gridtype=jqgrid` | 200 | `{…total:56951,results:[…]}` | **学生信息 56951 条**（全校） |
| `GET /admin/xjgl/xsjbxx/getZyxx?yxid=&sznj=` | 200 | `array(len=0)` | 专业信息；需 `yxid` |
| `GET /admin/xjgl/xsjbxx/getBjxx?zyid=&sznj=` | 200 | `array(len=0)` | 班级信息；需 `zyid` |
| `GET /admin/jsd/xskq/ajaxListJsJxrw?gridtype=jqgrid` | 200 | `{…total:6,results:[…]}` | 考勤-教学任务 6 条 |
| `GET /admin/jsd/xskq/jcwdxskq` | 200 | HTML 页 | 教师维度学生考勤 |
| `GET /admin/jsd/xskq/xswdxskq` | 200 | HTML 页「学生考勤管理列表」 | 学生维度考勤 |

## E. 成绩类

| 接口 | 状态 | 响应结构 | 说明 |
| --- | --- | --- | --- |
| `GET /admin/jsd/jsdcjlr/queryCjlrsz/1?bkbj=0&gridtype=jqgrid` | 200 | `{…total:0}` | 成绩录入设置（`bkbj` 0/1/2 三档） |
| `GET /admin/jsd/jsdcjlr/querycjdlr/1?bkbj=0` | 200 | `array(len=2)`（两个分页对象） | 成绩录入档案 |
| `GET /admin/cjgl/cjjdxkz/checkXz?gnym=&gnan=` | 200 | `{ret:0}` | 成绩阶段控制检查 |
| `GET /admin/cjgl/xnxqkfsz/checkAllowToUnlock` | **500** | 无法访问 | — |
| `GET /admin/jsd/jsdcjxgsq/listCjxgsq/1?kslx=0&gridtype=jqgrid` | 200 | `{…total:0}` | 成绩修改申请（`kslx` 0=待提交） |
| `GET /admin/jsd/jsdcjxgsq/listCjxgsq/1?kslx=1&gridtype=jqgrid` | 200 | `{…total:4,results:[…]}` | **成绩修改申请 4 条**（kslx=1） |
| `GET /admin/jsd/jsdcjxgsq/listCjxgsq/1?kslx=2&gridtype=jqgrid` | 200 | `{…total:0}` | kslx=2 |
| `GET /admin/cjgl/cjxgsjsz/checkCjxgXz?xnxq=` | 200 | `{ret:0}` | 成绩修改设置检查 |
| `GET /admin/jsd/jsdcjxgsq/getCjxgjlByJxbid?kslx=&gridtype=jqgrid` | — | 未单独探测 | 按教学班取成绩修改记录 |
| `GET /admin/xjgl/xftj/getxftjlist?encodeId=1&gridtype=jqgrid` | 200 | `{…total:0}` | 学分统计 |
| `GET /admin/xjgl/xftj/getBjgKcxx` | 200 | HTML 页「学分统计列表」 | 不及格课程信息页 |
| `GET /admin/cjgl/cjfbgl/xscjxxck` | 200 | HTML 页「查看待发布成绩」 | 待发布成绩页 |
| `GET /admin/cjgl/cjlrgl/detailPage` | 200 | HTML 页「教学班人数」 | 教学班人数页 |
| `GET /admin/cjgl/archiveGrades/searchChooseStudents?urlType=xj_xftj` | 200 | `{…total:0}` | 选择学生 |
| `GET /admin/cjgl/tjfx/axzbzgcjcx/openChooseWindow` | 200 | HTML 页「历史学生成绩列表」 | — |

## F. 考试 / 监考 / 试卷 / 评教

| 接口 | 状态 | 响应结构 | 说明 |
| --- | --- | --- | --- |
| `GET /admin/jsd/kwglJsdJkcx/ajaxJsjkList?gridtype=jqgrid` | 200 | `{…total:1,results:[…]}` | **我的监考 1 条** |
| `GET /admin/jsd/kwglJsdJkcx/ajaxJsrkjxbksList?encodeId=1&gridtype=jqgrid` | 200 | `{…total:1,results:[…]}` | **任课班级考试 1 条** |
| `GET /admin/jsd/kwglJsdJkcx/detail` | 200 | HTML 页「排考名单管理」 | 监考详情页 |
| `GET /admin/kw/kwhkgl/hkmdcxjg?lx=` | 200 | `{…total:0}` | 缓考名单查询结果 |
| `GET /admin/jsd/sjfx/jsdlistsjfx?gridtype=jqgrid` | 200 | `{…total:0}` | 试卷分析列表 |
| `GET /admin/jsd/sjgl/ajaxSysj?gridtype=jqgrid` | 200 | `{…total:0}` | 剩余试卷 |
| `GET /admin/jsd/sjgl/ajaxOwnList?gridtype=jqgrid` | 200 | `{ret:-1,msg:"请联系管理员设置需上传资料类型！"}` | 考试任务管理列表（**业务未配置**） |
| `GET /admin/jsd/sjgl/getTjsqZdyh` | **404** | 无法访问 | — |
| `GET /admin/pj/xspjxxcx/acustomList?gridtype=jqgrid` | 200 | `{…total:0}` | 学生评教信息 |
| `GET /admin/pj/zbmbwh/getZbmbxx` | 200 | `array(len=0)` | 评教指标模板 |
| `GET /admin/pj/xspjjgcx/acustomList?gridtype=jqgrid` | 200 | `{…total:0,data:0.0}` | 学生评价结果 |
| `GET /admin/pj/xspjjgcx/getZbmbxx` | 200 | `array(len=0)` | 指标模板 |
| `GET /admin/pj/xspjjgcx/checkRefresh` | 200 | `{ret:0,msg:"刷新完成",data:"100%"}` | **注意**：名字像查询，但返回「刷新完成」，语义上可能触发服务端刷新 → **建议不调用** |
| `GET /admin/pj/thpjcx/acustomList?gridtype=jqgrid` | 200 | `{…total:0}` | 同行评教结果 |
| `GET /admin/pj/thpjcx/getThpjZbmbList?xnxq=` | 200 | `array(len=0)` | 同行评教指标模板 |

## G. 申请 / 工作流 / 通知

| 接口 | 状态 | 响应结构 | 说明 |
| --- | --- | --- | --- |
| `GET /admin/activiti/myApply/qryMyApply?zdysq=&processInstanceId=&gridtype=jqgrid` | 200 | `{…total:2,results:[…]}` | **我的申请 2 条** |
| `GET /admin/activiti/myApply/qryOperationApply?zdyjb=&gridtype=jqgrid` | 200 | `{…total:2}` | 我的经办 2 条 |
| `GET /admin/activiti/dbsy/listRunningProcessInstaces?zdydb=&showAll=&processInstanceId=&gridtype=jqgrid` | 200 | `{…total:0}` | 我的待办 |
| `GET /admin/activiti/myApply/viewDetail` | **404** | 无法访问 | 需 POST 或参数 |
| `GET /admin/activiti/dbsy/toTaskTrace` | **404** | 无法访问 | — |
| `GET /admin/activiti/dbsy/toTaskMain` | **404** | 无法访问 | — |
| `GET /admin/activiti/dbsy/toPlblPage` | **500** | 无法访问 | — |
| `GET /admin/checkImage/index` | **404** | 无法访问 | — |
| `GET /admin/system/attachment/getFileViewUrl/` | **404** | 无法访问 | 需文件 id |
| `GET /admin/xjgl/xsydsq/showDetail` | 200 | **错误页** | 需参数 |
| `GET /admin/jwxtgld/jscx/jsxxlist` | 200 | HTML（1.4KB，空壳） | 需参数 |
| `GET /admin/jsd/notice/ajaxList1?gridtype=jqgrid` | 200 | `{…total:0}` | 我发布的通知 |
| `GET /admin/system/tzsjx/ajaxList?gridtype=jqgrid` | 200 | `{…total:15,results:[…]}` | **通知收件箱 15 条** |
| `GET /admin/system/tzsjx/showdetail` | 200 | **错误页** | 需参数 |

## H. 字段级样本（首条记录）

### 教学班列表 `jsdQueryJxbList`
`kcmc,kcbh,xnxq,id,name,bjrs,kkxxdm,ksxs,xf,xs,kkyxmc,cjfbzt,bkbj,jxbid,jxbzc`
```json
{"kcmc":"计算机制图与表达-2","kcbh":"20605010A","xnxq":"2026-2027-1","id":"47133675a2834f758bb8b7807471435e","name":"计算机制图与表达-2【理论】1183","bjrs":49,"ksxs":"1","xf":"1.5","xs":"24","kkyxmc":"土木建筑与环境学院","cjfbzt":"1","bkbj":"1","jxbid":"0fa2a700a1d544ca809a91e70b44a6be","jxbzc":"25建筑学2,25建筑学1"}
```

### 教学任务 `ajaxListJsJxrw`（教师端最全的一条）
身份字段 + `id,encodeid,vkkxxid,kkxxdm,xnxq,kcdm,kcmc,zrs,kcxz,xf,zongxs,llxs,syxs,shijianxs,ksxs,sfsjhj,sfsjhjname,sjzs,name,ksxsname,xstype,xstypename,isparent,jxbid,jxbmc,jxbzc,skzc,bjrs,zcxspzid,jxzc,zxs,zhouxs,kkxs,pkxs,jxbbh,jxbjhrs,jxjhzxs,kckzxs,djwhsftctsk,cqzt1..cqzt13`

### 监考安排 `ajaxJsjkList`
`id,xnxq,pcid,ypjks,xqmc,zjk,ksrq,kscc,kcmc,jsmc,ksrs,txbz,kspcmc,ksfs,jkjsxm,kkyx,gld,ksbj,new`
```json
{"id":"76a6b988375f4a42b5423fbc0b9b2993","zjk":"主监考","xqmc":"本部","kspcmc":…}
```

### 任课班级考试 `ajaxJsrkjxbksList`
`id,kcmc,jsmc,jkjs,kssj,ksrs,syrl,kkyx,skyx,kspcmc,ksrq,sjbh,bjmc,jxbmc,jsname,kcbh,jkjsid,encodeId,qssj,jssj`
```json
{"kcmc":"筑匠短学期实践-2（城乡调研）","jsmc":"2-302","jkjs":"<教师姓名>(主),<教师姓名B>","kssj":"2026-08-30 14:30~18:00","ksrs":23}
```

### 学生信息 `xsxxcxListCustom`
`id,xh,xm,mzdm,yxdm,sznj,rxnj,bjdm,xsdqztdm,xz,sfzx,zymc,bjmc,encodeId`
```json
{"xh":"<学生学号>","xm":"<学生姓名>","yxdm":"202","sznj":"2016","rxnj":"2015","bjdm":"wbj226","zymc":…,"bjmc":…}
```
> ⚠️ 含学生姓名等个人信息，仅用于内部接口文档，**不得外泄**。

### 全校课表 `queryQxkbPage`（字段最全）
`id,tid,type,xnxq,xf,xqmc,nj,kkyxmc,kcxz,kcbh,kcmc,skjsbh,skjs,jxlmc,jxbid,jxbmc,jxbzc,jxbbh,bjrs,sksjdd,schooltime,skdd,jslx,jsmc,jsxq,zdskrnrs,zongxs,llxs,syxs,shangjxs,shijianxs,qtxs,jsyx,xsstatus,jsstatus,kkxs,xz,showzc,kkyxAuth,jsyxAuth,xsyxAuth,skyxmc,zymc,zybh,dqzcm,jzglbm,pkzxs,jxlName,kkzxs,kkkzxz,sfhyclj,source`

### 空教室 `getZyKjs`
`id,jsmc,jsbh,jslx,jxldm,jxlmc,xqmc,xqdm,zdskrnrs,szlc,sfqy,syyx,jyzt,jsglbmmc`
```json
{"jsmc":"1-001","jxlmc":"1号","xqmc":"本部","zdskrnrs":193,"szlc":"1","syyx":"土木建筑与环境学院"}
```

### 班级列表 `qryBjxx`
`id,bjbh,bjmc,bjjc,rxnf,xqdm,dwdm,zydm,bjrs,bjzdrs,bzrdm,fdydm,bjlbdm,kyzt,zyxz,fdyxm,bzrxm,yxmc,zymc,xnxq,zys,bjs,xz,sfkz,encodeId`

### 教室列表 `ajaxListCustom`（教室课表页）
`id,jsbh,jsmc,jxldm,zdskrnrs,xqdm,xqmc,jxlmc,xnxq,jslx,encodeId`

### 节次信息 `getJcinfo`
`kssj,jssj,jc,jcbm,djs,sjd,sjdmc,sjdtj,sjdxh`
```json
{"kssj":"8:20","jssj":"9:05","jc":"1","jcbm":"1","djs":"1","sjd":"sw","sjdmc":"上午","sjdtj":4,"sjdxh":1}
```

### 我的申请 `qryMyApply`
`id,processInstanceId,processInstanceIdEnc,endTime,createTime,definitionName,status,clyj,busiType,busiTypeCode,shzt,queryprotype,sproleqf,version`

### 通知收件箱 `ajaxList`
`id,title,releaseDate,noticeType,content,noticeTypeName,dqstatus,collectstatus,sfzd,sfsq,sfxshd`
> `title` 含 HTML（如 `<span class='label label-primary'>置顶</span>`），需 strip。

### 字典 `getDictList`
`id,groupid,dictname,dictcode,groupcode,sort,canUpdate,canDel,createDate,updateDate,sfqy`

### 周日期 `getRqListByWeek`
`id,xnxqh,nfyf,zc,rq,xqbh,xqmc,fontsize,fontcolor,fontname,fontbold,lunarCalendar,day`
```json
{"xnxqh":"2026-2027-1","nfyf":"2026-10","zc":6,"rq":"2026-10-05 00:00:00","xqbh":2,"xqmc":"星期一"}
```

## I. 观察到的通用约定

1. **响应包裹**：列表类多为 `{msg, ret, page, rows, total, totalPages, results[]}`（jqGrid 风格）；
   字典/下拉类多为**裸数组**；设置类为 `{ret, msg, extend}`。
2. **身份字段注入**：绝大多数数组/对象响应的**每条记录**都被注入
   `currentUserId, userRoleId, dataAuth, dataXnxq, currentRoleId, currentJsId, currentUserName, currentDepartmentId`，
   最后还有一个 `new`（布尔）。**解析时应忽略这些字段**。
3. **错误形态**：
   - `{ret:-1,msg:"参数传输异常"}` / `"数据传输异常"` / `"关键参数缺失"` → 缺参数
   - `{ret:-1,msg:"没有访问当前接口的权限!Subject does not have permission [xxx:yyy]"}` + **HTTP 401** → 无权限
   - HTTP 404/500 + 页面「无法访问」→ 路径不存在或需其它 HTTP 方法
   - HTTP 200 + 页面「报错啦 / 错误原因：…」→ 业务错误页
4. **分页参数**：`page`、`rows`、`gridtype=jqgrid`、`_search=false`、`sort`、`order`。
5. **`encodeId=1`**：让响应额外带 `encodeId` 字段（前端用于二次跳转），可安全使用。
6. **`gridId` 前缀**：每个页面的网格有固定 gridId（如 `qxzkbGridIdGrid`、`cjlrszGrid`），
   `queryFieldByGridId` 用它取列配置。

---

## H0. 【补充】`getJskbByXqid` 完整字段表（教师本人课表）

> 这条来自**上一轮**真实抓包（2026-10-08，同一教师账号），是课表域最核心的接口，
> 本节把它的完整字段补齐（上文 H 节当时未收录）。

请求：
```
GET /admin/pkgl/pkgljskb/getJskbByXqid
    ?xnxq=2026-2027-1
    &id=<teacherId>          # 服务端加密 id，来自 /admin/pkgl/pkgljskb/queryKbForJsd 的 #teacherId
    &xqdm=                   # 校区代码（空=全部，"1"=本部）
    &isjsd=0
    &sftqz=0                 # 是否提前周 0/1
    &xsqbkb=0
    &zc=                     # 周次（空=全部）
```
响应：`{"ret":0,"msg":"操作成功","data":[ … ]}`（`data` 为**裸数组**，无分页包裹）

### 单条记录完整字段

| 字段 | 示例 | 含义 / 备注 |
| --- | --- | --- |
| `id` | `9e90407965e048af9662bf5a6dd28cc9` | ⚠️ **同一次查询内所有记录相同**，不可作唯一键 |
| `pkid` | `5a6e6d83cd58ef0ce065000000000001` | **排课唯一 ID**，可作唯一键 |
| `xnxq` | `2026-2027-1` | 学年学期 |
| `kcid` / `kcbh` | `20605005A` | 课程代码（`kcbh` = 课程编号） |
| `encodeKcid` | `<加密ID:WGEyQ0…>` | 课程加密 ID（前端跳转用） |
| `kcmc` | `<a href="javascript:void(0);" …>计算机制图与表达-1</a>` | **课程名，含 HTML**（`<a>` 带 `openKckb(...)` onclick）→ 需 strip |
| `name` | `计算机制图与表达-1【上机】3844` | 课程全名（含教学班编号后缀） |
| `jxbid` | `d7fad7022b66492a93e754e2b30da0dc` | 教学班 ID |
| `jxbbh` | `202613844` | 教学班编号 |
| `jxbmc` | （本例未返回） | 教学班名称 |
| `kcxz` | `学科基础课` | 课程性质 |
| `tmc` / `zjsname` | `<教师姓名>` | 授课教师（`tmc` 与 `zjsname` 同值） |
| `ztid` | `<教务教师ID>` | 教师 ID（= `currentJsId`） |
| `croommc` | `<a href="javascript:void(0);" onclick="openCrkb('2026-2027-1','<加密ID:WGEyQ0…>')">2-209</a>` | **教室名，含 HTML** → 需 strip |
| `croombh` | `2-209` / `5B-704` | 教室编号（**纯文本，推荐用它**） |
| `croomid` | `272` / `864` | 教室 ID |
| `jxlmc` | `2号` / `5号` | 教学楼名 |
| `szlc` | `2` / `7` | 所在楼层 |
| `jslxmc` | `多媒体` | 教学类型 |
| `jsxq` / `xqmc` / `kkxq` | `本部` | 校区 |
| `xqid` | `1` | 校区 ID |
| `xingqi` | `1` | 星期几（1..7） |
| `djc` | `7` / `8` | **小节号（1..11）** |
| `djs` | `4` | ⚠️ **大节号 = ceil(djc/2)**（1..6），**不是连堂节数** |
| `zc` | `7` / `8-14` | 周次（紧凑文本） |
| `zcstr` | `7` / `8,9,10,11,12,13,14` | **周次（展开文本，推荐用它解析）** |
| `zctype` | `0` / `1` / `2` | 周类型：0=全周、1=单周、2=双周 |
| `zcxspzid` | `b3aeabfe74914f59b70bfc42b11e6642` | 周次显示配置 ID |
| `jxbzc` | `<a …>26建筑学1</a>,<a …>26建筑学2</a>` | **教学班（班级名列表，含 HTML、逗号分隔）** → 需逐 `<a>` 提取 |
| `bjrs` / `jxbrs` | `62` | 班级人数 / 教学班人数（字符串） |
| `xkrs` | `62` | 选课人数（数字） |
| `cxrs` | `0` | 重修人数 |
| `xf` | `1` | 学分 |
| `zongxs` | `16` | 总学时 |
| `xslx` | `3` | 学生类型 |
| `xsbq` | `` | 学生标签 |
| `type` | `3` | 记录类型 |
| `source` | `1` | 数据来源 |
| `rqxl` | `107` | 日期序列（内部用） |
| `dszhoupx` / `zcdxpx` | `0` | 单双周排序 / 周次大小排序 |
| `jc` | `0` | 节次（未用） |
| `kkxq` | `本部` | 开课校区 |
| 身份字段 | `currentUserId/userRoleId/dataAuth/dataXnxq/currentRoleId/currentJsId/currentUserName/currentDepartmentId` | 每条记录注入，**解析时忽略** |

### 实测去重结论（三个学期交叉验证）

| 学期 | 出现的 `(djc/djs)` 组合 | 记录数 |
| --- | --- | --- |
| 2026-2027-1 | `7/4`、`8/4` | 4 |
| 2025-2026-1 | `1/1`、`2/1`、`3/2`、`4/2` | 8 |
| 2025-2026-2 | `1/1`、`2/1`、`3/2`、`4/2`、`5/3`、`6/3`、`7/4`、`8/4` | 20 |

→ **`djs` = 大节号**（`1,2→1`；`3,4→2`；`5,6→3`；`7,8→4`），三学期全部自洽；
若按「连堂数」解释会得出跨大节重叠的矛盾结果。

→ 接口**按小节逐行返回**：一门课跨大节会返回多行（如大节 4 返回 `djc=7` 与 `djc=8` 两行）。
需按 `(课程 + 教学班 + 课程名 + 星期 + 周次 + 教室 + 周类型 + 大节)` 聚合去重，
取小节区间作为 `period` / 连堂数。

### 真实样本（2026-2027-1，同一门课的 4 条记录）

```json
[
  {"kcbh":"20605005A","kcmc":"<a …>计算机制图与表达-1</a>","jxbbh":"202613844","tmc":"<教师姓名>",
   "croombh":"2-209","croommc":"<a …>2-209</a>","jxlmc":"2号","xingqi":1,"djc":7,"djs":4,
   "zc":"7","zcstr":"7","zctype":"1","xf":"1","jxbzc":"<a …>26建筑学1</a>,<a …>26建筑学2</a>",
   "bjrs":"62","pkid":"5a6e6d83cd58ef0ce065000000000001","name":"计算机制图与表达-1【上机】3844"},
  {"kcbh":"20605005A","djc":8,"djs":4,"zc":"7","zcstr":"7","zctype":"1","croombh":"2-209",
   "pkid":"5a6e6d83cd59ef0ce065000000000001"},
  {"kcbh":"20605005A","djc":7,"djs":4,"zc":"8-14","zcstr":"8,9,10,11,12,13,14","zctype":"0",
   "croombh":"5B-704","jxlmc":"5号","pkid":"5a6e6d83cd5aef0ce065000000000001"},
  {"kcbh":"20605005A","djc":8,"djs":4,"zc":"8-14","zcstr":"8,9,10,11,12,13,14","zctype":"0",
   "croombh":"5B-704","jxlmc":"5号","pkid":"5a6e6d83cd5bef0ce065000000000001"}
]
```

→ 去重后应得到 **2 张卡片**：
1. 星期一 大节4（小节 7-8），第 7 周（单周），教室 `2-209`（2号）
2. 星期一 大节4（小节 7-8），第 8-14 周，教室 `5B-704`（5号）
