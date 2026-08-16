// lib.rs
//
// 逻辑文档: lib_logic.md
// 主要功能: Tauri 后端逻辑入口
//
// 本文件主要职责:
// 1. 模块声明与必要公共类型（AppState、DB 常量、DTO re-export）
// 2. Tauri builder / setup / 状态注册与 generate_handler 组合
// 3. Tauri Command 按领域拆分至 transport/tauri/，此处仅组合注册，不做业务实现

pub mod app_state;
pub mod application;
pub mod commands;
pub mod credential_store;
pub mod db;
pub mod debug_bridge;
pub mod grade;
pub mod http_client;
#[cfg(feature = "bridge")]
pub mod http_server;
// #622：设备 Enrollment / Ed25519 签名批准 / 设备撤销（私钥只进 OS keyring，fail closed）。
pub mod identity;
pub mod modules;
pub mod parser;
pub mod qxzkb_options;
pub mod runtime_log;
pub mod secret_envelope;
pub mod transport;
pub mod utils;

pub use grade::domain::Grade;

use app_state::AppState;
use commands::{
    delete_remembered_credential, load_remembered_credential, load_session_password,
    save_remembered_credential,
};
use http_client::HbutClient;
use tauri::path::BaseDirectory;
use tauri::Manager;

use modules::ai::*;
use modules::chaoxing_checkin::commands as chaoxing_checkin_cmd;
use modules::one_code::*;
use modules::sports_venue::*;
use modules::usage_stats::commands as usage_stats_cmd;

// DTO / 传输辅助 re-export：保持 crate::Xxx 路径可解析（modules/* 与 http_server 引用）
pub use transport::tauri::academic::{CalendarEvent, Classroom, Exam, Ranking};
pub use transport::tauri::auth::{
    ChaoxingLoginContext, ChaoxingLoginResult, ChaoxingQrInitResponse, ChaoxingQrStatusResponse,
    LoginPageInfo, PortalQrInitResponse, PortalQrStatusResponse, UserInfo,
};
pub use transport::tauri::chaoxing::{
    ChaoxingClassDownloadRequest, ChaoxingClassInviteRequest, ChaoxingClassResourceAccessRequest,
    ChaoxingClassResourcesRequest, ChaoxingClassSsoRequest, ChaoxingCourseOutlineRequest,
    ChaoxingCourseProgressRequest, ChaoxingCourseScoreRequest, ChaoxingCoursesRequest,
    ChaoxingKnowledgeCardsRequest, ChaoxingSessionStatusRequest, ChaoxingVideoStatusRequest,
};
#[cfg(feature = "mobile-full")]
pub use transport::tauri::chaoxing::{
    ChaoxingLaunchUrlRequest, ChaoxingReportProgressRequest, OnlineLearningClearCacheRequest,
    OnlineLearningOverviewRequest, OnlineLearningSyncRequest, OnlineLearningSyncRunsRequest,
    YuketangCourseChaptersRequest, YuketangCourseOutlineRequest, YuketangCourseProgressRequest,
    YuketangCoursesRequest, YuketangHeartbeatRequest, YuketangLeafInfoRequest,
    YuketangPollQrLoginRequest, YuketangQrCreateRequest,
};
pub(crate) use transport::tauri::common::attach_sync_time;
pub(crate) use transport::tauri::config::{
    get_temp_upload_endpoint_config, DEFAULT_TEMP_UPLOAD_ENDPOINT,
};
pub use transport::tauri::course_selection::{
    CourseSelectionChildClassesRequest, CourseSelectionDetailRequest,
    CourseSelectionEndTimeRequest, CourseSelectionListRequest, CourseSelectionSelectRequest,
    CourseSelectionSelectedCoursesRequest, CourseSelectionWithdrawRequest,
};
pub use transport::tauri::qxzkb::QxzkbQuery;
pub use transport::tauri::schedule::{
    AddCustomScheduleCourseRequest, DeleteCustomScheduleCourseRequest, ScheduleCourse,
    ScheduleExportEvent, ScheduleExportRequest, UpdateCustomScheduleCourseRequest,
};
pub(crate) use transport::tauri::system::open_external_url_impl;
pub(crate) use transport::tauri::update::{
    save_export_file_impl, SaveExportFileRequest, SaveExportFileResult,
};

