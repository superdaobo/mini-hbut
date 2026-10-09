# 02 · 登录链路、身份字段与权限模型

> 本文件只描述**只读**的登录与身份识别链路。登录本身是「建立会话」而非「修改业务数据」，
> 属于访问系统的必要前提，已在本次勘察中实际执行。
> 所有**业务写型接口**见 [`07-write-endpoints-denylist.md`](07-write-endpoints-denylist.md)。

---

## 1. 门户层：教师与学生共用同一套 CAS 登录

登录页：`https://auth.hbut.edu.cn/authserver/login`（标题「统一身份认证平台」）
**关键点：账号输入框的占位符就是「请输入学号/工号」** —— 门户层不区分教师与学生。

### 1.1 登录表单（`form#pwdFromId`，POST 到 `/authserver/login`）

| 字段 | 示例 / 说明 |
| --- | --- |
| `username` | 学号或**工号**（本次用 `<教师工号>`） |
| `passwordText` | 明文密码（仅前端输入框，不提交） |
| `password` | **隐藏域** = `AES(明文, pwdEncryptSalt)`，提交时由前端 JS 计算 |
| `captcha` | 验证码 |
| `lt` | 登录票据（**实测可为空**） |
| `execution` | 实测 `e2s1` |
| `cllt` | `userNameLogin` |
| `dllt` | `generalLogin` |
| `_eventId` | `submit` |
| `pwdEncryptSalt` | 隐藏域，本次实测 `ydrVRNWwpkrmEGaV`（**每次会话可能不同**） |

### 1.2 验证码

```
GET /authserver/getCaptcha.htl?<时间戳>
```
- 返回 80×30 的 JPEG
- ⚠️ **每次请求都会重新生成并写入会话**。必须「取一次图 → 用同一份字节做 OCR → 立即提交」，
  否则会出现「看到的图 ≠ 会话里的图」

### 1.3 登录成功后的跳转链（实测）

```
POST /authserver/login            → 302
GET  /authserver/index.do         → 302
GET  /authserver/login?service=…  → 307 → 302
GET  <service>?ticket=ST-…        → 落地
```

### 1.4 进入教务系统的正确入口

```
GET https://auth.hbut.edu.cn/authserver/login?service=https%3A%2F%2Fjwxt.hbut.edu.cn%2Fadmin%2Fcaslogin
```
→ 最终落地 `https://jwxt.hbut.edu.cn/admin/?loginType=1`

> **注意**：service 必须用 `/admin/caslogin`。实测直接指向 `/admin/?loginType=1` 时教务会丢弃 CAS ticket，
> 无法完成 ticket → session 交换。

---

## 2. 教务层：身份识别（两条互补的来源）

### 2.1 来源 A：`POST /admin/getMenuList`（推荐，JSON 稳定）

```
POST /admin/getMenuList        # 无请求体；纯查询，无副作用
```

返回菜单树数组，**每个节点**都带身份字段：

| 字段 | 教师账号实测值 | 含义 |
| --- | --- | --- |
| `currentUserId` | `<教务用户ID>` | 教务内部用户 ID（UUID） |
| `userRoleId` | `<用户角色ID>` | 用户-角色绑定 ID |
| `currentRoleId` | **`js`** | **身份类型：`js` = 教师**（学生预期为 `xs`，本次未实测学生账号） |
| `currentJsId` | `<教务教师ID>` | **教务内部教师 ID**（与课表数据的 `ztid` 一致） |
| `currentUserName` | `<教师工号>` | 工号 |
| `currentDepartmentId` | `205` | 部门 ID |
| `dataXnxq` | `2026-2027-1` | 当前默认学期 |
| `dataAuth` | `true` | 数据权限标记 |

菜单节点自身字段：`id`（如 `M160101`）、`name`、`url`、`parentId`、`parentIds`、`type`、`isshow`、`sort`、
`delFlag`、`sfzz/sfgz/sfbk/sfwl`（是否自助/是否规则/…）、`ywmc`（英文名）、`children`。

### 2.2 来源 B：教务首页服务端渲染（兜底）

```
GET /admin/?loginType=1
```

页面 HTML 中直接渲染：

```html
<input id="roleId" type="hidden" value="js">
<input id="adminPath" type="hidden" value="/admin">
<input id="topNavShowHome" type="hidden" value="1">
<div class="headFr"><div class="userInfo">
  <p><span class="admin_name"><教师工号></span><span class="arrowbt"><教师姓名></span></p>
</div></div>
```

→ `#roleId` = 身份；`.admin_name` = 工号；`.arrowbt` = 姓名。

### 2.3 来源 C：教师课表页的隐藏域

```
GET /admin/pkgl/pkgljskb/queryKbForJsd        # 标题「教师端个人课表-Powered by ChaoXing」
```

