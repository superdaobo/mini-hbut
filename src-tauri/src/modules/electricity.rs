//! ⚡ 电费查询模块 - 与 Python modules/electricity.py 对应
//!
//! 主要职责:
//! 1. 封装 Fusion Portal (能耗系统) 的 API。
//! 2. 提供位置层级 (Location) 的递归查询 (区域 -> 楼栋 -> 楼层 -> 房间)。
//! 3. 查询特定房间的电费账户余额和状态。
//! 
//! 注意: 使用前必须先通过 OAuth 流程获取 Token (由 `http_client.rs` 负责)。

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const CODE_BASE_URL: &str = "https://code.hbut.edu.cn";

/// 电费账户余额信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElectricityBalance {
    /// 查询是否成功
    pub success: bool,
    /// 账户余额 (元)
    pub balance: String,
    /// 剩余电量 (度)
    pub quantity: String,
    /// 供电状态 (如 "正常供电")
    pub status: String,
    /// 房间名称 (可选)
    pub room_name: String,
}

/// 位置节点信息 (区域/楼栋/房间通用)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationItem {
    pub id: String,
    pub name: String,
}

/// 电费模块封装
pub struct ElectricityModule {
    client: Client,
    /// JWT 认证令牌
    auth_token: Option<String>,
}

impl ElectricityModule {
    pub fn new(client: Client) -> Self {
        Self {
            client,
            auth_token: None,
        }
    }

    /// 设置认证 Token
    pub fn set_auth_token(&mut self, token: &str) {
        self.auth_token = Some(token.to_string());
    }

    /// 通用位置查询接口
    /// 
    /// 向 /server/utilities/location 发送 POST 请求。
    /// payload 决定了查询的层级 (area, building, unit, room)。
    pub async fn query_location(&self, payload: &Value) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/server/utilities/location", CODE_BASE_URL);
        
        let token = self.auth_token.as_ref()
            .ok_or("未设置电费查询授权 Token")?;
        
        println!("[DEBUG] Querying electricity location: {}", url);

        let response = self.client
            .post(&url)
            .header("Authorization", token)
            .header("Content-Type", "application/json")
            .header("Origin", CODE_BASE_URL)
            .header("Referer", format!("{}/", CODE_BASE_URL))
            .json(payload)
            .send()
            .await?;

        let json: Value = response.json().await?;
        Ok(json)
    }

    /// 查询账户详情 (余额/电量)
    pub async fn query_account(&self, payload: &Value) -> Result<ElectricityBalance, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/server/utilities/account", CODE_BASE_URL);
        
        let token = self.auth_token.as_ref()
            .ok_or("未设置电费查询授权 Token")?;
        
        println!("[DEBUG] Querying electricity account: {}", url);
        println!("[DEBUG] Payload: {}", payload);

        let response = self.client
            .post(&url)
            .header("Authorization", token)
            .header("Content-Type", "application/json")
            .header("Origin", CODE_BASE_URL)
            .header("Referer", format!("{}/", CODE_BASE_URL))
            .json(payload)
            .send()
            .await?;

        let status = response.status();
        println!("[DEBUG] Electricity account response status: {}", status);

        if !status.is_success() {
            return Ok(ElectricityBalance {
                success: false,
                balance: "0.00".to_string(),
                quantity: "0.00".to_string(),
                status: format!("请求失败: {}", status),
                room_name: String::new(),
            });
        }

        let json: Value = response.json().await?;
        
        if !json.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
            let msg = json.get("message").and_then(|v| v.as_str()).unwrap_or("未知错误");
            return Ok(ElectricityBalance {
                success: false,
                balance: "0.00".to_string(),
                quantity: "0.00".to_string(),
                status: msg.to_string(),
                room_name: String::new(),
            });
        }

        // 解析结果
        let result_data = json.get("resultData").unwrap_or(&Value::Null);
        let template_list = result_data.get("templateList")
            .and_then(|v| v.as_array());

        let mut balance = "0.00".to_string();
        let mut quantity = "0.00".to_string();

        if let Some(items) = template_list {
            for item in items {
                let code = item.get("code").and_then(|v| v.as_str()).unwrap_or("");
                let value = item.get("value").and_then(|v| v.as_str()).unwrap_or("0.00");
                
                match code {
                    "balance" => balance = value.to_string(),
                    "quantity" => quantity = value.to_string(),
                    _ => {}
                }
            }
        }

        let status_name = result_data.get("utilityStatusName")
            .and_then(|v| v.as_str())
            .unwrap_or("未知")
            .to_string();

        Ok(ElectricityBalance {
            success: true,
            balance,
            quantity,
            status: status_name,
            room_name: String::new(),
        })
    }

    pub async fn get_root_areas(&self) -> Result<Vec<LocationItem>, Box<dyn std::error::Error + Send + Sync>> {
        let payload = serde_json::json!({
            "utilityType": "electric",
            "locationType": "area",
            "area": "",
            "building": "",
            "unit": "",
            "room": "",
            "level": ""
        });

        let json = self.query_location(&payload).await?;
        self.parse_location_list(&json)
    }

    pub async fn get_buildings(&self, area_id: &str) -> Result<Vec<LocationItem>, Box<dyn std::error::Error + Send + Sync>> {
        let payload = serde_json::json!({
            "utilityType": "electric",
            "locationType": "building",
            "area": area_id,
            "building": "",
            "unit": "",
            "room": "",
            "level": ""
        });

        let json = self.query_location(&payload).await?;
        self.parse_location_list(&json)
    }

    pub async fn get_units(&self, area_id: &str, building_id: &str) -> Result<Vec<LocationItem>, Box<dyn std::error::Error + Send + Sync>> {
        let payload = serde_json::json!({
            "utilityType": "electric",
            "locationType": "unit",
            "area": area_id,
            "building": building_id,
            "unit": "",
            "room": "",
            "level": ""
        });

        let json = self.query_location(&payload).await?;
        self.parse_location_list(&json)
    }

    pub async fn get_rooms(&self, area_id: &str, building_id: &str, unit_id: &str) -> Result<Vec<LocationItem>, Box<dyn std::error::Error + Send + Sync>> {
        let payload = serde_json::json!({
            "utilityType": "electric",
            "locationType": "room",
            "area": area_id,
            "building": building_id,
            "unit": "",
            "level": unit_id,
            "room": ""
        });

        let json = self.query_location(&payload).await?;
        self.parse_location_list(&json)
    }

    fn parse_location_list(&self, json: &Value) -> Result<Vec<LocationItem>, Box<dyn std::error::Error + Send + Sync>> {
        let mut items = Vec::new();

        if !json.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
            return Ok(items);
        }

        if let Some(result_data) = json.get("resultData").and_then(|v| v.as_array()) {
            for item in result_data {
                let id = item.get("id")
                    .and_then(|v| v.as_str().map(|s| s.to_string()).or_else(|| v.as_i64().map(|n| n.to_string())))
                    .unwrap_or_default();
                let name = item.get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                if !id.is_empty() {
                    items.push(LocationItem { id, name });
                }
            }
        }

        Ok(items)
    }
}
