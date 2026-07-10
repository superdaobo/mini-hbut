# 湖工大 iHBUT 校园网认证协议备忘

> **状态**：基于公开资料与社区脚本整理；`service` 字段与网关 IP 需在真实 iHBUT 环境抓包确认（Phase 0）。

## 认证体系概览

湖工大校园网存在两套并存 API：

| 协议 | 典型入口 | 说明 |
|------|----------|------|
| **eportal** | `/eportal/index.jsp` + `InterFace.do?method=login` | 浏览器 captive 页、用户实测 URL |
| **深澜 Srun** | `/cgi-bin/get_challenge` + `/cgi-bin/srun_portal` | 社区 CLI/脚本常用 |

Mini-HBUT 实现 **双适配器**：探测到 eportal `queryString` 时优先 eportal；失败或无 eportal 时 fallback Srun。

## 网关候选列表

```
http://172.16.54.18
http://202.114.177.246
http://202.114.177.113
http://202.114.177.114
http://202.114.177.115
```

历史探测地址：`http://123.123.123.123`（未认证时可能 302 到 eportal，响应体含 `wlanuserip=`）

官方说明：[ITC 校园网使用指南](https://itc.hbut.edu.cn/info/1043/1093.htm)

## Captive 页示例（用户实测）

```
http://172.16.54.18/eportal/index.jsp?wlanuserip=10.9.188.79&wlanacname=logic&nasip=10.253.0.17&...&url=http://www.msftconnecttest.com/redirect
```

关键 query 参数（用于 `queryString` 登录字段）：

- `wlanuserip` — 客户端 IP
- `wlanacname`、`nasip` — AC 信息
- `url` — 原始探测 URL

## eportal 登录流程

参考 [zhongbr/hbut-campus-net-auto-login](https://github.com/zhongbr/hbut-campus-net-auto-login)：

1. **探测**：访问 `http://123.123.123.123` 或连网探测，获取含 `wlanuserip=` 的 query
2. **会话**：`GET {gateway}/eportal/index.jsp?{query}`，保存 `JSESSIONID`
3. **登录**：`POST {gateway}/eportal/InterFace.do?method=login`

表单字段：

| 字段 | 说明 |
|------|------|
| `userId` | 学号 |
| `password` | 明文密码 |
| `service` | 运营商（见下表） |
| `queryString` | 完整 captive query（不含 `?`） |
| `passwordEncrypt` | `false` |

成功响应通常为 JSON，`result` 为 `success` 或 `1`（以实现为准，待校内校验）。

## Srun 登录流程

参考 [zu1k/srun](https://github.com/zu1k/srun)（GPL-3.0，逻辑已内联至 `campus_network::srun`）：

1. `GET /cgi-bin/get_challenge?callback=sdu&username=...&ip=...`
2. 解析 JSONP：`sdu({...})`，取 `challenge` token 与 `client_ip`
3. `GET /cgi-bin/srun_portal?action=login&...&chksum=...&info={SRBX1}...`

默认 `ac_id=1`（部分网关为 `12`，失败时可尝试覆盖）。

## 运营商映射

| UI 选项 | eportal `service` | Srun 用户名 |
|---------|-------------------|-------------|
| 校园网 | `default` | `{学号}` |
| 移动 | `YD` | `{学号}@cmcc` |
| 联通 | `LT` | `{学号}@cucc` |
| 电信 | `DX` | `{学号}@ctcc` |

> ⚠️ 页面下拉框显示名可能与 `YD`/`LT`/`DX` 不一致，校内抓包为准。

## 已认证探测

依次尝试：

1. `GET http://www.msftconnecttest.com/connecttest.txt` — 正文含 `Microsoft Connect Test` 表示未被劫持
2. `GET http://123.123.123.123` — 无 `wlanuserip=` 且非 eportal 重定向
3. 可选：短超时访问 `https://e.hbut.edu.cn` 成功则倾向已联网

## 凭证存储

- 密钥环账户键：`campus:{学号}`
- 设置项（localStorage）：运营商、自动认证开关、上次状态（不含密码）

## 校内实测清单（Phase 0）

- [ ] `172.16.54.18` eportal `InterFace.do` 抓包字段
- [ ] `202.114.177.246` 等官方入口一致性
- [ ] `/cgi-bin/srun_portal` 是否可用及 `ac_id`
- [ ] 四运营商 `service` / `@suffix` 与页面一致
- [ ] 成功/失败 JSON 样例归档

## FAQ

**Q：连上 iHBUT 为什么没有自动登录？**  
A：iOS 无法保证后台 WiFi 触发；请打开应用或手动点「立即认证」。Android 依赖系统 BackgroundFetch 周期，频率受限。

**Q：密码存在哪里？**  
A：开启「记住密码」后写入系统密钥环（`campus:` 前缀），不会明文写入 localStorage。

**Q：eportal 和 Srun 用哪个？**  
A：应用自动选择：有 captive query 时先试 eportal，失败再试 Srun。

**Q：校外能用吗？**  
A：探测与登录仅在校内网或未认证 captive 环境有意义；校外会显示「已连接」或「无法探测」。
