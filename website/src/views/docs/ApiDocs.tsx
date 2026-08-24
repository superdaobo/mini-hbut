const ISSUER = 'https://id.xn--vhq74jc2fzpchter27a.com';
const DEVELOPER_PORTAL = 'https://developer.xn--vhq74jc2fzpchter27a.com';

// 示例 Key 仅为格式占位，不是真实凭据：mhbat_<8位hex>_<43位base64url>
const SAMPLE_KEY = 'mhbat_ab12cd34_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfG';

const scopeList = [
    {
        id: 'openid',
        risk: '基础',
        desc: 'OIDC 必选 scope。几乎所有接入应用都应保留。',
    },
    {
        id: 'profile',
        risk: '基础',
        desc: '基础资料（如 name / preferred_username），用于在第三方界面展示账户标识。',
    },
    {
        id: 'student.identity',
        risk: '敏感 · 人工审核',
        desc: '学校身份快照相关能力。申请时必须填写不少于 10 个字的用途说明，并经人工审核通过后才可使用。',
    },
    {
        id: 'offline_access',
        risk: '敏感',
        desc: '允许签发 Refresh Token 以维持长期会话。仅在确有长期离线访问需求时申请。',
    },
];

const errorCodes = [
    ['API_KEY_INVALID', '401', 'Key 无效：不存在、格式错误或已被删除', '检查 Authorization 是否携带完整 mhbat_ 整串 Key；必要时重新申请'],
    ['API_KEY_REVOKED', '403', 'Key 已吊销', '到开发者门户重新申请新 Key，并更新部署中的配置'],
    ['API_KEY_EXPIRED', '403', 'Key 已过期', '重新申请 Key；建议在到期前轮换'],
    ['（无固定 code）', '400', '参数错误：缺失、类型或取值不符合要求', '根据响应 message 修正请求体或查询参数后重试'],
    ['（无固定 code）', '404', '资源不存在或不属于当前 Key 所属账户', '不要重试；核对路径中的资源 id 是否正确、是否属于你'],
    ['LINK_REQUIRED', '409', '（已移除）历史上要求先完成设备绑定', '多设备自绑定上线后不应再出现；保留该 code 仅为兼容说明，遇到请反馈'],
    ['RATE_LIMITED', '429', '触发限流', '读取响应头 Retry-After（秒），等待对应时长后再发起请求'],
    ['INTERNAL', '500', '服务端内部错误', '可按指数退避少量重试；持续失败请携带时间点反馈'],
];

const errorBodySample = `HTTP/1.1 429 Too Many Requests
Retry-After: 30

{
  "error": "RATE_LIMITED",
  "message": "请求过于频繁，请按 Retry-After 等待后重试",
  "retry_after": 30
}`;

const quickStartSetup = `# 1) 登录开发者门户，进入「API 密钥」页创建 Key；
#    创建成功弹窗中的明文 Key 仅显示这一次，立即整串复制保存。
# 2) 在终端导出两个环境变量（示例 Key 为占位，请替换为自己的）：
export API_BASE="${ISSUER}"
export MHBAT_KEY="${SAMPLE_KEY}"`;

const quickStartMe = `curl -sS "\\$API_BASE/api/v1/account/me" \\
  -H "Authorization: Bearer \\$MHBAT_KEY"`;

const quickStartMeResp = `{
  "user_id": "usr_7f3a9c21",
  "key": {
    "name": "my-local-agent",
    "prefix": "mhbat_ab12cd34",
    "created_at": "2026-08-20T08:00:00Z",
    "expires_at": null,
    "last_used_at": "2026-08-23T12:34:56Z"
  }
}`;

const quickStartListApps = `curl -sS "\\$API_BASE/api/v1/account/apps" \\
  -H "Authorization: Bearer \\$MHBAT_KEY"`;

const quickStartListAppsResp = `{
  "apps": [
    {
      "id": "app_01j8zkm3v6n7",
      "name": "成绩提醒机器人",
      "app_type": "native_public",
      "status": "active",
      "client_id": "cl_9p2m4k8s",
      "redirect_uris": ["http://127.0.0.1/callback"],
      "scopes": ["openid", "profile"],
      "created_at": "2026-07-01T02:10:00Z",
      "updated_at": "2026-07-01T02:10:00Z"
    }
  ]
}`;

const quickStartCreateApp = `curl -sS -X POST "\\$API_BASE/api/v1/account/apps" \\
  -H "Authorization: Bearer \\$MHBAT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
        "name": "我的第一个接入应用",
        "app_type": "web_confidential",
        "description": "在学习计划网站展示课程与成绩提醒"
      }'`;

const quickStartCreateAppResp = `{
  "app": {
    "id": "app_x1y2z3w4",
    "name": "我的第一个接入应用",
    "app_type": "web_confidential",
    "status": "draft",
    "client_id": "cl_a1b2c3d4",
    "redirect_uris": [],
    "scopes": [],
    "created_at": "2026-08-23T12:40:00Z",
    "updated_at": "2026-08-23T12:40:00Z"
  }
}`;

const quickStartConfigure = `# 记下上一步响应中的 app.id（此处假设为 app_x1y2z3w4）
APP_ID="app_x1y2z3w4"

# 新增回调地址（web_confidential 只允许 https，精确匹配）
curl -sS -X POST "\\$API_BASE/api/v1/account/apps/\\$APP_ID/redirect-uris" \\
  -H "Authorization: Bearer \\$MHBAT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"redirect_uri": "https://my-app.example.com/oauth/callback"}'

# 配置 scope 白名单（PUT 为全量替换语义）
curl -sS -X PUT "\\$API_BASE/api/v1/account/apps/\\$APP_ID/scopes" \\
  -H "Authorization: Bearer \\$MHBAT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"scopes": ["openid", "profile"]}'`;

