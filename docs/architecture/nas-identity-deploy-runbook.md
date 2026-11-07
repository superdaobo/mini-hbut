# ocr-service 身份迁移 —— NAS 部署 / 回滚运行手册（T14 配套）

> 建立：2026-11-07。目的：把「认证后端 ocr-service 在 NAS 上的部署 / 回滚」写成**没有 SSH 的执行者**也能照做的订单。
> 本手册**未执行**任何部署命令、未访问 NAS；所有「已核实」均来自本地仓库/文档，「待确认」清单见 §3 与 §13。
> 依据（只读，未改）：
> - `D:\Documents\C_learn\panda-club\fdl-server\docs\nas\services\README.md`（下称 **SR**，行号指该文件）
> - `D:\Documents\C_learn\panda-club\fdl-server\docs\archive\2026-10-02-ocr-service上NAS与全PG化重构实施方案.md`（下称 **P1002**）
> - `D:\Documents\C_learn\panda-club\panda_bot\docs\nas_compose.md`（下称 **PC**）
> - `D:\Documents\C_learn\panda-club\NAS配置-AS6208T-2026-09-22.md`（下称 **NAS22**）
> - ocr-service 仓库：`D:\Documents\C_learn\成绩查询\ocr-service`（分支 `feat/t11-data-authz`，HEAD `56ae174`）

## 1. 目的与适用

| 项 | 说明 |
|---|---|
| 适用服务 | NAS 容器 `fdl-ocr-service`（Compose 项目 `fdl-ocr-service`，`/volume1/services/apps/ocr-service/`） |
| 本次变更 | 身份迁移新增能力（T10 建号/断言/引导 + T11 数据授权）**全部默认关闭**；部署 = 换新镜像 + 可选开启环境变量，关闭时行为与现状一致 |
| 执行者 | **无 SSH 权限**的运维/用户；命令由「有 shell 的人」执行（FDL，或临时授权的 SSH；见 §2） |
| 红线 | 不碰 `cf-tunnel`；容器不得挂 `/volume1`；不发布宿主端口（SR:19） |

## 2. 没有 SSH 时如何执行（通道说明）

| 通道 | 状态（证据） | 能做什么 |
|---|---|---|
| SSH（22） | **已核实：2026-09-22 快照 `ssh_enable=0`（关闭）**；此后是否重开未核实 | 关闭状态下不可用；若 FDL 临时开启则按 SR 的脚本约定执行 |
| SFTP（2222） | **已核实：2026-09-22 快照 `sftp_enable=1`、端口 2222**（`sftp://192.168.168.37:2222`）；当前是否仍开未核实 | 只能传文件（镜像 tar、compose 文件、secrets 文件）；**不能执行 `docker compose` 命令** |
| ADM 面板（8000/8001） | 已核实：快照存在（NAS22:234,270） | 管理面板，非容器执行通道 |
| 结论 | — | 本手册是**待执行订单**：SFTP 只能完成「文件到位」半程；`docker compose` 命令必须等 shell 通道（FDL 执行或临时开 SSH）后才能跑 |

## 3. 已核实的事实 vs 待确认（总表）

