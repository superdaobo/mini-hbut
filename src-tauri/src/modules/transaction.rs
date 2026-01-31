//! 💰 交易流水数据结构
//! 
//! 定义了一卡通或电费充值的交费记录结构。
//! 对应财务处的 API 返回格式。

use serde::{Deserialize, Serialize};

/// 单条交易记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionRecord {
    /// 摘要 (如 "电费充值")
    pub summary: String,
    /// 商户名称
    #[serde(rename = "merchantName")]
    pub merchant_name: String,
    /// 交易时间
    pub date: String,
    /// 交易金额
    pub amt: String,
    /// 是否为退款
    #[serde(rename = "isRefund")]
    pub is_refund: String,
    /// 流水号
    pub journo: String,
}

/// 交易查询响应包
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionResponse {
    pub success: bool,
    pub message: String,
    #[serde(rename = "resultData")]
    pub data: Vec<TransactionRecord>,
}