const quickStartConfigureResp = `{
  "redirect_uri": {
    "id": "ruri_5f6g7h8i",
    "uri": "https://my-app.example.com/oauth/callback",
    "created_at": "2026-08-23T12:42:00Z"
  }
}

{
  "app": {
    "id": "app_x1y2z3w4",
    "scopes": ["openid", "profile"],
    "updated_at": "2026-08-23T12:43:00Z"
  }
}`;

const redirectUriCreateResp = `{
  "redirect_uri": {
    "id": "ruri_5f6g7h8i",
    "uri": "https://my-app.example.com/oauth/callback",
    "created_at": "2026-08-23T12:42:00Z"
  }
}`;

const quickStartSubmit = `curl -sS -X POST "\\$API_BASE/api/v1/account/apps/\\$APP_ID/submit" \\
  -H "Authorization: Bearer \\$MHBAT_KEY"`;

const quickStartSubmitResp = `{
  "app": {
    "id": "app_x1y2z3w4",
    "status": "pending_review",
    "submitted_at": "2026-08-23T12:45:00Z"
  }
}`;

type ParamRow = [string, string, string, string, string];

interface EndpointDoc {
    methods: string[];
    path: string;
    title: string;
    summary: string;
    params?: ParamRow[];
    requestExample?: string;
    responseExample?: string;
    responseNote?: string;
    errors?: Array<[string, string, string]>;
}

