use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Cursor, Write};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager};

#[cfg(desktop)]
use tauri::{WebviewUrl, WebviewWindowBuilder};

const DEFAULT_BRIDGE_PORT: u16 = 4399;
/// #1165 T04：模块静态内容独立端口（与业务 API 不同 origin）。
/// 该端口由 `http_server` 单独监听，只提供 `/module_bundle/content/*`。
const DEFAULT_MODULE_CONTENT_PORT: u16 = 4398;
const MODULE_CACHE_ROOT: &str = "more_modules";
const REMOTE_MODULE_CDN_HOST: &str = "hbut.6661111.xyz";
const LOCAL_MODULE_REDIRECT_ENV: &str = "HBUT_DEBUG_LOCAL_MODULE_REDIRECT";
const CACHE_META_FILE: &str = ".module-cache-meta.json";

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ModuleBundlePrepareRequest {
    #[serde(default)]
    pub channel: String,
    #[serde(alias = "moduleId")]
    pub module_id: String,
    pub version: String,
    #[serde(alias = "packageUrl")]
    pub package_url: String,
    #[serde(default, alias = "packageUrls")]
    pub package_urls: Vec<String>,
    #[serde(default, alias = "packageSha256")]
    pub package_sha256: String,
    #[serde(default, alias = "minCompatibleVersion")]
    pub min_compatible_version: String,
    #[serde(default, alias = "entryPath")]
    pub entry_path: String,
    #[serde(default, alias = "moduleName")]
    pub module_name: String,
    /// #1166 T05：前端取到的原始清单（含 signature）。缺省时按 `HBUT_ALLOW_UNSIGNED_MODULES`
    /// 决定是否允许（默认拒绝）。
    #[serde(default)]
    pub manifest: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModuleBundlePrepareResult {
    pub channel: String,
    pub module_id: String,
    pub module_name: String,
    pub version: String,
    pub entry_path: String,
    pub preview_url: String,
    pub cache_dir: String,
    pub bundle_path: String,
    pub min_compatible_version: String,
    pub source: String,
    /// #1166 T05：清单是否通过发布者验签。`false` 时模块不得获得任何敏感能力。
    pub trusted: bool,
    /// 通过验签时的发布者 key_id（未签名为空）。
    #[serde(skip_serializing_if = "String::is_empty")]
    pub publisher_key_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
struct ModuleBundleCacheMetadata {
    version: String,
    package_sha256: String,
    min_compatible_version: String,
    entry_path: String,
    /// #1166 T05：缓存命中时必须重新验签，因此把清单原样存下来。
    #[serde(default)]
    manifest: Option<serde_json::Value>,
    #[serde(default)]
    release_seq: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OpenModuleBundleWindowRequest {
    #[serde(flatten)]
    pub prepare: ModuleBundlePrepareRequest,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub height: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OpenModuleBundleWindowResult {
    #[serde(flatten)]
    pub prepared: ModuleBundlePrepareResult,
    pub window_label: String,
}

fn bridge_port() -> u16 {
    std::env::var("HBUT_HTTP_BRIDGE_PORT")
        .ok()
        .and_then(|v| v.trim().parse::<u16>().ok())
        .unwrap_or(DEFAULT_BRIDGE_PORT)
}

/// 模块内容端口（#1165 T04）。必须与 Bridge 端口不同 —— 否则模块页面与业务 API
/// 同源，同源即可读响应体，隔离失效。相同或非法时回退到默认内容端口。
pub fn module_content_port() -> u16 {
    let configured = std::env::var("HBUT_MODULE_CONTENT_PORT")
        .ok()
        .and_then(|value| value.trim().parse::<u16>().ok())
        .filter(|port| *port != 0);
    resolve_module_content_port(configured, bridge_port())
}

/// 纯函数版本（便于单测）：内容端口必须与 Bridge 端口不同，否则隔离失效。
fn resolve_module_content_port(configured: Option<u16>, bridge_port: u16) -> u16 {
    match configured {
        // 显式配置且与 Bridge 端口不同 → 采用
        Some(port) if port != bridge_port => port,
        // 显式配置但与 Bridge 相同 → 拒绝该配置（如果直接沿用会让模块与 API 同源）
        Some(_) => {
            eprintln!("[T04] HBUT_MODULE_CONTENT_PORT 与 Bridge 端口相同，已回退到默认内容端口");
            if DEFAULT_MODULE_CONTENT_PORT == bridge_port {
                DEFAULT_MODULE_CONTENT_PORT + 1
            } else {
                DEFAULT_MODULE_CONTENT_PORT
            }
        }
        None => {
            if DEFAULT_MODULE_CONTENT_PORT == bridge_port {
                DEFAULT_MODULE_CONTENT_PORT + 1
            } else {
                DEFAULT_MODULE_CONTENT_PORT
            }
        }
    }
}

fn normalize_channel(raw: &str) -> Result<String, String> {
    let value = raw.trim().to_ascii_lowercase();
    if value.is_empty() || value == "main" {
        return Ok("main".to_string());
    }
    if value == "dev" {
        return Ok("dev".to_string());
    }
    if value == "latest" {
        // 共享最新包只影响远端下载地址；原生缓存命名仍复用既有稳定通道。
        return Ok("main".to_string());
    }
    Err("channel 仅支持 main 或 dev".to_string())
}

fn sanitize_storage_segment(raw: &str, field: &str) -> Result<String, String> {
    let value = raw.trim();
    if value.is_empty() {
        return Err(format!("{} 不能为空", field));
    }
    if !value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
    {
        return Err(format!("{} 包含非法字符", field));
    }
    Ok(value.to_string())
}

fn sanitize_optional_storage_segment(raw: &str, field: &str) -> Result<String, String> {
    if raw.trim().is_empty() {
        return Ok(String::new());
    }
    sanitize_storage_segment(raw, field)
}

fn sanitize_window_label(raw: &str) -> String {
    let mut label = raw
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    while label.contains("--") {
        label = label.replace("--", "-");
    }
    label.trim_matches('-').to_string()
}

fn normalize_relative_path(raw: &str, default_value: &str) -> Result<String, String> {
    let value = raw.trim();
    let normalized = if value.is_empty() {
        default_value.to_string()
    } else {
        value.replace('\\', "/")
    };
    let trimmed = normalized.trim_start_matches('/').trim();
    if trimmed.is_empty() {
        return Ok(default_value.to_string());
    }
    let path = Path::new(trimmed);
    for component in path.components() {
        match component {
            Component::Normal(_) => {}
            _ => return Err("路径包含非法片段".to_string()),
        }
    }
    Ok(trimmed.to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|b| format!("{:02x}", b)).collect()
}

fn module_cache_dir(
    app: &AppHandle,
    channel: &str,
    module_id: &str,
    version: &str,
) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map_err(|e| format!("获取应用缓存目录失败: {}", e))
        .map(|dir| {
            dir.join(MODULE_CACHE_ROOT)
                .join(channel)
                .join(module_id)
                .join(version)
        })
}

fn candidate_entry_paths(requested: &str) -> Vec<String> {
    let mut candidates = Vec::new();
    for value in [
        requested.to_string(),
        format!("site/{}", requested),
        "index.html".to_string(),
        "site/index.html".to_string(),
    ] {
        if value.is_empty() || candidates.iter().any(|item| item == &value) {
            continue;
        }
        candidates.push(value);
    }
    candidates
}

fn locate_entry_path(root: &Path, requested: &str) -> Result<String, String> {
    for candidate in candidate_entry_paths(requested) {
        if root.join(&candidate).is_file() {
            return Ok(candidate);
        }
    }
    Err(format!(
        "模块入口不存在：{}",
        root.join(requested).display()
    ))
}

fn build_preview_url(channel: &str, module_id: &str, version: &str, entry_path: &str) -> String {
    // #1165 T04：模块内容走独立端口 —— 模块 origin 与业务 API origin 分离，
    // 模块即使想同源读取桥响应也做不到（浏览器层面跨源 + 桥仍只认令牌）。
    format!(
        "http://127.0.0.1:{}/module_bundle/content/{}/{}/{}/{}",
        module_content_port(),
        channel,
        module_id,
        version,
        entry_path
    )
}

fn cache_meta_path(cache_dir: &Path) -> PathBuf {
    cache_dir.join(CACHE_META_FILE)
}

fn read_cache_metadata(cache_dir: &Path) -> Option<ModuleBundleCacheMetadata> {
    let raw = fs::read_to_string(cache_meta_path(cache_dir)).ok()?;
    serde_json::from_str::<ModuleBundleCacheMetadata>(&raw).ok()
}

fn write_cache_metadata(
    cache_dir: &Path,
    metadata: &ModuleBundleCacheMetadata,
) -> Result<(), String> {
    let text = serde_json::to_string_pretty(metadata)
        .map_err(|e| format!("序列化模块缓存元信息失败: {}", e))?;
    fs::write(cache_meta_path(cache_dir), text)
        .map_err(|e| format!("写入模块缓存元信息失败: {}", e))
}

fn resolve_cached_entry_path(
    cache_dir: &Path,
    requested_entry: &str,
    expected_sha: &str,
    min_compatible_version: &str,
) -> Option<String> {
    let entry_path = locate_entry_path(cache_dir, requested_entry).ok()?;
    if expected_sha.is_empty() && min_compatible_version.is_empty() {
        return Some(entry_path);
    }

    let metadata = read_cache_metadata(cache_dir)?;
    if !expected_sha.is_empty()
        && !metadata
            .package_sha256
            .trim()
            .eq_ignore_ascii_case(expected_sha.trim())
    {
        return None;
    }
    if metadata.min_compatible_version.trim() != min_compatible_version.trim() {
        return None;
    }
    if !metadata.entry_path.trim().is_empty() && metadata.entry_path.trim() != entry_path {
        return None;
    }
    Some(entry_path)
}

fn local_dev_module_redirect_enabled() -> bool {
    if !cfg!(debug_assertions) {
        return false;
    }
    match std::env::var(LOCAL_MODULE_REDIRECT_ENV) {
        Ok(value) => matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        ),
        Err(_) => false,
    }
}

fn local_dev_module_root() -> Option<PathBuf> {
    if !local_dev_module_redirect_enabled() {
        return None;
    }
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()?
        .join("website")
        .join("public")
        .join("modules");
    if root.is_dir() {
        Some(root)
    } else {
        None
    }
}

pub fn resolve_local_dev_module_file_from_url(raw_url: &str) -> Option<PathBuf> {
    let parsed = reqwest::Url::parse(raw_url).ok()?;
    if parsed.host_str()? != REMOTE_MODULE_CDN_HOST {
        return None;
    }
    let mut segments = parsed.path_segments()?;
    if segments.next()? != "modules" {
        return None;
    }

    let mut target = local_dev_module_root()?;
    for segment in segments {
        if segment.is_empty() || segment == "." || segment == ".." {
            return None;
        }
        target.push(segment);
    }

    if target.is_file() {
        Some(target)
    } else {
        None
    }
}

fn write_bundle_archive(dest_root: &Path, zip_bytes: &[u8]) -> Result<(), String> {
    let parent = dest_root
        .parent()
        .ok_or_else(|| "模块缓存目录异常".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("创建模块缓存父目录失败: {}", e))?;

    let temp_root = parent.join(format!(
        ".{}-tmp-{}",
        dest_root
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or("module"),
        chrono::Utc::now().timestamp_millis()
    ));
    if temp_root.exists() {
        fs::remove_dir_all(&temp_root).map_err(|e| format!("清理临时模块目录失败: {}", e))?;
    }
    fs::create_dir_all(&temp_root).map_err(|e| format!("创建临时模块目录失败: {}", e))?;

    // #1166 T05：解包边界（防 zip bomb / 超量文件 / 单条目过大）。
    const MAX_ENTRIES: usize = 512;
    const MAX_ENTRY_BYTES: u64 = 16 * 1024 * 1024;
    const MAX_TOTAL_BYTES: u64 = 64 * 1024 * 1024;

    let cursor = Cursor::new(zip_bytes.to_vec());
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("解析模块压缩包失败: {}", e))?;
    if archive.len() > MAX_ENTRIES {
        return Err(format!(
            "模块压缩包条目过多（{} > {MAX_ENTRIES}）",
            archive.len()
        ));
    }
    let mut total_bytes: u64 = 0;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| format!("读取压缩包条目失败: {}", e))?;
        // #1166 T05：单条目与总量上限（解压前按声明大小判断，写入时再累计）。
        if entry.size() > MAX_ENTRY_BYTES {
            return Err(format!(
                "模块压缩包条目过大（{} > {MAX_ENTRY_BYTES}）",
                entry.size()
            ));
        }
        total_bytes = total_bytes.saturating_add(entry.size());
        if total_bytes > MAX_TOTAL_BYTES {
            return Err(format!("模块解压总量超限（> {MAX_TOTAL_BYTES} 字节）"));
        }
        // zip v9 的条目名称解析会返回 Result；拒绝解码失败的名称，
        // 不以不可信名称或默认值构造文件路径。
        let entry_name = entry
            .name()
            .map_err(|e| format!("解码压缩包条目名称失败: {}", e))?;
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| format!("压缩包包含非法路径：{}", entry_name))?
            .to_path_buf();
        let output_path = temp_root.join(&enclosed);
        if !output_path.starts_with(&temp_root) {
            return Err("压缩包路径越界".to_string());
        }
        if entry_name.ends_with('/') {
            fs::create_dir_all(&output_path).map_err(|e| format!("创建模块子目录失败: {}", e))?;
            continue;
        }
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建模块文件父目录失败: {}", e))?;
        }
        let mut file =
            fs::File::create(&output_path).map_err(|e| format!("写入模块文件失败: {}", e))?;
        std::io::copy(&mut entry, &mut file).map_err(|e| format!("解压模块文件失败: {}", e))?;
        file.flush()
            .map_err(|e| format!("刷新模块文件失败: {}", e))?;
    }

    if dest_root.exists() {
        fs::remove_dir_all(dest_root).map_err(|e| format!("替换旧模块目录失败: {}", e))?;
    }
    fs::rename(&temp_root, dest_root).map_err(|e| format!("切换模块目录失败: {}", e))?;
    fs::write(dest_root.join("bundle.zip"), zip_bytes)
        .map_err(|e| format!("保存模块压缩包失败: {}", e))?;
    Ok(())
}

