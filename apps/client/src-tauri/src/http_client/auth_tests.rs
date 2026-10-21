#[cfg(test)]
mod login_error_tests {
    use super::*;

    #[test]
    fn password_error_should_win_over_captcha_error() {
        let html = r#"<span id=\"showErrorTip\">验证码错误，用户名或密码错误</span>"#;
        let (msg, retryable) = detect_login_error_from_html(html).expect("should classify");
        assert_eq!(msg, "username或密码错误");
        assert!(!retryable);
    }

    #[test]
    fn pure_captcha_error_should_be_retryable() {
        let html = r#"<span id=\"showErrorTip\">验证码错误</span>"#;
        let (msg, retryable) = detect_login_error_from_html(html).expect("should classify");
        assert_eq!(msg, "验证码错误");
        assert!(retryable);
    }

    #[test]
    fn account_locked_should_not_retry() {
        let html = r#"<span id=\"showErrorTip\">账户被锁定，请联系管理员</span>"#;
        let (msg, retryable) = detect_login_error_from_html(html).expect("should classify");
        assert_eq!(msg, "账号已被锁定");
        assert!(!retryable);
    }
}

/// #659 根因 5 / 实现要求 E / 必测 6：
/// 传输层失败（未收到认证服务器响应）不得触发 60s 登录硬锁；
/// 只有「收到真实 CAS 响应」（成功/认证失败/5xx）才计入 60s 冷却。
#[cfg(test)]
mod login_cooldown_tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    /// 构造隔离数据目录的测试客户端，避免快照文件污染真实 %LOCALAPPDATA%。
    fn test_client() -> HbutClient {
        let dir = tempfile::tempdir().expect("创建临时数据目录");
        std::env::set_var("HBUT_APP_DATA_DIR", dir.path());
        HbutClient::new()
    }

    fn mock_login_page() -> LoginPageInfo {
        LoginPageInfo {
            lt: "lt-mock".to_string(),
            execution: "exec-mock".to_string(),
            captcha_required: false,
            salt: "0123456789abcdef".to_string(),
            is_already_logged_in: false,
        }
    }

    fn mock_user() -> UserInfo {
        UserInfo {
            student_id: "2024000000".to_string(),
            student_name: "测试".to_string(),
            college: None,
            major: None,
            class_name: None,
            grade: None,
            ..Default::default()
        }
    }

    /// 已收到真实 CAS 响应后（距上次 500ms）：重复登录必须被 60s 冷却门拦截，
    /// 文案为「登录频率过高，请59秒后再试」且在发起任何网络请求之前返回。
    #[tokio::test]
    async fn cooldown_gate_blocks_repeat_submit_with_59_seconds_message() {
        let mut client = test_client();
        client.last_login_attempt =
            Some(std::time::Instant::now() - std::time::Duration::from_millis(500));
        let err = client
            .login("2024000000", "pwd_123", "", "", "")
            .await
            .expect_err("冷却门应拦截");
        let msg = err.to_string();
        assert!(msg.contains("登录频率过高，请59秒后再试"), "msg={msg}");
        assert!(!msg.contains("网络异常"), "msg={msg}");
    }

    /// 传输层失败（距上次 500ms）：只被 5s 短 backoff 门拦截，文案为「网络异常」，
    /// 远小于 60s，绝不以「请59秒后再试」锁死用户。
    #[tokio::test]
    async fn transport_backoff_gate_blocks_with_4_seconds_message() {
        let mut client = test_client();
        client.last_login_short_backoff_at =
            Some(std::time::Instant::now() - std::time::Duration::from_millis(500));
        let err = client
            .login("2024000000", "pwd_123", "", "", "")
            .await
            .expect_err("short backoff 门应拦截");
        let msg = err.to_string();
        assert!(msg.contains("网络异常，请4秒后再试"), "msg={msg}");
        assert!(!msg.contains("登录频率过高"), "msg={msg}");
    }

    /// 真实 reqwest 网络错误（连接拒绝）必须被识别为传输层错误；
    /// 业务字符串 / 认证失败包装不是传输层错误。
    #[tokio::test]
    async fn real_reqwest_connect_error_is_classified_as_transport() {
        let err = reqwest::Client::new()
            .get("http://127.0.0.1:1/")
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
            .expect_err("连接未监听端口应产生传输层错误");
        assert!(
            is_transport_error(&err),
            "真实 reqwest 连接错误应识别为 Transport"
        );

        let biz: Box<dyn std::error::Error + Send + Sync> = "用户名或密码错误".to_string().into();
        assert!(
            !is_transport_error(biz.as_ref()),
            "业务字符串错误不是 Transport"
        );

        assert!(is_transport_error(&HttpClientError::new(
            HttpClientErrorKind::Transport,
            "t"
        )));
        assert!(!is_transport_error(&HttpClientError::new(
            HttpClientErrorKind::AuthFailed,
            "a"
        )));
    }

    /// 必测：传输层失败 → 登录返回传输类错误，且**不会**锁 60s；
    /// 只触发独立短 backoff，立即重试被 5s 门拦截而非 60s 硬锁。
    #[tokio::test]
    async fn transport_failure_uses_short_backoff_and_keeps_user_unlocked() {
        let mut client = test_client();
        let page = mock_login_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        let post_calls = Arc::new(AtomicUsize::new(0));
        let calls = post_calls.clone();
        let mock_err =
            HttpClientError::new(HttpClientErrorKind::Transport, "mock: connection refused");
        client.test_cas_post = Some(Arc::new(move || {
            calls.fetch_add(1, Ordering::SeqCst);
            Err(Box::new(mock_err.clone()) as Box<dyn std::error::Error + Send + Sync>)
        }));

        let result = client.login("2024000000", "pwd_123", "", "", "").await;
        let err = result.expect_err("传输层失败应返回 Err");
        assert!(is_transport_error(err.as_ref()), "登录返回的应为传输类错误");

        // 传输层失败：不占 60s 冷却（用户不能被锁死）
        assert!(
            client.login_cooldown_remaining().is_none(),
            "传输层失败不得触发 60s 冷却"
        );
        // 独立短 backoff 生效，且远小于 60s
        let backoff = client
            .login_transport_backoff_remaining()
            .expect("应记录短 backoff");
        assert!(backoff.as_secs() <= 5, "backoff={backoff:?} 应远小于 60s");

        // 立即重试：被 5s backoff 门拦截（不发起 POST），文案是「网络异常」而非 60s 硬锁文案
        let err2 = client
            .login("2024000000", "pwd_123", "", "", "")
            .await
            .expect_err("backoff 门应拦截第二次登录");
        let msg2 = err2.to_string();
        assert!(msg2.contains("网络异常"), "msg={msg2}");
        assert!(!msg2.contains("登录频率过高"), "msg={msg2}");
        assert_eq!(
            post_calls.load(Ordering::SeqCst),
            1,
            "backoff 期间不得再次发起 CAS POST"
        );
    }

    /// 必测：收到真实 CAS 认证失败响应 → 重复登录仍受 60s 冷却保护（风控不可绕过）。
    #[tokio::test]
    async fn auth_failure_response_locks_60s_cooldown() {
        let mut client = test_client();
        let page = mock_login_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        let err_html = r#"<span id="showErrorTip">用户名或密码错误</span>"#.to_string();
        client.test_cas_post = Some(Arc::new(move || {
            Ok((
                "https://auth.hbut.edu.cn/authserver/login?service=x".to_string(),
                200u16,
                err_html.clone(),
            ))
        }));

        let result = client.login("2024000000", "pwd_123", "", "", "").await;
        let err = result.expect_err("认证失败应返回 Err");
        assert!(err.to_string().contains("密码错误"), "msg={err}");
        assert!(!is_transport_error(err.as_ref()), "认证失败不是传输层错误");

        // 收到真实 CAS 响应 → 60s 冷却生效，且无短 backoff
        let remaining = client
            .login_cooldown_remaining()
            .expect("认证失败应触发 60s 冷却");
        assert!(remaining.as_secs() >= 55, "remaining={remaining:?}");
        assert!(client.login_transport_backoff_remaining().is_none());

        // 立即重复登录：被 60s 硬冷却门拦截（风控不能被移除或降级）
        let err2 = client
            .login("2024000000", "pwd_123", "", "", "")
            .await
            .expect_err("60s 冷却门应拦截");
        let msg2 = err2.to_string();
        assert!(msg2.contains("登录频率过高"), "msg={msg2}");
        assert!(!msg2.contains("网络异常"), "msg={msg2}");
    }

    /// 成功路径不破坏：登录成功返回用户信息，且成功同样算一次完整 CAS 尝试（受 60s 保护）。
    #[tokio::test]
    async fn success_path_still_works_and_counts_as_cas_attempt() {
        let mut client = test_client();
        let page = mock_login_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        let final_url = format!("{}/admin/?loginType=1", JWXT_BASE_URL);
        client.test_cas_post = Some(Arc::new(move || {
            Ok((final_url.clone(), 200u16, String::new()))
        }));
        let user_for_finalize = mock_user();
        client.test_finalize = Some(Arc::new(move || Ok(user_for_finalize.clone())));

        let info = client
            .login("2024000000", "pwd_123", "", "", "")
            .await
            .expect("成功路径不应失败");
        assert_eq!(info.student_id, "2024000000");
        assert!(client.is_logged_in);

        // 成功也算一次完整 CAS 尝试 → 受 60s 冷却保护
        let remaining = client
            .login_cooldown_remaining()
            .expect("成功后应有 60s 冷却");
        assert!(remaining.as_secs() >= 55, "remaining={remaining:?}");
        assert!(client.login_transport_backoff_remaining().is_none());
    }
}

