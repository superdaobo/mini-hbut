use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Cursor, Write};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const DEFAULT_BRIDGE_PORT: u16 = 4399;
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
    #[serde(default, alias = "packageSha256")]
    pub package_sha256: String,
    #[serde(default, alias = "minCompatibleVersion")]
    pub min_compatible_version: String,
    #[serde(default, alias = "entryPath")]
    pub entry_path: String,
    #[serde(default, alias = "moduleName")]
    pub module_name: String,
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
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
struct ModuleBundleCacheMetadata {
    version: String,
    package_sha256: String,
    min_compatible_version: String,
    entry_path: String,
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

fn normalize_channel(raw: &str) -> Result<String, String> {
    let value = raw.trim().to_ascii_lowercase();
    if value.is_empty() || value == "main" {
        return Ok("main".to_string());
    }
    if value == "dev" {
        return Ok("dev".to_string());
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
    format!(
        "http://127.0.0.1:{}/module_bundle/content/{}/{}/{}/{}",
        bridge_port(),
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

fn write_cache_metadata(cache_dir: &Path, metadata: &ModuleBundleCacheMetadata) -> Result<(), String> {
    let text = serde_json::to_string_pretty(metadata)
        .map_err(|e| format!("序列化模块缓存元信息失败: {}", e))?;
    fs::write(cache_meta_path(cache_dir), text).map_err(|e| format!("写入模块缓存元信息失败: {}", e))
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
        Err(_) => true,
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

    let cursor = Cursor::new(zip_bytes.to_vec());
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("解析模块压缩包失败: {}", e))?;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| format!("读取压缩包条目失败: {}", e))?;
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| format!("压缩包包含非法路径：{}", entry.name()))?
            .to_path_buf();
        let output_path = temp_root.join(&enclosed);
        if !output_path.starts_with(&temp_root) {
            return Err("压缩包路径越界".to_string());
        }
        if entry.name().ends_with('/') {
            fs::create_dir_all(&output_path)
                .map_err(|e| format!("创建模块子目录失败: {}", e))?;
            continue;
        }
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建模块文件父目录失败: {}", e))?;
        }
        let mut file = fs::File::create(&output_path)
            .map_err(|e| format!("写入模块文件失败: {}", e))?;
        std::io::copy(&mut entry, &mut file)
            .map_err(|e| format!("解压模块文件失败: {}", e))?;
        file.flush().map_err(|e| format!("刷新模块文件失败: {}", e))?;
    }

    if dest_root.exists() {
        fs::remove_dir_all(dest_root).map_err(|e| format!("替换旧模块目录失败: {}", e))?;
    }
    fs::rename(&temp_root, dest_root).map_err(|e| format!("切换模块目录失败: {}", e))?;
    fs::write(dest_root.join("bundle.zip"), zip_bytes)
        .map_err(|e| format!("保存模块压缩包失败: {}", e))?;
    Ok(())
}

async fn download_bundle_bytes(package_url: &str) -> Result<Vec<u8>, String> {
    if let Some(local_file) = resolve_local_dev_module_file_from_url(package_url) {
        return fs::read(&local_file)
            .map_err(|e| format!("读取本地模块压缩包失败: {} ({})", e, local_file.display()));
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建模块下载客户端失败: {}", e))?;
    let response = client
        .get(package_url)
        .send()
        .await
        .map_err(|e| format!("下载模块压缩包失败: {}", e))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("下载模块压缩包失败：HTTP {}", status.as_u16()));
    }
    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|e| format!("读取模块压缩包失败: {}", e))
}

pub async fn prepare_module_bundle(
    app: &AppHandle,
    req: ModuleBundlePrepareRequest,
) -> Result<ModuleBundlePrepareResult, String> {
    let channel = normalize_channel(&req.channel)?;
    let module_id = sanitize_storage_segment(&req.module_id, "module_id")?;
    let version = sanitize_storage_segment(&req.version, "version")?;
    let min_compatible_version = sanitize_optional_storage_segment(
        &req.min_compatible_version,
        "min_compatible_version",
    )?;
    let requested_entry = normalize_relative_path(&req.entry_path, "index.html")?;
    let package_url = req.package_url.trim().to_string();
    let module_name = if req.module_name.trim().is_empty() {
        module_id.clone()
    } else {
        req.module_name.trim().to_string()
    };
    let cache_dir = module_cache_dir(app, &channel, &module_id, &version)?;
    let expected_sha = req.package_sha256.trim().to_ascii_lowercase();

    if cache_dir.exists() {
        if let Some(entry_path) = resolve_cached_entry_path(
            &cache_dir,
            &requested_entry,
            &expected_sha,
            &min_compatible_version,
        ) {
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
            });
        }
        fs::remove_dir_all(&cache_dir).map_err(|e| format!("清理失效模块缓存失败: {}", e))?;
    }

    if package_url.is_empty() {
        return Err("模块 package_url 为空，无法准备本地包".to_string());
    }

    let bundle_bytes = download_bundle_bytes(&package_url).await?;
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
    };
    write_cache_metadata(&cache_dir, &metadata)?;
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
    })
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