| 类别 | 事实 | 来源 |
|---|---|---|
| 已核实 | 服务树 `/volume1/services/` 为普通目录（非 ADM 共享），一服务一目录一 `compose.yaml`；`secrets/` 权限 0700 root:root | SR:17,27,36–54 |
| 已核实 | 主机 ASUSTOR AS6208T，~3.77 GiB 内存，LAN 192.168.168.37；Docker 28.1.1、Compose v2.35.1 | SR:9–10；NAS22:18,36–45,52 |
| 已核实 | 16 个栈全部**不发布宿主端口**；ocr-service 自 2026-09-29 已部署 | SR:18,49–50 |
| 已核实 | 凭据只放 `secrets/` 文件，compose **只读挂载**，不写进环境变量、不入库 | SR:83 |
| 已核实 | 运维脚本 `scripts/fdl-stack.sh`（root、LF 行尾）；**显式拒绝任何碰 `cf-tunnel` 的操作**、不用 `--remove-orphans` | SR:20,103–106,130 |
| 已核实 | 镜像以各目录 `compose.yaml` 为准（仓库内无 ocr-service 的 compose）；`fdl-panda` 先例：镜像手工投递 `fdl-panda-load-image.sh <tar.gz>`，上一版保留为 `:rollback`，失败自动回退 | SR:80–82 |
| 已核实 | 标准容器约定：`restart: unless-stopped`、`mem_limit`、`security_opt: no-new-privileges:true`、日志 `json-file` 10MB×3 | SR:150–152；PC:27–35 |
| 已核实 | 网络模型：`fdl-edge/fdl-apps/fdl-backend/fdl-management`；宿主禁用 80/443/5432/5244/8080；Traefik `exposedByDefault=false`，Docker provider 经 `tcp://fdl-socket-proxy:2375`；TLS 不在 NAS 终结 | SR:110–124 |
| 已核实 | 线路 B 先例 `panda.hbut.site`：frpc → 阿里云 Caddy；cloudflared/frpc 目录当前仅模板未部署 | SR:75,176–177 |
| 已核实 | 镜像拉取：Docker Hub 不可达，需前缀（`docker.m.daocloud.io` 首选、`registry.cn-hangzhou.aliyuncs.com` 备选） | SR:141 |
| 已核实 | 线上入口 `mini.hbut.site`，业务库 `minihbut`（PG，NAS 上现有实例） | tauri-app `goal-9/plan.md:19`；P1002:74 |
| 已核实 | ocr-service 镜像构建：`python:3.10-slim`（仓库前缀可 override）、端口 7860、build-arg `APP_BUILD_SHA`/`BUILD_TIME` → `/health` 的 `build.sha/built_at`、CMD `uvicorn runtime.entrypoint:app` | ocr-service `Dockerfile:5–6,14–18,44,46–48,54`；`runtime/entrypoint.py:4216–4225,4228` |
| 已核实 | 身份开关默认全关：`MINI_HBUT_CASDOOR_ENABLED=false`、`MINI_HBUT_ASSERTION_ENABLED=false`、`MINI_HBUT_DATA_AUTHZ_ENABLED=false`、`MINI_HBUT_IDENTITY_ENABLED=false` | ocr-service `identity_auth/config.py:158,245,291`；`identity_auth/assertion.py:122` |
| 已核实 | 身份端点默认关闭时不注册/503（fail closed，行为与部署前一致） | ocr-service `runtime/entrypoint.py:170–225`；`modules/identity_bootstrap/routes.py:41–45,110–132` |
| 已核实 | Rollout 6 步 + 6 个灰度指标 + 回滚=重开 `LEGACY_GRACE` | ocr-service `docs/identity_auth_rollout.md:59–88` |
| 已核实 | 失败判定：`/health` 不健康、指标异常比例、登录成功率下降 → 立即回滚并停灰度 | tauri-app `goal-9/plan.md:84` |
| 已核实 | 对账方法：行数 + 抽样字段哈希 + 关键聚合双向核对 | P1002:192 |
| 已核实 | tag/digest 策略：生产优先 digest，记录「digest↔tag↔commit」映射入 worklog，**禁止 `latest`** | PC:40–50 |
| 已核实 | 回滚纪律：备份数据目录 → 停新实例 → 换回旧 digest → `compose config` 校验 → up；回滚后 **24h 观察期内不得再次切换**；worklog 记旧 digest+备份位置+时间 | PC:123–136 |
| 已核实 | SSH 关闭、SFTP 2222（2026-09-22 快照） | NAS22:207,210 |
| 待确认 | NAS 当前是否开 SSH / 执行者通道；SFTP 2222 是否仍开 | §13-1 |
| 待确认 | 镜像仓库可达性与 ocr-service 镜像存放位置（文档仅载拉取前缀） | §13-3 |
| 待确认 | `mini.hbut.site` 实际走线路 A（cf-tunnel）还是线路 B（frpc），以及对外域名 | §13-4 |
| 待确认 | 当前在跑镜像的 tag/digest（以 NAS 上 `docker image inspect` 为准） | §13-5 |
| 待确认 | P1002「全量 PG 化 + 两条新 ingress」自 2026-10-02 后是否已实施（P1002:5 当时状态「仍未实施」） | §13-6 |
| 待确认 | ocr-service 目录 `compose.yaml` 实际内容（仓库内无） | §13-7 |
| 待确认 | secrets 文件 → 容器环境变量的注入机制（Dockerfile CMD 直接 uvicorn，不读 secret 文件） | §13-8 |