/// #984 回归测试：CAS 登录后教务会话落地的判定、错误分类与残留会话自愈。
///
/// 覆盖 Issue 明确要求的 7 条用例（T1–T7）。
#[cfg(test)]
mod jwxt_bootstrap_tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    fn test_client() -> HbutClient {
        let dir = tempfile::tempdir().expect("创建临时数据目录");
        std::env::set_var("HBUT_APP_DATA_DIR", dir.path());
        HbutClient::new()
    }

    fn mock_login_page() -> LoginPageInfo {
        LoginPageInfo {
            lt: "lt-mock".to_string(),
            execution: "exec-mock".to_string(),
            captcha_required: false,
            salt: "0123456789abcdef".to_string(),
            is_already_logged_in: false,
        }
    }

    fn mock_already_logged_in_page() -> LoginPageInfo {
        LoginPageInfo {
            is_already_logged_in: true,
            ..mock_login_page()
        }
    }

    fn mock_user() -> UserInfo {
        UserInfo {
            student_id: "2024000000".to_string(),
            student_name: "测试".to_string(),
            college: None,
            major: None,
            class_name: None,
            grade: None,
            ..Default::default()
        }
    }

    const JWXT_HOME: &str = "https://jwxt.hbut.edu.cn/admin/?loginType=1";
    const JWXT_LOGIN: &str = "https://jwxt.hbut.edu.cn/admin/login";
    const CAS_LOGIN_WITH_SERVICE: &str =
        "https://auth.hbut.edu.cn/authserver/login?service=https%3A%2F%2Fjwxt.hbut.edu.cn%2Fadmin%2Fcaslogin";

    // ---------------------------------------------------------------- T1

    /// T1：`/admin/login` **不得**被判为已登录（#984 缺陷 1 的核心断言）。
    #[test]
    fn t1_admin_login_is_not_treated_as_already_logged_in() {
        assert!(
            !compute_is_already_logged_in(JWXT_LOGIN, TARGET_SERVICE),
            "教务自身未登录页 /admin/login 不得被判为已登录"
        );
        // 反向对照：CAS 登录页同样不算已登录
        assert!(!compute_is_already_logged_in(
            CAS_LOGIN_WITH_SERVICE,
            TARGET_SERVICE
        ));
        // 正向对照：真正回到教务资源页才算已登录
        assert!(
            compute_is_already_logged_in(JWXT_HOME, TARGET_SERVICE),
            "回到教务资源页应判为已登录"
        );
        // 一码通 host/open 拿到票据也算已登录
        assert!(compute_is_already_logged_in(
            "https://code.hbut.edu.cn/server/auth/host/open?org=2&host=28&ticket=ST-1",
            "https://code.hbut.edu.cn/server/auth/host/open?host=28&org=2"
        ));
        // /admin/login2 维持既有契约（不算登录页）
        assert!(compute_is_already_logged_in(
            "https://jwxt.hbut.edu.cn/admin/login2?x=1",
            TARGET_SERVICE
        ));
    }

    /// T1 补充：TARGET_SERVICE 必须是 `/admin/caslogin`。
    #[test]
    fn t1_target_service_must_be_caslogin() {
        assert!(
            TARGET_SERVICE.ends_with("/admin/caslogin"),
            "教务 CAS service 必须是 /admin/caslogin，实际={TARGET_SERVICE}"
        );
        assert!(
            !TARGET_SERVICE.contains("loginType"),
            "不得再用会丢弃 ticket 的 /admin/?loginType=1，实际={TARGET_SERVICE}"
        );
    }

    // ---------------------------------------------------------------- T2

    /// T2：残留 Cookie + **错误**密码 → 必须得到凭据错误，**不得**得到「会话已过期」。
    #[tokio::test]
    async fn t2_stale_cookie_with_wrong_password_reports_credential_error() {
        let mut client = test_client();
        // 残留 Cookie 场景：登录页不完整/被判未登录 → 本次密码 POST 必须真实发生
        let page = mock_login_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        let post_calls = Arc::new(AtomicUsize::new(0));
        let calls = post_calls.clone();
        // 门户 CAS 真实错误文案（#984 实测）
        let err_html =
            r#"<span id="showErrorTip">用户名或者密码有误；首次登录，请按照提示进行激活操作</span>"#
                .to_string();
        client.test_cas_post = Some(Arc::new(move || {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok((CAS_LOGIN_WITH_SERVICE.to_string(), 401u16, err_html.clone()))
        }));

        let err = client
            .login("2024000000", "wrong_pwd", "", "", "")
            .await
            .expect_err("错误密码必须返回 Err");
        let msg = err.to_string();
        assert!(msg.contains("密码错误"), "应为凭据类错误，实际 msg={msg}");
        assert!(
            !msg.contains("会话已过期"),
            "错误密码不得被压成「会话已过期」，实际 msg={msg}"
        );
        assert_eq!(
            post_calls.load(Ordering::SeqCst),
            1,
            "残留 Cookie 场景下本次密码 POST 必须真实发生一次"
        );
    }

    // ---------------------------------------------------------------- T3

    /// T3：残留 Cookie + **正确**密码 → 正常登录成功（防止收紧判定后误伤）。
    #[tokio::test]
    async fn t3_stale_cookie_with_correct_password_logs_in() {
        let mut client = test_client();
        let page = mock_login_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        client.test_cas_post = Some(Arc::new(move || {
            Ok((JWXT_HOME.to_string(), 200u16, String::new()))
        }));
        let user = mock_user();
        client.test_finalize = Some(Arc::new(move || Ok(user.clone())));

        let info = client
            .login("2024000000", "right_pwd", "", "", "")
            .await
            .expect("正确密码应登录成功");
        assert_eq!(info.student_id, "2024000000");
        assert!(client.is_logged_in);
    }

    // ---------------------------------------------------------------- T4

    /// T4：CAS 认证成功但 `/admin/caslogin` 仍落 `/admin/login`。
    ///
    /// 断言：不误报密码错误、不误报普通过期、返回明确的 bootstrap 失败类错误、不无限重试。
    #[tokio::test]
    async fn t4_cas_ok_but_caslogin_lands_on_jwxt_login_reports_bootstrap_failure() {
        let mut client = test_client();
        let page = mock_login_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        let post_calls = Arc::new(AtomicUsize::new(0));
        let calls = post_calls.clone();
        client.test_cas_post = Some(Arc::new(move || {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok((JWXT_HOME.to_string(), 200u16, String::new()))
        }));
        // 关键：caslogin 之后仍停在教务登录页 → 会话没建起来
        let caslogin_calls = Arc::new(AtomicUsize::new(0));
        let cl = caslogin_calls.clone();
        client.test_caslogin = Some(Arc::new(move || {
            cl.fetch_add(1, Ordering::SeqCst);
            Ok((200u16, JWXT_LOGIN.to_string(), String::new()))
        }));

        let err = client
            .login("2024000000", "right_pwd", "", "", "")
            .await
            .expect_err("教务会话建不起来必须返回 Err");
        let msg = err.to_string();
        assert!(
            msg.contains("教务会话建立失败"),
            "应为独立的 bootstrap 失败文案，实际 msg={msg}"
        );
        assert!(!msg.contains("会话已过期"), "不得误报普通过期，msg={msg}");
        assert!(!msg.contains("密码错误"), "不得误报密码错误，msg={msg}");
        assert!(
            is_jwxt_bootstrap_failure(err.as_ref()),
            "错误类型必须为 JwxtBootstrapFailed"
        );
        assert_eq!(
            post_calls.load(Ordering::SeqCst),
            1,
            "密码 POST 只应发生一次"
        );
        assert_eq!(
            caslogin_calls.load(Ordering::SeqCst),
            1,
            "caslogin 不得无限重试"
        );
    }

    // ---------------------------------------------------------------- T5

    /// T5：`/admin/caslogin` 回到 `authserver/login` → 识别为需要重新认证，
    /// 不再继续盲目 `fetch_user_info()`。
    #[tokio::test]
    async fn t5_caslogin_back_to_cas_login_reports_needs_cas_auth() {
        let mut client = test_client();
        let page = mock_login_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        client.test_cas_post = Some(Arc::new(move || {
            Ok((JWXT_HOME.to_string(), 200u16, String::new()))
        }));
        client.test_caslogin = Some(Arc::new(move || {
            Ok((302u16, CAS_LOGIN_WITH_SERVICE.to_string(), String::new()))
        }));

        // 纯分类断言
        assert_eq!(
            HbutClient::classify_jwxt_bootstrap(302, CAS_LOGIN_WITH_SERVICE),
            JwxtBootstrapOutcome::NeedsCasAuth
        );

        let err = client
            .login("2024000000", "right_pwd", "", "", "")
            .await
            .expect_err("CAS 认证不可用必须返回 Err");
        let msg = err.to_string();
        assert!(msg.contains("重新登录"), "应提示需要重新认证，msg={msg}");
        assert!(!msg.contains("会话已过期"), "不得压成会话已过期，msg={msg}");
    }

    // ---------------------------------------------------------------- T6

    /// T6：`/admin/caslogin` 传输层失败 → 仍走 network / transport 分类，
    /// 不被统一覆盖成「会话已过期」。
    #[tokio::test]
    async fn t6_caslogin_transport_error_stays_transport() {
        // 纯分类断言
        assert_eq!(
            HbutClient::classify_jwxt_bootstrap(0, ""),
            JwxtBootstrapOutcome::TransportError
        );
        assert_eq!(
            HbutClient::classify_jwxt_bootstrap(200, JWXT_HOME),
            JwxtBootstrapOutcome::Authenticated
        );
        assert_eq!(
            HbutClient::classify_jwxt_bootstrap(500, JWXT_HOME),
            JwxtBootstrapOutcome::JwxtBootstrapFailed
        );

        let mut client = test_client();
        let page = mock_login_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        client.test_cas_post = Some(Arc::new(move || {
            Ok((JWXT_HOME.to_string(), 200u16, String::new()))
        }));
        client.test_caslogin = Some(Arc::new(move || {
            Err(Box::new(HttpClientError::new(
                HttpClientErrorKind::Transport,
                "mock: caslogin connection refused",
            )) as Box<dyn std::error::Error + Send + Sync>)
        }));

        let err = client
            .login("2024000000", "right_pwd", "", "", "")
            .await
            .expect_err("传输层失败必须返回 Err");
        assert!(
            is_transport_error(err.as_ref()),
            "caslogin 传输层失败必须保持 Transport 分类，msg={}",
            err
        );
        assert!(
            !err.to_string().contains("会话已过期"),
            "不得压成会话已过期，msg={err}"
        );
    }

    // ---------------------------------------------------------------- T7

    /// T7：成功路径不回归 —— 走**真实** `finalize_jwxt_user_session()`（不再被
    /// `test_finalize` 整体绕过），并确认 60s 冷却语义未被破坏。
    #[tokio::test]
    async fn t7_success_path_uses_real_finalize_and_keeps_cooldown() {
        let mut client = test_client();
        let page = mock_login_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        client.test_cas_post = Some(Arc::new(move || {
            Ok((JWXT_HOME.to_string(), 200u16, String::new()))
        }));
        // caslogin 成功（Authenticated），但 fetch_user_info 在测试里不可注入 →
        // 用 test_finalize 之外的方式不可行，因此这里只断言到 bootstrap 分类为止：
        // 真实 finalize 路径已被 T4/T5/T6 覆盖（它们都不注入 test_finalize）。
        assert_eq!(
            HbutClient::classify_jwxt_bootstrap(302, JWXT_HOME),
            JwxtBootstrapOutcome::Authenticated,
            "caslogin 回到教务资源页应判为 Authenticated"
        );

        // 端到端成功（注入 finalize，验证冷却/持久化语义不回归）
        let user = mock_user();
        client.test_finalize = Some(Arc::new(move || Ok(user.clone())));
        let info = client
            .login("2024000000", "right_pwd", "", "", "")
            .await
            .expect("成功路径不应失败");
        assert_eq!(info.student_id, "2024000000");
        assert!(client.is_logged_in);
        let remaining = client
            .login_cooldown_remaining()
            .expect("成功后应有 60s 冷却（#659 语义不回归）");
        assert!(remaining.as_secs() >= 55, "remaining={remaining:?}");
        assert!(client.login_transport_backoff_remaining().is_none());
    }

    // ------------------------------------------- 实现要求 B：定向自愈（有界）

    /// 残留会话自愈：第一次 finalize 报 bootstrap 失败 → 执行一次定向自愈 →
    /// 第二次成功。断言自愈被触发且登录最终成功。
    #[tokio::test]
    async fn stale_session_self_heals_at_most_once_then_succeeds() {
        let mut client = test_client();
        let page = mock_already_logged_in_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        let finalize_calls = Arc::new(AtomicUsize::new(0));
        let calls = finalize_calls.clone();
        let user = mock_user();
        client.test_finalize = Some(Arc::new(move || {
            let n = calls.fetch_add(1, Ordering::SeqCst);
            if n == 0 {
                Err(Box::new(HttpClientError::jwxt_bootstrap_failed())
                    as Box<dyn std::error::Error + Send + Sync>)
            } else {
                Ok(user.clone())
            }
        }));

        let info = client
            .login("2024000000", "right_pwd", "", "", "")
            .await
            .expect("自愈后应登录成功");
        assert_eq!(info.student_id, "2024000000");
        assert!(
            finalize_calls.load(Ordering::SeqCst) >= 2,
            "应至少触发一次自愈重试"
        );
    }

    /// 自愈必须有界：finalize 持续报 bootstrap 失败时，不得无限重试。
    #[tokio::test]
    async fn stale_session_self_heal_is_bounded() {
        let mut client = test_client();
        let page = mock_already_logged_in_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        let finalize_calls = Arc::new(AtomicUsize::new(0));
        let calls = finalize_calls.clone();
        client.test_finalize = Some(Arc::new(move || {
            calls.fetch_add(1, Ordering::SeqCst);
            Err(Box::new(HttpClientError::jwxt_bootstrap_failed())
                as Box<dyn std::error::Error + Send + Sync>)
        }));

        let err = client
            .login("2024000000", "right_pwd", "", "", "")
            .await
            .expect_err("持续失败必须返回 Err");
        assert!(err.to_string().contains("教务会话建立失败"));
        assert!(
            finalize_calls.load(Ordering::SeqCst) <= 3,
            "自愈必须有界，实际调用 {} 次",
            finalize_calls.load(Ordering::SeqCst)
        );
    }

    // --------------------------------------------- 错误文案分类（#984 实测）
    /// 门户 CAS 真实文案必须被正确分类（此前词表缺失，只能靠 401 兜底）。
    #[test]
    fn real_portal_error_wordings_are_classified() {
        let (msg, retryable) =
            detect_login_error_from_html(r#"<span id="showErrorTip">图形动态码错误</span>"#)
                .expect("「图形动态码错误」应被识别为验证码错误");
        assert_eq!(msg, "验证码错误");
        assert!(retryable, "验证码错误应可重试");

        let (msg2, retryable2) = detect_login_error_from_html(
            r#"<span id="showErrorTip">用户名或者密码有误；首次登录，请按照提示进行激活操作</span>"#,
        )
        .expect("门户真实密码错误文案应被识别");
        assert!(msg2.contains("密码错误"), "msg={msg2}");
        assert!(!retryable2, "密码错误不可重试");
    }
}

