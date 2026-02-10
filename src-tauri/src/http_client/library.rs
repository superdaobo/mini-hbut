use super::*;
use reqwest::RequestBuilder;
use serde_json::{json, Map, Value};

const OPAC_BASE_URL: &str = "https://opac.hbut.edu.cn:8013";

fn with_opac_headers(builder: RequestBuilder) -> RequestBuilder {
    builder
        .header("Accept", "application/json, text/plain, */*")
        .header("Content-Type", "application/json;charset=UTF-8")
        .header("Origin", OPAC_BASE_URL)
        .header("Referer", format!("{}/", OPAC_BASE_URL))
        .header("content-language", "zh_CN")
        .header("x-lang", "CHI")
        .header("groupcode", "800512")
        .header("mappingpath", "")
}

fn ensure_opac_success(
    payload: &Value,
    action: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ok = payload
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if ok {
        return Ok(());
    }

    let message = payload
        .get("message")
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty())
        .or_else(|| payload.get("errorCode").and_then(|v| v.as_str()))
        .unwrap_or("接口返回失败");

    Err(format!("{}失败: {}", action, message).into())
}

fn to_array(input: Option<&Value>) -> Value {
    match input {
        Some(Value::Array(arr)) => Value::Array(arr.clone()),
        _ => Value::Array(Vec::new()),
    }
}

fn to_string_or(input: Option<&Value>, default: &str) -> String {
    match input {
        Some(Value::String(v)) if !v.trim().is_empty() => v.trim().to_string(),
        Some(Value::Number(v)) => v.to_string(),
        Some(Value::Bool(v)) => v.to_string(),
        _ => default.to_string(),
    }
}

fn to_i64_or(input: Option<&Value>, default: i64) -> i64 {
    match input {
        Some(Value::Number(v)) => v.as_i64().unwrap_or(default),
        Some(Value::String(v)) => v.trim().parse::<i64>().unwrap_or(default),
        _ => default,
    }
}

fn to_nullable_bool(input: Option<&Value>) -> Value {
    match input {
        Some(Value::Bool(v)) => Value::Bool(*v),
        Some(Value::String(v)) => {
            let lower = v.trim().to_lowercase();
            if lower == "true" || lower == "1" {
                Value::Bool(true)
            } else if lower == "false" || lower == "0" {
                Value::Bool(false)
            } else {
                Value::Null
            }
        }
        _ => Value::Null,
    }
}

fn build_library_search_payload(params: Value) -> Value {
    let obj = params.as_object().cloned().unwrap_or_else(Map::new);
    let mut payload = Map::new();

    payload.insert("docCode".to_string(), json!([Value::Null]));
    payload.insert(
        "searchFieldContent".to_string(),
        Value::String(to_string_or(obj.get("searchFieldContent"), "")),
    );
    payload.insert(
        "searchField".to_string(),
        Value::String(to_string_or(obj.get("searchField"), "keyWord")),
    );
    payload.insert(
        "matchMode".to_string(),
        Value::String(to_string_or(obj.get("matchMode"), "2")),
    );

    for key in [
        "resourceType",
        "subject",
        "discode1",
        "publisher",
        "libCode",
        "locationId",
        "eCollectionIds",
        "neweCollectionIds",
        "curLocationId",
        "campusId",
        "kindNo",
        "collectionName",
        "author",
        "langCode",
        "countryCode",
        "coreInclude",
        "ddType",
        "verifyStatus",
        "group",
        "newCoreInclude",
        "customSub",
        "customSub0",
    ] {
        payload.insert(key.to_string(), to_array(obj.get(key)));
    }

    payload.insert(
        "publishBegin".to_string(),
        obj.get("publishBegin").cloned().unwrap_or(Value::Null),
    );
    payload.insert(
        "publishEnd".to_string(),
        obj.get("publishEnd").cloned().unwrap_or(Value::Null),
    );
    payload.insert(
        "sortField".to_string(),
        Value::String(to_string_or(obj.get("sortField"), "issued_sort")),
    );
    payload.insert(
        "sortClause".to_string(),
        Value::String(to_string_or(obj.get("sortClause"), "desc")),
    );
    payload.insert(
        "page".to_string(),
        Value::Number(to_i64_or(obj.get("page"), 1).into()),
    );
    payload.insert(
        "rows".to_string(),
        Value::Number(to_i64_or(obj.get("rows"), 10).into()),
    );
    payload.insert("onlyOnShelf".to_string(), to_nullable_bool(obj.get("onlyOnShelf")));
    payload.insert(
        "searchItems".to_string(),
        obj.get("searchItems").cloned().unwrap_or(Value::Null),
    );
    payload.insert("indexSearch".to_string(), Value::Number(1_i64.into()));

    Value::Object(payload)
}

