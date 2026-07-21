//! 教学评教（#439）
//!
//! 协议落地前返回可解析的空列表结构；后续抓包后补 list/form/submit。

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::http_client::HbutClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeachingEvalListResponse {
    pub success: bool,
    pub protocol_ready: bool,
    pub items: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeachingEvalFormResponse {
    pub success: bool,
    pub eval_id: String,
    pub questions: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeachingEvalSubmitResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// 待评列表。当前未完成评教子系统协议时返回空列表 + 提示。
pub async fn list_evals(client: &HbutClient) -> TeachingEvalListResponse {
    let _ = client;
    // TODO: MCP/协议抓包后对接官方 list API（教管一体化「学生评教」）
    TeachingEvalListResponse {
        success: true,
        protocol_ready: false,
        items: vec![],
        message: Some(
            "评教协议待对接：请在开放评教时段使用官方入口；后续版本将补齐列表与提交。"
                .to_string(),
        ),
    }
}

pub async fn fetch_form(client: &HbutClient, eval_id: &str) -> TeachingEvalFormResponse {
    let _ = client;
    TeachingEvalFormResponse {
        success: true,
        eval_id: eval_id.to_string(),
        questions: vec![
            json!({
                "id": "q1",
                "kind": "score",
                "title": "总体评分（协议占位）",
                "max_score": 10,
                "value": 10
            }),
            json!({
                "id": "q2",
                "kind": "text",
                "title": "意见建议（协议占位）",
                "value": ""
            }),
        ],
        message: Some("当前为占位表单，提交将返回未对接提示。".to_string()),
    }
}

pub async fn submit_eval(
    client: &HbutClient,
    eval_id: &str,
    _answers: &[Value],
    _quick_full_score: bool,
) -> TeachingEvalSubmitResponse {
    let _ = (client, eval_id);
    TeachingEvalSubmitResponse {
        success: false,
        message: Some("评教提交协议尚未对接，请暂用教管一体化官方「学生评教」。".to_string()),
    }
}
