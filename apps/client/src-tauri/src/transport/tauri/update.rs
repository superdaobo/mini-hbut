//! 资源更新/下载类 Tauri commands：字体、远程资源缓存、模块包准备、导出文件。

use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::path::BaseDirectory;
use tauri::Manager;

use crate::modules;
use crate::modules::module_bundle::OpenModuleBundleWindowRequest;

#[cfg(target_os = "android")]
fn notify_android_media_scanner(
    file_path: &std::path::Path,
    mime_type: &str,
) -> Result<(), String> {
    use jni::objects::{JObject, JValue};

    let ctx = ndk_context::android_context();
    let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }
        .map_err(|e| format!("获取 Android VM 失败: {}", e))?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|e| format!("附加 Android 线程失败: {}", e))?;

    let context = unsafe { JObject::from_raw(ctx.context().cast()) };
    let string_cls = env
        .find_class("java/lang/String")
        .map_err(|e| format!("加载 String 类失败: {}", e))?;
    let path_arr = env
        .new_object_array(1, &string_cls, JObject::null())
        .map_err(|e| format!("创建路径数组失败: {}", e))?;
    let mime_arr = env
        .new_object_array(1, &string_cls, JObject::null())
        .map_err(|e| format!("创建类型数组失败: {}", e))?;

    let path_str = env
        .new_string(file_path.to_string_lossy().to_string())
        .map_err(|e| format!("创建路径字符串失败: {}", e))?;
    let mime_str = env
        .new_string(mime_type)
        .map_err(|e| format!("创建类型字符串失败: {}", e))?;
    env.set_object_array_element(&path_arr, 0, &path_str)
        .map_err(|e| format!("写入路径数组失败: {}", e))?;
    env.set_object_array_element(&mime_arr, 0, &mime_str)
        .map_err(|e| format!("写入类型数组失败: {}", e))?;

    let media_cls = env
        .find_class("android/media/MediaScannerConnection")
        .map_err(|e| format!("加载 MediaScannerConnection 失败: {}", e))?;
    env.call_static_method(
        media_cls,
        "scanFile",
        "(Landroid/content/Context;[Ljava/lang/String;[Ljava/lang/String;Landroid/media/MediaScannerConnection$OnScanCompletedListener;)V",
        &[
            (&context).into(),
            (&path_arr).into(),
            (&mime_arr).into(),
            JValue::Object(&JObject::null()),
        ],
    )
    .map_err(|e| format!("触发媒体扫描失败: {}", e))?;

    // context 由 Android 生命周期管理，这里仅借用 JNI 句柄
    std::mem::forget(context);
    Ok(())
}

#[tauri::command]
pub(crate) async fn download_deyihei_font(
    app: tauri::AppHandle,
    url: Option<String>,
    urls: Option<Vec<String>>,
    force: Option<bool>,
) -> Result<String, String> {
    let force = force.unwrap_or(false);
    let cache_dir = app
        .path()
        .resolve("fonts", BaseDirectory::AppCache)
        .map_err(|e| format!("resolve cache dir failed: {}", e))?;
    tokio::fs::create_dir_all(&cache_dir)
        .await
        .map_err(|e| format!("create cache dir failed: {}", e))?;

    let font_path = cache_dir.join("SmileySans-Oblique.ttf");
    if !force {
        if let Ok(meta) = tokio::fs::metadata(&font_path).await {
            if meta.len() > 50_000 {
                return Ok(font_path.to_string_lossy().to_string());
            }
        }
    }

    let mut candidates: Vec<String> = Vec::new();
    if let Some(primary) = url {
        if !primary.trim().is_empty() {
            candidates.push(primary);
        }
    }
    if let Some(extra) = urls {
        for item in extra {
            if !item.trim().is_empty() {
                candidates.push(item);
            }
        }
    }
    for builtin in [
        "https://raw.gitcode.com/superdaobo/mini-hbut-config/blobs/c297dc6928402fc0c73cec17ea7518d3731f7022/SmileySans-Oblique.ttf",
    ] {
        candidates.push(builtin.to_string());
    }
    candidates.sort();
    candidates.dedup();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("create download client failed: {}", e))?;

    let mut last_error = "font download failed".to_string();
    for candidate in candidates {
        for _ in 0..2 {
            let response = match client
                .get(&candidate)
                .header(
                    reqwest::header::USER_AGENT,
                    "Mini-HBUT/1.0 (font-downloader; +https://github.com/superdaobo/mini-hbut)",
                )
                .header(
                    reqwest::header::ACCEPT,
                    "font/ttf,application/octet-stream,*/*",
                )
                .send()
                .await
            {
                Ok(resp) => resp,
                Err(e) => {
                    last_error = format!("request failed: {} ({})", candidate, e);
                    continue;
                }
            };

            if !response.status().is_success() {
                last_error = format!("non-success status: {} ({})", candidate, response.status());
                continue;
            }

            let bytes = match response.bytes().await {
                Ok(data) => data,
                Err(e) => {
                    last_error = format!("read bytes failed: {} ({})", candidate, e);
                    continue;
                }
            };

            if bytes.len() < 50_000 {
                last_error = format!(
                    "downloaded file too small: {} ({} bytes)",
                    candidate,
                    bytes.len()
                );
                continue;
            }

            tokio::fs::write(&font_path, &bytes)
                .await
                .map_err(|e| format!("write cached font failed: {}", e))?;
            return Ok(font_path.to_string_lossy().to_string());
        }
    }

    Err(last_error)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct FontDownloadPayload {
    path: String,
    base64: String,
}