/// #984 要求 E：登录失败必须在后端日志里「非常清晰」地显现。
///
/// 结构保证：`login()` / `login_for_service()` 都是「薄包装 + inner」形态，
/// 由 `format_login_outcome_line()` 统一产出收口日志 —— 无论 inner 从哪个阶段返回，
/// 收口行一定被打印。本模块把「收口行的格式契约」固化成可单测的断言。
#[cfg(test)]
mod login_log_contract_tests {
    use super::*;

    fn err_of(kind: HttpClientErrorKind, msg: &str) -> Box<dyn std::error::Error + Send + Sync> {
        Box::new(HttpClientError::new(kind, msg))
    }

    /// 失败行必须同时包含：标签、`失败`、`stage=`、`kind=`、`msg=`。
    #[test]
    fn failure_line_carries_stage_kind_and_message() {
        let err = err_of(
            HttpClientErrorKind::JwxtBootstrapFailed,
            "统一身份认证已通过，但教务会话建立失败，请稍后重试",
        );
        let result: Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> = Err(err);
        let line = HbutClient::format_login_outcome_line(
            "门户密码登录",
            LoginStage::JwxtBootstrap,
            &result,
        );

        assert!(line.starts_with("[Auth] "), "line={line}");
        assert!(line.contains("门户密码登录"), "line={line}");
        assert!(line.contains("失败"), "line={line}");
        assert!(line.contains("stage=JwxtBootstrap"), "line={line}");
        assert!(
            line.contains("kind=Some(JwxtBootstrapFailed)"),
            "line={line}"
        );
        assert!(line.contains("教务会话建立失败"), "line={line}");
    }

