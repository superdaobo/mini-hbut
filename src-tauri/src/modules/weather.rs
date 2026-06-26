//! 🌤️ 天气查询模块 - 获取湖北工业大学实时天气
//!
//! 主要职责:
//! 1. 调用 Open-Meteo 免费 API 获取实时天气数据
//! 2. 返回当前天气 + 3 天预报
//! 3. 内置 5 分钟缓存，避免频繁请求
//!
//! API: https://api.open-meteo.com/v1/forecast (无需 API Key)
//! 坐标: 湖北工业大学 (30.67°N, 114.35°E)

use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

/// 湖北工业大学坐标
const LATITUDE: f64 = 30.67;
const LONGITUDE: f64 = 114.35;

/// Open-Meteo API 地址
const API_URL: &str = "https://api.open-meteo.com/v1/forecast";

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
    /// 空气质量指数（根据 PM2.5 估算）
    pub aqi: i32,
    /// Font Awesome 图标 class
    pub icon: String,
    /// 城市名称
    pub city: String,
    /// 3 天预报
    pub forecast: Vec<ForecastDay>,
    /// 逐时预报（未来 24 小时）
    pub hourly: Vec<HourlyItem>,
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

/// 逐时预报项
#[derive(Debug, Clone, Serialize)]
pub struct HourlyItem {
    /// 时间标签（如 "14:00" 或 "现在"）
    pub time: String,
    /// 温度
    pub temp: i32,
    /// 天气状况
    pub condition: String,
    /// 图标
    pub icon: String,
}

// ─── 缓存 ───────────────────────────────────────────────────

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
        let cache = get_cache()
            .lock()
            .map_err(|e| format!("缓存锁异常: {}", e))?;
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
        let mut cache = get_cache()
            .lock()
            .map_err(|e| format!("缓存锁异常: {}", e))?;
        *cache = Some((Instant::now(), data.clone()));
    }

    Ok(data)
}

// ─── API 请求与解析 ─────────────────────────────────────────

/// 请求 Open-Meteo 并解析为 WeatherData
async fn request_weather() -> Result<WeatherData, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    // 构建请求 URL
    // timezone=Asia/Shanghai 确保返回北京时间
    let url = format!(
        "{}?latitude={}&longitude={}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia/Shanghai&forecast_days=7",
        API_URL, LATITUDE, LONGITUDE
    );

    let resp = client
        .get(&url)
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

/// 解析 Open-Meteo JSON 响应
fn parse_weather_response(json: &serde_json::Value) -> Result<WeatherData, String> {
    // 解析当前天气
    let current = json.get("current").ok_or("无法解析 current 数据")?;

    let temp = current
        .get("temperature_2m")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0)
        .round() as i32;

    let humidity = current
        .get("relative_humidity_2m")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;

    let weather_code = current
        .get("weather_code")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;

    let wind_speed = current
        .get("wind_speed_10m")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let wind_direction = current
        .get("wind_direction_10m")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;

    let condition = wmo_code_to_condition(weather_code);
    let icon = condition_to_icon(&condition);
    let wind_dir = degree_to_direction(wind_direction);
    let wind_level = kmph_to_level(wind_speed.round() as i32);
    let wind = format!("{} {}级", wind_dir, wind_level);

    // AQI 估算（Open-Meteo 免费版不提供 AQI，根据天气状况粗略估算）
    let aqi = estimate_aqi_from_weather(weather_code);

    // 解析 3 天预报
    let daily = json.get("daily").ok_or("无法解析 daily 数据")?;
    let daily_codes = daily
        .get("weather_code")
        .and_then(|v| v.as_array())
        .ok_or("无法解析 daily weather_code")?;
    let daily_max = daily
        .get("temperature_2m_max")
        .and_then(|v| v.as_array())
        .ok_or("无法解析 daily temperature_2m_max")?;
    let daily_min = daily
        .get("temperature_2m_min")
        .and_then(|v| v.as_array())
        .ok_or("无法解析 daily temperature_2m_min")?;

    let mut forecast = Vec::new();

    // 动态生成日期标签（今天/明天/后天 + 星期几）
    let today = chrono::Utc::now() + chrono::Duration::hours(8); // 北京时间
    let weekday_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

    for i in 0..7.min(daily_codes.len()) {
        let code = daily_codes.get(i).and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let t_max = daily_max
            .get(i)
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0)
            .round() as i32;
        let t_min = daily_min
            .get(i)
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0)
            .round() as i32;
        let day_condition = wmo_code_to_condition(code);
        let day_icon = condition_to_icon(&day_condition);

        let label = if i == 0 {
            "今天".to_string()
        } else if i == 1 {
            "明天".to_string()
        } else if i == 2 {
            "后天".to_string()
        } else {
            // 计算星期几
            let future_day = today + chrono::Duration::days(i as i64);
            let weekday_idx = future_day
                .format("%u")
                .to_string()
                .parse::<usize>()
                .unwrap_or(1)
                - 1;
            weekday_names.get(weekday_idx).unwrap_or(&"").to_string()
        };

        forecast.push(ForecastDay {
            day: label,
            temp_high: t_max,
            temp_low: t_min,
            condition: day_condition,
            icon: day_icon,
        });
    }

    // 解析逐时预报（取当前时间起未来 24 小时）
    let hourly = json.get("hourly").ok_or("无法解析 hourly 数据")?;
    let hourly_temps = hourly
        .get("temperature_2m")
        .and_then(|v| v.as_array())
        .ok_or("无法解析 hourly temperature_2m")?;
    let hourly_codes = hourly
        .get("weather_code")
        .and_then(|v| v.as_array())
        .ok_or("无法解析 hourly weather_code")?;
    let hourly_times = hourly
        .get("time")
        .and_then(|v| v.as_array())
        .ok_or("无法解析 hourly time")?;

    // 获取当前北京时间的小时数，找到对应的起始索引
    let now_hour = {
        let now = chrono::Utc::now() + chrono::Duration::hours(8); // UTC+8 北京时间
        now.format("%H").to_string().parse::<usize>().unwrap_or(12)
    };

    let mut hourly_items = Vec::new();
    for i in 0..24 {
        let idx = now_hour + i;
        if idx >= hourly_temps.len() {
            break;
        }
        let h_temp = hourly_temps
            .get(idx)
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0)
            .round() as i32;
        let h_code = hourly_codes.get(idx).and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let h_condition = wmo_code_to_condition(h_code);
        let h_icon = condition_to_icon(&h_condition);

        // 从 time 字段提取小时（格式: "2026-05-17T14:00"）
        let time_label = if i == 0 {
            "现在".to_string()
        } else {
            hourly_times
                .get(idx)
                .and_then(|v| v.as_str())
                .map(|s| {
                    // 提取 "HH:00" 部分
                    if let Some(t_part) = s.split('T').nth(1) {
                        t_part[..5].to_string()
                    } else {
                        format!("{}:00", (now_hour + i) % 24)
                    }
                })
                .unwrap_or_else(|| format!("{:02}:00", (now_hour + i) % 24))
        };

        hourly_items.push(HourlyItem {
            time: time_label,
            temp: h_temp,
            condition: h_condition,
            icon: h_icon,
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
        hourly: hourly_items,
    })
}

