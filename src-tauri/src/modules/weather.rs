//! 🌤️ 天气查询模块 - 获取武汉洪山区实时天气
//!
//! 主要职责:
//! 1. 调用 wttr.in 免费 API 获取实时天气数据
//! 2. 返回当前天气 + 3 天预报
//! 3. 内置 5 分钟缓存，避免频繁请求
//!
//! API: https://wttr.in/Wuhan+Hongshan?format=j1 (无需 API Key)

use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

/// wttr.in API 地址
const WTTR_URL: &str = "https://wttr.in/Wuhan+Hongshan?format=j1";

/// 缓存有效期 (5 分钟)
const CACHE_TTL_SECS: u64 = 300;

// ─── 数据结构 ───────────────────────────────────────────────

/// 天气数据（返回给前端）
#[derive(Debug, Clone, Serialize)]
pub struct WeatherData {
    /// 当前温度 (°C)
    pub temp: i32,
    /// 天气状况（中文：晴/多云/小雨 等）
    pub condition: String,
    /// 湿度百分比
    pub humidity: i32,
    /// 风力描述（如 "东南风 3级"）
    pub wind: String,
    /// 空气质量指数（根据能见度估算）
    pub aqi: i32,
    /// Font Awesome 图标 class
    pub icon: String,
    /// 城市名称
    pub city: String,
    /// 3 天预报
    pub forecast: Vec<ForecastDay>,
}

/// 单日预报
#[derive(Debug, Clone, Serialize)]
pub struct ForecastDay {
    /// 日期标签（今天/明天/后天）
    pub day: String,
    /// 最高温度
    pub temp_high: i32,
    /// 最低温度
    pub temp_low: i32,
    /// 天气状况（中文）
    pub condition: String,
    /// Font Awesome 图标 class
    pub icon: String,
}

// ─── 缓存 ───────────────────────────────────────────────────

/// 全局缓存：(上次获取时间, 天气数据)
static WEATHER_CACHE: OnceLock<Mutex<Option<(Instant, WeatherData)>>> = OnceLock::new();

fn get_cache() -> &'static Mutex<Option<(Instant, WeatherData)>> {
    WEATHER_CACHE.get_or_init(|| Mutex::new(None))
}

// ─── Tauri Command ──────────────────────────────────────────

/// 获取天气数据（带 5 分钟缓存）
#[tauri::command]
pub async fn fetch_weather() -> Result<WeatherData, String> {
    // 检查缓存
    {
        let cache = get_cache().lock().map_err(|e| format!("缓存锁异常: {}", e))?;
        if let Some((ts, data)) = cache.as_ref() {
            if ts.elapsed().as_secs() < CACHE_TTL_SECS {
                return Ok(data.clone());
            }
        }
    }

    // 缓存过期或不存在，请求 API
    let data = request_weather().await?;

    // 写入缓存
    {
        let mut cache = get_cache().lock().map_err(|e| format!("缓存锁异常: {}", e))?;
        *cache = Some((Instant::now(), data.clone()));
    }

    Ok(data)
}

// ─── API 请求与解析 ─────────────────────────────────────────

/// 请求 wttr.in 并解析为 WeatherData
async fn request_weather() -> Result<WeatherData, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let resp = client
        .get(WTTR_URL)
        .header("User-Agent", "curl/7.68.0") // wttr.in 需要类 curl UA 才返回 JSON
        .send()
        .await
        .map_err(|e| format!("天气 API 请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("天气 API 返回错误状态: {}", resp.status()));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析天气 JSON 失败: {}", e))?;

    parse_weather_response(&json)
}