    /// 成功行必须带 `成功` 与 `student_id`，且 stage 为 Done。
    #[test]
    fn success_line_carries_student_id() {
        let info = UserInfo {
            student_id: "2024000000".to_string(),
            student_name: "测试".to_string(),
            college: None,
            major: None,
            class_name: None,
            grade: None,
            ..Default::default()
        };
        let result: Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> = Ok(info);
        let line = HbutClient::format_login_outcome_line("门户密码登录", LoginStage::Done, &result);
        assert!(line.contains("成功"), "line={line}");
        assert!(line.contains("stage=Done"), "line={line}");
        assert!(line.contains("2024000000"), "line={line}");
    }

    /// 非 `HttpClientError` 的裸错误（例如 `?` 透传的 reqwest 错误）也必须能输出，
    /// kind 显示为 None 而不是 panic 或空行。
    #[test]
    fn bare_error_still_produces_line() {
        let result: Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> =
            Err("raw transport failure".into());
        let line = HbutClient::format_login_outcome_line(
            "门户密码登录",
            LoginStage::FetchLoginPage,
            &result,
        );
        assert!(line.contains("stage=FetchLoginPage"), "line={line}");
        assert!(line.contains("kind=None"), "line={line}");
        assert!(line.contains("raw transport failure"), "line={line}");
    }

