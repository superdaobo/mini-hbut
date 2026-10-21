#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_key_accepts_keys_ids_and_chinese() {
        assert_eq!(LibraryApp::from_key("seat"), Some(LibraryApp::Seat));
        assert_eq!(LibraryApp::from_key("19248837"), Some(LibraryApp::Seat));
        assert_eq!(LibraryApp::from_key("座位预约"), Some(LibraryApp::Seat));
        assert_eq!(
            LibraryApp::from_key("quiet_room"),
            Some(LibraryApp::QuietRoom)
        );
        assert_eq!(
            LibraryApp::from_key("quietRoom"),
            Some(LibraryApp::QuietRoom)
        );
        assert_eq!(
            LibraryApp::from_key("19261750"),
            Some(LibraryApp::QuietRoom)
        );
        assert_eq!(
            LibraryApp::from_key("静音仓预约"),
            Some(LibraryApp::QuietRoom)
        );
        assert_eq!(
            LibraryApp::from_key("seminar_room"),
            Some(LibraryApp::SeminarRoom)
        );
        assert_eq!(
            LibraryApp::from_key("19248835"),
            Some(LibraryApp::SeminarRoom)
        );
        assert_eq!(
            LibraryApp::from_key("研讨室"),
            Some(LibraryApp::SeminarRoom)
        );
        assert_eq!(LibraryApp::from_key("  "), None);
        assert_eq!(LibraryApp::from_key("unknown"), None);
    }

    #[test]
    fn catalog_matches_recon_contract() {
        let catalog = app_catalog();
        assert_eq!(catalog.len(), 3);
        let seat = catalog.iter().find(|c| c.app == "seat").expect("seat 存在");
        assert_eq!(seat.m_app_id, "19248837");
        assert_eq!(seat.system_path, "/front/apps/seatengine/index");
        assert_eq!(seat.business_key, "seatId");
        assert_eq!(seat.business_value, "3597");
        let quiet = catalog
            .iter()
            .find(|c| c.app == "quiet_room")
            .expect("quiet 存在");
        assert_eq!(quiet.m_app_id, "19261750");
        assert_eq!(quiet.system_path, "/front/web/apps/reservepc/index");
        assert_eq!(quiet.business_value, "24727");
        let seminar = catalog
            .iter()
            .find(|c| c.app == "seminar_room")
            .expect("seminar 存在");
        assert_eq!(seminar.m_app_id, "19248835");
        assert_eq!(seminar.business_value, "24679");
        // 目录不得包含任何时效凭证
        assert!(!seat.entry_url_without_credentials.contains("Enc"));
    }

    #[test]
    fn collect_params_reads_nested_redirect_uri() {
        let auth_url = "https://auth.chaoxing.com/connect/oauth2/authorize?appid=0be8aa201f084dc2b6956535f906f0ce&redirect_uri=https%3A%2F%2Freserve.chaoxing.com%2Ffront%2Fapps%2Fseatengine%2Findex%3FseatId%3D3597%26enc%3DABC%26fidEnc%3DFID%26uid%3D406591160%26mappIdEnc%3DMAPP";
        let mut params = BTreeMap::new();
        collect_params(auth_url, &mut params);
        assert_eq!(
            params.get("appid").map(String::as_str),
            Some("0be8aa201f084dc2b6956535f906f0ce")
        );
        assert_eq!(params.get("seatId").map(String::as_str), Some("3597"));
        assert_eq!(params.get("enc").map(String::as_str), Some("ABC"));
        assert_eq!(params.get("fidEnc").map(String::as_str), Some("FID"));
        assert_eq!(params.get("uid").map(String::as_str), Some("406591160"));
        assert_eq!(params.get("mappIdEnc").map(String::as_str), Some("MAPP"));
        // redirect_uri 本身也保留（便于诊断）
        assert!(params.contains_key("redirect_uri"));
    }

    #[test]
    fn terminal_url_overrides_intermediate_params() {
        let mut params = BTreeMap::new();
        collect_params(
            "https://auth.chaoxing.com/connect/oauth2/authorize?redirect_uri=https%3A%2F%2Freserve.chaoxing.com%2Fx%3Fenc%3DOLD",
            &mut params,
        );
        collect_params(
            "https://reserve.chaoxing.com/front/apps/seatengine/index?seatId=3597&enc=NEW&code=C1&state=25285",
            &mut params,
        );
        assert_eq!(params.get("enc").map(String::as_str), Some("NEW"));
        assert_eq!(params.get("code").map(String::as_str), Some("C1"));
        assert_eq!(params.get("state").map(String::as_str), Some("25285"));
    }

    #[test]
    fn collect_params_stops_at_nesting_limit() {
        // 构造多层嵌套 redirect_uri：最内层参数不应被解析（防远端自引用导致无限递归）
        let mut url = "https://x.example/?deepKey=LEAK".to_string();
        for _ in 0..5 {
            url = format!(
                "https://x.example/?redirect_uri={}",
                urlencoding::encode(&url)
            );
        }
        let mut params = BTreeMap::new();
        collect_params(&url, &mut params);
        assert!(
            !params.contains_key("deepKey"),
            "超过嵌套上限后不应继续解析：{:?}",
            params.keys().collect::<Vec<_>>()
        );
    }

    #[test]
    fn credentials_pick_named_fields() {
        let mut params = BTreeMap::new();
        params.insert("enc".into(), "E1".into());
        params.insert("fidEnc".into(), "F1".into());
        params.insert("uid".into(), "406591160".into());
        params.insert("seatIdEnc".into(), "b146028eafa4eea9".into());
        params.insert("reserveIdEnc".into(), "".into());
        let cred = LibraryReserveCredentials::from_params(&params);
        assert_eq!(cred.enc.as_deref(), Some("E1"));
        assert_eq!(cred.fid_enc.as_deref(), Some("F1"));
        assert_eq!(cred.uid.as_deref(), Some("406591160"));
        assert_eq!(cred.seat_id_enc.as_deref(), Some("b146028eafa4eea9"));
        // 空值视为缺失
        assert!(cred.reserve_id_enc.is_none());
        assert!(cred.has_any());
    }

    #[test]
    fn login_and_permission_detection() {
        assert!(is_login_page_url(
            "https://passport2.chaoxing.com/login?fid=&refer=http%3A%2F%2Fv1.chaoxing.com"
        ));
        assert!(is_login_page_url("https://sso.chaoxing.com/login"));
        // 实测未登录链路终态：学校 CAS 登录页
        assert!(is_login_page_url(
            "https://auth.hbut.edu.cn/authserver/login?service=https%3A%2F%2Funified-auth.chaoxing.com%2Flogin_auth%2Fcas%2Fhbut%2Findex"
        ));
        // 回归：unified-auth 是超星统一授权入口，登录成功后也会经过，绝不能判成登录页
        assert!(!is_login_page_url(
            "https://unified-auth.chaoxing.com/login_auth/hbut/init?refer="
        ));
        // 正常业务页不是登录页
        assert!(!is_login_page_url(
            "https://reserve.chaoxing.com/front/web/apps/reservepc/index"
        ));
        assert!(!is_login_page_url(
            "https://v1.chaoxing.com/mobileSet/redirectUrlMobile?mAppId=1"
        ));

        // 正文特征：超星登录页 / 学校 CAS 页
        assert!(looks_like_login_body(
            "<html><title>账号登录</title></html>"
        ));
        assert!(looks_like_login_body("<div>统一身份认证</div>"));
        assert!(looks_like_login_body(
            "<form action=\"/authserver/login;jsessionid=1\"></form>"
        ));
        assert!(!looks_like_login_body(
            "<html><title>座位预约</title></html>"
        ));

        // 实测修正：超星「应用未找到」文案是**凭证缺失/失效**，不再判无权限
        assert!(!looks_like_no_permission(
            500,
            "未查询到您所访问的应用，请咨询管理员配置是否正确"
        ));
        assert!(looks_like_credential_invalid(
            500,
            "未查询到您所访问的应用，请咨询管理员配置是否正确"
        ));
        // 403 不再无条件判无权限：正文无特征词 → 不是无权限
        assert!(!looks_like_no_permission(403, ""));
        // 403 且正文命中权限特征词 → 仍判无权限
        assert!(looks_like_no_permission(403, "<div>无权限</div>"));
        assert!(!looks_like_no_permission(
            200,
            "{\"data\":{\"seatConfig\":{}}}"
        ));
        // 短错误页上的弱特征可识别
        assert!(looks_like_no_permission(200, "<div>无权限</div>"));
        // 体量大的正常业务页内联出现「未授权」不误判
        let big_page = format!("<html>{}未授权</html>", "x".repeat(4000));
        assert!(!looks_like_no_permission(200, &big_page));
    }

    #[test]
    fn credential_invalid_detection_requires_explicit_json_failure() {
        // 实测的失败响应（HTTP 200）→ 判凭证缺失
        assert!(looks_like_credential_invalid(
            200,
            r#"{"msg":"未查询到您所访问的应用，请咨询管理员配置是否正确","success":false}"#
        ));
        assert!(looks_like_credential_invalid(
            200,
            r#"{"success":false,"msg":"应用不存在"}"#
        ));
        // 成功 JSON 里出现同名字符串（如 seat/i18n 全量文案）**不得**误判
        assert!(!looks_like_credential_invalid(
            200,
            r#"{"i18n":{"appNotFound":"应用不存在","tip":"未查询到您所访问的应用"}}"#
        ));
        assert!(!looks_like_credential_invalid(
            200,
            r#"{"success":true,"data":{"msg":"应用不存在"}}"#
        ));
        // 无特征词 → 不判
        assert!(!looks_like_credential_invalid(200, r#"{"success":false}"#));
        // 非 JSON 错误页：短正文 / HTTP 错误码命中
        assert!(looks_like_credential_invalid(500, "<div>应用不存在</div>"));
        assert!(looks_like_credential_invalid(400, "未查询到您所访问的应用"));
        // 非 JSON 且体量大、非错误码 → 不判（避免误伤正常页面）
        let big = format!("<html>{}应用不存在</html>", "x".repeat(4000));
        assert!(!looks_like_credential_invalid(200, &big));
    }

    #[test]
    fn json_error_message_reads_failure_payload() {
        assert_eq!(
            json_error_message("{\"success\":false,\"msg\":\"应用不存在\"}").as_deref(),
            Some("应用不存在")
        );
        assert_eq!(json_error_message("{\"success\":true}"), None);
        assert_eq!(json_error_message("<html></html>"), None);
    }

    // ── P0-2：落地页服务端注入参数提取（座位 / PC 共用） ──

    #[test]
    fn extract_page_value_handles_js_json_and_query() {
        // 勘察原文形态：serverNow = new Date('...')
        let html = "serverNow = new Date('2026-10-15T23:31:03.073+08:00'), \
                    currentServerTime = seatBaseUtils.createServerClock(serverNow);";
        assert_eq!(
            extract_page_value(html, PAGE_KEY_SERVER_NOW).as_deref(),
            Some("2026-10-15T23:31:03.073+08:00")
        );

        // 直接赋值（单 / 双引号）
        assert_eq!(
            extract_page_value(
                "var seatIdEnc = \"b146028eafa4eea9\";",
                PAGE_KEY_SEAT_ID_ENC
            )
            .as_deref(),
            Some("b146028eafa4eea9")
        );
        // 实测原文形态（静音仓页）：reserveIdEnc: '838c48dae07db28c'
        assert_eq!(
            extract_page_value(
                "reserveIdEnc: '838c48dae07db28c', fidEnc: fidEnc",
                PAGE_KEY_RESERVE_ID_ENC
            )
            .as_deref(),
            Some("838c48dae07db28c")
        );

        // JSON 字段形态
        assert_eq!(
            extract_page_value(
                r#"{"seatIdEnc":"abc123","other":"x"}"#,
                PAGE_KEY_SEAT_ID_ENC
            )
            .as_deref(),
            Some("abc123")
        );

        // URL query 里的裸值
        assert_eq!(
            extract_page_value(
                "url + '/front/apps/seatengine/index?seatId=3597&seatIdEnc=deadbeef'",
                PAGE_KEY_SEAT_ID_ENC
            )
            .as_deref(),
            Some("deadbeef")
        );

        // 键不存在 / 值为空 → None（不得把相邻的无关引号串当值）
        assert_eq!(
            extract_page_value("<html></html>", PAGE_KEY_SEAT_ID_ENC),
            None
        );
        assert_eq!(
            extract_page_value("seatIdEnc = ''", PAGE_KEY_SEAT_ID_ENC),
            None
        );
        assert_eq!(
            extract_page_value("seatIdEnc = null, other: \"bar\"", PAGE_KEY_SEAT_ID_ENC),
            None
        );
    }

    #[test]
    fn page_injected_hints_get_by_key() {
        let mut values = BTreeMap::new();
        values.insert(PAGE_KEY_RESERVE_ID_ENC.to_string(), "838c".to_string());
        let hints = PageInjectedHints { values };
        assert_eq!(
            hints.get(PAGE_KEY_RESERVE_ID_ENC),
            Some("838c"),
            "按 key 取值"
        );
        assert_eq!(hints.get(PAGE_KEY_SEAT_ID_ENC), None, "未提取的键为 None");
    }

    #[test]
    fn extract_next_hop_handles_meta_and_js() {
        let meta = r#"<html><head><meta http-equiv="refresh" content="0;url=https://auth.chaoxing.com/connect/oauth2/authorize?appid=1&amp;redirect_uri=https%3A%2F%2Freserve.chaoxing.com%2Fx"></head></html>"#;
        let hop = extract_next_hop_from_body(meta).expect("meta 跳转可解析");
        assert!(hop.starts_with("https://auth.chaoxing.com/connect/oauth2/authorize"));
        assert!(hop.contains("&redirect_uri="), "HTML 实体应被解码：{hop}");

        let js = r#"<script>window.location.href = 'https://auth.chaoxing.com/connect/oauth2/authorize?appid=1';</script>"#;
        assert_eq!(
            extract_next_hop_from_body(js).as_deref(),
            Some("https://auth.chaoxing.com/connect/oauth2/authorize?appid=1")
        );

        // 普通业务页不应被误判为跳转
        assert_eq!(
            extract_next_hop_from_body("<div class=\"seat_index\">座位预约</div>"),
            None
        );
    }

    #[test]
    fn network_error_heuristic_does_not_misfire_on_chaoxing_wording() {
        assert!(looks_like_network_error(
            "error sending request for url (https://passport2.chaoxing.com/)"
        ));
        assert!(looks_like_network_error("operation timed out"));
        // 超星登录态提示语里含「（不是断网）」，不能被判成网络故障
        assert!(!looks_like_network_error(
            "门户未登录或会话已失效，且无法静默续期。请重新登录融合门户（不是断网）"
        ));
        assert!(!looks_like_network_error(
            "CAS→学习通桥接失败。请重新登录融合门户后重试"
        ));
    }

    #[test]
    fn error_kinds_are_distinguishable() {
        let n = LibraryReserveError::not_logged_in("x");
        assert_eq!(n.kind, ERR_CHAOXING_NOT_LOGGED_IN);
        assert!(n.can_relogin);
        let p = LibraryReserveError::no_permission("x");
        assert_eq!(p.kind, ERR_NO_PERMISSION);
        assert!(!p.can_relogin);
        // 凭证缺失 / 失效：与无权限严格区分，且可重试
        let cred = LibraryReserveError::credential_invalid("x");
        assert_eq!(cred.kind, ERR_CREDENTIAL_INVALID);
        assert!(cred.can_relogin);
        assert_ne!(cred.kind, ERR_NO_PERMISSION);
        let net = LibraryReserveError::network_unreachable("x");
        assert_eq!(net.kind, ERR_NETWORK_UNREACHABLE);
        let bad = LibraryReserveError::invalid_app("x");
        assert_eq!(bad.kind, ERR_INVALID_APP);
        let un = LibraryReserveError::unexpected(
            "x",
            &[
                "https://v1.chaoxing.com/a?enc=1".into(),
                "https://reserve.chaoxing.com/b".into(),
            ],
        );
        assert_eq!(un.kind, ERR_UNEXPECTED_RESPONSE);
        // detail 已脱敏：只保留 scheme://host/path
        assert_eq!(
            un.detail.as_deref(),
            Some("https://v1.chaoxing.com/a -> https://reserve.chaoxing.com/b")
        );
        // 业务失败：kind 由调用方指定，且「重新登录」无意义
        let biz = LibraryReserveError::business("slot_unavailable", "该时段已被预约");
        assert_eq!(biz.kind, "slot_unavailable");
        assert!(!biz.can_relogin);
        assert!(biz.detail.is_none());
        // 序列化后前端可按 kind 分支
        let v = serde_json::to_value(&n).expect("可序列化");
        assert_eq!(
            v.get("kind").and_then(|k| k.as_str()),
            Some(ERR_CHAOXING_NOT_LOGGED_IN)
        );
    }

    // ── 通用 JSON 取值工具（#1053 / #1054 共用） ──

    #[test]
    fn value_helpers_handle_string_numbers_and_bools() {
        let v: Value = serde_json::json!({"a": "12", "b": 3.9, "c": "true", "d": "  ", "e": true});
        assert_eq!(value_i64(&v, &["a"]), Some(12));
        assert_eq!(value_i64(&v, &["b"]), Some(3));
        assert_eq!(value_bool(&v, &["c"]), Some(true));
        assert_eq!(value_string(&v, &["d"]), None, "空白串视为缺失");
        assert_eq!(value_bool(&v, &["e"]), Some(true));
        assert_eq!(value_i64(&v, &["missing", "a"]), Some(12), "按候选顺序回退");
    }

    #[test]
    fn encode_form_percent_encodes_values() {
        let mut p = BTreeMap::new();
        p.insert("fidEnc".to_string(), "c7450f13f8a0e9ab".to_string());
        p.insert("startTime".to_string(), "2026-10-16 08:00".to_string());
        let body = encode_form(&p);
        // BTreeMap 顺序稳定：fidEnc 在前；空格按表单规范编成 `+`
        assert_eq!(body, "fidEnc=c7450f13f8a0e9ab&startTime=2026-10-16+08%3A00");

        // 值里本身含字面 "%20" 时不能被误替换
        assert_eq!(form_encode("a%20b"), "a%2520b");
        assert_eq!(form_encode("张三"), "%E5%BC%A0%E4%B8%89");
    }

    // ── 业务失败分类（#1053 / #1054 共用） ──

    #[test]
    fn business_failure_classification_covers_three_kinds() {
        // 时段被占
        let e = classify_business_failure("该时段已被预约，请选择其它时段", "提交预约");
        assert_eq!(e.kind, ERR_SLOT_UNAVAILABLE);
        assert!(!e.can_relogin);

        let e = classify_business_failure("所选房间已被占用", "提交预约");
        assert_eq!(e.kind, ERR_SLOT_UNAVAILABLE);

        // 超限
        let e = classify_business_failure("预约时长超出单次限制", "提交预约");
        assert_eq!(e.kind, ERR_RESERVE_LIMIT);

        let e = classify_business_failure("您今日预约次数已达上限", "提交预约");
        assert_eq!(e.kind, ERR_RESERVE_LIMIT);

        // 违约停用（同时含「违约」「次数」，必须归为停用而非超限）
        let e = classify_business_failure("7天内违约3次，预约功能已被暂停", "提交预约");
        assert_eq!(e.kind, ERR_RESERVE_SUSPENDED);

        let e = classify_business_failure("您的账号已被限制预约", "提交预约");
        assert_eq!(e.kind, ERR_RESERVE_SUSPENDED);

        // 兜底
        let e = classify_business_failure("参数不正确", "提交预约");
        assert_eq!(e.kind, ERR_BUSINESS_REJECTED);
        assert!(e.message.contains("提交预约失败"));
    }

    #[test]
    fn business_failure_detects_login_expiry_and_network_is_separate() {
        let e = classify_business_failure("未登录或登录已失效", "提交预约");
        assert_eq!(e.kind, ERR_CHAOXING_NOT_LOGGED_IN);
        assert!(e.can_relogin, "登录态问题应可重新登录修复");

        // 网络失败由传输层产生，与业务失败 kind 不同
        let net = LibraryReserveError::network_unreachable("连接超时");
        assert_eq!(net.kind, ERR_NETWORK_UNREACHABLE);
        assert_ne!(net.kind, ERR_SLOT_UNAVAILABLE);
        assert!(!net.can_relogin);
    }

    #[test]
    fn api_data_distinguishes_success_and_business_failure() {
        // 成功：取 data
        let ok: Value = serde_json::json!({"success": true, "data": {"a": 1}});
        assert_eq!(
            api_data(&ok, "x")
                .expect("成功")
                .get("a")
                .and_then(as_i64_loose),
            Some(1)
        );

        // success:false → 业务失败（带 kind）
        let fail: Value = serde_json::json!({"success": false, "msg": "该时段已被预约"});
        let err = api_data(&fail, "提交预约").expect_err("应失败");
        assert_eq!(err.kind, ERR_SLOT_UNAVAILABLE);

        // 非 0 业务码同样归类
        let coded: Value = serde_json::json!({"code": 500, "message": "超出预约限额"});
        let err = api_data(&coded, "提交预约").expect_err("应失败");
        assert_eq!(err.kind, ERR_RESERVE_LIMIT);

        // code=200 视为成功
        let coded_ok: Value = serde_json::json!({"code": 200, "data": {"b": 2}});
        assert!(api_data(&coded_ok, "x").is_ok());

        // 无 success / code 字段（如某些查询接口）视为成功
        let plain: Value = serde_json::json!({"data": {"c": 3}});
        assert!(api_data(&plain, "x").is_ok());

        // 不套 data 包装的接口：原样返回整个响应，不丢信息
        let bare: Value = serde_json::json!({"showStyle": "0"});
        let out = api_data(&bare, "x").expect("成功");
        assert_eq!(out.get("showStyle").and_then(|v| v.as_str()), Some("0"));

        // success 为字符串 "false" 也要识别
        let str_fail: Value = serde_json::json!({"success": "false", "msg": "已被预定"});
        let err = api_data(&str_fail, "提交预约").expect_err("应失败");
        assert_eq!(err.kind, ERR_SLOT_UNAVAILABLE);
    }

    // ── P1-4：诊断链脱敏（detail 不得携带凭证） ──

    #[test]
    fn error_detail_strips_credentials_from_chain() {
        let chain = vec![
            "https://v1.chaoxing.com/mobileSet/redirectUrlMobile?mAppId=19248837".to_string(),
            "https://auth.chaoxing.com/connect/oauth2/authorize?appid=abc&redirect_uri=https%3A%2F%2Freserve.chaoxing.com%2Fx%3Fenc%3DENCSECRET%26uid%3D406591160".to_string(),
            "https://reserve.chaoxing.com/front/apps/seatengine/index?seatId=3597&enc=ENCSECRET&fidEnc=FIDSECRET&code=CODESECRET&state=25285&mappIdEnc=MAPPSECRET".to_string(),
        ];
        let err = LibraryReserveError::unexpected("入口未落到预约系统", &chain);
        // 先序列化（模拟经 IPC 交给前端的实际形态），再取 detail 做断言
        let json = serde_json::to_string(&err).expect("可序列化");
        let detail = err.detail.expect("应带诊断链");

        // 凭证一律不得出现（query 全丢）
        for secret in [
            "ENCSECRET",
            "FIDSECRET",
            "CODESECRET",
            "MAPPSECRET",
            "406591160",
        ] {
            assert!(
                !detail.contains(secret),
                "detail 泄漏凭证 {secret}：{detail}"
            );
        }
        assert!(!detail.contains("enc="));
        assert!(!detail.contains("uid="));
        assert!(!detail.contains('?'));

        // 诊断能力保留：host + path 足以定位「跳到哪个系统」
        assert!(detail.contains("https://v1.chaoxing.com/mobileSet/redirectUrlMobile"));
        assert!(detail.contains("https://auth.chaoxing.com/connect/oauth2/authorize"));
        assert!(detail.contains("https://reserve.chaoxing.com/front/apps/seatengine/index"));
        assert_eq!(detail.split(" -> ").count(), 3);

        // 序列化后经 IPC 交给前端时同样不含凭证
        assert!(!json.contains("ENCSECRET"));
        assert!(!json.contains("FIDSECRET"));
        assert!(json.contains("reserve.chaoxing.com/front/apps/seatengine/index"));
    }

    #[test]
    fn sanitize_url_keeps_scheme_host_path_only() {
        assert_eq!(
            sanitize_url(
                "https://reserve.chaoxing.com/front/apps/seatengine/index?enc=S&uid=1#frag"
            ),
            "https://reserve.chaoxing.com/front/apps/seatengine/index"
        );
        assert_eq!(
            sanitize_url("https://auth.chaoxing.com"),
            "https://auth.chaoxing.com/"
        );
        // 解析失败时不回显原串（畸形文本同样可能含凭证）
        assert_eq!(sanitize_url("not a url"), "<无法解析的地址>");
    }

    // ── P1-2：JSON 正文不参与登录页正文启发式 ──

    #[test]
    fn json_body_is_not_treated_as_login_page() {
        // `seat/i18n` 是「全量文案（含业务提示语）」，含「账号登录」等标记也不能判未登录
        assert!(!looks_like_login_page_body(
            r#"{"i18n":{"loginBtn":"账号登录","smsBtn":"短信登录"}}"#
        ));
        assert!(!looks_like_login_page_body(
            r#"{"msg":"请使用账号登录后重试"}"#
        ));
        assert!(!looks_like_login_page_body(r#"[{"text":"统一身份认证"}]"#));

        // HTML 登录页仍必须判出来（CAS / 超星登录页）
        assert!(looks_like_login_page_body(
            "<html><title>账号登录</title></html>"
        ));
        assert!(looks_like_login_page_body(
            "<!DOCTYPE html><form action=\"/authserver/login\"></form>"
        ));
        // 普通业务 HTML 页不误判
        assert!(!looks_like_login_page_body(
            "<html><title>座位预约</title></html>"
        ));

        // 底层标记函数行为不变：HTML 场景仍按它判定
        assert!(looks_like_login_body(r#"{"msg":"账号登录"}"#));
        // JSON 识别
        assert!(looks_like_json_body(r#"{"a":1}"#));
        assert!(looks_like_json_body("[]"));
        assert!(looks_like_json_body("  {\"a\":1}  "));
        assert!(!looks_like_json_body("<html></html>"));
        assert!(!looks_like_json_body(""));
    }

    // ── P1-1：入口 {"success":false} 必须分登录 / 权限 ──

    #[test]
    fn entry_json_failure_separates_login_from_permission() {
        // 登录态类提示语 → 未登录（可重新登录修复）
        for msg in [
            "未登录",
            "请登录后访问",
            "登录失效",
            "登录已失效",
            "请重新登录",
            "会话已失效",
        ] {
            let e = classify_entry_json_failure(msg);
            assert_eq!(e.kind, ERR_CHAOXING_NOT_LOGGED_IN, "msg={msg}");
            assert!(e.can_relogin, "msg={msg} 应可通过重新登录修复");
        }
        // 真正的权限类提示语 → 无权限（重新登录无用）
        for msg in ["无权限访问", "没有权限使用该应用"] {
            let e = classify_entry_json_failure(msg);
            assert_eq!(e.kind, ERR_NO_PERMISSION, "msg={msg}");
            assert!(!e.can_relogin, "msg={msg}");
        }
        // 实测修正：「应用未找到」是凭证缺失 / 失效（可重试），**不是**无权限
        for msg in ["应用不存在", "未查询到您所访问的应用"] {
            let e = classify_entry_json_failure(msg);
            assert_eq!(e.kind, ERR_CREDENTIAL_INVALID, "msg={msg}");
            assert!(e.can_relogin, "msg={msg} 应可重新登录 / 重试");
        }
        // 空提示语兜底为无权限，不 panic
        assert_eq!(classify_entry_json_failure("  ").kind, ERR_NO_PERMISSION);
    }

    // ── P1-3：写操作必须拿到显式成功信号 ──

    #[test]
    fn api_write_result_requires_explicit_success() {
        // ① {} —— 无任何成功标志：绝不能判成功
        let e = api_write_result(&serde_json::json!({}), "提交预约").expect_err("不得默认成功");
        assert_eq!(e.kind, ERR_UNEXPECTED_RESPONSE);
        assert!(!e.can_relogin);
        assert!(e.message.contains("提交预约"));
        assert!(e.message.contains("未返回明确的成功标志"), "{}", e.message);

        // ② {"msg":"..."} —— 服务端用提示语表达拒绝（如时段被占），同样不能判成功
        let e = api_write_result(&serde_json::json!({"msg": "该时段已被预约"}), "提交预约")
            .expect_err("不得默认成功");
        assert_eq!(e.kind, ERR_UNEXPECTED_RESPONSE);
        // {"result":false} 形态同理
        let e = api_write_result(&serde_json::json!({"result": false}), "取消预约")
            .expect_err("不得默认成功");
        assert_eq!(e.kind, ERR_UNEXPECTED_RESPONSE);

        // ③ {"success":true} —— 合法成功形态，必须判成功（不得引入成功误判为失败的回归）
        let ok = api_write_result(&serde_json::json!({"success": true}), "提交预约").expect("成功");
        assert_eq!(ok.raw.get("success").and_then(|v| v.as_bool()), Some(true));
        assert!(ok.message.is_none());

        // ④ {"code":0} —— 合法成功形态；code=200 / 数字字符串 / success:"true" 同样算成功
        assert!(api_write_result(&serde_json::json!({"code": 0}), "提交预约").is_ok());
        assert!(api_write_result(&serde_json::json!({"code": 200}), "提交预约").is_ok());
        assert!(api_write_result(&serde_json::json!({"code": "0"}), "提交预约").is_ok());
        assert!(api_write_result(&serde_json::json!({"success": "true"}), "提交预约").is_ok());

        // ⑤ {"success":false} —— 显式失败 → 业务 kind
        let e = api_write_result(&serde_json::json!({"success": false}), "提交预约")
            .expect_err("应失败");
        assert_eq!(e.kind, ERR_BUSINESS_REJECTED);

        // ⑥ {"code":500} —— 显式失败 → 业务 kind
        let e =
            api_write_result(&serde_json::json!({"code": 500}), "提交预约").expect_err("应失败");
        assert_eq!(e.kind, ERR_BUSINESS_REJECTED);
    }

    #[test]
    fn api_write_result_keeps_business_classification_and_raw() {
        // 显式失败仍走业务分类（时段被占 / 超限 / 登录失效）
        let e = api_write_result(
            &serde_json::json!({"success": false, "msg": "该时段已被预约"}),
            "提交预约",
        )
        .expect_err("应失败");
        assert_eq!(e.kind, ERR_SLOT_UNAVAILABLE);

        let e = api_write_result(
            &serde_json::json!({"code": 500, "message": "超出预约限额"}),
            "提交预约",
        )
        .expect_err("应失败");
        assert_eq!(e.kind, ERR_RESERVE_LIMIT);

        let e = api_write_result(
            &serde_json::json!({"success": false, "msg": "未登录或登录已失效"}),
            "提交预约",
        )
        .expect_err("应失败");
        assert_eq!(e.kind, ERR_CHAOXING_NOT_LOGGED_IN);
        assert!(e.can_relogin);

        // 成功时返回 data + message + raw（raw 供联调）
        let ok = api_write_result(
            &serde_json::json!({"success": true, "msg": "预约成功", "data": {"aprvId": 42}}),
            "提交预约",
        )
        .expect("成功");
        assert_eq!(ok.data.get("aprvId").and_then(as_i64_loose), Some(42));
        assert_eq!(ok.message.as_deref(), Some("预约成功"));
        assert_eq!(ok.raw.get("success").and_then(|v| v.as_bool()), Some(true));

        // 无 data 包装时原样返回整个响应（不丢信息）
        let ok = api_write_result(
            &serde_json::json!({"success": true, "result": 1}),
            "提交预约",
        )
        .expect("成功");
        assert_eq!(ok.data.get("result").and_then(as_i64_loose), Some(1));

        // 「结果未知」提示用户去核对，而不是重试（重试可能造成重复预约）
        let e = api_write_result(&serde_json::json!({}), "取消预约").expect_err("应失败");
        assert!(e.message.contains("核对"), "{}", e.message);
    }

    #[test]
    fn read_path_stays_lenient_while_write_path_is_strict() {
        // 读操作（api_data）保持宽松：无 success / code 也视为成功，避免误伤查询接口
        let plain = serde_json::json!({"data": {"c": 3}});
        assert!(api_data(&plain, "获取时段").is_ok());
        let bare = serde_json::json!({"showStyle": "0"});
        assert!(api_data(&bare, "获取视图标记").is_ok());
        // 写操作（api_write_result）对同一形态必须报「结果未知」
        assert_eq!(
            api_write_result(&bare, "提交预约").unwrap_err().kind,
            ERR_UNEXPECTED_RESPONSE
        );

        // 显式失败 / 显式成功：两条路径判定一致（只是写路径更严）
        let fail = serde_json::json!({"success": false, "msg": "已被预定"});
        assert_eq!(
            api_data(&fail, "x").unwrap_err().kind,
            api_write_result(&fail, "x").unwrap_err().kind
        );
        let ok = serde_json::json!({"success": true, "data": {"a": 1}});
        assert!(api_data(&ok, "x").is_ok());
        assert!(api_write_result(&ok, "x").is_ok());
    }
}