#[tauri::command]
pub(crate) async fn download_deyihei_font_payload(
    app: tauri::AppHandle,
    url: Option<String>,
    urls: Option<Vec<String>>,
    force: Option<bool>,
) -> Result<FontDownloadPayload, String> {
    let path = download_deyihei_font(app, url, urls, force).await?;
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("read font file failed: {}", e))?;
    Ok(FontDownloadPayload {
        path,
        base64: general_purpose::STANDARD.encode(bytes),
    })
}

/// 通用远程字体下载命令：接受 URL 列表和缓存文件名，下载后返回 base64
#[tauri::command]
pub(crate) async fn download_remote_font_payload(
    app: tauri::AppHandle,
    urls: Vec<String>,
    cache_name: String,
    force: Option<bool>,
) -> Result<FontDownloadPayload, String> {
    let force = force.unwrap_or(false);
    let cache_dir = app
        .path()
        .resolve("fonts", BaseDirectory::AppCache)
        .map_err(|e| format!("resolve cache dir failed: {}", e))?;
    tokio::fs::create_dir_all(&cache_dir)
        .await
        .map_err(|e| format!("create cache dir failed: {}", e))?;

    let safe_name = cache_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .collect::<String>();
    if safe_name.is_empty() {
        return Err("invalid cache_name".to_string());
    }
    let font_path = cache_dir.join(&safe_name);

    if !force {
        if let Ok(meta) = tokio::fs::metadata(&font_path).await {
            if meta.len() > 10_000 {
                let bytes = tokio::fs::read(&font_path)
                    .await
                    .map_err(|e| format!("read cached font failed: {}", e))?;
                return Ok(FontDownloadPayload {
                    path: font_path.to_string_lossy().to_string(),
                    base64: general_purpose::STANDARD.encode(bytes),
                });
            }
        }
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("create download client failed: {}", e))?;

    let mut last_error = "remote font download failed".to_string();
    for candidate in &urls {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            continue;
        }
        for _ in 0..2 {
            let response = match client
                .get(trimmed)
                .header(
                    reqwest::header::USER_AGENT,
                    "Mini-HBUT/1.0 (font-downloader; +https://github.com/superdaobo/mini-hbut)",
                )
                .header(
                    reqwest::header::ACCEPT,
                    "font/woff2,font/woff,font/ttf,application/octet-stream,*/*",
                )
                .send()
                .await
            {
                Ok(resp) => resp,
                Err(e) => {
                    last_error = format!("request failed: {} ({})", trimmed, e);
                    continue;
                }
            };

            if !response.status().is_success() {
                last_error = format!("non-success status: {} ({})", trimmed, response.status());
                continue;
            }

            let bytes = match response.bytes().await {
                Ok(data) => data,
                Err(e) => {
                    last_error = format!("read bytes failed: {} ({})", trimmed, e);
                    continue;
                }
            };

            if bytes.len() < 10_000 {
                last_error = format!(
                    "downloaded file too small: {} ({} bytes)",
                    trimmed,
                    bytes.len()
                );
                continue;
            }

            tokio::fs::write(&font_path, &bytes)
                .await
                .map_err(|e| format!("write cached font failed: {}", e))?;

            return Ok(FontDownloadPayload {
                path: font_path.to_string_lossy().to_string(),
                base64: general_purpose::STANDARD.encode(&bytes),
            });
        }
    }

    Err(last_error)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct RemoteImageCachePayload {
    path: String,
    from_cache: bool,
    updated_at: String,
    size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveExportFileRequest {
    file_name: String,
    mime_type: String,
    content_base64: String,
    prefer_media: Option<bool>,
    #[serde(default)]
    debug_save_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SaveExportFileResult {
    path: String,
    saved_to: String,
    size: u64,
    needs_manual_import: bool,
}

fn sanitize_cache_key(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    let out = out.trim_matches('_');
    if out.is_empty() {
        "asset".to_string()
    } else {
        out.to_string()
    }
}

fn infer_image_extension(url: &str) -> &'static str {
    let lower = url.to_ascii_lowercase();
    if lower.contains(".png") {
        ".png"
    } else if lower.contains(".webp") {
        ".webp"
    } else if lower.contains(".jpeg") || lower.contains(".jpg") {
        ".jpg"
    } else {
        ".jpg"
    }
}

fn extension_from_mime(mime_type: &str) -> &'static str {
    let normalized = mime_type.to_ascii_lowercase();
    if normalized.contains("json") {
        ".json"
    } else if normalized.contains("png") {
        ".png"
    } else if normalized.contains("jpeg") || normalized.contains("jpg") {
        ".jpg"
    } else if normalized.contains("webp") {
        ".webp"
    } else {
        ".bin"
    }
}