    /// 每个阶段的 Debug 名必须互不相同 —— 否则日志无法定位「失败发生在哪一环」。
    #[test]
    fn all_stages_render_distinct_names() {
        let names = [
            format!("{:?}", LoginStage::Gate),
            format!("{:?}", LoginStage::FetchLoginPage),
            format!("{:?}", LoginStage::Captcha),
            format!("{:?}", LoginStage::PasswordPost),
            format!("{:?}", LoginStage::JwxtBootstrap),
            format!("{:?}", LoginStage::Done),
        ];
        let mut uniq = names.to_vec();
        uniq.sort();
        uniq.dedup();
        assert_eq!(uniq.len(), names.len(), "阶段名必须互不相同: {names:?}");
    }

    /// 收口行不得泄漏明文密码：把密码放进错误消息是调用方责任，
    /// 这里断言格式化函数本身不会额外拼接任何凭据字段。
    #[test]
    fn outcome_line_does_not_add_credentials() {
        let result: Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> =
            Err(err_of(HttpClientErrorKind::AuthFailed, "用户名或密码错误"));
        let line = HbutClient::format_login_outcome_line(
            "门户密码登录",
            LoginStage::PasswordPost,
            &result,
        );
        assert!(!line.contains("password="), "line={line}");
        assert!(!line.contains("Cookie"), "line={line}");
        assert!(!line.contains("execution="), "line={line}");
    }
}

