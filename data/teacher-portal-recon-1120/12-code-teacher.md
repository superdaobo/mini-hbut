# 12 · 一码通 `code.hbut.edu.cn` 教师端接口勘察

> 负责人：子代理 C2（收尾）。数据基线：`raw/code-teacher-probe.json`（160 条实测记录，已脱敏）。
> 探测方式：真实教师账号 CAS → 一码通 SSO 换票，**全部只读**。

---

## 一、只读声明

- ✅ 只发 POST 纯查询（`info` / `config` / `list` / `type` / `quota` / `account` / `notice` 类）
- ❌ 未调用：`bindCard`、`unbind`、`reportLoss`、`scanPay`、`payMoney`、`updatePassword`、`transferTicket`、`recharge`/`pay`（下单）、`virtualCard/qrcodeOnline|qrcodeOffline|qrcodeTicket`（生成付款码）、`consume/*`（下单/核验）、`refund` 写操作、`utilities` 缴费提交
- `virtualCard/orderStatus` 用 `orderNo:'0'` 试探（只走到参数校验层，未触发任何订单）
- 姓名 / 工号 / 手机号 / 卡号 / token 已脱敏（`***NAME***`/`***SID***`/`***PHONE***`/`***TOKEN***`）

---

## 二、鉴权与加密

| 项 | 实测结论 |
| --- | --- |
| 鉴权头 | `Authorization: <accessToken>`（**无 Bearer 前缀**）；同值再放 `token` 头亦可 |
| 方法 | **必须 POST + `Content-Type: application/json`** |
| token 续期 | `POST /server/auth/updateToken`，body `{refreshToken}`，免鉴权；accessToken 约 1h 有效 |
| 加密 | 少数接口响应是 `{"data":"<SM4-ECB-Base64>"}`（key `w687-9+3C_H&je_5`，UTF-8 16 字节），解密后才是标准信封 |
| Referer | 建议带 `https://code.hbut.edu.cn/`（实测不带也通） |

### ⚠️ POST-only 坑（错误形态对照表）

| 调用方式 | 实测返回 | 含义 |
| --- | --- | --- |
| `GET /server/user/info` | `{"success":false,"message":"??"}` | **不是 405、不是路由错**，就是「请用 POST」。排查时看到 `"??"` 第一反应换成 POST |
| `POST` 无 `Authorization` | `{"success":false,"message":"token失效,请重新登录"}` 或 401 | token 缺失/过期 → `updateToken` 续期，**不要重登 CAS（会顶号）** |
| `POST` 到不存在路径 | HTTP 404 | `/server/auth/getLoginUser`、`/server/auth/getUserInfo` 是真 404（该路径不存在），不要误判为掉登录 |
| `POST` 角色无权限 | HTTP 403 | `merchant/*`、`iotdevice/*`，角色裁剪是 HTTP 层不是业务码 |
| `POST` 参数校验失败 | `success:false` + `code:"valid_error_1004"` + `message:"<字段>:<说明>不能为空"` | 逐个字段报错，可用来**反推必填参数清单** |
| `POST` 服务端未实现 | `success:false` + `resultData:"CORE10004"` + `message:"操作失败"` | bllt 全家桶，学生教师一致 |
| `POST` 业务空集 | `success:true` + `resultData:[]` 或 `{list:null,totalSize:0}` | 合法态，不是失败 |

---

## 三、教师身份字段（`POST /server/user/info`，SM4 解密后，已脱敏）

| 字段 | 实测值 | 学生参照 |
| --- | --- | --- |
| `positionCode` / `positionName` | `"01"` / `"教职工"` | 学生为学籍类 code |
| `idSerial` / `accNo` | `***SID***`（8 位工号） | 学号 |
| `balance` | `"2629.42"` | 结构同 |
| `accStatus` / `accStatusName` | `"1"` / `"正常"` | 同 |
| `hasCard` / `cardStatus*` / `cardId` / `cardType` | `false` / `null` / `null` / `null` | 学生有实体卡 |
| `hasVirCard` | `true` | — |
| `qrcodeStatus` / `qrcodeStatusName` | `"1"` / `"正常"` | 同 |
| `maxAmtCard` / `maxAmtTotalCard` | `"0.00"` / `"0.00"` | — |
| 顶层 | `pwdModifyTip`（弱密码提示）、`balanceLessRecharge:false`、`groupEnabled:false` | 同构 |