## 4. 服务树位置

| 项 | 值 | 来源 |
|---|---|---|
| 服务目录 | `/volume1/services/apps/ocr-service/`（含 `compose.yaml`，项目名 `fdl-ocr-service`） | SR:49,54,61 |
| 数据 | `/volume1/services/data/`（只允许窄范围子路径挂载） | SR:52,146–155 |
| 凭据 | `/volume1/services/secrets/`（0700 root:root，永不入 git） | SR:17,54,83 |
| 运维脚本 | `/volume1/services/scripts/fdl-stack.sh`（root 执行，LF 行尾） | SR:20,56,130 |
| 数据库 | PG 17（`infra/postgres`，项目 `fdl-postgres`）；业务库 `minihbut` | SR:40,72;goal-9/plan.md:19 |
| 内存预算 | `fdl-ocr-service` mem_limit **640 MiB**（onnxruntime 峰值；P1002 预算，是否已落到 compose 待确认） | P1002:42 |
| OCR 并发纪律 | `OCR_WORKERS=2`、`OCR_MAX_CONCURRENT=2`（4 核 Celeron 防打满） | P1002:50–51 |

## 5. compose 片段（标准模板，**非 NAS 现值**）

> 依据 SR:146–155 的「新增 app 8 步约定」与 SR:82 的 `:rollback` 先例编写；
> **实际值以 NAS 上该目录 `compose.yaml` 为准（SR:80）**，部署前先 `docker compose config` 比对。

```yaml
# /volume1/services/apps/ocr-service/compose.yaml（身份迁移增量模板）
services:
  fdl-ocr-service:
    image: ${OCR_IMAGE}            # 固定 tag 或 digest（禁止 latest，PC:40-50）；上一版保留 :rollback（SR:82）
    restart: unless-stopped        # SR:150
    # 不发布宿主端口：不写 ports:（SR:19,121,152）
    # 注入 secret 文件读出的环境变量（机制待确认，SR:83 只读挂载约定；见 §13-8）
    command:
      - sh
      - -c
      - >-
        export MINI_HBUT_CASDOOR_ADMIN_CLIENT_ID="$(cat /run/secrets/casdoor_admin_client_id)";
        export MINI_HBUT_CASDOOR_ADMIN_CLIENT_SECRET="$(cat /run/secrets/casdoor_admin_client_secret)";
        export MINI_HBUT_ASSERTION_PRIVATE_KEY_FILE=/run/secrets/assertion_private_key.pem;
        exec uvicorn runtime.entrypoint:app --host 0.0.0.0 --port 7860
    environment:
      TZ: Asia/Shanghai
      # 身份开关（默认全关；开启时机见 §9 灰度）
      MINI_HBUT_CASDOOR_ENABLED: "false"
      MINI_HBUT_ASSERTION_ENABLED: "false"
      MINI_HBUT_DATA_AUTHZ_ENABLED: "false"
      # 非凭据配置（默认值见 ocr-service identity_auth/config.py:83-86,155-169）
      MINI_HBUT_CASDOOR_BASE_URL: "https://sso.hbut.site"
      MINI_HBUT_CASDOOR_ORG: "fdl-users"
      MINI_HBUT_ASSERTION_ISSUER: "https://mini.hbut.site/identity"   # 必须 https；须与 Casdoor Federated Credential Issuer 一致
      MINI_HBUT_ASSERTION_AUDIENCE: "<Casdoor 应用 client_id>"        # 占位，部署前填实
    volumes:
      - /volume1/services/secrets/casdoor_admin_client_id:/run/secrets/casdoor_admin_client_id:ro      # 只读（SR:83）
      - /volume1/services/secrets/casdoor_admin_client_secret:/run/secrets/casdoor_admin_client_secret:ro
      - /volume1/services/secrets/assertion_private_key.pem:/run/secrets/assertion_private_key.pem:ro
      # 数据：窄范围子路径挂载（SR:52,155）；**不得出现 /volume1 整卷（SR:19,87-98）**
    mem_limit: 640m                # P1002:42
    security_opt:
      - no-new-privileges:true     # SR:150
    logging:                        # SR:152
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - fdl-apps                    # SR:122-123
      - fdl-backend                 # 需要 PG（SR:122）
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=fdl-apps"
      - "traefik.http.routers.fdl-ocr-service.rule=Host(`mini.hbut.site`)"   # 现入口（goal-9/plan.md:19）；域名待确认 §13-4
      - "traefik.http.routers.fdl-ocr-service.entrypoints=web"
      - "traefik.http.services.fdl-ocr-service.loadbalancer.server.port=7860"
networks:
  fdl-apps:
    external: true
  fdl-backend:
    external: true
```

