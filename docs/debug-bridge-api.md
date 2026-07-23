# 本地调试 Bridge API

应用在 **Bridge 启用平台** 上会在本机拉起 HTTP Bridge（默认 `http://127.0.0.1:4399`）。

## 平台启停矩阵

| 平台 | Debug | Release | 备注 |
|------|-------|---------|------|
| iOS | 启 | 启 | 官网 proxy / module_bundle 依赖 |
| Android | 启 | **默认不启** | 不静默依赖 4399 |
| 桌面 | 启 | 默认不启 | `HBUT_HTTP_BRIDGE_ENABLED=1` 强制 |

详见 [`src-tauri/docs/http_server.md`](../src-tauri/docs/http_server.md)。

## 长后台恢复（#452）

前端回前台可 invoke Tauri 命令 **`ensure_http_bridge`**：

1. 探测 `GET /health`
2. 不可达则 graceful shutdown + respawn
3. 返回 `{ enabled, healthy, respawned, addr, status, detail }`

冷启动仍由 setup 一次性 `spawn_http_server`；ensure 仅在健康失败时二次拉起。

开发构建（`debug_assertions`）下调试接口默认可用；正式包需：

- 环境变量 `HBUT_DEBUG_ENABLE_BRIDGE_TOOLS=1`，或
- 调用 `set_debug_runtime_config({ enableBridgeTools: true })`

## 运行时日志（推荐）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/debug/logs?limit=300&scope=Chaoxing&level=info&q=重登&since_id=0` | 拉取进程内日志 |
| DELETE | `/debug/logs` | 清空 |
| POST | `/debug/logs/query` | body 同 query 字段 |
| POST | `/debug/logs/push` | `{ scope, message, level, details }` |
| GET | `/debug/diag` | 登录态 / cookie 键 / 日志统计 |
| GET | `/debug/routes` | 接口清单 |

### 示例

```bash
# 最近日志
curl -s "http://127.0.0.1:4399/debug/logs?limit=100" | jq .

# 只看学习通会话 / 重登
curl -s "http://127.0.0.1:4399/debug/logs?scope=ChaoxingSession&limit=50" | jq .

# 诊断
curl -s "http://127.0.0.1:4399/debug/diag" | jq .

# 手动探测会话（会写「重新登录」类日志）
curl -s -X POST "http://127.0.0.1:4399/debug/chaoxing/session" -H "Content-Type: application/json" -d "{}" | jq .

# 课程列表计时（force=true 跳过缓存）
curl -s -X POST "http://127.0.0.1:4399/debug/chaoxing/courses" -H "Content-Type: application/json" -d "{\"force\":false}" | jq .

# 收件箱
curl -s -X POST "http://127.0.0.1:4399/debug/inbox" -H "Content-Type: application/json" -d "{\"login_mode\":\"chaoxing\",\"force\":false}" | jq .
```

## 前端调试窗

- `pushDebugLog` 会同时写入前端本地日志 + Rust `runtime_log`
- 每 2s 轮询 `get_runtime_logs` 合并 Rust 侧日志（含重登路径）
- 反馈页 / 调试面板可看到带 `[ChaoxingSession]`、`[ChaoxingCourses]`、`[ChaoxingInbox]` 前缀的条目

## 性能约定

- **课程中心**：再次进入默认读磁盘缓存，不重跑会话探测；点「刷新」才 `force`
- **收件箱**：3 分钟内存缓存；默认只拉前 3 页；点「刷新」拉全量

## Tauri 命令

- `get_runtime_logs` / `clear_runtime_logs` / `push_runtime_log` / `get_runtime_diag`