**账户结构（`user/tradeListConfig`）**：`主账户 accType=0 balance=0.00` + `补助钱包 accType=A10004950 balance=2629.42`。
教师余额全部在**补助钱包**（专款专用补贴），主账户为 0 —— 展示余额必须用 `accTypes` 聚合，不能只显示主账户。

---

## 四、按域分节接口表

状态缩写：✅ 通（有数据或合法空集）｜⚠️ 需参数已探明但值不可得｜❌ 未实现/无权限/404｜⏭ 未跑

### 4.1 身份 / 认证

| 路径 | 方法 | 必填参数 | 实测 | 业务字段 | SM4 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| `/server/user/info` | POST | — | ✅ 200 | `user.{positionCode,positionName,balance,accStatus,hasCard,hasVirCard,qrcodeStatus,tel}` | **是** | 教师档案主入口 |
| `/server/auth/getEncrypt` | POST | — | ✅ | `publicKey`（登录加密公钥） | 否 | 登录链路用 |
| `/server/auth/updateToken` | POST | `refreshToken` | ✅（免鉴权） | `accessToken/refreshToken` | 否 | 续期唯一入口 |
| `/server/auth/casConfig` | POST | `code` | ⚠️ 无值可试 | — | 否 | 学生侧 `{}` 即通，教师侧要 code；无影响 |
| `/server/auth/organizations` | POST | `code` | ⚠️ 参数非法 | — | 否 | 同上 |
| `/server/auth/getToken` | POST | `tid` | ⚠️ 无值可试 | — | 否 | 换票链路 |
| `/server/auth/bindCard/config` | POST | `code` | ⚠️ | — | 否 | 绑卡页配置，教师 hasCard=false 可不绑 |
| `/server/auth/getLoginUser` | — | — | ❌ 404 | — | — | 死端点 |
| `/server/auth/getUserInfo` | — | — | ❌ 404 | — | — | 死端点 |
| `/server/captcha/get` | POST | ? | ❌ 参数不明 | — | 否 | 登录验证码，接入不需要 |

### 4.2 卡务

| 路径 | 方法 | 必填参数 | 实测 | 业务字段 | SM4 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| `/server/card/config` | POST | — | ✅ | `{"type":"0"}` | 否 | 挂失页配置 |
| `/server/card/lossList` | POST | `idSerial`（学工号） | ✅ | 挂失记录列表（教师=`[]`） | **是** | 参数校验错误也走 SM4 |
| `/server/card/pickupList` | POST | — | ✅ | 拾卡登记（教师=「没有查询到历史记录」） | **是** | — |
| `/server/cardCost/config` | POST | — | ✅ | `cardCost:"20"`,`hasCard:false` | 否 | 补卡工本费展示 |

### 4.3 交易流水（教师**能查自己流水**，本域价值最高）