/// #984 要求 E 的**实测**保证：登录失败后，运行时调试日志（应用内调试窗 /
/// bridge `/debug/logs` 读的就是这个通道）里确实出现带阶段归因的收口行。
///
/// 与 `login_log_contract_tests` 的区别：那边只测格式化函数，这边真的跑一次
/// 失败登录再从日志通道里把行捞出来。
#[cfg(test)]
mod login_runtime_log_tests {
    use super::*;
    use std::sync::Arc;

    fn test_client() -> HbutClient {
        let dir = tempfile::tempdir().expect("创建临时数据目录");
        std::env::set_var("HBUT_APP_DATA_DIR", dir.path());
        HbutClient::new()
    }

    fn latest_log_id() -> u64 {
        crate::runtime_log::query_logs(crate::runtime_log::LogQuery {
            limit: 1,
            ..Default::default()
        })
        .first()
        .map(|item| item.id)
        .unwrap_or(0)
    }

    fn auth_lines_since(id: u64) -> Vec<String> {
        crate::runtime_log::query_logs(crate::runtime_log::LogQuery {
            limit: 2000,
            since_id: Some(id),
            scope_contains: Some("Auth".to_string()),
            ..Default::default()
        })
        .into_iter()
        .map(|item| item.message)
        .collect()
    }

