## TL;DR

在 Mini-HBUT 增加 iHBUT 校园网一键/自动认证：保存学号密码与运营商，连接校园网后 best-effort 自动登录。

## 问题/需求描述

用户连接 `iHBUT` WiFi 后需打开浏览器完成深澜/eportal 认证。现有应用仅支持教务融合门户登录，不包含 WiFi captive portal 认证。需在「我的」中提供简洁配置页，并在前台恢复/后台任务中尽力自动认证。

## 当前行为

- 仓库无 `srun` / `eportal` / captive portal 相关实现
- 「portal」指 `e.hbut.edu.cn` 教务系统，与校园网认证无关
- 凭证存储支持 `hbut:` / `cx:` 前缀，未支持校园网专用键

## 期望行为

- Me 页「校园网」入口：账号、密码（记住）、运营商四选一、自动认证开关
- 探测区分「已认证 / 需认证」
- 手动「立即认证」与 best-effort 自动认证（前台恢复 + Android 后台）
- 密码存密钥环（`campus:` 前缀）

## 认证入口调研（湖工大）

| 入口 | 协议 | 备注 |
|------|------|------|
| `172.16.54.18/eportal/...` | eportal | 用户实测 captive 页 |
| `202.114.177.246` 等 | eportal 网页 | [ITC 官方指南](https://itc.hbut.edu.cn/info/1043/1093.htm) |
| `/cgi-bin/srun_portal` | 深澜 Srun | 社区脚本 shadowfish07 使用 `@cmcc` 后缀 |

运营商映射（待校内实测校验）：

| UI | eportal `service` | Srun 用户名 |
|----|-------------------|-------------|
| 校园网 | `default` | `{学号}` |
| 移动 | `YD` | `{学号}@cmcc` |
| 联通 | `LT` | `{学号}@cucc` |
| 电信 | `DX` | `{学号}@ctcc` |

## 验收标准

- [ ] Me 页可配置账号/密码/运营商/自动认证开关
- [ ] 密码存密钥环（`campus:` 前缀），不明文 localStorage
- [ ] 探测能区分已认证 vs 需认证
- [ ] 手动认证命令可用（校内实测）
- [ ] 应用前台恢复时自动尝试（已开启开关）
- [ ] Android BackgroundFetch 周期尽力尝试
- [ ] UI 符合 `TPageHeader` + `glass-card` 风格
- [ ] 契约测试与 `cargo test` 通过

## 子任务

1. 协议文档 `docs/campus-network-hbut.md`
2. Rust `campus_network` 模块 + Tauri commands
3. `CampusNetworkView` + 导航/凭证
4. 自动认证调度
5. 契约测试与 FAQ

## 关联

- 参考实现：[zu1k/srun](https://github.com/zu1k/srun)（GPL-3.0）
- 湖工大脚本：[zhongbr/hbut-campus-net-auto-login](https://github.com/zhongbr/hbut-campus-net-auto-login)