const endpoints: EndpointDoc[] = [
    {
        methods: ['GET'],
        path: '/api/v1/account/me',
        title: 'Key 自检',
        summary: '验证当前 Key 是否有效，并返回所属 user_id 与 Key 元信息。推荐作为启动时的健康检查第一步。',
        params: [],
        requestExample: `curl -sS "\\$API_BASE/api/v1/account/me" \\
  -H "Authorization: Bearer \\$MHBAT_KEY"`,
        responseExample: quickStartMeResp,
        errors: [
            ['401 API_KEY_INVALID', 'Key 不存在或格式错误', '核对整串 Key（含 mhbat_ 前缀）后重试'],
            ['403 API_KEY_REVOKED', 'Key 已吊销', '重新申请 Key'],
            ['403 API_KEY_EXPIRED', 'Key 已过期', '重新申请 Key'],
        ],
    },
    {
        methods: ['GET'],
        path: '/api/v1/account/apps',
        title: '列出我的应用',
        summary: '返回当前账户名下的全部接入应用及其状态。',
        params: [],
        requestExample: `curl -sS "\\$API_BASE/api/v1/account/apps" \\
  -H "Authorization: Bearer \\$MHBAT_KEY"`,
        responseExample: quickStartListAppsResp,
        errors: [],
    },
    {
        methods: ['POST'],
        path: '/api/v1/account/apps',
        title: '创建应用',
        summary: '创建一个新的 OIDC 接入应用，初始状态为 draft。web_confidential 应用的 client_secret 通过 credentials/rotate 生成，仅显示一次。',
        params: [
            ['name', 'body', 'string', '是', '应用显示名称'],
            ['app_type', 'body', 'string', '是', '应用类型：web_confidential（服务端持密）或 native_public（公共客户端）'],
            ['description', 'body', 'string', '否', '用途描述，有助于加快人工审核'],
        ],
        requestExample: quickStartCreateApp,
        responseExample: quickStartCreateAppResp,
        errors: [
            ['400 参数错误', '缺少 name / app_type 或取值非法', '按 message 修正请求体'],
        ],
    },
    {
        methods: ['GET'],
        path: '/api/v1/account/apps/:id',
        title: '查询单个应用',
        summary: '按 id 查询应用详情，包括回调、scope、状态与凭据元信息。',
        params: [
            [':id', 'path', 'string', '是', '应用 id，形如 app_x1y2z3w4'],
        ],
        requestExample: `curl -sS "\\$API_BASE/api/v1/account/apps/\\$APP_ID" \\
  -H "Authorization: Bearer \\$MHBAT_KEY"`,
        responseExample: `{
  "app": {
    "id": "app_x1y2z3w4",
    "name": "我的第一个接入应用",
    "app_type": "web_confidential",
    "status": "draft",
    "client_id": "cl_a1b2c3d4",
    "has_client_secret": true,
    "redirect_uris": ["https://my-app.example.com/oauth/callback"],
    "scopes": ["openid", "profile"],
    "created_at": "2026-08-23T12:40:00Z",
    "updated_at": "2026-08-23T12:43:00Z"
  }
}`,
        errors: [
            ['404 资源不存在', '应用不存在或不属于你', '核对 id；不要对 404 重试'],
        ],
    },
    {
        methods: ['PATCH'],
        path: '/api/v1/account/apps/:id',
        title: '修改应用信息',
        summary: '更新应用名称、描述等基础信息。处于 pending_review 等锁定状态时可能被拒绝。',
        params: [
            [':id', 'path', 'string', '是', '应用 id'],
            ['name', 'body', 'string', '否', '新的应用名称'],
            ['description', 'body', 'string', '否', '新的用途描述'],
        ],
        requestExample: `curl -sS -X PATCH "\\$API_BASE/api/v1/account/apps/\\$APP_ID" \\
  -H "Authorization: Bearer \\$MHBAT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"description": "面向班级学习小组的课程提醒工具"}'`,
        responseExample: `{
  "app": {
    "id": "app_x1y2z3w4",
    "description": "面向班级学习小组的课程提醒工具",
    "updated_at": "2026-08-23T12:50:00Z"
  }
}`,
        errors: [
            ['400 参数错误', '当前状态不允许修改，或字段非法', '确认应用状态后重试'],
            ['404 资源不存在', '应用不存在或不属于你', '核对 id'],
        ],
    },
    {
        methods: ['DELETE'],
        path: '/api/v1/account/apps/:id',
        title: '删除应用',
        summary: '删除名下应用。已进入审核流程或运行中的应用通常不允许直接删除，需先 revoke。',
        params: [
            [':id', 'path', 'string', '是', '应用 id'],
        ],
        requestExample: `curl -sS -X DELETE "\\$API_BASE/api/v1/account/apps/\\$APP_ID" \\
  -H "Authorization: Bearer \\$MHBAT_KEY"`,
        responseExample: `HTTP/1.1 204 No Content`,
        errors: [
            ['400 参数错误', '当前状态不允许删除', '先执行 revoke 再删除'],
            ['404 资源不存在', '应用不存在或不属于你', '核对 id'],
        ],
    },
    {
        methods: ['POST'],
        path: '/api/v1/account/apps/:id/redirect-uris',
        title: '新增回调地址',
        summary: '为应用登记一条 Redirect URI。服务端会按 app_type 校验规则，并在授权时做精确匹配。',
        params: [
            [':id', 'path', 'string', '是', '应用 id'],
            ['redirect_uri', 'body', 'string', '是', '回调地址。web_confidential 仅允许 https；native_public 允许自定义 scheme 与 http://127.0.0.1 回环；禁止通配符与 fragment'],
        ],
        requestExample: `curl -sS -X POST "\\$API_BASE/api/v1/account/apps/\\$APP_ID/redirect-uris" \\
  -H "Authorization: Bearer \\$MHBAT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"redirect_uri": "https://my-app.example.com/oauth/callback"}'`,
        responseExample: redirectUriCreateResp,
        errors: [
            ['400 参数错误', 'URI 不符合 app_type 规则（http、通配符、fragment 等）', '按规则调整后重试'],
            ['404 资源不存在', '应用不存在或不属于你', '核对 id'],
        ],
    },
    {
        methods: ['DELETE'],
        path: '/api/v1/account/apps/:id/redirect-uris/:rid',
        title: '移除回调地址',
        summary: '按回调记录 id 移除一条已登记的 Redirect URI。',
        params: [
            [':id', 'path', 'string', '是', '应用 id'],
            [':rid', 'path', 'string', '是', '回调记录 id，形如 ruri_5f6g7h8i'],
        ],
        requestExample: `curl -sS -X DELETE "\\$API_BASE/api/v1/account/apps/\\$APP_ID/redirect-uris/ruri_5f6g7h8i" \\
  -H "Authorization: Bearer \\$MHBAT_KEY"`,
        responseExample: `HTTP/1.1 204 No Content`,
        errors: [
            ['404 资源不存在', '应用或回调记录不存在 / 不属于你', '核对 id'],
        ],
    },
    {
        methods: ['PUT'],
        path: '/api/v1/account/apps/:id/scopes',
        title: '配置 scope 白名单',
        summary: '全量替换应用的 scope 白名单。白名单只能从平台支持的 scope 中选择；包含 student.identity 时必须附带用途说明（不少于 10 个字），经人工审核通过后方可实际使用。',
        params: [
            [':id', 'path', 'string', '是', '应用 id'],
            ['scopes', 'body', 'string[]', '是', 'scope 数组，取值见白名单：openid / profile / student.identity / offline_access'],
            ['purpose', 'body', 'string', '条件', '申请 student.identity 时的用途说明，长度不少于 10 个字'],
        ],
        requestExample: `curl -sS -X PUT "\\$API_BASE/api/v1/account/apps/\\$APP_ID/scopes" \\
  -H "Authorization: Bearer \\$MHBAT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
        "scopes": ["openid", "profile", "student.identity"],
        "purpose": "在本站展示已验证的学生身份徽章"
      }'`,
        responseExample: `{
  "app": {
    "id": "app_x1y2z3w4",
    "scopes": ["openid", "profile", "student.identity"],
    "scope_review": {
      "student.identity": "pending_review"
    },
    "updated_at": "2026-08-23T13:00:00Z"
  }
}`,
        errors: [
            ['400 参数错误', 'scope 不在白名单内，或 student.identity 缺少合规用途说明', '补全 purpose（≥10 字）后重试'],
            ['404 资源不存在', '应用不存在或不属于你', '核对 id'],
        ],
    },
    {
        methods: ['GET'],
        path: '/api/v1/account/apps/:id/scopes',
        title: '查询 scope 配置',
        summary: '查看应用当前的 scope 白名单及敏感 scope 的审核状态。',
        params: [
            [':id', 'path', 'string', '是', '应用 id'],
        ],
        requestExample: `curl -sS "\\$API_BASE/api/v1/account/apps/\\$APP_ID/scopes" \\
  -H "Authorization: Bearer \\$MHBAT_KEY"`,
        responseExample: `{
  "app": {
    "id": "app_x1y2z3w4",
    "scopes": ["openid", "profile"],
    "updated_at": "2026-08-23T12:43:00Z"
  }
}`,
        errors: [
            ['404 资源不存在', '应用不存在或不属于你', '核对 id'],
        ],
    },
    {
        methods: ['POST'],
        path: '/api/v1/account/apps/:id/submit',
        title: '提交审核',
        summary: '把 draft 状态的应用提交人工审核，状态流转为 pending_review。提交前至少应配置一条合法回调与必要的 scope。',
        params: [
            [':id', 'path', 'string', '是', '应用 id'],
        ],
        requestExample: quickStartSubmit,
        responseExample: quickStartSubmitResp,
        errors: [
            ['400 参数错误', '缺少回调 / scope，或当前状态不允许提交', '补全配置或确认状态后重试'],
            ['404 资源不存在', '应用不存在或不属于你', '核对 id'],
        ],
    },
    {
        methods: ['POST'],
        path: '/api/v1/account/apps/:id/credentials/rotate',
        title: '轮换应用凭据',
        summary: '为 web_confidential 应用轮换 client_secret。新 secret 仅在本次响应中显示一次，旧 secret 立即失效。',
        params: [
            [':id', 'path', 'string', '是', '应用 id'],
        ],
        requestExample: `curl -sS -X POST "\\$API_BASE/api/v1/account/apps/\\$APP_ID/credentials/rotate" \\
  -H "Authorization: Bearer \\$MHBAT_KEY"`,
        responseExample: `{
  "credential": {
    "client_id": "cl_a1b2c3d4",
    "client_secret": "cs_NEW_SECRET_SHOWN_ONLY_ONCE",
    "rotated_at": "2026-08-23T13:10:00Z"
  }
}`,
        responseNote: 'client_secret 为敏感凭据：立即写入服务端秘密存储，之后无法再次查看。',
        errors: [
            ['400 参数错误', 'native_public 应用没有可轮换的 secret', 'public client 不使用 client_secret'],
            ['404 资源不存在', '应用不存在或不属于你', '核对 id'],
        ],
    },
    {
        methods: ['POST'],
        path: '/api/v1/account/apps/:id/revoke',
        title: '吊销应用',
        summary: '吊销应用，状态进入终态 revoked：立即失去 OIDC 授权能力，且不可恢复。如只是暂时下线，请走平台侧 suspended 流程。',
        params: [
            [':id', 'path', 'string', '是', '应用 id'],
        ],
        requestExample: `curl -sS -X POST "\\$API_BASE/api/v1/account/apps/\\$APP_ID/revoke" \\
  -H "Authorization: Bearer \\$MHBAT_KEY"`,
        responseExample: `{
  "app": {
    "id": "app_x1y2z3w4",
    "status": "revoked",
    "revoked_at": "2026-08-23T13:15:00Z"
  }
}`,
        errors: [
            ['400 参数错误', '当前状态不允许吊销', '确认状态后重试'],
            ['404 资源不存在', '应用不存在或不属于你', '核对 id'],
        ],
    },
    {
        methods: ['GET'],
        path: '/api/v1/account/apps/:id/audit',
        title: '查询应用审计',
        summary: '查询单个应用的历史变更记录（配置修改、提交、审核结果、凭据轮换、吊销等）。metadata 不存任何密钥材料。',
        params: [
            [':id', 'path', 'string', '是', '应用 id'],
        ],
        requestExample: `curl -sS "\\$API_BASE/api/v1/account/apps/\\$APP_ID/audit" \\
  -H "Authorization: Bearer \\$MHBAT_KEY"`,
        responseExample: `{
  "events": [
    {
      "id": "evt_001",
      "action": "app.submitted",
      "created_at": "2026-08-23T12:45:00Z",
      "metadata": {}
    },
    {
      "id": "evt_002",
      "action": "app.credentials_rotated",
      "created_at": "2026-08-23T13:10:00Z",
      "metadata": {}
    }
  ],
  "next_cursor": null
}`,
        errors: [
            ['404 资源不存在', '应用不存在或不属于你', '核对 id'],
        ],
    },
    {
        methods: ['GET'],
        path: '/api/v1/account/devices',
        title: '列出绑定设备',
        summary: '查看当前账户绑定的 Mini-HBUT 设备列表，可用于核对多设备自绑定状态。',
        params: [],
        requestExample: `curl -sS "\\$API_BASE/api/v1/account/devices" \\
  -H "Authorization: Bearer \\$MHBAT_KEY"`,
        responseExample: `{
  "devices": [
    {
      "device_id": "dev_8k1n2m3p",
      "platform": "windows",
      "bound_at": "2026-06-01T09:00:00Z",
      "last_seen_at": "2026-08-23T11:00:00Z"
    },
    {
      "device_id": "dev_4q5r6s7t",
      "platform": "android",
      "bound_at": "2026-06-20T18:30:00Z",
      "last_seen_at": "2026-08-22T21:12:00Z"
    }
  ]
}`,
        errors: [],
    },
    {
        methods: ['GET'],
        path: '/api/v1/account/audit',
        title: '查询账户级审计',
        summary: '查询整个账户范围的审计事件，包括所有 Key 操作与应用变更。metadata 不存任何密钥材料，因此日志本身可以放心留存。',
        params: [],
        requestExample: `curl -sS "\\$API_BASE/api/v1/account/audit" \\
  -H "Authorization: Bearer \\$MHBAT_KEY"`,
        responseExample: `{
  "events": [
    {
      "id": "evt_101",
      "action": "key.created",
      "target": "mhbat_ab12cd34",
      "created_at": "2026-08-20T08:00:00Z",
      "metadata": {}
    },
    {
      "id": "evt_102",
      "action": "app.created",
      "target": "app_x1y2z3w4",
      "created_at": "2026-08-23T12:40:00Z",
      "metadata": {}
    }
  ],
  "next_cursor": null
}`,
        errors: [],
    },
];