impl HbutClient {
    async fn ensure_opac_session(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/", OPAC_BASE_URL);
        let response = self.client.get(url).send().await?;
        if !response.status().is_success() {
            return Err(format!("初始化图书检索会话失败: {}", response.status()).into());
        }
        Ok(())
    }

    async fn post_opac_json(
        &self,
        path: &str,
        payload: &Value,
    ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}{}", OPAC_BASE_URL, path);
        let response = with_opac_headers(self.client.post(url).json(payload))
            .send()
            .await?;

        let status = response.status();
        let body = response.text().await?;
        if !status.is_success() {
            let preview = body.chars().take(200).collect::<String>();
            return Err(format!("图书接口请求失败({}): {}", status, preview).into());
        }

        serde_json::from_str::<Value>(&body)
            .map_err(|e| format!("图书接口响应解析失败: {}", e).into())
    }

    pub async fn fetch_library_dict(
        &self,
    ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
        self.ensure_opac_session().await?;
        let payload = json!({});
        let result = self.post_opac_json("/find/groupResource/dict", &payload).await?;
        ensure_opac_success(&result, "获取图书筛选项")?;
        Ok(result)
    }

    pub async fn search_library_books(
        &self,
        params: Value,
    ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
        self.ensure_opac_session().await?;
        let payload = build_library_search_payload(params);
        let result = self.post_opac_json("/find/unify/search", &payload).await?;
        ensure_opac_success(&result, "图书检索")?;
        Ok(result)
    }

    pub async fn fetch_library_book_detail(
        &self,
        title: &str,
        isbn: &str,
        record_id: Option<i64>,
    ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
        if title.trim().is_empty() {
            return Err("图书标题不能为空".into());
        }

        self.ensure_opac_session().await?;

        let mut detail_payload = json!({
            "title": title,
            "isbn": isbn
        });
        if let Some(id) = record_id {
            detail_payload["recordId"] = json!(id);
        }

        let mut holding_payload = json!({
            "title": title,
            "isbn": isbn
        });
        if let Some(id) = record_id {
            holding_payload["recordId"] = json!(id);
        }

        let detail_result = self
            .post_opac_json(
                "/find/searchResultDetail/getBookInfoFromCxCkb",
                &detail_payload,
            )
            .await
            .ok();

        let holding_result = self
            .post_opac_json(
                "/find/unify/getPItemAndOnShelfCountAndDuxiuImageUrl",
                &holding_payload,
            )
            .await
            .ok();

        let detail_data = detail_result
            .as_ref()
            .and_then(|v| v.get("data").cloned())
            .unwrap_or(Value::Null);

        let holding_data = holding_result
            .as_ref()
            .and_then(|v| v.get("data").cloned())
            .unwrap_or(Value::Null);

        if detail_result.is_none() && holding_result.is_none() {
            return Err("图书详情与馆藏均获取失败".into());
        }

        Ok(json!({
            "success": true,
            "title": title,
            "isbn": isbn,
            "detail": detail_data,
            "holding": holding_data
        }))
    }
}