要点（逐条对应硬约束）：
- **secrets 只读挂载**：`secrets/` 单文件 `:ro`，不进 git、不进日志（SR:83）；
- **日志轮转**：json-file 10m×3（SR:152）；
- **mem_limit**：640m（P1002:42）；
- **no-new-privileges**（SR:150；PC:33）；
- **不发布宿主端口**：无 `ports:`，上游经 Traefik `http://fdl-<name>:<port>`（SR:121-124,152）；
- 镜像 build-arg `APP_BUILD_SHA` 写入镜像 → `/health` 可核对构建溯源（ocr-service `Dockerfile:46–48`）。

## 6. 镜像构建与固定

| 步 | 动作 | 依据 |
|---|---|---|
| 1 | 构建：`docker build --build-arg APP_BUILD_SHA=<git sha> --build-arg BUILD_TIME=<UTC> -t fdl-ocr-service:<new-tag> .`（ocr-service 仓库根；基础镜像 `python:3.10-slim`，前缀可 override） | ocr-service `Dockerfile:5-6,14-18,46-48` |
| 2 | 固定：记录新镜像 **tag + digest**（`docker image inspect --format '{{index .RepoDigests 0}}' <img>:<tag>`）与「digest↔tag↔commit」映射，写入 worklog | PC:40-50 |
| 3 | 保留回滚镜像：切换前把当前在跑镜像 tag 另存为 **`:rollback`**（`fdl-panda` 先例：上一版保留 `:rollback`，失败自动回退） | SR:82 |
| 4 | 投递：无 SSH 时用 SFTP 上传 `docker save` 出的 tar 到 NAS（如 `/volume1/services/backups/` 或约定目录），再 `docker load`（有 shell 时） | NAS22:270（SFTP 2222）；SR:82（手工投递先例） |
| 5 | 禁止 `latest`；拉取公共镜像需仓库前缀（`docker.m.daocloud.io` 首选） | PC:50；SR:141 |

## 7. Traefik / 线路 B 路由要点

| 项 | 要点 | 依据 |
|---|---|---|
| 路由入口 | 全部经 Traefik（`infra/traefik`，镜像 `traefik:3.7.13`）；容器只写 labels，不写 `ports:` | SR:70,151-152 |
| provider | `exposedByDefault=false`，Docker provider 经 `tcp://fdl-socket-proxy:2375`（只读 socket 代理，不暴露原始 `docker.sock`） | SR:122,69 |
| TLS | **不在 NAS 终结**：线路 A 在 CF 边缘、线路 B 在阿里云 VPS Caddy | SR:123 |
| 线路 A | `cf-tunnel`（生产 Cloudflare 隧道）——**任何脚本不许碰**；切换需蓝绿前置条件 | SR:19,104,176 |
| 线路 B 先例 | `panda.hbut.site`：frpc → 阿里云 Caddy；`infra/frpc/` 当前仅模板未部署 | SR:75,177 |
| 本次身份迁移 | 建议**不新增 ingress**：沿用 `mini.hbut.site` 现有路由直达 `fdl-ocr-service:7860`；P1002 规划的 `ocr.<域名>` 公开 ingress 与 `pg.<私网域名>`（`tcp://fdl-postgres:5432` + Zero Trust Access Service Token）是否实施**待确认** | P1002:83-93；goal-9/plan.md:19 |
| `/health` 暴露 | 公开 `/health` 会暴露版本与内部计数 → 建议只暴露最小字段或走 Access（P1002 提醒，未拍板） | P1002:94 |