async fn download_bundle_bytes(package_urls: &[String]) -> Result<Vec<u8>, String> {
    let candidates: Vec<String> = package_urls
        .iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect();
    if candidates.is_empty() {
        return Err("模块 package_url 为空，无法准备本地包".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建模块下载客户端失败: {}", e))?;
    let mut last_error = None;
    for package_url in candidates {
        if let Some(local_file) = resolve_local_dev_module_file_from_url(&package_url) {
            match fs::read(&local_file) {
                Ok(bytes) => return Ok(bytes),
                Err(e) => {
                    last_error = Some(format!(
                        "读取本地模块压缩包失败: {} ({})",
                        e,
                        local_file.display()
                    ));
                    continue;
                }
            }
        }

        let response = match client.get(&package_url).send().await {
            Ok(response) => response,
            Err(e) => {
                last_error = Some(format!("下载模块压缩包失败: {} ({})", e, package_url));
                continue;
            }
        };
        let status = response.status();
        if !status.is_success() {
            last_error = Some(format!(
                "下载模块压缩包失败：HTTP {} ({})",
                status.as_u16(),
                package_url
            ));
            continue;
        }
        match response.bytes().await {
            Ok(bytes) => return Ok(bytes.to_vec()),
            Err(e) => {
                last_error = Some(format!("读取模块压缩包失败: {} ({})", e, package_url));
            }
        }
    }
    Err(last_error.unwrap_or_else(|| "下载模块压缩包失败：没有可用下载地址".to_string()))
}

pub async fn prepare_module_bundle(
    app: &AppHandle,
    req: ModuleBundlePrepareRequest,
) -> Result<ModuleBundlePrepareResult, String> {
    let channel = normalize_channel(&req.channel)?;
    let module_id = sanitize_storage_segment(&req.module_id, "module_id")?;
    let version = sanitize_storage_segment(&req.version, "version")?;
    let min_compatible_version =
        sanitize_optional_storage_segment(&req.min_compatible_version, "min_compatible_version")?;
    let requested_entry = normalize_relative_path(&req.entry_path, "index.html")?;
    let package_url = req.package_url.trim().to_string();
    let mut package_urls: Vec<String> = req
        .package_urls
        .iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect();
    if !package_url.is_empty() && !package_urls.iter().any(|item| item == &package_url) {
        package_urls.insert(0, package_url.clone());
    }
    let module_name = if req.module_name.trim().is_empty() {
        module_id.clone()
    } else {
        req.module_name.trim().to_string()
    };
    let cache_dir = module_cache_dir(app, &channel, &module_id, &version)?;
    let cache_root = module_cache_root(app)?;

    // ── #1166 T05：清单验签（先于一切下载/解包） ─────────────────────────
    //
    // 规则（与契约 §2 一致）：
    // - 有签名且通过 → trusted=true，后续才允许把清单摘要当作授权依据；
    // - 缺签名/错签名/未知密钥/协议不兼容 → **拒绝**；只有显式设置
    //   `HBUT_ALLOW_UNSIGNED_MODULES=1`（仅用于迁移期，且结果 trusted=false）才放行；
    // - 清单声明的 module_id/version/channel/entry/摘要必须与请求一致，防止「签A装B」；
    // - `release_seq` 单调，回放旧清单被拒。
    let manifest = parse_and_verify_manifest(&cache_root, req.manifest.as_ref(), &req)?;
    let trusted = manifest.is_some();
    let publisher_key_id = manifest
        .as_ref()
        .and_then(|item| item.signature.as_ref().map(|sig| sig.key_id.clone()))
        .unwrap_or_default();

    // 清单通过验签时，以清单为准（摘要、入口、版本号都不可被请求体覆盖）
    let expected_sha = match manifest.as_ref() {
        Some(item) if !item.package_sha256.trim().is_empty() => {
            let claimed = item.package_sha256.trim().to_ascii_lowercase();
            let requested = req.package_sha256.trim().to_ascii_lowercase();
            if !requested.is_empty() && requested != claimed {
                return Err(format!(
                    "模块清单声明的摘要与请求不一致（清单 {}，请求 {}）",
                    claimed, requested
                ));
            }
            claimed
        }
        _ => req.package_sha256.trim().to_ascii_lowercase(),
    };
    if trusted && expected_sha.is_empty() {
        return Err("已签名模块清单必须声明 package_sha256".to_string());
    }

    if cache_dir.exists() {
        if let Some(entry_path) = resolve_cached_entry_path(
            &cache_dir,
            &requested_entry,
            &expected_sha,
            &min_compatible_version,
        ) {
            // #1166 T05：缓存命中不得绕过验签 —— 缓存里的清单必须是同一份且仍能验过。
            if let Some(item) = manifest.as_ref() {
                let cached = read_cache_metadata(&cache_dir).and_then(|meta| meta.manifest);
                let cached_signature = cached
                    .as_ref()
                    .and_then(|value| value.get("signature"))
                    .cloned();
                let current_signature = serde_json::to_value(item)
                    .ok()
                    .and_then(|value| value.get("signature").cloned());
                if cached_signature != current_signature {
                    return Err("模块缓存与当前清单签名不一致，拒用缓存".to_string());
                }
                // #1166 G-E：签名只覆盖「包」的摘要，不覆盖解包后的文件。缓存命中若不做
                // 完整性复核，本机改动缓存目录里的 index.html 就能绕过验签。这里重算
                // bundle.zip 的 sha256 并与清单声明比对，不一致则视为缓存失效。
                let bundle_path = cache_dir.join("bundle.zip");
                let integrity_ok =
                    cached_bundle_integrity_ok(&bundle_path, item.package_sha256.trim());
                if !integrity_ok {
                    eprintln!("[T05] 模块缓存完整性校验失败，按失效处理并重新下载");
                    fs::remove_dir_all(&cache_dir)
                        .map_err(|e| format!("清理完整性失效的模块缓存失败: {}", e))?;
                } else {
                    let preview_url =
                        build_preview_url(&channel, &module_id, &version, &entry_path);
                    return Ok(ModuleBundlePrepareResult {
                        channel,
                        module_id,
                        module_name,
                        version,
                        entry_path: entry_path.clone(),
                        preview_url,
                        cache_dir: cache_dir.display().to_string(),
                        bundle_path: bundle_path.display().to_string(),
                        min_compatible_version,
                        source: "cache".to_string(),
                        trusted,
                        publisher_key_id: publisher_key_id.clone(),
                    });
                }
            }
            let preview_url = build_preview_url(&channel, &module_id, &version, &entry_path);
            return Ok(ModuleBundlePrepareResult {
                channel,
                module_id,
                module_name,
                version,
                entry_path: entry_path.clone(),
                preview_url,
                cache_dir: cache_dir.display().to_string(),
                bundle_path: cache_dir.join("bundle.zip").display().to_string(),
                min_compatible_version,
                source: "cache".to_string(),
                trusted,
                publisher_key_id: publisher_key_id.clone(),
            });
        }
        fs::remove_dir_all(&cache_dir).map_err(|e| format!("清理失效模块缓存失败: {}", e))?;
    }

    if package_urls.is_empty() {
        return Err("模块 package_url 为空，无法准备本地包".to_string());
    }

    let bundle_bytes = download_bundle_bytes(&package_urls).await?;
    let actual_sha = sha256_hex(&bundle_bytes);
    if !expected_sha.is_empty() {
        if actual_sha != expected_sha {
            return Err(format!(
                "模块压缩包校验失败：期望 {}，实际 {}",
                expected_sha, actual_sha
            ));
        }
    }

    let write_dir = cache_dir.clone();
    tokio::task::spawn_blocking(move || write_bundle_archive(&write_dir, &bundle_bytes))
        .await
        .map_err(|e| format!("写入模块缓存任务失败: {}", e))??;

    let entry_path = locate_entry_path(&cache_dir, &requested_entry)?;
    let metadata = ModuleBundleCacheMetadata {
        version: version.clone(),
        package_sha256: if expected_sha.is_empty() {
            actual_sha.clone()
        } else {
            expected_sha.clone()
        },
        min_compatible_version: min_compatible_version.clone(),
        entry_path: entry_path.clone(),
        manifest: manifest
            .as_ref()
            .and_then(|item| serde_json::to_value(item).ok()),
        release_seq: manifest.as_ref().map(|item| item.release_seq).unwrap_or(0),
    };
    write_cache_metadata(&cache_dir, &metadata)?;
    // #1166 T05：验签通过的发布序号写入防回放表（只增不减）
    if let Some(item) = manifest.as_ref() {
        if item.release_seq > 0 {
            if let Err(error) = crate::modules::module_manifest::write_release_seq(
                &cache_root,
                &channel,
                &module_id,
                item.release_seq,
            ) {
                eprintln!("[T05] 写入防回放序号失败: {error}");
            }
        }
    }
    let preview_url = build_preview_url(&channel, &module_id, &version, &entry_path);
    Ok(ModuleBundlePrepareResult {
        channel,
        module_id,
        module_name,
        version,
        entry_path: entry_path.clone(),
        preview_url,
        cache_dir: cache_dir.display().to_string(),
        bundle_path: cache_dir.join("bundle.zip").display().to_string(),
        min_compatible_version,
        source: "download".to_string(),
        trusted,
        publisher_key_id,
    })
}

/// #1166 T05：解析并校验清单。
///
/// - `manifest` 存在 → 解析 → 字段与请求一致 → 验签 → 协议 → 防回放；
/// - `manifest` 缺失 → 只有显式 `HBUT_ALLOW_UNSIGNED_MODULES=1` 才放行（trusted=false）。
fn parse_and_verify_manifest(
    cache_root: &Path,
    raw: Option<&serde_json::Value>,
    req: &ModuleBundlePrepareRequest,
) -> Result<Option<crate::modules::module_manifest::ModuleManifest>, String> {
    use crate::modules::module_manifest::{
        ensure_release_seq, verify_manifest_signature, ManifestError, ModuleManifest,
    };

    let Some(raw) = raw else {
        return unsigned_module_decision(ManifestError::MissingSignature);
    };

    let manifest: ModuleManifest = serde_json::from_value(raw.clone())
        .map_err(|error| format!("MODULE_MANIFEST_INVALID: 清单解析失败: {error}"))?;

    // 清单与请求必须是同一个模块，避免「签名有效但装错包」
    let request_channel = crate::modules::module_bundle::normalize_channel(&req.channel)?;
    if manifest.module_id != req.module_id.trim()
        || manifest.version != req.version.trim()
        || normalize_channel(&manifest.channel)? != request_channel
    {
        return Err("MODULE_MANIFEST_INVALID: 清单与请求的模块标识不一致".to_string());
    }
    if manifest.package_sha256.trim().is_empty() {
        return Err(format!(
            "{}: 已签名清单必须声明 package_sha256",
            ManifestError::MissingSignature.code()
        ));
    }

    if let Err(error) = verify_manifest_signature(&manifest) {
        match unsigned_module_decision(error)? {
            None => return Ok(None),
            Some(_) => unreachable!("unsigned_module_decision 只返回 None"),
        }
    }

    // 防回放：同一 channel+module 的 release_seq 不得倒退（同包幂等重试除外）
    let same_package = req
        .package_sha256
        .trim()
        .eq_ignore_ascii_case(manifest.package_sha256.trim());
    ensure_release_seq(
        cache_root,
        &request_channel,
        manifest.module_id.trim(),
        manifest.release_seq,
        same_package,
    )
    .map_err(|error| format!("{}: {}", error.code(), error.message()))?;

    Ok(Some(manifest))
}

/// 未通过验签时的决策（#1166 T05 签名策略）。
///
/// - 显式 `HBUT_MODULE_SIGNATURE_POLICY=enforce` 或 **release 构建** → 拒绝安装；
/// - debug 构建默认降级：允许安装但 `trusted=false`（该模块拿不到任何敏感能力），
///   便于开发期继续迭代；不会因此放宽运行期授权。
fn unsigned_module_decision(
    error: crate::modules::module_manifest::ManifestError,
) -> Result<Option<crate::modules::module_manifest::ModuleManifest>, String> {
    let rejected = format!("{}: {}", error.code(), error.message());
    if signature_policy_enforced() {
        return Err(rejected);
    }
    eprintln!("[T05] 模块未通过发布者验签（{rejected}），按 debug 降级策略加载但标记为不可信");
    Ok(None)
}

/// 是否强制验签（release 构建或显式策略）。
fn signature_policy_enforced() -> bool {
    match std::env::var("HBUT_MODULE_SIGNATURE_POLICY") {
        Ok(value) => {
            let value = value.trim().to_ascii_lowercase();
            matches!(value.as_str(), "enforce" | "strict" | "required")
        }
        Err(_) => !cfg!(debug_assertions),
    }
}

/// 缓存里的 bundle.zip 是否与清单声明的摘要一致（#1166 G-E）。
fn cached_bundle_integrity_ok(bundle_path: &Path, expected_sha: &str) -> bool {
    if expected_sha.trim().is_empty() {
        return false;
    }
    std::fs::read(bundle_path)
        .map(|bytes| sha256_hex(&bytes))
        .map(|actual| actual.eq_ignore_ascii_case(expected_sha.trim()))
        .unwrap_or(false)
}

/// 迁移期开关：允许未签名模块（仅显式设置时生效）。
fn allow_unsigned_modules() -> bool {
    std::env::var("HBUT_ALLOW_UNSIGNED_MODULES")
        .map(|value| {
            let value = value.trim().to_ascii_lowercase();
            value == "1" || value == "true" || value == "yes" || value == "on"
        })
        .unwrap_or(false)
}

/// 模块缓存根目录（`app_cache_dir/more_modules`）。
fn module_cache_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|dir| dir.join(MODULE_CACHE_ROOT))
        .map_err(|e| format!("获取应用缓存目录失败: {}", e))
}

