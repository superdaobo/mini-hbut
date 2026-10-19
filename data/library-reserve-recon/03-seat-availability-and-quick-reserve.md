# 座位预约 · 余量与快速预约接口实测契约（2026-10-16 第二轮勘察）

> 勘察方式：MCP 浏览器（已登录超星）+ 页面脚本静态分析（`office-static.chaoxing.com`）
> 触发背景：用户反馈「座位预约应该能查到哪儿有空座位、并且能预约时间，现在什么都没有显示」——
> 第一轮勘察只做了 `seatengine/index`（配置 + 我的预约），**漏掉了余量查询与快速预约这一整条链路**。
> 本文件是新增能力的事实依据。**所有结论均为实测**（含请求/响应原文）。

---

## 〇、为什么第一轮漏了

座位首页（`/front/apps/seatengine/index`）的「快速预约」按钮走 `AppUtils.openUrl()`（超星 App 原生桥接），
浏览器里点不动；二级页 `/front/apps/seatengine/list` 在浏览器直接访问返回
「未查询到您所访问的应用，请咨询管理员配置是否正确」（**该页确实不可用**）。

但 **`/front/apps/seatengine/live/select`（快速预约页）是可以直接打开的**，
且其页面脚本 `apps/seatengine/submit/live/third/seat_live_third.js` 明写了整条余量/预约接口。
第一轮只测了 `list` 就下了「座位只能走 App」的结论 —— 结论过窄。

---

## 一、请求形态

- Base：`https://reserve.chaoxing.com/data/apps/`
- **全部为 `POST`**（页面里 `loadData(url, data)` = `$.post(url, data)`），
  `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`
  （实测 GET 也返回同样结果，但实现按 POST 对齐页面）
- 公共标识：`seatId=3597`、`seatIdEnc=<落地页注入>`、`deptIdEnc=<落地页注入，实测为空字符串也有效>`

---

## 二、只读接口（已实测可用）

### 1）区域（一/二/三级）`seatengine/levels`

```text
POST seatengine/levels        { seatId: '3597', type: 0 }                       → 一级区域
POST seatengine/levels        { seatId: '3597', type: 1, firstLevelName: '…' }  → 二级区域
POST seatengine/levels        { seatId: '3597', type: 2, firstLevelName, secondLevelName } → 三级区域
```

实测（type=0）：

```json
{"data":{"levels":[{"firstLevelName":"四楼D区（有插座）"},{"firstLevelName":"二楼A区（现刊报纸阅览室）"}]},"success":true}
```

实测（type=1，四楼D区）→ `{"data":{"levels":[]},"success":true}`（该区无二级划分，正常）

### 2）可选时间范围 `seatengine/getstartendtime`

```text
POST seatengine/getstartendtime   { deptIdEnc: '', seatId: '3597' }
```

实测：

```json
{"data":{"ymd":"2026-10-16","commonPauseTimes":[],"startTime":0,"endTime":50400000},"success":true}
```

> `startTime` / `endTime` 为「当日毫秒偏移」（0 → 50400000 = 14:00）。
> 页面用 `seatConfig.timeUnit`（实测 60 分钟）把该区间切成可选时间片。

### 3）按时间找空座位 `seatengine/getseatinfo`（**核心：余量/匹配座位**）

```text
POST seatengine/getseatinfo
  { seatId: '3597', deptIdEnc: '', startTime: 'HH:mm', endTime: 'HH:mm',
    firstLevelName: '', secondLevelName: '', thirdLevelName: '' }
```

实测（三组，均 `success:true`）：

| 请求 | 返回 `data.matchReserve` |
| --- | --- |
| 明天 09:00-11:00 | `{"duration":"2.0","roomId":13248,"seatNum":"136","firstLevelName":"二楼A区（现刊报纸阅览室）","startTime":1792112400000,"endTime":1792119600000}` |
| 今天 20:00-21:00 | `{"duration":"1.0","roomId":10892,"seatNum":"016","firstLevelName":"四楼D区（有插座）","startTime":1792152000000,"endTime":1792155600000}` |
| 指定四楼D区 明天 09:00-11:00 | `{"duration":"2.0","roomId":10892,"seatNum":"114","firstLevelName":"四楼D区（有插座）"}` |

> 语义：**「给我一个该时段可用的座位」**（系统自动分配），而不是列出全部座位图。
> 页面在匹配成功后开始倒计时（`countDownSecond`）——即该座位被临时锁定，需在倒计时内提交。

### 4）房间列表（容量/开放时间）`seatengine/room/list`

```text
POST seatengine/room/list   { seatId: '3597', seatIdEnc: '<enc>' }
```

实测 `totalRow=2`：

| id | firstLevelName | capacity | reserveBeforeDay | reserveBeforeTime | reserveAfterDay | reserveAfterTime | gridStyle | picSeatMode |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10892 | 四楼D区（有插座） | 118 | 1 | 08:00 | -1 | 12:00 | 1 | 1 |
| 13248 | 二楼A区（现刊报纸阅览室） | 240 | 1 | 08:00 | -1 | 12:00 | 0 | 2 |