## 8. 健康检查端点

| 端点 | 行为 | 依据 |
|---|---|---|
| `GET /health` | 200；含 `build.sha`/`built_at`（来自 build-arg `APP_BUILD_SHA`/`BUILD_TIME`，空值返回 null） | ocr-service `runtime/entrypoint.py:4216-4225,4228`；`Dockerfile:46-48` |
| `POST /identity/bootstrap` | 未开启 → 503 `disabled`；校验器未注入 → 503 `verifier_not_configured`；校园会话未验证 → 401 `session_not_verified`；Casdoor 错误归一 → 401/502（`unauthorized/not_found/duplicate/invalid/server/transport`） | `modules/identity_bootstrap/routes.py:41-45,83-88` |
| `GET /identity/jwks.json` | 未开启 → 503 `assertion_not_configured`；开启后返回断言公钥（n/e + kid） | `modules/identity_bootstrap/routes.py:110-113`；`identity_auth/assertion.py` |
| `GET /identity/consents`、`POST /identity/consents/revoke` | 未开启（`MINI_HBUT_DATA_AUTHZ_ENABLED=false`）→ 不注册；开启后未注入身份提供器 → 一律 401 | `runtime/entrypoint.py:200-225` |
| 巡检 | `scripts/fdl-health.sh`（只读巡检，root） | SR:20 |

**部署后必查**（有 shell 时）：`curl -fsS http://127.0.0.1:7860/health`（容器内/同网段）或经 `mini.hbut.site` 的 `/health`；核对 `build.sha` = 本次发布 SHA；`/identity/*` 返回 503（未开启）或 404（未注册）= 预期，不是故障。

## 9. 灰度与观测阈值

| 步 | 操作 | 验证 | 依据 |
|---|---|---|---|
| G1 | 部署新镜像，身份开关**全关** | 现有客户端无感知；`/health` 200、`build.sha` 正确 | `identity_auth_rollout.md:63`；goal-9/plan.md:81 |
| G2 | 按范围开启 `MINI_HBUT_IDENTITY_ENABLED=true`（+ `LEGACY_GRACE=true` 双轨） | 新旧并存可用；`forum_auth_new_success` 开始增长 | `identity_auth_rollout.md:64` |
| G3 | 发布接入 Identity 的新客户端 | 新 token 占比上升、legacy 下降 | `identity_auth_rollout.md:65` |
| G4 | 观察 ≥7 天（完整版本窗口） | `new_success` 占比稳定接近 100%、`failed` 无异常抬升、无 401 误伤投诉 | `identity_auth_rollout.md:66` |
| G5 | 关闭 legacy（`LEGACY_GRACE=false`） | 旧 token 401 + 明确中文升级提示，不 500 | `identity_auth_rollout.md:67` |
| G6 | 清理（单独 PR/授权后） | 全量新 token | `identity_auth_rollout.md:68` |

**观测指标（进程内计数 + 脱敏日志 `logger "identity-auth"`）**：`forum_auth_new_success` / `forum_auth_legacy_success` / `forum_auth_failed` / `cloud_sync_auth_new_success` / `cloud_sync_auth_legacy_success` / `cloud_sync_auth_failed`（`identity_auth_rollout.md:81-88`；学号日志只记 `前2位…(长度)#sha256前6位`）。

**失败判定（立即回滚并停止灰度）**：`/health` 不健康、`identity_auth` 指标出现异常比例、登录成功率下降（goal-9/plan.md:84）。

## 10. 回滚步骤

> 两种回滚独立：镜像回滚（本节）与开关回滚（G 步任意异常 → 重开 `LEGACY_GRACE=true` 或临时 `ENABLED=false`，无需回滚 DB/签名密钥，`identity_auth_rollout.md:70-72`）。