```html
<input type="hidden" id="xnxq" value="2026-2027-1">
<input type="hidden" id="teacherId" value="<加密teacherId:WGEyQ0…>">
<input type="hidden" id="xqid" value="">
```

→ `#teacherId` 是**服务端加密 ID**（`WGEyQ0…` 前缀），是 `getJskbByXqid` 的必填参数。
未发现客户端可构造的算法，**只能抓取**。

---

## 3. 教师身份与学生身份：接口能力差异（实测）

教师账号访问学生专属接口的表现：

| 学生接口 | 教师账号返回 |
| --- | --- |
| `GET /admin/xsd/xsjbxx/xskp` | HTTP 200 + 错误页「获取学生基本信息出错或登录用户所属身份类型不是学生」 |
| `GET /admin/xsd/pkgl/xskb/queryKbForXsd` | HTTP 200 + 错误页「报错啦」 |
| `GET /admin/xsd/pkgl/xskb/sdpkkbList` | `{"ret":-1,"msg":"功能暂时停用，请联系管理员"}` |

→ **教师端必须走独立接口**，不能复用学生端抓取链路。

---

## 4. 权限模型：菜单 ≠ 接口权限

系统存在**细粒度权限点**，形如 `模块:子模块`。

实测反例（教师账号有「空教室查询」菜单，但底层权限接口返回无权限）：

```
GET /admin/pkgl/pkgljsjyhmd/checkHmdInTime
→ HTTP 401
{"ret":-1,"msg":"没有访问当前接口的权限!Subject does not have permission [pkgl:pkgljsjyhmd]","data":null,"extend":{}}
```

> 接入时的含义：**不要假设「菜单里有 = 接口一定能用」**，需要对 401 做兜底。

---

## 5. 会话要求

- 所有 `/admin/**` 接口都依赖**教务域 Cookie**（`jwxt.hbut.edu.cn`）
- 会话建立方式：CAS ticket → `/admin/caslogin`
- 会话失效表现：请求被重定向到登录页，或返回错误页
- 未发现接口级 token / 签名参数（除 `id` 类的服务端加密参数外，其余为明文查询参数）

---

## 6. 身份字段注入：解析时必须忽略

**绝大多数数组/对象响应的每一条记录**都会被注入下列字段（实测样本）：

```
currentUserId, userRoleId, dataAuth, dataXnxq, currentRoleId,
currentJsId, currentUserName, currentDepartmentId, new
```

其中 `new` 在部分接口为布尔、部分为 `false`；不同接口注入的字段集合可能略有差异。
**这些是框架级注入，不属于业务数据，解析时应一律忽略**（否则会污染数据模型，
且可能把工号/姓名误当成业务字段）。

> 例：`GET /admin/pkgl/pkrwgl/getjsxx` 返回 1087 条「教室」，每条都带 `currentUserName: "<教师工号>"`。

---

## 7. 通用请求约定

| 约定 | 说明 |
| --- | --- |
| 分页 | `page`、`rows`、`gridtype=jqgrid`、`_search=false`、`sort`、`order` |
| `encodeId=1` | 让响应额外带 `encodeId` 字段（前端二次跳转用），**可安全使用** |
| `gridId` | 每个页面网格有固定 id（如 `qxzkbGridIdGrid`、`cjlrszGrid`），供 `queryFieldByGridId` 取列配置 |
| 列名翻译 | `GET /admin/system/gridfield/getTranslation` 返回 `transMap`（如「借用理由」→「借用说明」） |
| 无鉴权变体 | 部分接口带 `NoAuth` 后缀（如 `getKkjysListNoAuth`） |

---

## 8. 错误形态速查（接入必备）

| 形态 | 判定 | 处理建议 |
| --- | --- | --- |
| `{"ret":-1,"msg":"参数传输异常"}` | 缺必填参数 | 补参数 |
| `{"ret":-1,"msg":"数据传输异常"}` | 参数值无效 | 检查参数取值 |
| `{"ret":-1,"msg":"关键参数缺失"}` | 缺关键参数 | 补参数 |
| HTTP 401 + `没有访问当前接口的权限!…[a:b]` | 无该权限点 | 隐藏对应入口 |
| HTTP 404 / 500 + 页面「无法访问」 | 路径不存在 / 需其它 HTTP 方法 | 不要重试 |
| HTTP 200 + 页面「报错啦 / 错误原因：…」 | 业务错误页 | 提取「错误原因」文案展示 |
| `{"ret":-1,"msg":"功能暂时停用，请联系管理员"}` | 功能被停用 | 直接提示 |
| `{"ret":-1,"msg":"请联系管理员设置需上传资料类型！"}` | 业务未配置 | 提示 |