### 5）风控 / 验证码能力开关（决定提交是否可自动化）

```text
POST seat/risk/check/config { appType: 2, appId: '3597' }
  → {"data":{"riskCheckOpen":false,"riskCheckType":0,"riskCheckAfterMilliSecond":0,"riskCheckBeforeMilliSecond":0},"success":true}
POST seat/captcha/type      { appType: 2, appId: '3597' }
  → {"data":{"captchaType":0,"captchaOpen":true,"openType":0,"beforeMilliSecond":0,"afterMilliSecond":0},"success":true}
```

`seatengine/index` 的 `seatConfig` 相关实测值：

```text
securityVerify=1  securityVerifyType=0  timeType=0  timeUnit=60
minReserveDuration=1  reserveDuration=4  reserveMode=0  allowReserveNow=0
verifySno=0  templateType=1  type=座位
```

> **风控关闭**（`riskCheckOpen=false`）→ 提交**不需要**网易易盾 `wyToken`（页面里 `wyToken` 传空串）。
> **`securityVerify=1`** → 页面会走 `getCaptchaType()`，即**提交需要验证码**。

---

## 三、写接口 `seatengine/submit`（静态提取 + 安全试探，**未真实提交**）

页面源码（`seat_live_third.js`）：

```javascript
function doSubmit(_this, wyToken) {
  var paramObj = {
    roomId: _this.matchReserve.roomId,
    startTime: moment(_this.matchReserve.startTime).format('HH:mm'),
    endTime:   moment(_this.matchReserve.endTime).format('HH:mm'),
    day:       moment(_this.matchReserve.startTime).format('YYYY-MM-DD'),
    captcha:   _this.captcha,
    seatNum:   _this.matchReserve.seatNum,
    wyToken:   wyToken,
    wfwEngineEnc: wfwEngineEnc
  }
  loadData('data/apps/seatengine/submit', {
    roomId, startTime, endTime, day, captcha, seatNum, wyToken, wfwEngineEnc,
    enc: submitVerify.verifyParam(paramObj)      // ← 客户端签名
  })
}
```

参数清单（除 `enc` 外全部来自 `getseatinfo` 的 `matchReserve`）：

| 参数 | 来源 | 说明 |
| --- | --- | --- |
| `roomId` | `matchReserve.roomId` | 实测 10892 / 13248 |
| `seatNum` | `matchReserve.seatNum` | 实测 `"016"` / `"114"` / `"136"`（**带前导零的字符串**） |
| `startTime` / `endTime` | `matchReserve.startTime/endTime` | 格式化为 `HH:mm` |
| `day` | `matchReserve.startTime` | 格式化为 `YYYY-MM-DD` |
| `captcha` | 用户输入 | `securityVerify=1` → 需要 |
| `wyToken` | 易盾 SDK | 风控关闭 → 空串 |
| `wfwEngineEnc` | 页面注入 | 实测 `9C32209DB3CDFF7CC351BD42FF5C8270`（= 入口链的 `wfwEnc`） |
| `enc` | `submitVerify.verifyParam(paramObj)` | **jsjiami.com.v5 混淆脚本**生成的签名（`apps/common/enc/min/submitVerify.min.js`，10.6KB） |

### 安全试探（**未产生任何预约**）

用「空 roomId / 空 seatNum / 空时间」请求 `submit`：

```json
{"msg":"预约区域不存在，请咨询管理员该区域是否被关闭","success":false}
```

> 说明服务端**先校验业务参数（roomId）**，因此该试探**无法判定 `enc` 是否必需**。
> 判定签名是否强校验的唯一方法是一次**真实提交**（会真的占用座位、且未签到会计违约）——
> 必须由用户手动执行，我方不代为提交。

---

## 四、与既有实现的差距（本次要补的）

| 能力 | 现状 | 本轮目标 |
| --- | --- | --- |
| 区域列表 | 无 | 新增（`levels`） |
| 可选时段 | 无（只用 `commonTimeConfig` 静态展示） | 新增（`getstartendtime` + `timeUnit`） |
| **查空座位** | **无**（用户上报「什么都没有」） | 新增（`getseatinfo` → 座位号 + 区域） |
| 房间容量 | 无 | 新增（`room/list`） |
| 提交预约 | 无 | 需签名 + 验证码，单独一轮（用户手动实测） |
| 取消预约 | 有按钮，但端点未验证、`aprvId` 恒为 0 | **本轮移除**（用户要求） |

---

## 五、仍需实测/决策

1. `enc` 签名是否服务端强校验（需一次真实提交；**需用户授权**）。
2. 验证码形态：`captchaType=0 / openType=0` 的实际含义与图片获取端点（未勘察）。
3. `getseatinfo` 的座位锁定时长（`countDownSecond` 初值）与超时行为。
4. `startTime/endTime` 的边界（`endTime=50400000` 与房间 `monEndTime 22:00` 不一致，需核对是否为「当日毫秒偏移」）。