| 路径 | 方法 | 必填参数 | 实测 | 业务字段 | SM4 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| `/server/user/tradeList` | POST | `tradeType,fromDate,toDate`（`pageNo,pageSize`） | ✅ 有真实记录 | `[{summary,merchantName,date,amt,isRefund,journo}]` | 否 | `tradeType:"1,2,3"`；教师有超市消费 + 补贴记录 |
| `/server/user/tradeListConfig` | POST | —（`{balance:true}` 切余额模式） | ✅ | `tradeTypes`,`accTypes[{typeCode,typeName,balance}]` | 否 | **余额从这里取**；balance 模式 tradeType 变 `11,12,13` |
| `/server/user/tradeListType` | POST | — | ✅ | `[{type,name}]` | 否 | 仅类型枚举，无账户 |
| `/server/user/balanceTradeList` | POST | `tradeType(11,12,13),fromDate,toDate,accType` | ✅ 补助钱包 24 条 | `{list:[{summary,amt,balance,txDate,in,isV5}]}` | 否 | `accType:"0"`(主)=0 条；`"A10004950"`(补助)=24 条 |
| `/server/user/custom/tradeList` | POST | `tradeType(1/2),fromDate,toDate` | ✅ 20 条 | `{data:{list:[{summary,merchantName,amt,in,accTypeName,tradeType}]},sumAmt}` | 否 | 带合计 `sumAmt`，按账户分 |
| `/server/user/custom/tradeListConfig` | POST | — | ✅ | 同上 + `sumConsumeAmt` | 否 | — |
| `/server/user/tradeInfo` | POST | `journo`（推断） | ⏭ 未跑（需先取单号） | 单笔详情 | ? | 列表的 `journo` 可作参数 |
| `/server/user/systemMTradeListByPage` | POST | `tradeType,fromDate,toDate` | ❌ `CORE10002` 未知业务操作 | — | 否 | 服务端不认，学生侧同死 |
| `/server/user/repayList` | POST | `tradeType,fromDate,toDate` | ✅ `[]` | — | 否 | 补缴/欠费列表，教师无欠费 |
| `/server/user/payConfig` | POST | — | ✅ | `facePayEnable:true,fingerprintPayEnable:false` | 否 | 支付方式开关 |
| `/server/user/idPhoto` / `idFacePhoto` | POST | — | ✅ | `photoImg:null,checkEnable:false` | 否 | 教师未传照片 |
| `/server/user/getBankConfig` | POST | — | ✅ | 退款银行卡清单（8 行） | 否 | — |
| `/server/user/getFaceAgreement` | POST | — | ✅ | 人脸协议文本（null=未配置） | 否 | — |
| `/server/user/getResetPwdConfig` | POST | — | ✅ | `{"type":"1","orgId":2}` | 否 | — |
| `/server/user/idtypeList` | POST | — | ✅ `[]` | — | 否 | — |
| `/server/relatedUser/list` | POST | — | ✅ `[]` | — | 否 | 亲属账户，教师无 |
| `/server/transFormal/getAuditResult` | POST | — | ✅ | `tranStatus:"-1"`（无在途） | 否 | 转账审核状态 |

### 4.4 账单聚合 `bllt/*`（**服务端整体未实现**）

| 路径 | 必填参数 | 实测 | 备注 |
| --- | --- | --- | --- |
| `/server/bllt/queryBathInterestBill`、`queryBoilingInterestBill`、`queryCardSelfTradeList`、`queryChartList`、`queryConsumeGroupByType`、`queryConsumeTotalDay`、`queryConsumeTradeTatol`、`queryMealInterestBill`、`queryUserMonthlybillHalfOfYear`、`queryRechargeGroupBy*`、`querySingleRechargeRank` | 参数带齐也失败 | ❌ `resultData:"CORE10004"` + `message:"操作失败"` | **学生教师一致**，服务端功能未上线，不要做 |
| `/server/bllt/querySuperMarketInterestBill` | — | ✅ `resultData:{}` | 唯一返回成功的，数据空 |
| `/server/bllt/queryOpenMertypeScene` | — | ✅ | 账单页场景配置（图表类型/标题/图片），前端硬编码可抄 |
| `/server/bllt/querySingleConsumeRank` | `starttime,endtime,sortOrder,sortName,pageNumber(?)` | ❌ 卡在第 4 个参数校验 | 参数名链已探明 4 级（starttime→endtime→sortOrder→sortName→pageNumber），`pageNumber` 传入仍报空，疑为服务端 bug；低价值，弃 |

### 4.5 水电缴费（utilities + water）