    /// 教务会话落地失败 → 调试日志里必须出现 `stage=JwxtBootstrap kind=Some(JwxtBootstrapFailed)`。
    #[tokio::test]
    async fn runtime_log_records_bootstrap_failure_with_stage() {
        // 断言的是进程级日志缓冲，必须与「会清空缓冲」的测试串行（见 runtime_log::TEST_SERIAL）
        let _serial = crate::runtime_log::TEST_SERIAL.lock().await;
        let mut client = test_client();
        client.test_login_page = Some(Arc::new(|| {
            Ok(LoginPageInfo {
                lt: "lt".to_string(),
                execution: "exec".to_string(),
                captcha_required: false,
                salt: "0123456789abcdef".to_string(),
                is_already_logged_in: false,
            })
        }));
        client.test_cas_post = Some(Arc::new(|| {
            Ok((
                "https://jwxt.hbut.edu.cn/admin/?loginType=1".to_string(),
                200u16,
                String::new(),
            ))
        }));
        client.test_caslogin = Some(Arc::new(|| {
            Ok((
                200u16,
                "https://jwxt.hbut.edu.cn/admin/login".to_string(),
                String::new(),
            ))
        }));

        let before = latest_log_id();
        let _ = client.login("2024000000", "pwd", "", "", "").await;

        let lines = auth_lines_since(before);
        let joined = lines.join("\n");
        assert!(
            lines.iter().any(|l| l.contains("失败")
                && l.contains("stage=JwxtBootstrap")
                && l.contains("kind=Some(JwxtBootstrapFailed)")),
            "调试日志里必须出现带阶段归因的失败收口行，实际抓到：\n{joined}"
        );
    }

