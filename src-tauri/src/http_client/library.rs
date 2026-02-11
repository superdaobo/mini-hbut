use super::*;
use reqwest::RequestBuilder;
use serde_json::{json, Map, Value};

const OPAC_BASE_URL: &str = "https://opac.hbut.edu.cn:8013";
const OPAC_SERVICE_URL: &str = "https://opac.hbut.edu.cn:8013/";
const BOOKCOVERS_CLIENT_ID: &str = "800512";

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
        Value::String(to_string_or(obj.get("sortClause"), "asc")),
    );
    payload.insert(
        "page".to_string(),
        Value::Number(to_i64_or(obj.get("page"), 1).into()),
    );
    payload.insert(
        "rows".to_string(),
        Value::Number(to_i64_or(obj.get("rows"), 50).into()),
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
    async fn fetch_cover_from_bookcovers(
        &self,
        isbn: &str,
    ) -> Result<Option<String>, Box<dyn std::error::Error + Send + Sync>> {
        let isbn = isbn.trim();
        if isbn.is_empty() {
            return Ok(None);
        }

        let callback = "lanbo";
        let url = format!(
            "https://www.bookcovers.cn/indexc.php?client={}&isbn={}&callback={}",
            BOOKCOVERS_CLIENT_ID,
            urlencoding::encode(isbn),
            callback
        );

        let response = self.client.get(url).send().await?;
        if !response.status().is_success() {
            return Ok(None);
        }
        let text = response.text().await?;
        let trimmed = text.trim().trim_end_matches(';').trim();
        let prefix = format!("{}(", callback);
        if !trimmed.starts_with(&prefix) || !trimmed.ends_with(')') {
            return Ok(None);
        }

        let json_text = &trimmed[prefix.len()..trimmed.len() - 1];
        let payload: Value = serde_json::from_str(json_text)?;
        let cover = payload
            .get("result")
            .and_then(|v| v.get("coverUrl").or_else(|| v.get("coverPath")))
            .and_then(|v| v.as_str())
            .map(|v| v.trim())
            .filter(|v| !v.is_empty())
            .map(|v| v.to_string());

        Ok(cover)
    }

    async fn ensure_opac_session(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/", OPAC_BASE_URL);
        let response = self.client.get(url).send().await?;
        if !response.status().is_success() {
            return Err(format!("初始化图书检索会话失败: {}", response.status()).into());
        }
        if response.url().as_str().contains("authserver/login") {
            let _ = self.establish_opac_sso_session().await;
        }
        Ok(())
    }

    /// Establish OPAC CAS session so follow-up OPAC APIs can be called.
    async fn establish_opac_sso_session(
        &mut self,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let cas_url = format!(
            "{}/login?service={}",
            AUTH_BASE_URL,
            urlencoding::encode(OPAC_SERVICE_URL)
        );

        let check_resp = self.client.get(&cas_url).send().await?;
        let check_url = check_resp.url().to_string();
        let need_login = check_url.contains("authserver/login") && !check_url.contains("ticket=");

        if need_login {
            let username = self.last_username.clone().unwrap_or_default();
            let password = self.last_password.clone().unwrap_or_default();
            if username.is_empty() || password.is_empty() {
                println!("[调试] 图书会话兜底：未找到登录凭据，跳过 OPAC SSO");
                return Ok(false);
            }
            println!("[调试] 图书会话兜底：执行 OPAC SSO 登录");
            self.login_for_service(&username, &password, OPAC_SERVICE_URL).await?;
        } else {
            println!("[调试] 图书会话兜底：CAS 会话可用，直接建立 OPAC 会话");
        }

        let final_resp = self.client.get(OPAC_SERVICE_URL).send().await?;
        if !final_resp.status().is_success() {
            return Err(format!("建立 OPAC 会话失败: {}", final_resp.status()).into());
        }
        Ok(true)
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

    async fn get_opac_json(
        &self,
        path: &str,
        query: &[(String, String)],
    ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}{}", OPAC_BASE_URL, path);
        let response = with_opac_headers(self.client.get(url).query(query))
            .send()
            .await?;

        let status = response.status();
        let body = response.text().await?;
        if !status.is_success() {
            let preview = body.chars().take(200).collect::<String>();
            return Err(format!("图书 GET 接口请求失败({}): {}", status, preview).into());
        }

        serde_json::from_str::<Value>(&body)
            .map_err(|e| format!("图书 GET 接口响应解析失败: {}", e).into())
    }

    pub async fn fetch_library_dict(
        &mut self,
    ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
        self.ensure_opac_session().await?;
        let payload = json!({});
        let result = self.post_opac_json("/find/groupResource/dict", &payload).await?;
        ensure_opac_success(&result, "获取图书筛选项")?;
        Ok(result)
    }

    pub async fn search_library_books(
        &mut self,
        params: Value,
    ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
        self.ensure_opac_session().await?;
        let payload = build_library_search_payload(params);
        let query = payload
            .get("searchFieldContent")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .trim()
            .to_string();

        let result = self.post_opac_json("/find/unify/search", &payload).await?;
        ensure_opac_success(&result, "图书检索")?;

        let num_found = result
            .get("data")
            .and_then(|v| v.get("numFound"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0);

        if !query.is_empty() && num_found == 0 {
            println!("[调试] 图书检索命中 0 条，尝试 OPAC SSO 后重试");
            match self.establish_opac_sso_session().await {
                Ok(true) => {
                    let retry = self.post_opac_json("/find/unify/search", &payload).await?;
                    ensure_opac_success(&retry, "图书检索重试")?;
                    return Ok(retry);
                }
                Ok(false) => {
                    println!("[调试] 图书检索重试跳过：无可用凭据");
                }
                Err(err) => {
                    println!("[警告] 图书检索重试失败：{}", err);
                }
            }
        }

        Ok(result)
    }

    pub async fn fetch_library_book_detail(
        &mut self,
        title: &str,
        isbn: &str,
        record_id: Option<i64>,
    ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
        if title.trim().is_empty() {
            return Err("book title is required".into());
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

        let holding_items_result = if let Some(id) = record_id {
            self.post_opac_json(
                "/find/physical/groupitems",
                &json!({
                    "page": 1,
                    "rows": 100,
                    "entrance": Value::Null,
                    "recordId": id,
                    "isUnify": true,
                    "sortType": 0
                }),
            )
            .await
            .ok()
        } else {
            None
        };

        let mut cover_query = vec![
            ("title".to_string(), title.to_string()),
            ("isbn".to_string(), isbn.to_string()),
        ];
        if let Some(id) = record_id {
            cover_query.push(("recordId".to_string(), id.to_string()));
        }
        let should_try_cover = record_id.is_some() || !title.trim().is_empty() || !isbn.trim().is_empty();
        let cover_result = if should_try_cover {
            self.get_opac_json("/find/book/getDuxiuImageUrl", &cover_query)
                .await
                .ok()
        } else {
            None
        };

        let detail_data = detail_result
            .as_ref()
            .and_then(|v| v.get("data").cloned())
            .unwrap_or(Value::Null);

        let holding_data = holding_result
            .as_ref()
            .and_then(|v| v.get("data").cloned())
            .unwrap_or(Value::Null);

        let holding_items_data = holding_items_result
            .as_ref()
            .and_then(|v| v.get("data").cloned())
            .unwrap_or(Value::Null);

        let mut cover_url = cover_result
            .as_ref()
            .and_then(|v| v.get("data"))
            .and_then(|v| v.as_str())
            .map(|v| v.trim())
            .filter(|v| !v.is_empty())
            .map(|v| v.to_string())
            .or_else(|| {
                holding_data
                    .get("duxiuImageUrl")
                    .and_then(|v| v.as_str())
                    .map(|v| v.trim())
                    .filter(|v| !v.is_empty())
                    .map(|v| v.to_string())
            })
            .unwrap_or_default();

        // OPAC 的独秀封面经常返回空字符串，额外走 bookcovers 兜底。
        if cover_url.is_empty() {
            if let Ok(Some(fallback_cover)) = self.fetch_cover_from_bookcovers(isbn).await {
                cover_url = fallback_cover;
            }
        }

        if detail_result.is_none() && holding_result.is_none() && holding_items_result.is_none() {
            return Err("failed to fetch library detail data".into());
        }

        Ok(json!({
            "success": true,
            "title": title,
            "isbn": isbn,
            "detail": detail_data,
            "holding": holding_data,
            "holding_items": holding_items_data,
            "cover_url": cover_url
        }))
    }
}