| 路径 | 必填参数 | 实测 | 业务字段 | 备注 |
| --- | --- | --- | --- | --- |
| `/server/utilities/typeList` | — | ✅ | `[{utilityType,enable,bind}]` | **教师：water/electric `bind:""`，broadband `bind:"***SID*** 罗*均"`（已绑宽带账号）** |
| `/server/utilities/config` | `utilityType`(water/electric/broadband) | ✅ | `templateList`（展示字段）、`amtGroupList`（金额档）、`payWayList`、`tip`、`needPwd` | 电费提示「02:00-23:00 可缴」 |
| `/server/utilities/location` | `utilityType,locationType,+上级 id` | ✅ | 级联 `bigArea→area→building→unit/level→room` | 教师可见全楼宇树（东苑公寓、主分区等），但**自身未绑房间** |
| `/server/utilities/account` | 房间六元组 + `utilityType` | ✅ | `balance,utilityAccount,utilityUsername,templateList[].value` | 传空房间返回的是**账户级余额**（校园卡余额）；电费余额 `value:null` |
| `/server/utilities/usageDetails` | 房间六元组 + `utilityType` + 日期 | ⚠️ | — | 空房间 → `所选房间不支持查询历史用电量`（非 403，是数据态） |
| `/server/utilities/packageList` | `utilityType` | ❌ | — | electric/broadband 均 `返回结果为null` |
| `/server/water/config` | — | ✅ | `appointList,todayAppoint,roomAppoint,enableScan,enableBluetooth,deviceTip` | 水控全局配置 |
| `/server/water/roomList` | — | ✅ `[]` | — | **教师无可用房间**（学生有绑定宿舍） |
| `/server/water/device/myList` | — | ✅ `[]` | — | 教师无绑定水控设备 |
| `/server/water/appointList` / `unstoppedList` | — | ✅ `[]` | — | 无预约 |
| `/server/water/appointCount` | `roomCode,timeList` | ⚠️ | — | 无房间可传，弃 |
| `/server/water/device/info` | `posCode` | ❌ | — | `POS设备不存在`（试探值）；教师无设备场景 |
| `/server/water/limitList` | — | ✅ | `hotWater/bathRoom{maxFare:"10",maxTime:"30"}` | 限额展示 |
| `/server/water/roomConfig` | — | ✅ | `manClosed/womanClosed{fromTime,toTime}` | 浴室开放时段 |
| `/server/water/tradeList` | `pageNo,pageSize` | ✅ `{list:null,totalSize:0}` | — | 带参后确认是**空数据**而非无权限 |
| `/server/water/freeWatreTradeList` | `pageNo,pageSize` | ✅ 空 | — | 同上 |
| `/server/water/freeWaterQuota` | `txdate` | ✅ | `totalQuota/userQuota/remainingQuota:"0.00"` | 教师**无免费水额度**（学生有补贴额度） |

### 4.6 校园码 `virtualCard/*`（只读三件套已验证）

| 路径 | 必填参数 | 实测 | 业务字段 | 备注 |
| --- | --- | --- | --- | --- |
| `/server/virtualCard/config` | `devCode`（可选） | ✅ | `enableOffline:true,displayBalance:true,displayInfo:true,refreshSecond:60,enableToRecharge:false,enableScan:false` + 说明文档 HTML | `qrcodeStatus:"正常"`，教师可用校园码 |
| `/server/virtualCard/getTicketInfo` | — | ✅ | `transferUsePhone,checkUserPhone,canUseList:[],overdueList:[]` | 票券，教师无券 |
| `/server/virtualCard/offlineSeq` | — | ✅ | `{"version":0}` | 离线码序号版本，只读 |
| `/server/virtualCard/orderStatus` | `qrcode` | ⚠️ 参数校验通过即弃 | — | 不生成码就不该调 |
| `/server/virtualCard/qrcodeOnline` / `qrcodeOffline` / `qrcodeTicket` / `qrcodeOfflineByWechatApp` | — | ⏭ **刻意未跑**（产物型） | — | 生成付款码，接入时按 60s 刷新 |

### 4.7 首页 / 通知