const methodBadgeClass: Record<string, string> = {
    GET: 'border-cyan/40 bg-cyan/10 text-cyan',
    POST: 'border-purple/40 bg-purple/10 text-purple',
    PATCH: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
    DELETE: 'border-red-400/40 bg-red-400/10 text-red-300',
};

const stateMachineDiagram = `              POST .../submit           人工审核通过             启用
   draft ────────────────────▶ pending_review ────────────▶ approved ────────────▶ active
     ▲                              │                                              │
     │ 修改后重新 submit              │ 人工审核拒绝                                   │ 平台侧操作
     │                              ▼                                              ▼
     └────────────────────────── rejected                             suspended / revoked
                                                                       (revoked 为终态)`;

const pythonSample = `import os
import time

import requests


class HbutApiError(Exception):
    """账户级 API 业务错误：携带 HTTP 状态码与服务端 error code。"""

    def __init__(self, status: int, code: str, message: str):
        super().__init__("[" + str(status) + "] " + code + ": " + message)
        self.status = status
        self.code = code
        self.message = message


class HbutAccountClient:
    """Mini-HBUT 账户级 API 最小封装。

    设计原则：
    - 自动携带 Authorization: Bearer <整串 Key>
    - 显式超时，绝不无限等待
    - 只自动重试幂等方法；429 严格遵循 Retry-After
    """

    MAX_RATE_RETRIES = 3    # 429 本地重试上限
    MAX_SERVER_RETRIES = 3  # 500 指数退避重试上限

    def __init__(self, base_url: str, api_key: str, timeout: float = 10.0):
        if not api_key.startswith("mhbat_"):
            raise ValueError("API Key 必须是完整的 mhbat_ 整串 Key")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": "Bearer " + api_key,
        })

    def request(self, method: str, path: str, payload=None):
        url = self.base_url + path
        rate_retries = 0
        server_retries = 0
        while True:
            resp = self.session.request(
                method, url, json=payload, timeout=self.timeout,
            )
            if resp.status_code == 429:
                if rate_retries >= self.MAX_RATE_RETRIES:
                    raise HbutApiError(429, "RATE_LIMITED", "超过本地重试上限")
                # 严格遵循服务端 Retry-After（秒）
                wait = float(resp.headers.get("Retry-After", "1"))
                time.sleep(wait)
                rate_retries += 1
                continue
            if resp.status_code == 500 and method in ("GET", "PUT", "DELETE"):
                if server_retries >= self.MAX_SERVER_RETRIES:
                    break
                time.sleep(0.5 * (2 ** server_retries))  # 指数退避 0.5s/1s/2s
                server_retries += 1
                continue
            break

        if resp.status_code >= 400:
            try:
                body = resp.json()
            except ValueError:
                body = {}
            raise HbutApiError(
                resp.status_code,
                body.get("error", "UNKNOWN"),
                body.get("message", ""),
            )
        if resp.status_code == 204:
            return None
        return resp.json()

    def get(self, path: str):
        return self.request("GET", path)

    def post(self, path: str, payload=None):
        return self.request("POST", path, payload)

    def patch(self, path: str, payload=None):
        return self.request("PATCH", path, payload)

    def delete(self, path: str):
        return self.request("DELETE", path)


if __name__ == "__main__":
    client = HbutAccountClient(
        base_url="https://id.xn--vhq74jc2fzpchter27a.com",
        api_key=os.environ["MHBAT_KEY"],  # 从环境变量读取，绝不硬编码
        timeout=10.0,
    )
    me = client.get("/api/v1/account/me")
    print("user_id =", me["user_id"])
`;

