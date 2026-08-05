//! 学习通班级资料鉴权下载：单连接/多分片/断点续传（.part）。

use serde_json::Value;

use crate::http_client::HbutClient;

use super::parse::{err_box, normalize_url, now_ms, DynError};

fn sanitize_download_filename(name: &str) -> String {
    let s: String = name
        .trim()
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let s = s.trim().trim_matches('.');
    if s.is_empty() {
        "download.bin".into()
    } else if s.len() > 180 {
        format!("{}…", &s[..160])
    } else {
        s.to_string()
    }
}

fn filename_from_content_disposition(header: &str) -> Option<String> {
    let h = header.trim();
    if h.is_empty() {
        return None;
    }
    // filename*=UTF-8''encoded
    if let Some(idx) = h.to_ascii_lowercase().find("filename*") {
        let rest = &h[idx + "filename*".len()..];
        let rest = rest.trim_start_matches('=').trim();
        let encoded = rest
            .trim_matches('"')
            .split("''")
            .nth(1)
            .unwrap_or(rest)
            .trim_matches('"');
        if let Ok(decoded) = urlencoding::decode(encoded) {
            let name = sanitize_download_filename(&decoded);
            if !name.is_empty() && name != "download.bin" {
                return Some(name);
            }
        }
    }
    // filename="..."
    if let Some(idx) = h.to_ascii_lowercase().find("filename") {
        let rest = &h[idx + "filename".len()..];
        let rest = rest.trim_start_matches('*').trim_start_matches('=').trim();
        let name = rest.trim_matches('"').trim_matches('\'');
        let name = sanitize_download_filename(name);
        if !name.is_empty() && name != "download.bin" {
            return Some(name);
        }
    }
    None
}

const CX_DOWNLOAD_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CX_MAX_BYTES: usize = 200 * 1024 * 1024;
const CX_RETRY: u32 = 3;
const CX_MULTI_PART_MIN: u64 = 4 * 1024 * 1024; // ≥4MB 才多分片
const CX_MULTI_PARTS: u64 = 4;

async fn ensure_sso_for_download(client: &mut HbutClient) {
    let _ = crate::modules::chaoxing_sso::ensure_chaoxing_sso(
        client,
        None,
        crate::modules::chaoxing_sso::EnsureSsoOptions {
            force: false,
            allow_silent_relogin: true,
            preheated: false,
            portal_password: None,
        },
    )
    .await;
}

async fn collect_download_urls(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    data_id: &str,
    cpi: &str,
    oid: &str,
) -> Vec<String> {
    let mut try_urls: Vec<String> = Vec::new();
    if !oid.is_empty() {
        let status_url = format!(
            "https://mooc1.chaoxing.com/ananas/status/{}?k=&flag=normal&_={}",
            urlencoding::encode(oid),
            now_ms()
        );
        if let Ok(resp) = client
            .client
            .get(&status_url)
            .header(
                "Referer",
                "https://mooc1.chaoxing.com/ananas/modules/video/index.html",
            )
            .send()
            .await
        {
            if let Ok(text) = resp.text().await {
                if let Ok(v) = serde_json::from_str::<Value>(&text) {
                    for key in ["https", "http", "download", "pdf"] {
                        if let Some(u) = v.get(key).and_then(|x| x.as_str()) {
                            let n = normalize_url(u);
                            if !n.is_empty() && !try_urls.iter().any(|x| x == &n) {
                                try_urls.push(n);
                            }
                        }
                    }
                }
            }
        }
    }
    try_urls.push(format!(
        "https://mooc1.chaoxing.com/coursedata/downloadData?dataId={}&classId={}&cpi={}&courseId={}&ut=s",
        urlencoding::encode(data_id.trim()),
        urlencoding::encode(clazz_id.trim()),
        urlencoding::encode(cpi),
        urlencoding::encode(course_id.trim())
    ));
    try_urls
}

/// HEAD/GET 探测：Content-Length 与是否支持 Range
async fn probe_download_meta(
    client: &HbutClient,
    url: &str,
) -> (Option<u64>, bool, Option<String>, Option<String>) {
    let mut len = None;
    let mut ranges = false;
    let mut cd = None;
    let mut ctype = None;
    // 优先 HEAD
    if let Ok(resp) = client
        .client
        .head(url)
        .header("Referer", "https://mooc2-ans.chaoxing.com/")
        .header("User-Agent", CX_DOWNLOAD_UA)
        .send()
        .await
    {
        if resp.status().is_success() {
            len = resp
                .headers()
                .get(reqwest::header::CONTENT_LENGTH)
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse().ok());
            ranges = resp
                .headers()
                .get(reqwest::header::ACCEPT_RANGES)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_ascii_lowercase().contains("bytes"))
                .unwrap_or(false);
            cd = resp
                .headers()
                .get(reqwest::header::CONTENT_DISPOSITION)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
            ctype = resp
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
        }
    }
    (len, ranges, cd, ctype)
}