| 步 | 动作 | 依据 |
|---|---|---|
| 1 | **切换前已做**：当前镜像 tag 已另存 `:rollback` + 数据目录备份位置 + 备份时间写入 worklog（否则不允许切换） | PC:123-136；SR:82 |
| 2 | 换回旧镜像：compose 的 `image:` 改回 `:rollback`（或记录的旧 digest） | PC:133；SR:82 |
| 3 | `docker compose config` 校验通过（无 "Invalid"、退出码 0） | PC:113-121 |
| 4 | 重启：`scripts/fdl-stack.sh` 对该栈 stop/up（root；不用 `--remove-orphans`） | SR:20,106,133 |
| 5 | 健康校验：`/health` 200 + `build.sha` = 旧版 SHA；`/identity/*` 恢复 503/404（旧镜像无新路由） | §8 |
| 6 | **24h 观察期**：观察 6 个 auth 指标 + 登录成功率；**观察期内不得再次切换** | PC:134；goal-9/plan.md:84 |
| 7 | worklog 记录：回滚时间、旧 digest、备份位置、触发原因 | PC:135-136 |

## 11. 本次身份迁移新增环境变量清单（全部默认关闭）

> 凭据（client secret、断言私钥）**只能放 NAS `secrets/` 目录**（0700 root:root），compose 只读挂载注入；
> 禁止写入仓库、compose 明文字面量、日志（SR:83,91；ocr-service `identity_auth/config.py:120`）。

### 11.1 `MINI_HBUT_CASDOOR_*`（T10 建号/组归属；ocr-service `identity_auth/config.py:155-169`）

| 变量 | 默认 | 说明 | 来源 |
|---|---|---|---|
| `MINI_HBUT_CASDOOR_ENABLED` | `false` | 总开关；关闭时端点 503，行为与部署前一致 | config.py:158 |
| `MINI_HBUT_CASDOOR_BASE_URL` | `https://sso.hbut.site` | 强制 https（fail closed 校验） | config.py:83,159 |
| `MINI_HBUT_CASDOOR_ORG` | `fdl-users` | 组织 | config.py:84,160 |
| `MINI_HBUT_CASDOOR_STUDENT_GROUP` | `hbut-students` | 学生组 | config.py:85,161 |
| `MINI_HBUT_CASDOOR_USER_PREFIX` | `hbut_` | 建号命名 `Name=<prefix><学号>`（幂等 upsert） | config.py:86,162 |
| `MINI_HBUT_CASDOOR_ADMIN_CLIENT_ID` | `""`（空=未配置，fail closed） | 管理 API 机器凭据，来自 `secrets/`（`fdl-account-sync` 在用同套） | config.py:164；goal-9/plan.md:33 |
| `MINI_HBUT_CASDOOR_ADMIN_CLIENT_SECRET` | `""`（空=fail closed） | 同上；**绝不进日志** | config.py:165；goal-9/evidence/pr-t10.md |
| `MINI_HBUT_CASDOOR_TIMEOUT_SECONDS` | `5` | 读超时 | config.py:166 |
| `MINI_HBUT_CASDOOR_CONNECT_TIMEOUT_SECONDS` | `3` | 连接超时 | config.py:167 |

### 11.2 `MINI_HBUT_ASSERTION_*`（T10 断言签发 + JWKS；ocr-service `identity_auth/assertion.py:110-128`）

| 变量 | 默认 | 说明 | 来源 |
|---|---|---|---|
| `MINI_HBUT_ASSERTION_ENABLED` | `false` | 总开关 | assertion.py:122 |
| `MINI_HBUT_ASSERTION_ISSUER` | `""`（必须 https，须与 Casdoor Federated Credential Issuer 一致） | 断言 issuer | assertion.py:71-72,84-85 |
| `MINI_HBUT_ASSERTION_AUDIENCE` | `""`（= Casdoor 应用 client_id） | 断言 aud | assertion.py:73-74,124 |
| `MINI_HBUT_ASSERTION_PRIVATE_KEY_PEM` | `""` | RS256 私钥 PEM（只运行时注入） | assertion.py:116 |
| `MINI_HBUT_ASSERTION_PRIVATE_KEY_FILE` | `""` | 私钥文件路径（**NAS compose secret 的推荐形态**；读失败不回退，fail closed） | assertion.py:113-114,117-120 |
| `MINI_HBUT_ASSERTION_KID` | `mini-hbut-assertion-rs256-1` | JWKS 与签名头 kid | assertion.py:77,126 |
| `MINI_HBUT_ASSERTION_TTL_SECONDS` | `60`（范围 10–300，越界启动即报错） | 断言 TTL | assertion.py:45-47,127 |