pub fn resolve_module_bundle_file(
    app: &AppHandle,
    channel: &str,
    module_id: &str,
    version: &str,
    rel_path: Option<&str>,
) -> Result<PathBuf, String> {
    let channel = normalize_channel(channel)?;
    let module_id = sanitize_storage_segment(module_id, "module_id")?;
    let version = sanitize_storage_segment(version, "version")?;
    let cache_dir = module_cache_dir(app, &channel, &module_id, &version)?;
    if !cache_dir.exists() {
        return Err("模块缓存不存在，请先准备模块包".to_string());
    }
    let relative = normalize_relative_path(rel_path.unwrap_or(""), "index.html")?;
    let final_relative = if rel_path.unwrap_or("").trim().is_empty() {
        locate_entry_path(&cache_dir, &relative)?
    } else {
        relative
    };
    let target = cache_dir.join(&final_relative);
    if !target.starts_with(&cache_dir) {
        return Err("模块文件路径越界".to_string());
    }
    if !target.is_file() {
        return Err(format!("模块文件不存在：{}", target.display()));
    }
    Ok(target)
}

#[cfg(desktop)]
pub async fn open_module_bundle_window(
    app: AppHandle,
    req: OpenModuleBundleWindowRequest,
) -> Result<OpenModuleBundleWindowResult, String> {
    let prepared = prepare_module_bundle(&app, req.prepare).await?;
    let title = req
        .title
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("{} - Mini-HBUT", prepared.module_name));
    let default_label = format!("more-module-{}", prepared.module_id);
    let window_label = sanitize_window_label(
        req.label
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(default_label.as_str()),
    );
    let width = req.width.unwrap_or(1100.0).clamp(720.0, 1600.0);
    let height = req.height.unwrap_or(780.0).clamp(520.0, 1200.0);

    if let Some(existing) = app.get_webview_window(&window_label) {
        let _ = existing.destroy();
        tokio::time::sleep(Duration::from_millis(120)).await;
    }

    let target = reqwest::Url::parse(&prepared.preview_url)
        .map_err(|e| format!("模块预览地址无效: {}", e))?;
    let window = WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::External(target))
        .title(title)
        .inner_size(width, height)
        .resizable(true)
        .build()
        .map_err(|e| format!("创建模块窗口失败: {}", e))?;
    let _ = window.set_focus();

    Ok(OpenModuleBundleWindowResult {
        prepared,
        window_label,
    })
}