| 路径 | 必填参数 | 实测 | 业务字段 | 备注 |
| --- | --- | --- | --- | --- |
| `/server/home/appList` | — | ✅ **19 项** | `[{name,code,linkUri,type,columnName,thirdApp}]` | 教师可见应用清单（见差异表） |
| `/server/home/config` | — | ✅ | `appName:"校园一码通",enableSms:false` | 全局配置 |
| `/server/home/cardStyleConfig` | — | ✅ | 校名/logo/卡面样式 | — |
| `/server/home/mealTimeConfig` | — | ✅ | 早/中/晚餐时段 | — |
| `/server/home/getAutoFlushQRTime` | — | ✅ | `autoflushqrtime:"60"` | 码刷新秒数 |
| `/server/home/birthdayMessage` | — | ✅ | `birthday:false` | — |
| `/server/home/noticeTypeList` | — | ✅ | `01 校园公告 / 02 校园新闻` | — |
| `/server/home/noticeList` | `type`（或 `typeCode`） | ✅ | `[{id,title,content(HTML),publishAt,publisher,unread}]` | `type:"01"` 与 `{type:0,typeCode:""}` 均通 |
| `/server/home/notice` | `id` | ✅ | 单条通知详情（HTML content） | id 从 noticeList 取 |
| `/server/home/tip` | `code` | ✅ `resultData:null` | — | `home`/`recharge` 均无浮层配置 |
| `/server/home/image` / `imgCode` | ? | ❌ 参数不明 | — | 轮播图/图形码，低价值弃 |

### 4.8 班车 `car/*`

| 路径 | 必填参数 | 实测 | 备注 |
| --- | --- | --- | --- |
| `/server/car/config` | — | ✅ | `defaultX/Y,routeId,baiduMapKey…` 全 null |
| `/server/car/routeList` | — | ✅ `[]` | **未开通班车** |
| `/server/car/getRoute` / `shiftList` | `routeId` | ✅ 空结构 | 传 `routeId:"1"` 返回全 null 骨架 + `shiftList:[]` |

### 4.9 商户 `merchant/*` 与 IoT（**教师全 403**）

| 路径 | 必填参数 | 实测 | 备注 |
| --- | --- | --- | --- |
| `/server/merchant/myList` `myPosList` `sumList` `tradeList` | 日期等 | ❌ **HTTP 403** | 商户角色专属，教师被拒（与学生一致） |
| `/server/merchant/report`、`report/*`、`sum`、`sumByMealTime|ByPrice|ByTxCode`、`operator` | 各参数 | ❌ 未跑/参数校验 | 403 域，不必补 |
| `/server/iotdevice/devices` `devicescounts` `devicetype` | — | ❌ **HTTP 403** | IoT 设备管理角色，教师不可见 |
| `/server/blueutil/*`（4 端点） | — | ❌ `失败` | 蓝牙钥匙，App 端能力、Web 无效 |
| `/server/alumuns/*`（6 端点） | `code` | ❌/⚠️ | 校友/临时用户域，教师角色无关 |
| `/server/apply/queryProgress` | 不明 | ❌ `CORE20055` | 办卡进度，教师无场景 |
| `/server/consume/paySuccessInfo` | 订单号 | ⚠️ 参数校验 | 支付回调展示，无码则无单 |
| `/server/pay/withholdStatus` | — | ❌ `dkchannelcode未配置` | 代扣渠道未配 |
| `/server/recharge/orderStatus` | `partnerJourno` | ⚠️ | 下单后才有 |

### 4.10 退款 `refund/*` 与充值 `recharge/*`（只读部分）

| 路径 | 必填参数 | 实测 | 业务字段 | 备注 |
| --- | --- | --- | --- | --- |
| `/server/refund/getRefundList` | `startDate,endDate` | ✅ `[]` | 退款记录分页 | — |
| `/server/refund/page` | — | ✅ | `flag,idserial,bankTitle,refundDes,donateEnabled:false` | **毕业生退款页文案对教师也返回**（提示面向毕业生，教师可忽略 flag=0） |
| `/server/refund/banklist` | — | ✅ | 8 家银行 | — |
| `/server/refund/donateConfig` | — | ✅ | 校友捐赠页配置 | — |
| `/server/refund/getRefundMode` | — | ✅ | `selfrefund_mode:"0"` | — |
| `/server/refund/getRechargeRecords`/`getRefundList`/`getABCRefundStatus` 等 | 各参数 | ⏭ 未跑 | — | 同质分页查询 |
| `/server/recharge/config` | — | ✅ | `balance,idSerial,amtGroupList(20/50/100),daLianPayList` | 充值档位，教师可充补助钱包外的主账户 |