fn sanitize_export_file_name(raw: &str, default_ext: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    let mut out = out.trim_matches('_').to_string();
    if out.is_empty() {
        out = format!("mini-hbut-export{}", default_ext);
    }
    if !out.to_ascii_lowercase().ends_with(default_ext) {
        out.push_str(default_ext);
    }
    out
}

#[cfg(target_os = "windows")]
fn pick_export_directory() -> Option<std::path::PathBuf> {
    rfd::FileDialog::new()
        .set_title("请选择导出目录")
        .pick_folder()
}

#[cfg(target_os = "windows")]
fn pick_debug_export_directory(req: &SaveExportFileRequest) -> Option<std::path::PathBuf> {
    req.debug_save_dir
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var("HBUT_DEBUG_EXPORT_DIR")
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .map(std::path::PathBuf::from)
        })
}

#[tauri::command]
#[allow(unused_variables)]
pub(crate) fn save_export_file(
    app: tauri::AppHandle,
    req: SaveExportFileRequest,
) -> Result<SaveExportFileResult, String> {
    save_export_file_impl(app, req)
}

#[allow(unused_variables)]
pub(crate) fn save_export_file_impl(
    app: tauri::AppHandle,
    req: SaveExportFileRequest,
) -> Result<SaveExportFileResult, String> {
    let ext = extension_from_mime(&req.mime_type);
    let file_name = sanitize_export_file_name(&req.file_name, ext);
    let bytes = general_purpose::STANDARD
        .decode(req.content_base64.trim())
        .map_err(|e| format!("导出数据解析失败: {}", e))?;

    #[cfg(target_os = "windows")]
    {
        // Windows 导出要求用户选择目录，便于企业环境下做路径管理
        let selected_dir = pick_debug_export_directory(&req)
            .or_else(pick_export_directory)
            .ok_or_else(|| "已取消选择保存目录".to_string())?;
        std::fs::create_dir_all(&selected_dir).map_err(|e| format!("创建目录失败: {}", e))?;
        let file_path = selected_dir.join(file_name);
        std::fs::write(&file_path, &bytes).map_err(|e| format!("写入导出文件失败: {}", e))?;
        return Ok(SaveExportFileResult {
            path: file_path.to_string_lossy().to_string(),
            saved_to: "windows-selected-dir".to_string(),
            size: bytes.len() as u64,
            needs_manual_import: false,
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        // 移动端与非 Windows 平台优先写入系统媒体目录，失败时回退到文档/缓存目录
        let mut candidates: Vec<(std::path::PathBuf, &'static str)> = Vec::new();
        let prefer_media = req.prefer_media.unwrap_or(false);

        if prefer_media {
            #[cfg(target_os = "android")]
            {
                if let Ok(dir) = app.path().resolve("Pictures", BaseDirectory::Public) {
                    candidates.push((dir, "public_picture"));
                }
            }
            if let Ok(dir) = app.path().picture_dir() {
                candidates.push((dir, "picture"));
            }
            if let Ok(dir) = app.path().download_dir() {
                candidates.push((dir, "download"));
            }
        } else if let Ok(dir) = app.path().download_dir() {
            candidates.push((dir, "download"));
        }

        if let Ok(dir) = app.path().document_dir() {
            candidates.push((dir, "document"));
        }
        if let Ok(dir) = app.path().app_data_dir() {
            candidates.push((dir, "app_data"));
        }
        if let Ok(dir) = app.path().app_cache_dir() {
            candidates.push((dir, "app_cache"));
        }

        let mut last_error = String::new();
        for (base_dir, label) in candidates {
            let export_dir = base_dir.join("Mini-HBUT-Export");
            if let Err(e) = std::fs::create_dir_all(&export_dir) {
                last_error = format!("创建目录失败({}): {}", label, e);
                continue;
            }
            let file_path = export_dir.join(&file_name);
            match std::fs::write(&file_path, &bytes) {
                Ok(_) => {
                    #[cfg(target_os = "android")]
                    let needs_manual_import = {
                        let wants_image_album = prefer_media
                            && req.mime_type.to_ascii_lowercase().starts_with("image/");
                        if wants_image_album {
                            notify_android_media_scanner(&file_path, &req.mime_type).is_err()
                        } else {
                            false
                        }
                    };

                    #[cfg(target_os = "ios")]
                    let needs_manual_import = true;

                    #[cfg(not(any(target_os = "android", target_os = "ios")))]
                    let needs_manual_import = false;

                    return Ok(SaveExportFileResult {
                        path: file_path.to_string_lossy().to_string(),
                        saved_to: label.to_string(),
                        size: bytes.len() as u64,
                        needs_manual_import,
                    });
                }
                Err(e) => {
                    last_error = format!("写入失败({}): {}", label, e);
                }
            }
        }
        Err(if last_error.is_empty() {
            "没有可用的导出目录".to_string()
        } else {
            last_error
        })
    }
}

#[tauri::command]
pub(crate) async fn cache_remote_image(
    app: tauri::AppHandle,
    cache_key: String,
    url: String,
    force: Option<bool>,
) -> Result<RemoteImageCachePayload, String> {
    // 缓存目录固定放到 AppCache/maps，避免污染业务数据目录
    let cache_dir = app
        .path()
        .resolve("maps", BaseDirectory::AppCache)
        .map_err(|e| format!("resolve map cache dir failed: {}", e))?;
    tokio::fs::create_dir_all(&cache_dir)
        .await
        .map_err(|e| format!("create map cache dir failed: {}", e))?;

    let key = sanitize_cache_key(&cache_key);
    let ext = infer_image_extension(&url);
    let file_name = format!("{}{}", key, ext);
    let file_path = cache_dir.join(file_name);
    let force = force.unwrap_or(false);

    if !force {
        if let Ok(meta) = tokio::fs::metadata(&file_path).await {
            if meta.len() > 1_024 {
                return Ok(RemoteImageCachePayload {
                    path: file_path.to_string_lossy().to_string(),
                    from_cache: true,
                    updated_at: chrono::Local::now().to_rfc3339(),
                    size: meta.len(),
                });
            }
        }
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(25))
        .connect_timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| format!("create image download client failed: {}", e))?;

    let response = client
        .get(&url)
        .header(
            reqwest::header::USER_AGENT,
            "Mini-HBUT/1.0 (map-cache; +https://github.com/superdaobo/mini-hbut)",
        )
        .send()
        .await
        .map_err(|e| format!("download map failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("download map failed: HTTP {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("read map bytes failed: {}", e))?;
    if bytes.len() < 1_024 {
        return Err(format!("downloaded map too small: {} bytes", bytes.len()));
    }

    tokio::fs::write(&file_path, &bytes)
        .await
        .map_err(|e| format!("write map cache failed: {}", e))?;

    Ok(RemoteImageCachePayload {
        path: file_path.to_string_lossy().to_string(),
        from_cache: false,
        updated_at: chrono::Local::now().to_rfc3339(),
        size: bytes.len() as u64,
    })
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct PrepareModuleBundleRequest {
    pub channel: String,
    #[serde(alias = "moduleId")]
    pub module_id: String,
    pub version: String,
    #[serde(alias = "packageUrl")]
    pub package_url: String,
    #[serde(alias = "packageUrls", default)]
    pub package_urls: Vec<String>,
    #[serde(alias = "packageSha256", default)]
    pub package_sha256: String,
    #[serde(alias = "minCompatibleVersion", default)]
    pub min_compatible_version: String,
    #[serde(alias = "entryPath")]
    pub entry_path: String,
    #[serde(alias = "moduleName", default)]
    pub module_name: String,
}

#[allow(dead_code)]
fn sanitize_module_token(raw: &str, label: &str) -> Result<String, String> {
    let value = raw.trim();
    if value.is_empty() {
        return Err(format!("{} 不能为空", label));
    }
    if value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Ok(value.to_string());
    }
    Err(format!("{} 含非法字符", label))
}

#[allow(dead_code)]
fn sanitize_zip_entry_path(raw: &str) -> Option<PathBuf> {
    let path = Path::new(raw);
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::Normal(seg) => normalized.push(seg),
            std::path::Component::CurDir => {}
            _ => return None,
        }
    }
    if normalized.as_os_str().is_empty() {
        None
    } else {
        Some(normalized)
    }
}

#[allow(dead_code)]
fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<String>()
}

#[allow(dead_code)]
fn extract_zip_bytes_to_dir(bytes: Vec<u8>, target_dir: PathBuf) -> Result<(), String> {
    let cursor = Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("解析模块 ZIP 失败: {}", e))?;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| format!("读取 ZIP 条目失败: {}", e))?;
        let entry_name = entry.name().to_string();
        let Some(relative) = sanitize_zip_entry_path(&entry_name) else {
            continue;
        };
        let output_path = target_dir.join(relative);

        if entry.is_dir() || entry_name.ends_with('/') {
            std::fs::create_dir_all(&output_path).map_err(|e| format!("创建目录失败: {}", e))?;
            continue;
        }

        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建父目录失败: {}", e))?;
        }

        let mut output =
            std::fs::File::create(&output_path).map_err(|e| format!("写入模块文件失败: {}", e))?;
        std::io::copy(&mut entry, &mut output).map_err(|e| format!("解压模块文件失败: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn prepare_module_bundle(
    app: tauri::AppHandle,
    request: PrepareModuleBundleRequest,
) -> Result<serde_json::Value, String> {
    let prepared = modules::module_bundle::prepare_module_bundle(
        &app,
        modules::module_bundle::ModuleBundlePrepareRequest {
            channel: request.channel,
            module_id: request.module_id,
            version: request.version,
            package_url: request.package_url,
            package_urls: request.package_urls,
            package_sha256: request.package_sha256,
            min_compatible_version: request.min_compatible_version,
            entry_path: request.entry_path,
            module_name: request.module_name,
        },
    )
    .await?;
    serde_json::to_value(prepared).map_err(|e| format!("序列化模块准备结果失败: {}", e))
}

#[tauri::command]
pub(crate) async fn open_module_bundle_window(
    app: tauri::AppHandle,
    req: OpenModuleBundleWindowRequest,
) -> Result<modules::module_bundle::OpenModuleBundleWindowResult, String> {
    modules::module_bundle::open_module_bundle_window(app, req).await
}