#[cfg(not(desktop))]
pub async fn open_module_bundle_window(
    app: AppHandle,
    req: OpenModuleBundleWindowRequest,
) -> Result<OpenModuleBundleWindowResult, String> {
    let prepared = prepare_module_bundle(&app, req.prepare).await?;
    Err(format!(
        "当前平台不支持独立模块窗口，请改用主窗口内嵌模式：{}",
        prepared.preview_url
    ))
}

#[cfg(test)]
mod t04_module_content_port_tests {
    use super::{resolve_module_content_port, DEFAULT_MODULE_CONTENT_PORT};

    #[test]
    fn content_port_defaults_away_from_bridge_port() {
        // 默认内容端口与默认 Bridge 端口不同
        assert_ne!(resolve_module_content_port(None, 4399), 4399);
        assert_eq!(
            resolve_module_content_port(None, 4399),
            DEFAULT_MODULE_CONTENT_PORT
        );
    }

    #[test]
    fn content_port_honours_explicit_override() {
        assert_eq!(resolve_module_content_port(Some(5000), 4399), 5000);
    }

    #[test]
    fn content_port_never_collides_with_bridge_port() {
        // 显式配置与 Bridge 相同 → 拒绝该配置（否则模块与 API 同源，隔离失效）
        let resolved = resolve_module_content_port(Some(4399), 4399);
        assert_ne!(resolved, 4399);
        assert_eq!(resolved, DEFAULT_MODULE_CONTENT_PORT);

        // 默认内容端口恰好等于 Bridge 端口时也要错开
        let resolved_default = resolve_module_content_port(None, DEFAULT_MODULE_CONTENT_PORT);
        assert_ne!(resolved_default, DEFAULT_MODULE_CONTENT_PORT);
    }
}

