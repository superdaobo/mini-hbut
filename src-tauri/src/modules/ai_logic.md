# 虚拟数字人 AI 模块逻辑 (ai.rs)

## 1. 模块概述
`ai.rs` 实现了与 "VirtualHuman" (wanmei.com) 服务的对接，这是一个第三方数字人问答系统。
功能包括初始化会话、上传附件、流式问答对话。

## 2. 核心流程

### 2.1 初始化会话 (`hbut_ai_init`)
1.  客户端调用 `init_ai_session()` (在 `http_client.rs` 中实现，涉及 HBUT 门户 SSO)。
2.  获取 `token` 和 `blade_auth` 认证头。

### 2.2 上传附件 (`hbut_ai_upload`)
1.  目标 API: `/apis/blade-resource/oss/endpoint/put-file-attach-limit`.
2.  使用 `multipart/form-data` 上传文件。
3.  需要设置 `blade-auth` 和 `Referer`。
4.  响应包含文件下载链接 (`link`)，用于后续对话上下文。

### 2.3 问答对话 (`hbut_ai_chat`)
1.  目标 API: `/apis/virtualhuman/serverApi/question/streamAnswer`.
2.  发送用户提问 (`ask`) 和附件链接。
3.  返回文本回复 (非标准流式)。

## 3. 关键结构
*   **AiInitResponse**: 包含前端后续请求所需的 Auth Info。
*   **AiUploadResponse**: 包含上传成功后的 OSS 链接。

## 4. 安全性
*   所有请求必须携带从 HBUT SSO 获取的 Token。
*   `Referer` 必须严格匹配 Token，否则 API 拒绝访问。