const nodeSample = `// hbut-client.mjs — Node 18+ 原生 fetch，零依赖
const BASE_URL = 'https://id.xn--vhq74jc2fzpchter27a.com';

export class HbutApiError extends Error {
  constructor(status, code, message) {
    super('[' + status + '] ' + code + ': ' + message);
    this.status = status;
    this.code = code;
  }
}

export class HbutAccountClient {
  constructor({ apiKey, baseUrl = BASE_URL, timeoutMs = 10000 }) {
    if (!apiKey || !apiKey.startsWith('mhbat_')) {
      throw new Error('API Key 必须是完整的 mhbat_ 整串 Key');
    }
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  async request(method, path, payload) {
    const headers = { Authorization: 'Bearer ' + this.apiKey };
    let body;
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(payload);
    }

    let serverRetries = 0;
    for (;;) {
      const resp = await fetch(this.baseUrl + path, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(this.timeoutMs), // 显式超时
      });

      if (resp.status === 429) {
        // 严格遵循服务端 Retry-After（秒）；生产请再加本地重试上限
        const retryAfter = Number(resp.headers.get('Retry-After') ?? '1');
        await sleep(retryAfter * 1000);
        continue;
      }
      if (resp.status === 500 && method !== 'POST' && serverRetries < 3) {
        // 指数退避 0.5s/1s/2s，仅针对幂等方法
        await sleep(500 * 2 ** serverRetries);
        serverRetries += 1;
        continue;
      }
      if (resp.status >= 400) {
        const data = await resp.json().catch(() => ({}));
        throw new HbutApiError(resp.status, data.error ?? 'UNKNOWN', data.message ?? '');
      }
      if (resp.status === 204) return null;
      return resp.json();
    }
  }

  get(path) { return this.request('GET', path); }
  post(path, payload) { return this.request('POST', path, payload); }
  patch(path, payload) { return this.request('PATCH', path, payload); }
  delete(path) { return this.request('DELETE', path); }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 用法：从环境变量读取 Key，绝不写入源码
const client = new HbutAccountClient({ apiKey: process.env.MHBAT_KEY });
const me = await client.get('/api/v1/account/me');
console.log('user_id =', me.user_id);
`;

const MethodBadge = ({ method }: { method: string }) => (
    <span className={`rounded-md border px-2 py-0.5 font-mono text-xs font-bold ${methodBadgeClass[method] ?? 'border-white/20 bg-white/5 text-gray-300'}`}>
        {method}
    </span>
);