---

## 五、教师 vs 本科生差异表

学生侧数据：`probe-out/yikatong.json`（64 端点实测）。

| 维度 | 教师（实测） | 本科生（参照） | 接入影响 |
| --- | --- | --- | --- |
| 身份 | `positionCode:"01"` 教职工；`hasCard:false`，**无实体卡**，无挂失场景 | 有实体卡 + 卡状态 | 教师端 UI 隐藏挂失/补卡（`cardCost` 仍返回 cardCost:"20" 但无卡） |
| 账户 | 主账户 `0.00` + **补助钱包 A10004950 = 2629.42**（专款专用补贴） | 主账户有余额 | **余额展示必须聚合 accTypes**；教师消费走补贴钱包（`tradeType` 含 3=补助） |
| 交易流水 | `tradeList`/`balanceTradeList`/`custom/tradeList` **全部有真实数据**（食堂/超市消费+补贴） | 同接口有数据 | 流水功能对教师**完全可用**，参数形态与学生一致 |
| 水电绑定 | `typeList`：water/electric `bind:""`，**broadband 已绑「工号+姓名」**；`freeWaterQuota=0`；`roomList/device/myList=[]` | electric 绑定「东苑公寓7栋…101房间」，有免费水额度 | 教师**不能查水电余额/明细**（未绑房间），但**能缴教育网网费**（broadband 已绑） |
| 水控 | `water/*` 全部合法空集或 `0.00` | 有房间设备、预约 | 教师端隐藏水控模块 |
| 可见应用 | **19 项**：含校园码、开门助手、美餐点餐、校园生活服务平台、北苑16-17栋生活应用、运动场馆预约、湖工小实 | 学生清单截断，核心项同构；教师专属 = 开门助手、场馆预约等 | 接 `home/appList` 做入口聚合，别硬编码 |
| 商户 | `merchant/*` **403**（同学生） | 403 | 两端都不能做商户报表 |
| IoT | `iotdevice/*` **403** | 未实测（推断同） | 不做 |
| bllt | `CORE10004` 未实现（同学生） | 同 | 账单聚合两端都别接 |
| 班车 | 未开通（`routeList=[]`） | 同 | 不做 |
| auth | `casConfig`/`organizations` 要 `code` 且教师侧校验更严 | 学生 `{}` 通 | 登录链路无关，忽略 |

---

## 六、错误码速查

| 形态 | 例 | 含义 / 处理 |
| --- | --- | --- |
| HTTP 403 | `merchant/*`、`iotdevice/*` | 角色裁剪，永久拒绝，重试无用 |
| HTTP 404 | `auth/getLoginUser`、`auth/getUserInfo` | 路径不存在（**不是掉登录**） |
| `message:"??"` | 任何 GET | 该接口 POST-only，换 POST |
| `message:"token失效,请重新登录"` / 401 | token 过期 | `auth/updateToken` 续期即可，勿重登 |
| `code:"valid_error_1004"` | 缺参 | `message` 逐个列出 `<字段>:<说明>不能为空`，按名补 |
| `resultData:"CORE10004"` | `bllt/*` | 服务端功能未实现 |
| `code:"CORE10002"` | `systemMTradeListByPage` | 未知业务操作（接口名存在但后端不认） |
| `code:"CORE20055"` | `apply/queryProgress` | 参数不完整（业务态） |
| `message:"CORE10008"` | `queryOpenMertypeScene` | **成功**但 message 是错误码文本的怪癖，看 `success:true` |
| 业务拒绝文案 | `POS设备不存在`、`所选房间不支持查询…`、`dkchannelcode未配置`、`code:"根据订单号…参数缺失"` | 放 `code` 或 `message` 字段，形态不固定，别只靠 message |