/// 多分片并行（需 Accept-Ranges + Content-Length）
async fn download_multipart(client: &HbutClient, url: &str, total: u64) -> Result<Vec<u8>, String> {
    if total == 0 || total > CX_MAX_BYTES as u64 {
        return Err("invalid total".into());
    }
    let n = CX_MULTI_PARTS.min(total).max(1);
    let chunk = (total + n - 1) / n;
    let mut handles = Vec::new();
    for i in 0..n {
        let start = i * chunk;
        if start >= total {
            break;
        }
        let end = (start + chunk - 1).min(total - 1);
        let http = client.client.clone();
        let url = url.to_string();
        handles.push(tokio::spawn(async move {
            // 分片内再重试 2 次
            let mut last = String::new();
            for attempt in 0..3u32 {
                let resp = http
                    .get(&url)
                    .header("Referer", "https://mooc2-ans.chaoxing.com/")
                    .header("User-Agent", CX_DOWNLOAD_UA)
                    .header("Range", format!("bytes={}-{}", start, end))
                    .send()
                    .await;
                match resp {
                    Ok(r) => {
                        let st = r.status().as_u16();
                        if st == 206 || r.status().is_success() {
                            match r.bytes().await {
                                Ok(b) => return Ok::<(u64, Vec<u8>), String>((i, b.to_vec())),
                                Err(e) => last = e.to_string(),
                            }
                        } else {
                            last = format!("HTTP {}", st);
                        }
                    }
                    Err(e) => last = e.to_string(),
                }
                if attempt < 2 {
                    tokio::time::sleep(std::time::Duration::from_millis(
                        300 * (attempt as u64 + 1),
                    ))
                    .await;
                }
            }
            Err(format!("part {} failed: {}", i, last))
        }));
    }
    let mut parts: Vec<(u64, Vec<u8>)> = Vec::new();
    for h in handles {
        match h.await {
            Ok(Ok(part)) => parts.push(part),
            Ok(Err(e)) => return Err(e),
            Err(e) => return Err(e.to_string()),
        }
    }
    parts.sort_by_key(|(i, _)| *i);
    let mut out = Vec::with_capacity(total as usize);
    for (_, b) in parts {
        out.extend_from_slice(&b);
    }
    if out.len() as u64 != total {
        return Err(format!(
            "multipart size mismatch: got {} expect {}",
            out.len(),
            total
        ));
    }
    Ok(out)
}