const ApiDocs = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">开发者文档 · Account API</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                账户级 API 文档
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                面向本地 Agent、自动化脚本与第三方服务的账户级 API Key 接入说明。通过一柄 <code>mhbat_</code> API Key，
                你可以编程式管理自己的 OIDC 接入应用、查看绑定设备并检索审计日志；
                Key 本身的申请、列表与吊销则在开发者门户中以浏览器操作完成。
            </p>
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm leading-7 text-amber-100">
                <strong>Key 即凭据：</strong> API Key 等同于你账户的操作权限。明文只在创建时显示一次，
                服务端只保存哈希，丢失后只能吊销重建。请像保管密码一样保管它：不要写进源码、Git、日志或聊天窗口。
            </div>
        </header>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">1. 概述与前置条件</h2>
            <p className="text-sm leading-7 text-gray-300">
                账户级 API 面向两类诉求：一是让本地 Agent / 脚本能代替你在开发者门户完成应用的日常维护；
                二是让自动化流程能够自查账户状态（设备、审计）。它与 <a className="text-cyan hover:underline" href="/docs/identity-oidc">OIDC 接入指南</a>
                描述的授权协议互补：OIDC 解决“用户如何授权第三方”，本页解决“开发者如何管理自己的接入配置”。
            </p>
            <div className="grid gap-4 md:grid-cols-2">
                <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="text-lg font-bold text-cyan">管理面（浏览器，非 API）</h3>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                        <li>入口：开发者门户「API 密钥」页；</li>
                        <li>支持申请、查看列表、吊销 Key；</li>
                        <li>明文 Key 仅创建弹窗显示一次。</li>
                    </ul>
                </article>
                <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="text-lg font-bold text-purple">API 面（本文档）</h3>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                        <li>全部接口使用 Bearer 认证直连 Identity 服务；</li>
                        <li>覆盖应用 CRUD、回调、scope、审核、凭据与审计；</li>
                        <li>适合本地 Agent、CI 脚本与第三方服务调用。</li>
                    </ul>
                </article>
            </div>
            <h3 className="text-lg font-bold text-white">前置条件</h3>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-gray-300">
                <li>拥有 Mini-HBUT 账号，并能登录开发者门户；</li>
                <li>在门户「API 密钥」页完成一次 Key 申请（见下方步骤）；</li>
                <li>一个能发起 HTTPS 请求的环境（curl / Python / Node 均可）。</li>
            </ol>
            <h3 className="text-lg font-bold text-white">申请 API Key 的步骤</h3>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-gray-300">
                <li>使用浏览器登录 <a className="text-cyan hover:underline" href={DEVELOPER_PORTAL}>Mini-HBUT Developer Portal</a>；</li>
                <li>在左侧导航进入「API 密钥」页。【截图占位：门户左侧导航中「API 密钥」入口高亮】</li>
                <li>点击「新建密钥」，填写密钥备注名（便于日后辨认用途）并确认。【截图占位：新建密钥弹窗表单】</li>
                <li>创建成功后，页面弹出完整明文 Key。<strong>它只显示这一次</strong>，立即整串复制到你的密码管理器或秘密存储。【截图占位：明文 Key 弹窗，Key 值打码】</li>
                <li>关闭弹窗后列表中只会显示 Key 的前缀与元信息；如果明文丢失，只能吊销后重新申请。</li>
            </ol>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">2. 认证方式</h2>
            <h3 className="text-lg font-bold text-white">Key 形态</h3>
            <p className="text-sm leading-7 text-gray-300">
                API Key 的固定格式为 <code className="text-cyan">{'mhbat_<8位hex>_<43位base64url>'}</code>，
                例如下面这串<strong>仅为格式示意</strong>，并非真实凭据：
            </p>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-sm leading-7 text-cyan">{SAMPLE_KEY}</pre>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                <li>前缀 <code>mhbat_</code> + 8 位十六进制前缀段 + 43 位 base64url 主体，整串一起参与认证；</li>
                <li>认证时携带<strong>整串 Key</strong>，不要截断、拆分或只发送某一段；</li>
                <li>服务端数据库只保存 Key 的哈希，泄露数据库也无法还原明文。</li>
            </ul>
            <h3 className="text-lg font-bold text-white">请求头格式</h3>
            <p className="text-sm leading-7 text-gray-300">
                所有账户级接口都需要携带如下请求头：
            </p>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-sm leading-7 text-gray-200">{`Authorization: Bearer <整串Key>`}</pre>
            <h3 className="text-lg font-bold text-white">服务域名</h3>
            <p className="text-sm leading-7 text-gray-300">
                账户级 API 与 OIDC 同域部署。与 <a className="text-cyan hover:underline" href="/docs/identity-oidc">OIDC 接入指南</a> 的口径一致：
                中文域名 <code>id.湖北工业大学.com</code> 只适合人类展示；代码、配置与环境变量统一使用下面的 ASCII / Punycode canonical 形式：
            </p>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-sm leading-7 text-cyan">{ISSUER}</pre>
            <h3 className="text-lg font-bold text-white">保管与泄露处置</h3>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                <li>Key 存放在环境变量或秘密管理器中，运行时注入进程；</li>
                <li>不要把 Key 提交进 Git、打印进日志、放进前端代码或截图分享；</li>
                <li>不同用途使用不同的 Key（一柄 Key 一个用途），便于单独吊销而不影响其它流程；</li>
                <li>疑似泄露立即处理：<strong>①</strong> 到开发者门户吊销该 Key；<strong>②</strong> 通过审计接口排查异常调用；
                    <strong>③</strong> 申请新 Key；<strong>④</strong> 更新所有使用该 Key 的部署。</li>
            </ul>
            <div className="rounded-xl border border-cyan/20 bg-cyan/5 p-5 text-sm leading-7 text-gray-300">
                注意区分两套 Bearer 凭据：本页的 <code>mhbat_</code> API Key 用于调用账户级管理 API；
                OIDC 流程中的 Access Token 用于调用 UserInfo 等协议端点。两者不可互换使用。
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">3. 快速开始：5 分钟 curl 序列</h2>
            <p className="text-sm leading-7 text-gray-300">
                下面用一个连续的 curl 序列走完「验 Key → 建应用 → 配回调/scope → 提交审核」的最短路径。
                所有响应 JSON 均为<strong>示意结构</strong>，字段以服务端实际返回为准。
            </p>

            <h3 className="text-lg font-bold text-cyan">步骤 0：准备环境变量</h3>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{quickStartSetup}</pre>

            <h3 className="text-lg font-bold text-cyan">步骤 1：Key 自检（me）</h3>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{quickStartMe}</pre>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-emerald-200">{quickStartMeResp}</pre>
            <p className="text-xs leading-6 text-gray-500">响应为示意。拿到 user_id 即说明 Key 有效且归属正确。</p>

            <h3 className="text-lg font-bold text-cyan">步骤 2：列出已有应用</h3>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{quickStartListApps}</pre>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-emerald-200">{quickStartListAppsResp}</pre>
            <p className="text-xs leading-6 text-gray-500">响应为示意。首次接入时 apps 可能为空数组。</p>

            <h3 className="text-lg font-bold text-cyan">步骤 3：创建应用（draft）</h3>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{quickStartCreateApp}</pre>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-emerald-200">{quickStartCreateAppResp}</pre>
            <p className="text-xs leading-6 text-gray-500">响应为示意。新应用处于 draft 状态，可以自由修改。</p>

            <h3 className="text-lg font-bold text-cyan">步骤 4：配置回调与 scopes</h3>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{quickStartConfigure}</pre>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-emerald-200">{quickStartConfigureResp}</pre>
            <p className="text-xs leading-6 text-gray-500">两条命令的响应均为示意。web_confidential 的回调必须是 https 且与授权请求精确匹配。</p>

            <h3 className="text-lg font-bold text-cyan">步骤 5：提交人工审核</h3>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{quickStartSubmit}</pre>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-emerald-200">{quickStartSubmitResp}</pre>
            <p className="text-xs leading-6 text-gray-500">响应为示意。提交后状态变为 pending_review；审核通过并启用后应用才会进入 active，被 OIDC 动态加载。</p>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-gray-300">
                Windows 用户提示：以上命令适用于 bash / zsh。PowerShell 中请使用 <code>curl.exe</code>，
                或直接使用第 6 节的 Python / Node 封装类，体验更好。
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">4. 端点参考</h2>
            <p className="text-sm leading-7 text-gray-300">
                所有端点均要求 <code>Authorization: Bearer &lt;整串Key&gt;</code>，基址为{' '}
                <code className="break-all text-cyan">{ISSUER}</code>。除非特别说明，请求与响应体均为 JSON。
                除每个端点列出的特有错误外，任何端点都可能返回第 5 节的通用错误
                （401 / 403 / 400 / 429 / 500）。响应示例均为示意。
            </p>
            <div className="space-y-6">
                {endpoints.map((endpoint) => (
                    <article key={endpoint.methods.join() + endpoint.path} className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <div className="flex flex-wrap items-center gap-3">
                            {endpoint.methods.map((method) => (
                                <MethodBadge key={method} method={method} />
                            ))}
                            <code className="text-sm font-semibold text-white">{endpoint.path}</code>
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-cyan">{endpoint.title}</h3>
                            <p className="mt-2 text-sm leading-7 text-gray-300">{endpoint.summary}</p>
                        </div>
                        {endpoint.params && endpoint.params.length > 0 && (
                            <div className="overflow-x-auto rounded-lg border border-white/10">
                                <table className="w-full min-w-[640px] text-left text-sm">
                                    <thead className="bg-white/[0.05] text-gray-200">
                                        <tr><th className="p-3">参数</th><th className="p-3">位置</th><th className="p-3">类型</th><th className="p-3">必填</th><th className="p-3">说明</th></tr>
                                    </thead>
                                    <tbody className="text-gray-300">
                                        {endpoint.params.map(([name, loc, type, required, desc]) => (
                                            <tr key={name} className="border-t border-white/10">
                                                <td className="p-3"><code className="text-cyan">{name}</code></td>
                                                <td className="p-3">{loc}</td>
                                                <td className="p-3">{type}</td>
                                                <td className="p-3">{required}</td>
                                                <td className="p-3">{desc}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {endpoint.params && endpoint.params.length === 0 && (
                            <p className="text-sm leading-7 text-gray-400">本端点无必填参数。</p>
                        )}
                        {endpoint.requestExample && (
                            <>
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">请求示例</div>
                                <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{endpoint.requestExample}</pre>
                            </>
                        )}
                        {endpoint.responseExample && (
                            <>
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">响应示例（示意）</div>
                                <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/50 p-4 text-xs leading-6 text-emerald-200">{endpoint.responseExample}</pre>
                            </>
                        )}
                        {endpoint.responseNote && (
                            <p className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4 text-xs leading-6 text-amber-100">{endpoint.responseNote}</p>
                        )}
                        {endpoint.errors && endpoint.errors.length > 0 && (
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">特有错误情形</div>
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-gray-300">
                                    {endpoint.errors.map(([head, cause, action]) => (
                                        <li key={head}>
                                            <code className="text-red-300">{head}</code> — {cause}；{action}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">5. 错误码总表</h2>
            <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-white/[0.05] text-gray-200">
                        <tr><th className="p-3">code</th><th className="p-3">HTTP</th><th className="p-3">含义</th><th className="p-3">处置</th></tr>
                    </thead>
                    <tbody className="text-gray-300">
                        {errorCodes.map(([code, http, meaning, action]) => (
                            <tr key={code + http} className="border-t border-white/10">
                                <td className="p-3"><code className="text-cyan">{code}</code></td>
                                <td className="p-3 font-mono">{http}</td>
                                <td className="p-3">{meaning}</td>
                                <td className="p-3">{action}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-sm leading-7 text-gray-300">
                错误响应体统一为 JSON（示意）：
            </p>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-emerald-200">{errorBodySample}</pre>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-gray-300">
                <strong className="text-white">关于 409 LINK_REQUIRED：</strong>
                该错误码已随「多设备自绑定」机制上线而移除——正常情况下不会再出现。
                此处保留条目仅为兼容历史客户端的排错说明；如果你的旧脚本仍在处理它，可以直接删除相关分支。
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">6. 本地 Agent 接入指南</h2>

            <h3 className="text-lg font-bold text-cyan">设计原则</h3>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                <li><strong>最小权限：</strong>只申请业务真正需要的 scope；一柄 Key 只服务一个用途，出问题时可以精准吊销；</li>
                <li><strong>超时：</strong>每次请求都必须显式设置连接与读取超时（建议 10s 量级），绝不无限等待；</li>
                <li><strong>重试：</strong>只自动重试幂等请求（GET / PUT / DELETE）。POST 可能产生副作用（创建、提交、轮换），
                    重试前先确认上一请求是否已生效；重试采用指数退避并加入随机抖动，设次数上限；</li>
                <li><strong>429 处理：</strong>收到 RATE_LIMITED 后解析 <code>Retry-After</code> 头并原样等待，
                    不要自作主张缩短间隔，更不要并发轰炸；</li>
                <li><strong>fail closed：</strong>遇到 401 / 403 时停止使用当前 Key 继续尝试，先排查再行动。</li>
            </ul>

            <h3 className="text-lg font-bold text-cyan">Python（requests）封装示例</h3>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{pythonSample}</pre>

            <h3 className="text-lg font-bold text-cyan">Node（原生 fetch）封装示例</h3>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{nodeSample}</pre>

            <h3 className="text-lg font-bold text-cyan">常见陷阱</h3>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                <li>复制 Key 时漏掉尾部字符或混入空格、引号 → 401 API_KEY_INVALID；</li>
                <li>把 Key 写进源码、Dockerfile、Git 历史或异常日志 → 视同泄露，应立即吊销重建；</li>
                <li>未设置超时 → 网络抖动时 Agent 进程挂死、任务队列堆积；</li>
                <li>对 400 / 401 / 403 / 404 盲目重试 → 这些是非暂时性错误，重试只会浪费配额；</li>
                <li>忽略 Retry-After 固定频率猛刷 → 限流窗口不断延长；</li>
                <li>把 API Key 当 OIDC Access Token 调 UserInfo（或反过来）→ 两套凭据体系互不通用；</li>
                <li>Redirect URI 使用通配符、fragment 或随意端口 → 会被校验拒绝；native_public 回环仅允许 <code>http://127.0.0.1</code>；</li>
                <li>申请 student.identity 时未填写不少于 10 个字的用途说明 → 审核被退回；</li>
                <li>应用还没走到 active 就去跑 OIDC 授权 → 只有 active 应用才会被动态加载；</li>
                <li>credentials/rotate 后忘记同步更新服务端 secret → 旧 secret 立即失效，授权交换开始报错；</li>
                <li>把 revoke 当作“临时停用” → revoked 是终态不可恢复，临时停用请关注 suspended 状态。</li>
            </ul>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">7. 应用状态机与审核说明</h2>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-cyan">{stateMachineDiagram}</pre>
            <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-white/[0.05] text-gray-200">
                        <tr><th className="p-3">状态</th><th className="p-3">含义</th><th className="p-3">允许的操作</th></tr>
                    </thead>
                    <tbody className="text-gray-300">
                        <tr className="border-t border-white/10">
                            <td className="p-3"><code className="text-cyan">draft</code></td>
                            <td className="p-3">刚创建，自由编辑阶段</td>
                            <td className="p-3">修改信息、配置回调与 scope、提交审核、删除</td>
                        </tr>
                        <tr className="border-t border-white/10">
                            <td className="p-3"><code className="text-cyan">pending_review</code></td>
                            <td className="p-3">已提交，等待人工审核</td>
                            <td className="p-3">等待审核结论，不宜再改动</td>
                        </tr>
                        <tr className="border-t border-white/10">
                            <td className="p-3"><code className="text-cyan">approved</code></td>
                            <td className="p-3">审核通过，尚未启用</td>
                            <td className="p-3">启用进入 active</td>
                        </tr>
                        <tr className="border-t border-white/10">
                            <td className="p-3"><code className="text-cyan">active</code></td>
                            <td className="p-3">运行中，被 OIDC 动态加载，可正常参与授权流程</td>
                            <td className="p-3">日常运维：轮换凭据、查审计、吊销</td>
                        </tr>
                        <tr className="border-t border-white/10">
                            <td className="p-3"><code className="text-cyan">suspended</code></td>
                            <td className="p-3">被平台侧暂停（如违规、风控）</td>
                            <td className="p-3">暂停授权能力；按平台指引处理后恢复或吊销</td>
                        </tr>
                        <tr className="border-t border-white/10">
                            <td className="p-3"><code className="text-cyan">rejected</code></td>
                            <td className="p-3">审核拒绝</td>
                            <td className="p-3">按反馈修改后可重新 submit 进入 pending_review</td>
                        </tr>
                        <tr className="border-t border-white/10">
                            <td className="p-3"><code className="text-cyan">revoked</code></td>
                            <td className="p-3">已吊销（终态）</td>
                            <td className="p-3">不可恢复；如需继续接入请新建应用</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p className="text-sm leading-7 text-gray-300">
                关键规则：<strong>仅 active 应用会被 OIDC 动态加载</strong>。
                suspended / revoked 的应用会立即失去授权能力；rejected 不是终点，按审核意见修改后重新提交即可。
                审核由人工完成，涉及 student.identity 等敏感 scope 时会额外核对用途说明。
            </p>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">8. 安全须知与审计</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                <li>服务端只存 Key 哈希，明文仅创建时显示一次；任何声称能“找回明文 Key”的都是假的；</li>
                <li>所有 Key 操作与应用变更都会进入审计日志，可通过应用级与账户级 audit 端点查询；</li>
                <li>审计事件 metadata 不存任何密钥材料，日志可以放心留存与导出分析；</li>
                <li>建议定期（例如每月）检查账户级 audit 与 devices 列表，确认没有陌生设备与异常操作；</li>
                <li>发现未知的 Key、应用或设备：先吊销 / 吊销应用 / 排查设备，再排查自身环境是否失陷；</li>
                <li>轮换是常态：web_confidential 凭据定期 rotate；长期不用的 Key 及时在门户吊销；</li>
                <li>Agent 的日志系统必须脱敏：禁止记录 Authorization 头、Key 明文、client_secret 与审计之外的敏感字段。</li>
            </ul>
            <div className="rounded-xl border border-cyan/20 bg-cyan/5 p-5 text-sm leading-7 text-gray-300">
                泄露应急处置口诀：<strong>吊销 → 查审计 → 重建 → 更新部署</strong>。
                四步都可以在一小时内完成，越早吊销影响越小。
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">9. 相关入口</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                <li><a className="text-cyan hover:underline" href="/docs/identity-oidc">OIDC 接入指南</a>：应用审核通过后的授权协议接入；</li>
                <li><a className="text-cyan hover:underline" href={DEVELOPER_PORTAL}>Developer Portal</a>：申请 / 列表 / 吊销 API Key 与应用管理面板；</li>
                <li><a className="text-cyan hover:underline" href="/docs/security-privacy">安全与隐私</a>：理解平台整体的安全边界。</li>
            </ul>
        </section>
    </div>
);

export default ApiDocs;