### 11.3 相关但非新增（已存在，供回滚参照）

| 变量 | 默认 | 说明 | 来源 |
|---|---|---|---|
| `MINI_HBUT_IDENTITY_ENABLED` | `false` | Resource Server 验签总开关（Rollout 第 1 步） | `docs/identity_auth_rollout.md:12` |
| `MINI_HBUT_IDENTITY_LEGACY_GRACE` | `true` | 旧 HMAC/无 Bearer 兼容；回滚=重开它 | rollout.md:13,70-72 |
| `MINI_HBUT_DATA_AUTHZ_ENABLED` | `false` | T11 数据授权（`/identity/consents*`）总开关 | config.py:291 |

## 12. 禁止事项

| # | 禁止 | 依据 |
|---|---|---|
| 1 | **碰 `cf-tunnel`**（改、停、重建、进网络） | SR:19,104,176 |
| 2 | 容器**挂载 `/volume1`**（整卷/共享文件夹/`/share`）——只允许 `secrets/`、`data/`、`logs/` 的窄范围子路径 | SR:19,52,87-98,155 |
| 3 | 把 **secret 写进仓库、compose 明文字面量或日志**（含示例、截图、命令历史） | SR:83,91,191 |
| 4 | 发布宿主端口（尤其 80/443/5432/5244/8080） | SR:121-122,152 |
| 5 | 重启 Docker daemon；创建/修改 `/etc/docker/daemon.json` | SR:103-104 |
| 6 | 用 `--remove-orphans`；用非 root 或 CRLF 脚本操作 | SR:106,130 |
| 7 | 使用 `latest` tag；未记录 digest↔tag↔commit 映射就切换 | PC:40-50,135 |
| 8 | 跳过 24h 观察期再次切换镜像 | PC:134 |
| 9 | 为「方便」新增端口转发/把管理端点改绑 0.0.0.0 | PC:97（同精神）；SR:121 |

## 13. 待确认清单（执行前必须逐项关闭）

| # | 事项 | 现状证据 | 关闭方式 |
|---|---|---|---|
| 1 | NAS 是否开放 SSH/SFTP 供执行者 | 09-22 快照：SSH 关（`ssh_enable=0`）、SFTP 开（2222）；此后状态未复测 | FDL 现场确认或临时开启并记录 |
| 2 | SFTP 2222 当前是否仍开、目录权限是否仍 0700 root:root | NAS22:207,210；SR:17 | 执行者实测 `sftp` 连接 + `ls -la /volume1/services/secrets` |
| 3 | 镜像仓库可达性、ocr-service 镜像存放位置（自建/ACR/纯手工投递） | 仅 SR:141（拉取前缀）与 SR:82（panda 手工投递）；ocr-service 无记载 | 向 FDL 要现值；本手册默认「手工投递 tar」路径 |
| 4 | `mini.hbut.site` 路由（线路 A cf-tunnel 或线路 B frpc）与对外域名 | 入口见 goal-9/plan.md:19；P1002 的域名决策当时「需确认」（P1002:92,210） | 查 CF/阿里云侧配置 |
| 5 | 当前在跑镜像 tag/digest | SR:80（以 compose.yaml 为准）；仓库无 | `docker image inspect` 后回填本手册 |
| 6 | P1002「全量 PG 化 + 两条 ingress」10-02 后是否实施 | P1002:5「仍未实施」 | FDL 查 `fdl-stack.sh status` 与 cloudflared 配置 |
| 7 | ocr-service `compose.yaml` 实际内容（网络/挂载/labels 现值） | 仓库内无该文件 | 只读 `cat` 后与 §5 模板 diff |
| 8 | secrets 文件 → 环境变量注入机制（当前 Dockerfile CMD 直接 uvicorn，不读文件） | ocr-service `Dockerfile:54` | 按 §5 模板加 `command` 包装（需 FDL 验证）或改镜像入口 |
| 9 | `/identity/*` 是否需 Access 保护或保持公开（仅 `/health` 有 P1002 提醒） | P1002:94 | 拍板后更新 SR |