---

## 七、未覆盖项与原因

| 项 | 原因 |
| --- | --- |
| `virtualCard/qrcodeOnline|Offline|Ticket` | **产物型**：会生成真实付款码，只读红线不调；接入时照 `refreshSecond:60` 轮询即可 |
| `consume/paySuccessInfo`、`recharge/orderStatus`、`refund/getRechargeRefundMode` 等 6 个 refund 变体 | 需要真实单号/流水号，只读场景下无法合法构造；参数校验已探明 |
| `alumuns/*`（校友）、`apply/queryProgress`、`captcha`、`home/image|imgCode`、`blueutil/*` | 角色无关或参数形态不可合法获得，低价值 |
| `user/tradeInfo`、`tradeRefundInfo`（单笔详情） | 需 `journo`：已从 tradeList 拿到形态，接入时按 `journo` 字段直接传 |
| `merchant/report/*`、`sum`、`operator` | 403 角色域内，无需补参数 |
| `smartWaterAndElectricityService/*`（SWAE H5 水电子系统） | 学生侧是独立 H5（`getbindroom`/`h5_getstuindexpage`），教师**未绑房间无会话对象**，跳过 |
| `third/open` 三方跳转链 | 需要 state 参数与三方会话，与只读勘察目标无关 |

---

## 八、给 App 的接入建议（Top 8，按移动端价值排序）

1. **余额 + 补助钱包聚合**：`user/tradeListConfig`（`accTypes[].balance`）——教师钱在补助钱包 A10004950，单看主账户会显示 0 元。
2. **本人交易流水**：`user/tradeList`（`tradeType:"1,2,3"` + 日期范围 + `pageNo/pageSize`）＋ `user/balanceTradeList`（余额变动视角，含 `balance` 快照字段）。教师实测有食堂/超市真实数据，**这是教师端最高价值接口**。
3. **校园码展示**：`virtualCard/config`（`enableOffline`、`refreshSecond:60`、`displayBalance`）＋ `home/getAutoFlushQRTime`；生成码的 `qrcodeOnline/qrcodeOffline` 属产物型，接入时单独立项并加防截屏/时效逻辑。
4. **教育网网费（broadband）**：教师 `typeList` 里 broadband 已绑定 `工号+姓名` → `utilities/config`（金额档/支付方式）＋ `utilities/account` 可查账户。**教师唯一能「缴」的费**，水/电因未绑房间不可做。
5. **站内通知**：`home/noticeTypeList` → `home/noticeList{type}` → `home/notice{id}`，有 `unread` 标记，可做通知中心/红点。
6. **应用入口聚合**：`home/appList` 19 项动态下发（含 `thirdApp` 外链项），按 `columnName` 分组渲染，别写死菜单——教师与学生清单不同源下发，天然按角色裁剪。
7. **卡务瘦身**：教师 `hasCard:false`，只保留 `card/config` + `pickupList`（拾卡寻主）展示；挂失/补卡（`lossList`/`cardCost`）对学生显示、对教师隐藏或降级为「未持卡」提示。
8. **人脸采集状态**：`user/idFacePhoto`/`idPhoto`（`photoImg/checkStatus`）＋ `payConfig`（`facePayEnable`）——教师人脸支付开关已开但未传照片，可做「去采集」引导入口。

**接入硬约束**：
- 全链路 **POST JSON + `Authorization` 裸 token**，见 GET 一律 `"??"`；
- `data` 为长字符串的响应先 SM4-ECB（key `w687-9+3C_H&je_5`）解再按信封解析；
- token 1h，用 `auth/updateToken` 静默续，**绝不重走 CAS（互踢顶号）**；
- `bllt/*`（账单聚合）服务端 `CORE10004` 未实现，**不要排期**；
- `merchant/*`、`iotdevice/*` 403 角色墙，教师学生都过不去。