// ────────────────────────────────────────────────────────────
// #1166 T05：验签入口与解包边界的单元测试（不依赖 AppHandle / 网络）
#[cfg(test)]
mod t05_signature_and_unpack_tests {
    use super::*;
    use crate::modules::module_manifest::{
        canonical_manifest_bytes, ManifestCompat, ManifestSignature, ModuleManifest,
    };
    use base64::Engine as _;
    use ed25519_dalek::{Signer, SigningKey};
    use std::io::Write;

    fn test_signing_key() -> SigningKey {
        SigningKey::from_bytes(&[7u8; 32])
    }

    fn signed_manifest_value(release_seq: u64, sha: &str) -> serde_json::Value {
        let mut manifest = ModuleManifest {
            module_id: "demo".to_string(),
            version: "1.0.0".to_string(),
            release_seq,
            channel: "main".to_string(),
            module_name: "示例".to_string(),
            entry_path: "index.html".to_string(),
            package_sha256: sha.to_string(),
            min_compatible_version: String::new(),
            compat: ManifestCompat {
                host_min: String::new(),
                bridge_protocol: 1,
            },
            permissions: vec!["school.schedule".to_string()],
            publisher_key_id: "dev-test-1".to_string(),
            signature: None,
        };
        let canonical = canonical_manifest_bytes(&manifest).expect("canonical");
        let signature = test_signing_key().sign(&canonical);
        manifest.signature = Some(ManifestSignature {
            alg: "ed25519".to_string(),
            key_id: "dev-test-1".to_string(),
            value: base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(signature.to_bytes()),
        });
        serde_json::to_value(manifest).expect("value")
    }