/// 解析 wttr.in JSON 响应
fn parse_weather_response(json: &serde_json::Value) -> Result<WeatherData, String> {
    // 解析当前天气
    let current = json
        .get("current_condition")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .ok_or("无法解析 current_condition")?;

    let temp = current
        .get("temp_C")
        .and_then(|v| v.as_str())
        .unwrap_or("0")
        .parse::<i32>()
        .unwrap_or(0);

    let humidity = current
        .get("humidity")
        .and_then(|v| v.as_str())
        .unwrap_or("0")
        .parse::<i32>()
        .unwrap_or(0);

    // 天气描述（英文）
    let weather_desc_en = current
        .get("weatherDesc")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.get("value"))
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown");

    let condition = translate_condition(weather_desc_en);
    let icon = condition_to_icon(&condition);

    // 风力信息
    let wind_speed_kmph = current
        .get("windspeedKmph")
        .and_then(|v| v.as_str())
        .unwrap_or("0")
        .parse::<i32>()
        .unwrap_or(0);

    let wind_dir_degree = current
        .get("winddirDegree")
        .and_then(|v| v.as_str())
        .unwrap_or("0")
        .parse::<i32>()
        .unwrap_or(0);

    let wind_dir = degree_to_direction(wind_dir_degree);
    let wind_level = kmph_to_level(wind_speed_kmph);
    let wind = format!("{} {}级", wind_dir, wind_level);

    // AQI 估算（基于能见度）
    let visibility = current
        .get("visibility")
        .and_then(|v| v.as_str())
        .unwrap_or("10")
        .parse::<i32>()
        .unwrap_or(10);
    let aqi = estimate_aqi(visibility);

    // 解析 3 天预报
    let weather_arr = json
        .get("weather")
        .and_then(|v| v.as_array())
        .ok_or("无法解析 weather 预报数组")?;

    let day_labels = ["今天", "明天", "后天"];
    let mut forecast = Vec::new();

    for (i, day_data) in weather_arr.iter().take(3).enumerate() {
        let temp_high = day_data
            .get("maxtempC")
            .and_then(|v| v.as_str())
            .unwrap_or("0")
            .parse::<i32>()
            .unwrap_or(0);

        let temp_low = day_data
            .get("mintempC")
            .and_then(|v| v.as_str())
            .unwrap_or("0")
            .parse::<i32>()
            .unwrap_or(0);

        // 取中午时段的天气描述作为当天代表
        let hourly = day_data
            .get("hourly")
            .and_then(|v| v.as_array());

        let day_desc_en = hourly
            .and_then(|hours| {
                // 取 12:00 的天气（index 4，每 3 小时一个点）
                hours.get(4).or_else(|| hours.get(2))
            })
            .and_then(|h| h.get("weatherDesc"))
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|v| v.get("value"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown");

        let day_condition = translate_condition(day_desc_en);
        let day_icon = condition_to_icon(&day_condition);

        forecast.push(ForecastDay {
            day: day_labels.get(i).unwrap_or(&"").to_string(),
            temp_high,
            temp_low,
            condition: day_condition,
            icon: day_icon,
        });
    }

    Ok(WeatherData {
        temp,
        condition,
        humidity,
        wind,
        aqi,
        icon,
        city: "武汉市洪山区".to_string(),
        forecast,
    })
}

// ─── 辅助函数 ───────────────────────────────────────────────

/// 英文天气描述 → 中文
fn translate_condition(en: &str) -> String {
    let lower = en.to_lowercase();
    if lower.contains("thunder") {
        "雷阵雨".to_string()
    } else if lower.contains("heavy rain") || lower.contains("heavy shower") {
        "大雨".to_string()
    } else if lower.contains("moderate rain") || lower.contains("moderate shower") {
        "中雨".to_string()
    } else if lower.contains("light rain")
        || lower.contains("patchy rain")
        || lower.contains("drizzle")
        || lower.contains("light shower")
    {
        "小雨".to_string()
    } else if lower.contains("snow") || lower.contains("sleet") || lower.contains("blizzard") {
        "雪".to_string()
    } else if lower.contains("fog") || lower.contains("mist") || lower.contains("haze") {
        "雾".to_string()
    } else if lower.contains("overcast") {
        "阴".to_string()
    } else if lower.contains("partly cloudy") || lower.contains("partly sunny") {
        "多云".to_string()
    } else if lower.contains("cloudy") {
        "阴".to_string()
    } else if lower.contains("sunny") || lower.contains("clear") {
        "晴".to_string()
    } else {
        // 无法匹配时返回原文
        en.to_string()
    }
}

/// 中文天气状况 → Font Awesome 图标 class
fn condition_to_icon(condition: &str) -> String {
    match condition {
        "晴" => "fa-sun".to_string(),
        "多云" => "fa-cloud-sun".to_string(),
        "阴" => "fa-cloud".to_string(),
        "小雨" | "中雨" => "fa-cloud-rain".to_string(),
        "大雨" | "雷阵雨" => "fa-cloud-showers-heavy".to_string(),
        "雪" => "fa-snowflake".to_string(),
        "雾" => "fa-smog".to_string(),
        _ => "fa-cloud".to_string(),
    }
}

/// 风向角度 → 中文方位
fn degree_to_direction(degree: i32) -> &'static str {
    match degree {
        0..=22 | 338..=360 => "北风",
        23..=67 => "东北风",
        68..=112 => "东风",
        113..=157 => "东南风",
        158..=202 => "南风",
        203..=247 => "西南风",
        248..=292 => "西风",
        293..=337 => "西北风",
        _ => "北风",
    }
}

/// 风速 (km/h) → 风力等级
fn kmph_to_level(kmph: i32) -> i32 {
    match kmph {
        0..=1 => 0,
        2..=5 => 1,
        6..=11 => 2,
        12..=19 => 3,
        20..=28 => 4,
        29..=38 => 5,
        39..=49 => 6,
        50..=61 => 7,
        _ => 8,
    }
}

/// 根据能见度估算 AQI
/// 能见度越低，AQI 越高（空气越差）
fn estimate_aqi(visibility_km: i32) -> i32 {
    match visibility_km {
        v if v >= 20 => 25,  // 优
        v if v >= 10 => 50,  // 良
        v if v >= 5 => 100,  // 轻度
        v if v >= 3 => 150,  // 中度
        v if v >= 1 => 200,  // 重度
        _ => 300,            // 严重
    }
}