pub(crate) const DB_FILENAME: &str = "grades.db";
const GRADE_TEACHER_CACHE_TABLE: &str = "grade_teacher_cache";

// 应用状态见 app_state.rs；Tauri Command 见 transport/tauri/ 各领域模块
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // #621：Single Instance 必须最早注册（Windows/Linux 深链第二实例启动时，
    // 由它把 argv 交给已运行实例；deep-link 插件随后统一转发到前端 onOpenUrl 事件）。
    // 回调只负责聚焦已运行窗口，不解析/不打印完整 deep-link（argv 含 handoff secret）。
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));

    // #621：统一 minihbut:// 深链插件（desktop + mobile 同 source 配置，见 tauri.conf.json plugins.deep-link）。
    let builder = builder.plugin(tauri_plugin_deep_link::init());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        Some(vec!["--flag1", "--flag2"]),
    ));

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder.plugin(tauri_plugin_keep_screen_on::init());

    let builder = builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        // #611：自研移动后台插件骨架（Android WorkManager / iOS BGTask 统一承载层）。
        // 7 个 API 由插件内部注册：configure/disable/syncContext/getState/runNow/consumeEvents/clearContext。
        .plugin(tauri_plugin_hbut_background::init());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());

    builder
        .setup(|app| {
            // #621：Linux 始终由插件注册 scheme；Windows 仅 debug（dev）注册，生产由安装器注册，
            // 避免每次启动篡改系统协议关联。
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }
            if let Ok(app_data_path) = app.path().app_data_dir() {
                let _ = std::fs::create_dir_all(&app_data_path);
                std::env::set_var(
                    "HBUT_APP_DATA_DIR",
                    app_data_path.to_string_lossy().to_string(),
                );
            }
            if let Ok(db_path) = app.path().resolve("grades.db", BaseDirectory::AppData) {
                if let Some(parent) = db_path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                std::env::set_var("HBUT_DB_PATH", db_path.to_string_lossy().to_string());
            }
            if let Ok(export_path) = app.path().resolve("exports", BaseDirectory::AppCache) {
                let _ = std::fs::create_dir_all(&export_path);
                std::env::set_var("HBUT_EXPORT_DIR", export_path.to_string_lossy().to_string());
            }
            if let Err(e) = db::init_db(DB_FILENAME) {
                eprintln!("初始化数据库失败: {}", e);
            }

            #[cfg(debug_assertions)]
            fn find_file_in_parents(
                file_name: &str,
                max_depth: usize,
            ) -> Option<std::path::PathBuf> {
                let mut dir = std::env::current_dir().ok()?;
                for _ in 0..=max_depth {
                    let candidate = dir.join(file_name);
                    if candidate.exists() {
                        return Some(candidate);
                    }
                    if !dir.pop() {
                        break;
                    }
                }
                None
            }
            fn extract_cookie_segment(raw: &str, label: &str) -> Option<String> {
                let marker = format!("{}:", label);
                let pos = raw.find(&marker)?;
                let after = &raw[pos + marker.len()..];
                let end = after.find('|').unwrap_or(after.len());
                let segment = after[..end].trim();
                if segment.is_empty() {
                    None
                } else {
                    Some(segment.to_string())
                }
            }

            #[cfg(debug_assertions)]
            fn clean_cookie_string(raw: &str) -> String {
                raw.replace("Code:", "")
                    .replace("Auth:", "")
                    .replace("Jwxt:", "")
                    .replace(" | ", "; ")
                    .trim()
                    .to_string()
            }

            #[cfg(debug_assertions)]
            fn read_access_token_from_capture(paths: &[std::path::PathBuf]) -> Option<String> {
                let token_re = regex::Regex::new(r#"\"accessToken\"\s*:\s*\"([^\"]+)\""#).ok()?;
                let auth_re = regex::Regex::new(r#"\"authorization\"\s*:\s*\"([^\"]+)\""#).ok()?;
                for path in paths {
                    let text = std::fs::read_to_string(path).ok()?;
                    let mut last: Option<String> = None;
                    for cap in token_re.captures_iter(&text) {
                        if let Some(m) = cap.get(1) {
                            let value = m.as_str().trim().to_string();
                            if !value.is_empty() {
                                last = Some(value);
                            }
                        }
                    }
                    if last.is_none() {
                        for cap in auth_re.captures_iter(&text) {
                            if let Some(m) = cap.get(1) {
                                let value = m.as_str().trim().to_string();
                                if !value.is_empty() {
                                    last = Some(value);
                                }
                            }
                        }
                    }
                    if last.is_some() {
                        return last;
                    }
                }
                None
            }

            // 统一改为前端跨平台通知监控（Capacitor/Tauri 共用），
            // 这里不再启动 Rust 侧后台循环，避免桌面端重复通知。
            // 启动时尝试加载最近会话凭据 + auth_cookie_v2 全域 cookie（#348）
            let mut restored_any = false;
            let mut token_loaded = false;
            if let Ok(Some(session)) = db::get_latest_user_session(DB_FILENAME) {
                let student_id = session.student_id.clone();
                let cookies = session.cookies.clone();
                let password = session.password.clone();
                let token = session.one_code_token.clone();
                let mut code_cookie = None;
                let mut auth_cookie = None;
                let mut jwxt_cookie = None;
                if !cookies.is_empty() {
                    code_cookie = extract_cookie_segment(&cookies, "Code");
                    auth_cookie = extract_cookie_segment(&cookies, "Auth");
                    jwxt_cookie = extract_cookie_segment(&cookies, "Jwxt");
                }

                let should_restore =
                    code_cookie.is_some() || auth_cookie.is_some() || jwxt_cookie.is_some();
                let should_set_credentials = !password.is_empty();
                let should_set_token = !token.is_empty();
                // 即使旧 cookies 列为空，也要尝试 v2 / 文件快照
                let has_v2 = db::load_auth_cookies_for_student(DB_FILENAME, &student_id)
                    .map(|rows| !rows.is_empty())
                    .unwrap_or(false);

                if should_restore || has_v2 {
                    restored_any = true;
                }
                if should_set_token {
                    token_loaded = true;
                }

                if should_restore || should_set_credentials || should_set_token || has_v2 {
                    let state = app.state::<AppState>();
                    tauri::async_runtime::block_on(async {
                        let mut client = state.client.write().await;
                        // 优先 auth_cookie_v2 全域恢复（#348）
                        client.hydrate_session_cookies_from_store(Some(&student_id));
                        if should_restore {
                            let _ = client.restore_cookie_snapshot(
                                code_cookie,
                                auth_cookie,
                                jwxt_cookie,
                            );
                        }
                        if should_set_credentials {
                            client.set_credentials(student_id.clone(), password);
                        }
                        if should_set_token {
                            let expires_at =
                                chrono::DateTime::parse_from_rfc3339(&session.token_expires_at)
                                    .ok()
                                    .map(|dt| dt.with_timezone(&chrono::Utc));
                            let refresh = if session.refresh_token.trim().is_empty() {
                                None
                            } else {
                                Some(session.refresh_token.clone())
                            };
                            client.set_electricity_session(token, refresh, expires_at);
                        }
                    });
                }
            } else {
                // 无 user_sessions 行时仍尝试 v2 / 文件快照
                let state = app.state::<AppState>();
                tauri::async_runtime::block_on(async {
                    let mut client = state.client.write().await;
                    client.hydrate_session_cookies_from_store(None);
                });
            }
            #[cfg(debug_assertions)]
            if !restored_any {
                if let Some(path) = find_file_in_parents("rust_backend_session.json", 6) {
                    if let Ok(text) = std::fs::read_to_string(path) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                            if let Some(snapshot) = json.get("cookie_snapshot") {
                                let code_raw =
                                    snapshot.get("code").and_then(|v| v.as_str()).unwrap_or("");
                                let auth_raw =
                                    snapshot.get("auth").and_then(|v| v.as_str()).unwrap_or("");
                                let jwxt_raw =
                                    snapshot.get("jwxt").and_then(|v| v.as_str()).unwrap_or("");

                                let cleaned_code = clean_cookie_string(code_raw);
                                let cleaned_auth = clean_cookie_string(auth_raw);
                                let cleaned_jwxt = clean_cookie_string(jwxt_raw);

                                let code_cookie = extract_cookie_segment(code_raw, "Code")
                                    .or_else(|| extract_cookie_segment(auth_raw, "Code"))
                                    .or_else(|| extract_cookie_segment(jwxt_raw, "Code"))
                                    .or_else(|| {
                                        if cleaned_code.is_empty() {
                                            None
                                        } else {
                                            Some(cleaned_code)
                                        }
                                    });
                                let auth_cookie = extract_cookie_segment(auth_raw, "Auth")
                                    .or_else(|| extract_cookie_segment(code_raw, "Auth"))
                                    .or_else(|| extract_cookie_segment(jwxt_raw, "Auth"))
                                    .or_else(|| {
                                        if cleaned_auth.is_empty() {
                                            None
                                        } else {
                                            Some(cleaned_auth)
                                        }
                                    });
                                let jwxt_cookie = extract_cookie_segment(jwxt_raw, "Jwxt")
                                    .or_else(|| extract_cookie_segment(code_raw, "Jwxt"))
                                    .or_else(|| extract_cookie_segment(auth_raw, "Jwxt"))
                                    .or_else(|| {
                                        if cleaned_jwxt.is_empty() {
                                            None
                                        } else {
                                            Some(cleaned_jwxt)
                                        }
                                    });

                                if code_cookie.is_some()
                                    || auth_cookie.is_some()
                                    || jwxt_cookie.is_some()
                                {
                                    let state = app.state::<AppState>();
                                    tauri::async_runtime::block_on(async {
                                        let mut client = state.client.write().await;
                                        let _ = client.restore_cookie_snapshot(
                                            code_cookie,
                                            auth_cookie,
                                            jwxt_cookie,
                                        );
                                    });
                                }
                            }
                        }
                    }
                }
            }
            #[cfg(debug_assertions)]
            if !token_loaded {
                let mut capture_paths: Vec<std::path::PathBuf> = Vec::new();
                if let Some(path) = find_file_in_parents("captured_requests1.json", 6) {
                    capture_paths.push(path);
                }
                if let Some(path) = find_file_in_parents("captured_requests.json", 6) {
                    capture_paths.push(path);
                }
                if let Some(token) = read_access_token_from_capture(&capture_paths) {
                    let state = app.state::<AppState>();
                    tauri::async_runtime::block_on(async {
                        let mut client = state.client.write().await;
                        client.set_electricity_token(token);
                    });
                }
            }
            #[cfg(not(debug_assertions))]
            let _ = (restored_any, token_loaded);

            // 启动本地 HTTP Bridge 服务；具体平台/构建开关由 http_server 统一判断（#594 bridge feature 关闭时不编译）。
            #[cfg(feature = "bridge")]
            let client = app.state::<AppState>().client.clone();
            #[cfg(feature = "bridge")]
            crate::http_server::spawn_http_server(client, app.handle().clone());
            Ok(())
        })
        .manage(AppState::new(HbutClient::new()))
        .manage(chaoxing_checkin_cmd::CheckinState::new())
        .invoke_handler(tauri::generate_handler![
            transport::tauri::auth::get_login_page,
            transport::tauri::auth::get_captcha,
            transport::tauri::auth::recognize_captcha,
            transport::tauri::config::set_ocr_endpoint,
            transport::tauri::config::set_ocr_runtime_config,
            transport::tauri::config::get_ocr_runtime_status,
            transport::tauri::config::set_temp_upload_endpoint,
            transport::tauri::config::fetch_remote_config,
            transport::tauri::config::fetch_remote_json,
            transport::tauri::system::exit_app,
            transport::tauri::update::download_deyihei_font,
            transport::tauri::update::download_deyihei_font_payload,
            transport::tauri::update::download_remote_font_payload,
            transport::tauri::update::cache_remote_image,
            transport::tauri::update::save_export_file,
            debug_bridge::get_debug_runtime_config,
            debug_bridge::set_debug_runtime_config,
            debug_bridge::set_debug_bridge_ready,
            debug_bridge::complete_debug_screenshot,
            debug_bridge::complete_debug_open_module,
            debug_bridge::complete_debug_reset_more_modules,
            debug_bridge::complete_debug_state,
            debug_bridge::save_debug_capture_file,
            transport::tauri::system::get_runtime_logs,
            transport::tauri::system::clear_runtime_logs,
            transport::tauri::system::push_runtime_log,
            transport::tauri::system::get_runtime_diag,
            transport::tauri::system::open_external_url,
            modules::school_website_embed::school_website_embed_open,
            modules::school_website_embed::school_website_embed_resize,
            modules::school_website_embed::school_website_embed_close,
            // #452：长后台回前台 ensure/respawn loopback HTTP Bridge
            #[cfg(feature = "bridge")]
            http_server::ensure_http_bridge,
            transport::tauri::update::prepare_module_bundle,
            transport::tauri::system::open_file_with_system,
            transport::tauri::update::open_module_bundle_window,
            transport::tauri::system::resource_share_direct_url_native,
            transport::tauri::system::resource_share_fetch_file_payload_native,
            transport::tauri::system::resource_share_list_dir_native,
            transport::tauri::notification::send_test_notification_native,
            transport::tauri::notification::send_local_notification_native,
            transport::tauri::notification::schedule_local_notification_native,
            transport::tauri::notification::get_pending_local_notifications_native,
            transport::tauri::notification::cancel_local_notifications_native,
            transport::tauri::notification::get_notification_permission_native,
            transport::tauri::notification::request_notification_permission_native,
            transport::tauri::auth::login,
            transport::tauri::auth::portal_qr_init_login,
            transport::tauri::auth::portal_qr_check_status,
            transport::tauri::auth::portal_qr_confirm_login,
            transport::tauri::auth::chaoxing_qr_init_login,
            transport::tauri::auth::chaoxing_qr_refresh_login,
            transport::tauri::auth::chaoxing_qr_check_status,
            transport::tauri::auth::chaoxing_qr_confirm_login,
            transport::tauri::auth::chaoxing_password_login,
            transport::tauri::auth::logout,
            save_remembered_credential,
            load_remembered_credential,
            load_session_password,
            delete_remembered_credential,
            commands::campus_network::campus_network_probe,
            commands::campus_network::campus_network_login,
            commands::campus_network::campus_network_logout,
            transport::tauri::auth::restore_session,
            transport::tauri::auth::restore_latest_session,
            transport::tauri::auth::has_restorable_credentials,
            transport::tauri::auth::auto_relogin_from_stored,
            transport::tauri::auth::set_offline_user_context,
            transport::tauri::auth::get_cookies,
            transport::tauri::auth::refresh_session,
            transport::tauri::grades::sync_grades,
            transport::tauri::grades::get_grade_teacher_cache,
            transport::tauri::grades::sync_grade_teachers_current_semester,
            transport::tauri::grades::get_grades_local,
            transport::tauri::schedule::sync_schedule,
            transport::tauri::schedule::get_schedule_local,
            transport::tauri::schedule::list_custom_schedule_courses,
            transport::tauri::schedule::list_all_custom_schedule_courses,
            transport::tauri::schedule::add_custom_schedule_course,
            transport::tauri::schedule::delete_custom_schedule_course,
            transport::tauri::schedule::update_custom_schedule_course,
            transport::tauri::schedule::export_schedule_calendar,
            transport::tauri::academic::fetch_exams,
            transport::tauri::academic::fetch_ranking,
            transport::tauri::academic::fetch_student_info,
            transport::tauri::forum::school_inbox_fetch,
            transport::tauri::forum::school_inbox_detail_fetch,
            transport::tauri::forum::school_inbox_mark_read,
            transport::tauri::forum::smart_orientation_list_panels,
            transport::tauri::forum::smart_orientation_list_messages,
            transport::tauri::forum::smart_orientation_profile_blocks,
            transport::tauri::academic::fetch_personal_login_access_info,
            transport::tauri::academic::fetch_semesters,
            transport::tauri::academic::fetch_classroom_buildings,
            transport::tauri::academic::fetch_classrooms,
            transport::tauri::academic::fetch_training_plan_options,
            transport::tauri::academic::fetch_training_plan_jys,
            transport::tauri::academic::fetch_training_plan_courses,
            transport::tauri::academic::fetch_calendar,
            transport::tauri::academic::fetch_calendar_data,
            transport::tauri::academic::fetch_academic_progress,
            transport::tauri::qxzkb::fetch_qxzkb_options,
            transport::tauri::qxzkb::fetch_qxzkb_jcinfo,
            transport::tauri::qxzkb::fetch_qxzkb_zyxx,
            transport::tauri::qxzkb::fetch_qxzkb_kkjys,
            transport::tauri::qxzkb::fetch_qxzkb_list,
            transport::tauri::course_selection::fetch_course_selection_overview,
            transport::tauri::course_selection::fetch_course_selection_list,
            transport::tauri::course_selection::fetch_course_selection_end_time,
            transport::tauri::course_selection::fetch_course_selection_child_classes,
            transport::tauri::course_selection::select_course_selection_course,
            transport::tauri::course_selection::withdraw_course_selection_course,
            transport::tauri::course_selection::fetch_course_selection_selected_courses,
            transport::tauri::course_selection::fetch_course_selection_detail_intro,
            transport::tauri::course_selection::fetch_course_selection_detail_teacher,
            #[cfg(feature = "mobile-full")]
            transport::tauri::chaoxing::online_learning_overview,
            #[cfg(feature = "mobile-full")]
            transport::tauri::chaoxing::online_learning_sync_now,
            #[cfg(feature = "mobile-full")]
            transport::tauri::chaoxing::online_learning_list_sync_runs,
            #[cfg(feature = "mobile-full")]
            transport::tauri::chaoxing::online_learning_clear_cache,
            transport::tauri::chaoxing::chaoxing_get_session_status,
            transport::tauri::chaoxing::chaoxing_class_ensure_sso,
            transport::tauri::chaoxing::chaoxing_class_preview_invite,
            transport::tauri::chaoxing::chaoxing_class_accept_invite,
            transport::tauri::chaoxing::chaoxing_class_list_resources,
            transport::tauri::chaoxing::chaoxing_class_resolve_resource,
            transport::tauri::chaoxing::chaoxing_class_download_resource,
            transport::tauri::chaoxing::chaoxing_sso_get_diag,
            transport::tauri::chaoxing::chaoxing_fetch_courses,
            transport::tauri::chaoxing::chaoxing_fetch_course_outline,
            transport::tauri::chaoxing::chaoxing_fetch_course_progress,
            #[cfg(feature = "mobile-full")]
            transport::tauri::chaoxing::chaoxing_get_launch_url,
            #[cfg(feature = "mobile-full")]
            transport::tauri::chaoxing::yuketang_create_qr_login,
            #[cfg(feature = "mobile-full")]
            transport::tauri::chaoxing::yuketang_poll_qr_login,
            #[cfg(feature = "mobile-full")]
            transport::tauri::chaoxing::yuketang_fetch_courses,
            #[cfg(feature = "mobile-full")]
            transport::tauri::chaoxing::yuketang_fetch_course_outline,
            #[cfg(feature = "mobile-full")]
            transport::tauri::chaoxing::yuketang_fetch_course_progress,
            transport::tauri::chaoxing::chaoxing_get_knowledge_cards,
            transport::tauri::chaoxing::chaoxing_get_video_status,
            transport::tauri::chaoxing::chaoxing_fetch_course_score,
            #[cfg(feature = "mobile-full")]
            transport::tauri::chaoxing::chaoxing_report_progress,
            #[cfg(feature = "mobile-full")]
            transport::tauri::chaoxing::yuketang_get_course_chapters,
            #[cfg(feature = "mobile-full")]
            transport::tauri::chaoxing::yuketang_get_leaf_info,
            #[cfg(feature = "mobile-full")]
            transport::tauri::chaoxing::yuketang_send_heartbeat,
            transport::tauri::academic::fetch_library_dict,
            transport::tauri::academic::search_library_books,
            transport::tauri::academic::fetch_library_book_detail,
            transport::tauri::electricity::electricity_query_location,
            transport::tauri::electricity::electricity_query_account,
            transport::tauri::electricity::refresh_electricity_token,
            transport::tauri::electricity::fetch_transaction_history,
            transport::tauri::electricity::campus_code_fetch_config,
            transport::tauri::electricity::campus_code_fetch_qrcode,
            transport::tauri::electricity::campus_code_fetch_order_status,
            hbut_ai_init,
            hbut_ai_upload,
            hbut_ai_chat,
            hbut_one_code_token,
            one_code_app_open_prepare,
            electricity_usage_stats,
            sports_venue_bootstrap,
            sports_venue_detail,
            sports_venue_reserve,
            sports_venue_orders,
            sports_venue_records,
            sports_venue_pay,
            sports_venue_cancel_pay,
            transport::tauri::teaching_eval::teaching_eval_list,
            transport::tauri::teaching_eval::teaching_eval_form,
            transport::tauri::teaching_eval::teaching_eval_submit,
            transport::tauri::widget::write_widget_snapshot,
            transport::tauri::widget::clear_widget_snapshot,
            transport::tauri::widget::write_widget_theme_color,
            transport::tauri::widget::write_electricity_snapshot,
            transport::tauri::widget::write_exam_snapshot,
            transport::tauri::widget::debug_widget_paths,
            transport::tauri::system::backup_database_now,
            chaoxing_checkin_cmd::chaoxing_checkin_list,
            chaoxing_checkin_cmd::chaoxing_checkin_submit_common,
            chaoxing_checkin_cmd::chaoxing_checkin_submit_location,
            chaoxing_checkin_cmd::chaoxing_checkin_upload_photo,
            chaoxing_checkin_cmd::chaoxing_checkin_submit_photo,
            chaoxing_checkin_cmd::chaoxing_checkin_submit_qrcode,
            chaoxing_checkin_cmd::chaoxing_checkin_submit_gesture,
            chaoxing_checkin_cmd::chaoxing_checkin_history,
            chaoxing_checkin_cmd::chaoxing_checkin_parse_qr_url,
            chaoxing_checkin_cmd::chaoxing_checkin_decode_qr_image,
            chaoxing_checkin_cmd::chaoxing_checkin_capture_screen_qr,
            chaoxing_checkin_cmd::clear_chaoxing_data,
            usage_stats_cmd::usage_stats_record_event,
            usage_stats_cmd::usage_stats_end_session,
            usage_stats_cmd::usage_stats_upsert_device_profile,
            usage_stats_cmd::usage_stats_get_personal_summary,
            usage_stats_cmd::usage_stats_list_pending_upload,
            usage_stats_cmd::usage_stats_mark_uploaded,
            modules::weather::fetch_weather,
            // #622：设备身份 commands（统一 identity_ 前缀；追加，不删 #610/#621 的注册）
            identity::commands::identity_device_status,
            identity::commands::identity_core_fetch,
            identity::commands::identity_get_public_key,
            identity::commands::identity_enroll_device,
            identity::commands::identity_sign_auth_request,
            identity::commands::identity_revoke_current_device_local,
            identity::commands::identity_fetch_auth_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