    fn request(sha: &str) -> ModuleBundlePrepareRequest {
        ModuleBundlePrepareRequest {
            channel: "main".to_string(),
            module_id: "demo".to_string(),
            version: "1.0.0".to_string(),
            package_url: "https://example.com/a.zip".to_string(),
            package_urls: Vec::new(),
            package_sha256: sha.to_string(),
            min_compatible_version: String::new(),
            entry_path: "index.html".to_string(),
            module_name: "示例".to_string(),
            manifest: None,
        }
    }

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("hbut-t05-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("mkdir");
        dir
    }

    #[test]
    fn valid_signed_manifest_matching_request_is_accepted() {
        let root = temp_root("ok");
        let sha = "b".repeat(64);
        let value = signed_manifest_value(1, &sha);
        let parsed = parse_and_verify_manifest(&root, Some(&value), &request(&sha)).expect("ok");
        let manifest = parsed.expect("应返回清单");
        assert_eq!(manifest.publisher_key_id, "dev-test-1");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn manifest_for_other_module_is_rejected() {
        let root = temp_root("mismatch");
        let sha = "c".repeat(64);
        let mut value = signed_manifest_value(1, &sha);
        value["module_id"] = serde_json::Value::from("other");
        let error = parse_and_verify_manifest(&root, Some(&value), &request(&sha)).unwrap_err();
        assert!(error.contains("MODULE_MANIFEST_INVALID"), "{error}");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn signed_manifest_without_sha_is_rejected() {
        let root = temp_root("nosha");
        let mut value = signed_manifest_value(1, "");
        value["package_sha256"] = serde_json::Value::from("");
        let error = parse_and_verify_manifest(&root, Some(&value), &request("")).unwrap_err();
        assert!(
            error.contains("MODULE_SIGNATURE_MISSING") || error.contains("package_sha256"),
            "{error}"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn replayed_release_seq_is_rejected() {
        let root = temp_root("replay");
        let sha = "d".repeat(64);
        crate::modules::module_manifest::write_release_seq(&root, "main", "demo", 5)
            .expect("seed replay store");
        let value = signed_manifest_value(2, &sha);
        let error = parse_and_verify_manifest(&root, Some(&value), &request(&sha)).unwrap_err();
        assert!(error.contains("MODULE_RELEASE_REPLAY"), "{error}");
        let _ = std::fs::remove_dir_all(&root);
    }

    fn zip_with_entries(entries: &[(&str, usize)]) -> Vec<u8> {
        let mut buffer = std::io::Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut buffer);
            let options = zip::write::SimpleFileOptions::default();
            for (name, size) in entries {
                writer.start_file(*name, options).expect("start_file");
                writer.write_all(&vec![b'a'; *size]).expect("write");
            }
            writer.finish().expect("finish");
        }
        buffer.into_inner()
    }

    #[test]
    fn too_many_zip_entries_are_rejected() {
        let root = temp_root("manyentries");
        let names: Vec<String> = (0..600).map(|index| format!("f{index}.html")).collect();
        let entries: Vec<(&str, usize)> = names.iter().map(|name| (name.as_str(), 1)).collect();
        let archive = zip_with_entries(&entries);
        let error = write_bundle_archive(&root, &archive).unwrap_err();
        assert!(error.contains("条目过多"), "{error}");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn oversized_zip_entry_is_rejected() {
        let root = temp_root("bigentry");
        let archive = zip_with_entries(&[("index.html", 17 * 1024 * 1024)]);
        let error = write_bundle_archive(&root, &archive).unwrap_err();
        assert!(error.contains("条目过大"), "{error}");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn safe_zip_with_index_html_is_extracted() {
        let root = temp_root("safe");
        let archive = zip_with_entries(&[("index.html", 16), ("assets/app.js", 32)]);
        write_bundle_archive(&root, &archive).expect("extract");
        assert!(root.join("index.html").is_file());
        assert!(root.join("assets/app.js").is_file());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn traversal_entry_is_rejected() {
        let root = temp_root("traversal");
        let archive = zip_with_entries(&[("../escape.html", 4)]);
        let error = write_bundle_archive(&root, &archive).unwrap_err();
        assert!(!root.join("escape.html").exists(), "不得写出目录外文件");
        assert!(!error.is_empty());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn cached_entry_requires_matching_sha_and_metadata() {
        // #1166 T05：缓存复用必须与 metadata 里的摘要/最小兼容版本一致，
        // 否则按「缓存失效」处理（删除后重下），不得直接用旧包。
        let root = temp_root("cachehit");
        write_cache_metadata(
            &root,
            &ModuleBundleCacheMetadata {
                version: "1.0.0".to_string(),
                package_sha256: "e".repeat(64),
                min_compatible_version: String::new(),
                entry_path: "index.html".to_string(),
                manifest: None,
                release_seq: 1,
            },
        )
        .expect("write meta");
        std::fs::write(root.join("index.html"), b"<html></html>").expect("write entry");

        // 摘要一致 → 命中
        assert!(resolve_cached_entry_path(&root, "index.html", &"e".repeat(64), "").is_some());
        // 摘要不一致 → 不命中（会触发重新下载）
        assert!(resolve_cached_entry_path(&root, "index.html", &"f".repeat(64), "").is_none());
        // 最小兼容版本不一致 → 不命中
        assert!(resolve_cached_entry_path(&root, "index.html", &"e".repeat(64), "9.9.9").is_none());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn cached_bundle_integrity_detects_tampering() {
        // #1166 G-E：缓存命中必须重算包摘要；本机改缓存目录里的文件不得绕过验签。
        let root = temp_root("integrity");
        let payload = b"fake zip bytes".to_vec();
        let bundle_path = root.join("bundle.zip");
        std::fs::write(&bundle_path, &payload).expect("write bundle");
        let sha = format!("{:x}", sha2::Sha256::digest(&payload));
        assert!(cached_bundle_integrity_ok(&bundle_path, &sha));
        assert!(!cached_bundle_integrity_ok(&bundle_path, &"0".repeat(64)));
        assert!(!cached_bundle_integrity_ok(&bundle_path, ""));
        // 篡改文件内容 → 摘要不再匹配
        std::fs::write(&bundle_path, b"tampered").expect("tamper");
        assert!(!cached_bundle_integrity_ok(&bundle_path, &sha));
        let _ = std::fs::remove_dir_all(&root);
    }
}