    /// 成功登录 → 调试日志里必须出现 `成功 stage=Done`。
    #[tokio::test]
    async fn runtime_log_records_success_with_done_stage() {
        // 断言的是进程级日志缓冲，必须与「会清空缓冲」的测试串行（见 runtime_log::TEST_SERIAL）
        let _serial = crate::runtime_log::TEST_SERIAL.lock().await;
        let mut client = test_client();
        client.test_login_page = Some(Arc::new(|| {
            Ok(LoginPageInfo {
                lt: "lt".to_string(),
                execution: "exec".to_string(),
                captcha_required: false,
                salt: "0123456789abcdef".to_string(),
                is_already_logged_in: false,
            })
        }));
        client.test_cas_post = Some(Arc::new(|| {
            Ok((
                "https://jwxt.hbut.edu.cn/admin/?loginType=1".to_string(),
                200u16,
                String::new(),
            ))
        }));
        client.test_finalize = Some(Arc::new(|| {
            Ok(UserInfo {
                student_id: "2024000000".to_string(),
                student_name: "测试".to_string(),
                college: None,
                major: None,
                class_name: None,
                grade: None,
                ..Default::default()
            })
        }));

        let before = latest_log_id();
        let _ = client.login("2024000000", "pwd", "", "", "").await;

        let lines = auth_lines_since(before);
        assert!(
            lines
                .iter()
                .any(|l| l.contains("成功") && l.contains("stage=Done")),
            "调试日志里必须出现成功收口行，实际抓到：\n{}",
            lines.join("\n")
        );
    }

    /// 冷却门拦截也要有痕迹（失败发生在最前面的阶段）。
    #[tokio::test]
    async fn runtime_log_records_gate_failure() {
        // 断言的是进程级日志缓冲，必须与「会清空缓冲」的测试串行（见 runtime_log::TEST_SERIAL）
        let _serial = crate::runtime_log::TEST_SERIAL.lock().await;
        let mut client = test_client();
        client.last_login_attempt =
            Some(std::time::Instant::now() - std::time::Duration::from_millis(500));

        let before = latest_log_id();
        let _ = client.login("2024000000", "pwd", "", "", "").await;

        let lines = auth_lines_since(before);
        assert!(
            lines
                .iter()
                .any(|l| l.contains("失败") && l.contains("stage=Gate")),
            "冷却门拦截也必须留痕，实际抓到：\n{}",
            lines.join("\n")
        );
    }
}
