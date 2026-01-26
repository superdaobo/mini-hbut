use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionRecord {
    pub summary: String,
    #[serde(rename = "merchantName")]
    pub merchant_name: String,
    pub date: String,
    pub amt: String,
    #[serde(rename = "isRefund")]
    pub is_refund: String,
    pub journo: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionResponse {
    pub success: bool,
    pub message: String,
    #[serde(rename = "resultData")]
    pub data: Vec<TransactionRecord>,
}