/// 整文件下载；若 part_path 有未完成字节且服务端支持 Range，则续传并边下边写 .part
async fn download_single_or_resume(
    client: &HbutClient,
    url: &str,
    part_path: Option<&std::path::Path>,
) -> Result<(Vec<u8>, String, String, String), String> {
    use futures::StreamExt;
    use std::io::Write;

    let existing = part_path
        .and_then(|p| std::fs::metadata(p).ok())
        .map(|m| m.len())
        .unwrap_or(0);

    let mut req = client
        .client
        .get(url)
        .header("Referer", "https://mooc2-ans.chaoxing.com/")
        .header("User-Agent", CX_DOWNLOAD_UA);
    if existing > 0 {
        req = req.header("Range", format!("bytes={}-", existing));
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let final_url = resp.url().to_string();
    let code = status.as_u16();
    if code == 403 {
        return Err("403 Forbidden：会话可能失效，请重新进入学习通后再试".into());
    }
    if code == 416 {
        return Err("range_not_satisfiable".into());
    }
    if code != 206 && !status.is_success() {
        return Err(format!("HTTP {} ({})", code, final_url));
    }
    let ctype = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let cd = resp
        .headers()
        .get(reqwest::header::CONTENT_DISPOSITION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    // 边下边写 part，便于中断后 Range 续传
    let mut file = if let Some(p) = part_path {
        if existing > 0 && code == 206 {
            std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(p)
                .map_err(|e| e.to_string())?
        } else {
            // 200 整包或新任务：覆盖写
            std::fs::OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(p)
                .map_err(|e| e.to_string())?
        }
    } else {
        // 无 part：仅内存
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        return Ok((bytes.to_vec(), final_url, cd, ctype));
    };

    let mut stream = resp.bytes_stream();
    let mut written: u64 = if existing > 0 && code == 206 {
        existing
    } else {
        0
    };
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        written = written.saturating_add(chunk.len() as u64);
        if written > CX_MAX_BYTES as u64 {
            return Err(format!(
                "文件过大（{} MB），暂不支持",
                written / 1024 / 1024
            ));
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    drop(file);

    let bytes = std::fs::read(part_path.unwrap()).map_err(|e| e.to_string())?;
    Ok((bytes, final_url, cd, ctype))
}

fn validate_download_payload(bytes: &[u8], ctype: &str) -> Result<(), String> {
    if bytes.len() < 16 {
        return Err("下载内容过小".into());
    }
    if bytes.len() > CX_MAX_BYTES {
        return Err(format!(
            "文件过大（{} MB），暂不支持",
            bytes.len() / 1024 / 1024
        ));
    }
    let ct = ctype.to_ascii_lowercase();
    if ct.contains("text/html") {
        let head = String::from_utf8_lossy(&bytes[..bytes.len().min(400)]).to_ascii_lowercase();
        if head.contains("login") || head.contains("passport") || head.contains("403") {
            return Err("下载被重定向到登录页，请重新接入学习通会话".into());
        }
    }
    Ok(())
}

/// 用学习通会话鉴权下载课件（#358/#359）：
/// - 失败最多重试 3 次（含 SSO 续期）
/// - 支持 Range 断点续传（.part）
/// - 大文件且服务端支持 Range 时多分片并行
pub async fn download_resource_bytes(
    client: &mut HbutClient,
    course_id: &str,
    clazz_id: &str,
    data_id: &str,
    object_id: Option<&str>,
    cpi: Option<&str>,
    file_name: Option<&str>,
) -> Result<(Vec<u8>, String, String), DynError> {
    download_resource_bytes_with_part(
        client, course_id, clazz_id, data_id, object_id, cpi, file_name, None,
    )
    .await
}

/// `part_path`：可选的本地未完成文件路径，用于断点续传
pub async fn download_resource_bytes_with_part(
    client: &mut HbutClient,
    course_id: &str,
    clazz_id: &str,
    data_id: &str,
    object_id: Option<&str>,
    cpi: Option<&str>,
    file_name: Option<&str>,
    part_path: Option<&std::path::Path>,
) -> Result<(Vec<u8>, String, String), DynError> {
    let cpi = cpi.unwrap_or("0").trim().to_string();
    let preferred_name = sanitize_download_filename(file_name.unwrap_or(""));
    let oid = object_id.map(str::trim).unwrap_or("").to_string();
    let mut last_err = String::from("下载失败");

    for attempt in 0..CX_RETRY {
        if attempt > 0 {
            // 重试前强制静默 SSO，处理 403/登录页
            ensure_sso_for_download(client).await;
            let backoff_ms = 400 * (1u64 << (attempt.min(3) - 1));
            tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
            println!(
                "[chaoxing] 下载重试 attempt={}/{} backoff={}ms",
                attempt + 1,
                CX_RETRY,
                backoff_ms
            );
        } else {
            ensure_sso_for_download(client).await;
        }

        let try_urls =
            collect_download_urls(client, course_id, clazz_id, data_id, &cpi, &oid).await;

        for url in try_urls {
            // 探测元数据：大文件多分片
            let (content_len, accept_ranges, probe_cd, _) = probe_download_meta(client, &url).await;

            let result = if accept_ranges
                && content_len.unwrap_or(0) >= CX_MULTI_PART_MIN
                && part_path
                    .map(|p| !p.exists() || std::fs::metadata(p).map(|m| m.len()).unwrap_or(0) == 0)
                    .unwrap_or(true)
            {
                // 多分片（无本地 part 时）
                match download_multipart(client, &url, content_len.unwrap()).await {
                    Ok(bytes) => Ok((
                        bytes,
                        url.clone(),
                        probe_cd.clone().unwrap_or_default(),
                        String::new(),
                    )),
                    Err(e) => {
                        println!("[chaoxing] multipart 失败，降级单连接: {}", e);
                        download_single_or_resume(client, &url, part_path).await
                    }
                }
            } else {
                download_single_or_resume(client, &url, part_path).await
            };

            match result {
                Ok((bytes, final_url, cd, ctype)) => {
                    if let Err(e) = validate_download_payload(&bytes, &ctype) {
                        last_err = e;
                        // 416/脏 part：清 part 再试
                        if last_err == "range_not_satisfiable" {
                            if let Some(p) = part_path {
                                let _ = std::fs::remove_file(p);
                            }
                        }
                        continue;
                    }
                    let mut name = filename_from_content_disposition(&cd).unwrap_or_default();
                    if name.is_empty() || name == "download.bin" {
                        name = if preferred_name != "download.bin" {
                            preferred_name.clone()
                        } else {
                            format!("chaoxing_{}.bin", data_id.trim())
                        };
                    }
                    name = sanitize_download_filename(&name);
                    println!(
                        "[chaoxing] 鉴权下载成功 bytes={} name={} url={} attempt={}",
                        bytes.len(),
                        name,
                        final_url,
                        attempt + 1
                    );
                    return Ok((bytes, name, final_url));
                }
                Err(e) => {
                    last_err = e;
                    if last_err == "range_not_satisfiable" {
                        if let Some(p) = part_path {
                            let _ = std::fs::remove_file(p);
                        }
                    }
                    continue;
                }
            }
        }
    }

    Err(err_box(format!("{}（已重试 {} 次）", last_err, CX_RETRY)))
}