// ─── 辅助函数 ───────────────────────────────────────────────

/// WMO 天气代码 → 中文天气描述
/// 参考: https://open-meteo.com/en/docs#weathervariables
fn wmo_code_to_condition(code: i32) -> String {
    match code {
        0 => "晴".to_string(),
        1 => "晴".to_string(),
        2 => "多云".to_string(),
        3 => "阴".to_string(),
        45 | 48 => "雾".to_string(),
        51 | 53 | 55 => "毛毛雨".to_string(),
        56 | 57 => "冻雨".to_string(),
        61 => "小雨".to_string(),
        63 => "中雨".to_string(),
        65 => "大雨".to_string(),
        66 | 67 => "冻雨".to_string(),
        71 => "小雪".to_string(),
        73 => "中雪".to_string(),
        75 => "大雪".to_string(),
        77 => "雪粒".to_string(),
        80 => "小阵雨".to_string(),
        81 => "中阵雨".to_string(),
        82 => "大阵雨".to_string(),
        85 | 86 => "阵雪".to_string(),
        95 => "雷阵雨".to_string(),
        96 | 99 => "雷暴冰雹".to_string(),
        _ => "未知".to_string(),
    }
}

/// 中文天气状况 → Font Awesome 图标 class
fn condition_to_icon(condition: &str) -> String {
    match condition {
        "晴" => "fa-sun".to_string(),
        "多云" => "fa-cloud-sun".to_string(),
        "阴" => "fa-cloud".to_string(),
        "雾" => "fa-smog".to_string(),
        "毛毛雨" | "小雨" | "小阵雨" => "fa-cloud-rain".to_string(),
        "中雨" | "中阵雨" => "fa-cloud-rain".to_string(),
        "大雨" | "大阵雨" | "雷阵雨" | "雷暴冰雹" => {
            "fa-cloud-showers-heavy".to_string()
        }
        "冻雨" => "fa-cloud-rain".to_string(),
        "小雪" | "中雪" | "大雪" | "雪粒" | "阵雪" => "fa-snowflake".to_string(),
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

/// 根据天气代码估算 AQI（Open-Meteo 免费版不提供 AQI）
fn estimate_aqi_from_weather(code: i32) -> i32 {
    match code {
        0 | 1 => 35,    // 晴天通常空气较好
        2 | 3 => 55,    // 多云/阴天
        45 | 48 => 120, // 雾天 AQI 通常较高
        51..=67 => 45,  // 雨天空气较好
        71..=77 => 40,  // 雪天
        80..=82 => 40,  // 阵雨
        95..=99 => 50,  // 雷暴
        _ => 60,
    }
}
