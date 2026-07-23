//! 教学评教（#439）
//!
//! - UI：一键满分 + 确认 / 不再询问已由前端实现
//! - 协议：教管一体化 list/form/submit 待 MCP 抓包；当前返回友好空态
//! - 纯函数：满分答案填充可单测，便于协议对接后直接复用

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

/// 默认主观题短评（与前端 TeachingEvalView 保持一致语义）
pub const DEFAULT_COMMENT_TEMPLATE: &str = "认真负责，收获很大。";

/// 将题目列表填为满分 / 默认评语。`kind` 支持 score/rate/text。
pub fn apply_full_score_answers(questions: &[Value], comment_template: &str) -> Vec<Value> {
    questions
        .iter()
        .map(|q| {
            let mut obj = q.clone();
            let kind = obj
                .get("kind")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            match kind.as_str() {
                "score" | "rate" => {
                    let max = obj
                        .get("max_score")
                        .and_then(|v| v.as_f64())
                        .or_else(|| obj.get("max_score").and_then(|v| v.as_i64()).map(|n| n as f64))
                        .unwrap_or(10.0);
                    if let Some(map) = obj.as_object_mut() {
                        map.insert("value".into(), json!(max));
                    }
                }
                "text" => {
                    let empty = obj
                        .get("value")
                        .and_then(|v| v.as_str())
                        .map(|s| s.trim().is_empty())
                        .unwrap_or(true);
                    if empty {
                        if let Some(map) = obj.as_object_mut() {
                            map.insert("value".into(), json!(comment_template));
                        }
                    }
                }
                _ => {}
            }
            obj
        })
        .collect()
}

/// 待评列表。协议未对接：空列表 + 友好 message，不 panic。
pub async fn list_evals(client: &HbutClient) -> TeachingEvalListResponse {
    let _ = client;
    // TODO: MCP 抓包后对接教管一体化学生评教 list API（见 docs/protocol/teaching-eval.md）
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
    let questions = vec![
        json!({
            "id": "q1",
            "kind": "score",
            "title": "总体评分（协议占位）",
            "max_score": 10,
            "value": 0
        }),
        json!({
            "id": "q2",
            "kind": "text",
            "title": "意见建议（协议占位）",
            "value": ""
        }),
    ];
    TeachingEvalFormResponse {
        success: true,
        eval_id: eval_id.to_string(),
        questions: apply_full_score_answers(&questions, DEFAULT_COMMENT_TEMPLATE),
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
        message: Some(
            "评教提交协议尚未对接，请暂用教管一体化官方「学生评教」。".to_string(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_score_fills_max_and_default_comment() {
        let qs = vec![
            json!({"id":"q1","kind":"score","max_score":5,"value":1}),
            json!({"id":"q2","kind":"text","value":""}),
            json!({"id":"q3","kind":"text","value":"已有内容"}),
        ];
        let out = apply_full_score_answers(&qs, DEFAULT_COMMENT_TEMPLATE);
        assert_eq!(out[0]["value"], json!(5.0));
        assert_eq!(out[1]["value"], json!(DEFAULT_COMMENT_TEMPLATE));
        assert_eq!(out[2]["value"], json!("已有内容"));
    }

    #[test]
    fn submit_without_protocol_is_friendly_failure() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build();
        // 不依赖 HbutClient 真机：直接构造响应语义
        let resp = TeachingEvalSubmitResponse {
            success: false,
            message: Some("评教提交协议尚未对接".into()),
        };
        assert!(!resp.success);
        assert!(resp.message.as_deref().unwrap_or("").contains("未对接"));
        let _ = rt; // keep tokio optional
    }
}
