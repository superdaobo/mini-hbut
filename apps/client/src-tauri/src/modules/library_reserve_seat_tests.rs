#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::library_reserve::{
        LibraryReserveCredentials, ERR_BUSINESS_REJECTED, ERR_INVALID_APP, ERR_INVALID_PARAMS,
        ERR_UNEXPECTED_RESPONSE,
    };

    /// 构造一个最小可用的入口解析结果（仅测试用）
    fn make_entry(
        app: LibraryApp,
        seat_id_enc: Option<&str>,
        seat_id: Option<&str>,
    ) -> LibraryAppEntry {
        let (business_key, business_value) = app.business_id();
        LibraryAppEntry {
            app: app.key().to_string(),
            app_name: app.name().to_string(),
            m_app_id: app.m_app_id().to_string(),
            entry_url: "https://reserve.chaoxing.com/front/apps/seatengine/index?seatId=3597"
                .to_string(),
            system_base: "https://reserve.chaoxing.com".to_string(),
            system_path: app.system_path().to_string(),
            api_base: RESERVE_API_BASE.to_string(),
            business_key: business_key.to_string(),
            business_value: business_value.to_string(),
            credentials: LibraryReserveCredentials {
                seat_id_enc: seat_id_enc.map(str::to_string),
                seat_id: seat_id.map(str::to_string),
                ..Default::default()
            },
            params: BTreeMap::new(),
            contract_match: true,
            redirect_chain: Vec::new(),
            resolved_at_ms: 0,
            hint: String::new(),
        }
    }

    fn seat_context(seat_id_enc: Option<&str>) -> SeatContext {
        SeatContext::from_entry(
            LibraryApp::Seat,
            &make_entry(LibraryApp::Seat, seat_id_enc, None),
        )
        .expect("可构造")
    }

    /// 指定 deptIdEnc 的座位上下文（第二轮勘察新增参数）
    fn seat_context_with_dept(seat_id_enc: Option<&str>, dept_id_enc: Option<&str>) -> SeatContext {
        let mut entry = make_entry(LibraryApp::Seat, seat_id_enc, None);
        entry.credentials.dept_id_enc = dept_id_enc.map(str::to_string);
        SeatContext::from_entry(LibraryApp::Seat, &entry).expect("可构造")
    }

    // ── 上下文与保护 ──

    #[test]
    fn context_extracts_credentials_and_rejects_other_apps() {
        let ctx = seat_context(Some("b146028eafa4eea9"));
        assert_eq!(ctx.seat_id, "3597");
        assert_eq!(ctx.seat_id_enc.as_deref(), Some("b146028eafa4eea9"));
        assert_eq!(ctx.mapp_id, "19248837");

        // 入口链路带上 seatId 时以实时值为准
        let entry = make_entry(LibraryApp::Seat, None, Some(" 3597 "));
        let ctx = SeatContext::from_entry(LibraryApp::Seat, &entry).expect("可构造");
        assert_eq!(ctx.seat_id, "3597");

        // 静音仓 / 研讨室不属于本模块（seatengine）
        for app in [LibraryApp::QuietRoom, LibraryApp::SeminarRoom] {
            let entry = make_entry(app, Some("E"), None);
            let err = SeatContext::from_entry(app, &entry).expect_err("应拒绝非座位预约");
            assert_eq!(err.kind, ERR_INVALID_APP);
        }
    }

    #[test]
    fn context_keeps_seat_id_enc_optional() {
        // seatIdEnc 缺失不阻断：仍可构造，只是不带该参数
        let ctx = seat_context(None);
        assert!(ctx.seat_id_enc.is_none());
        assert!(!index_params(&ctx).contains_key("seatIdEnc"));
        assert_eq!(ctx.seat_id, "3597");
    }

    #[test]
    fn missing_seat_id_enc_is_noted_in_diagnostics_only() {
        let ctx = seat_context(None);

        // 缺失 seatIdEnc：补充诊断，但**不改变** kind 与用户可见 message
        let err = note_missing_seat_id_enc(
            LibraryReserveError::business("business_rejected", "获取座位预约配置失败：参数错误"),
            &ctx,
        );
        assert_eq!(err.kind, "business_rejected");
        assert!(err.message.contains("参数错误"));
        assert!(
            !err.message.contains("seatIdEnc"),
            "用户提示不应被诊断信息污染：{}",
            err.message
        );
        assert!(err
            .detail
            .as_deref()
            .unwrap_or_default()
            .contains("seatIdEnc"));

        // 已有 detail（如跳转链）时追加而非覆盖
        // ⚠️ detail 已脱敏为 scheme://host/path，故此处用真实 URL 断言追加语义
        let err = note_missing_seat_id_enc(
            LibraryReserveError::unexpected(
                "x",
                &[
                    "https://v1.chaoxing.com/a?enc=1".into(),
                    "https://reserve.chaoxing.com/b".into(),
                ],
            ),
            &ctx,
        );
        let detail = err.detail.unwrap_or_default();
        assert!(
            detail.starts_with("https://v1.chaoxing.com/a -> https://reserve.chaoxing.com/b"),
            "原诊断不能被丢弃：{detail}"
        );
        assert!(detail.contains("seatIdEnc"));

        // 已拿到 seatIdEnc 时不做任何附加
        let err = note_missing_seat_id_enc(
            LibraryReserveError::business("business_rejected", "x"),
            &seat_context(Some("ENC")),
        );
        assert!(err.detail.is_none());
    }

    // ── 请求体构造（与实测契约逐字段对齐） ──

    #[test]
    fn index_params_match_contract() {
        let ctx = seat_context(Some("b146028eafa4eea9"));
        let p = index_params(&ctx);
        assert_eq!(p.get("seatId").map(String::as_str), Some("3597"));
        assert_eq!(
            p.get("seatIdEnc").map(String::as_str),
            Some("b146028eafa4eea9")
        );
        assert_eq!(p.len(), 2, "index 接口不应多带参数：{p:?}");
        assert!(!p.contains_key("fidEnc"), "实测契约未携带 fidEnc");
    }

    #[test]
    fn identity_verify_params_match_contract() {
        let ctx = seat_context(Some("ENC"));
        let p = identity_verify_params(&ctx);
        assert_eq!(p.get("mappId").map(String::as_str), Some("19248837"));
        assert_eq!(p.get("seatId").map(String::as_str), Some("3597"));
        assert_eq!(p.get("seatIdEnc").map(String::as_str), Some("ENC"));
        assert_eq!(p.len(), 3);

        // 缺 seatIdEnc 时只带两个参数
        let p = identity_verify_params(&seat_context(None));
        assert_eq!(p.len(), 2);
        assert!(!p.contains_key("seatIdEnc"));
    }

    #[test]
    fn entrance_config_params_match_contract() {
        let ctx = seat_context(None);
        let p = entrance_config_params(&ctx);
        // 实测：appType=2&appId=3597
        assert_eq!(p.get("appType").map(String::as_str), Some("2"));
        assert_eq!(p.get("appId").map(String::as_str), Some("3597"));
        assert_eq!(p.len(), 2, "入口配置接口不应多带参数：{p:?}");
    }

    #[test]
    fn endpoints_match_recon_contract() {
        // 防止重构时误改路径（契约文档 01-api-contract.md / 03-seat-availability-and-quick-reserve.md）
        assert_eq!(ENDPOINT_I18N, "seat/i18n");
        assert_eq!(ENDPOINT_ENTRANCE_CONFIG, "seat/entrance/config");
        assert_eq!(ENDPOINT_SEAT_INDEX, "seatengine/index");
        assert_eq!(ENDPOINT_IDENTITY_VERIFY, "seatengine/identity/verify");
        // 第二轮勘察（实测）新增的 POST 端点
        assert_eq!(ENDPOINT_ROOM_LIST, "seatengine/room/list");
        assert_eq!(ENDPOINT_LEVELS, "seatengine/levels");
        assert_eq!(ENDPOINT_START_END_TIME, "seatengine/getstartendtime");
        assert_eq!(ENDPOINT_GET_SEAT_INFO, "seatengine/getseatinfo");
        // 快速预约链路（实测）：验证码 + 提交 + 快速预约页
        assert_eq!(ENDPOINT_CAPTCHA, "seat/captcha");
        assert_eq!(ENDPOINT_SUBMIT, "seatengine/submit");
        assert_eq!(SEAT_LIVE_SELECT_PATH, "/front/apps/seatengine/live/select");
        assert_eq!(ENTRANCE_APP_TYPE, "2");
        // 层级常量与契约 `type: 0|1|2` 对齐
        assert_eq!(
            [LEVEL_TYPE_FIRST, LEVEL_TYPE_SECOND, LEVEL_TYPE_THIRD],
            [0, 1, 2]
        );
        // 基址以 / 结尾，路径不得以 / 开头（否则拼接出错）
        for p in [
            ENDPOINT_I18N,
            ENDPOINT_ENTRANCE_CONFIG,
            ENDPOINT_SEAT_INDEX,
            ENDPOINT_IDENTITY_VERIFY,
            ENDPOINT_ROOM_LIST,
            ENDPOINT_LEVELS,
            ENDPOINT_START_END_TIME,
            ENDPOINT_GET_SEAT_INFO,
            ENDPOINT_CAPTCHA,
            ENDPOINT_SUBMIT,
        ] {
            assert!(!p.starts_with('/'), "路径不应以 / 开头：{p}");
        }
        assert!(RESERVE_API_BASE.ends_with('/'));
        // 座位预约 Referer 是 seatengine 页面，不得混入 reservepc
        assert!(!SEAT_REFERER.ends_with("reservepc/index"));
        assert!(SEAT_REFERER.contains("seatengine"));
    }

    // ── 页面注入参数提取（能力已上提到 library_reserve，提取测试随迁） ──

    #[test]
    fn plausible_server_time_rejects_slot_strings() {
        assert!(plausible_server_time("2026-10-15T23:31:03.073+08:00"));
        assert!(plausible_server_time("1760542263000"));
        assert!(plausible_server_time("1760542263"));
        assert!(plausible_server_time("2026/10/15 23:31"));
        // 时段值不能被当成时间
        assert!(!plausible_server_time("08:00"));
        assert!(!plausible_server_time("22:00"));
        assert!(!plausible_server_time(""));
        assert!(!plausible_server_time("123"));
    }

    // ── 响应解析 ──

    /// issue #1054 实测表给出的关键配置样本
    fn recon_seat_config() -> Value {
        serde_json::json!({
            "id": 3597, "deptId": 25285, "name": "座位预约", "appType": 0,
            "reserveBeforeDay": 1, "reserveBeforeTime": "08:00",
            "reserveDuration": 4, "reserveNumLimit": 1,
            "violateTimes": 3, "violationLimitDay": 7, "violationLimitDuration": 3,
            "superviseNum": 2, "superviseDuration": 10, "timeUnit": 60,
            "onlySupportsApiSignIn": true,
            "commonTimeConfig": {
                "monStartTime": "08:00", "monEndTime": "22:00",
                "tueStartTime": "08:00", "tueEndTime": "22:00"
            },
            "noticeName": "试运规则说明",
            "noticeContent": "<p>1. 遵守图书馆座位使用规则……</p>"
        })
    }

    #[test]
    fn seat_config_parses_recon_fields() {
        let cfg = SeatConfigView::from_value(&recon_seat_config());
        assert_eq!(cfg.seat_id, Some(3597));
        assert_eq!(cfg.dept_id, Some(25285));
        assert_eq!(cfg.name.as_deref(), Some("座位预约"));
        assert_eq!(cfg.app_type, Some(0));
        // 放号规则
        assert_eq!(cfg.reserve_before_day, Some(1));
        assert_eq!(cfg.reserve_before_time.as_deref(), Some("08:00"));
        // 时长与限额
        assert_eq!(cfg.reserve_duration, Some(4));
        assert_eq!(cfg.reserve_num_limit, Some(1));
        assert_eq!(cfg.time_unit, Some(60));
        // 违约规则
        assert_eq!(cfg.violate_times, Some(3));
        assert_eq!(cfg.violation_limit_day, Some(7));
        assert_eq!(cfg.violation_limit_duration, Some(3));
        assert_eq!(cfg.supervise_num, Some(2));
        assert_eq!(cfg.supervise_duration, Some(10));
        // 规则原文
        assert_eq!(cfg.notice_name.as_deref(), Some("试运规则说明"));
        assert!(
            cfg.notice_content
                .as_deref()
                .unwrap_or_default()
                .contains("座位使用规则"),
            "规则原文必须原样透传"
        );
        // 签到能力开关
        assert_eq!(cfg.only_supports_api_sign_in, Some(true));
        // 开放时段
        let time = cfg.common_time_config.expect("应解析开放时段");
        assert_eq!(time.days.len(), 2);
        assert_eq!(time.days[0].day, "周一");
        assert_eq!(time.days[0].start.as_deref(), Some("08:00"));
        assert_eq!(time.days[0].end.as_deref(), Some("22:00"));
        assert_eq!(time.days[1].day, "周二");
        // 未建模字段仍保留在 raw 中
        assert_eq!(
            time.raw.get("monEndTime").and_then(|v| v.as_str()),
            Some("22:00")
        );
        assert_eq!(cfg.raw.get("id").and_then(|v| v.as_i64()), Some(3597));
    }

    #[test]
    fn common_time_config_falls_back_to_plain_keys() {
        let cfg = CommonTimeConfig::from_value(&serde_json::json!({
            "startTime": "08:00", "endTime": "21:00"
        }));
        assert_eq!(cfg.days.len(), 1);
        assert_eq!(cfg.days[0].day, "每日");
        assert_eq!(cfg.days[0].start.as_deref(), Some("08:00"));

        // 空对象 / 非对象 → 不 panic，days 为空
        assert!(CommonTimeConfig::from_value(&serde_json::json!({}))
            .days
            .is_empty());
        assert!(CommonTimeConfig::from_value(&Value::Null).days.is_empty());
    }

    #[test]
    fn seat_index_parses_reservations_and_server_now() {
        let data = serde_json::json!({
            "seatConfig": recon_seat_config(),
            "curReserves": [
                {"id": 1, "seatNo": "A-01", "roomName": "四楼东区",
                 "reserveDate": "2026-10-16", "startTime": "08:00", "endTime": "12:00",
                 "status": 1, "statusName": "已预约"}
            ],
            "nearReserves": [],
            "serverTime": "2026-10-15T23:31:03.073+08:00"
        });
        let view = SeatIndexView::from_data(&data, &seat_context(None));

        assert_eq!(view.current_reservations.len(), 1);
        let r = &view.current_reservations[0];
        assert_eq!(r.id, Some(1));
        assert_eq!(r.seat_no.as_deref(), Some("A-01"));
        assert_eq!(r.room_name.as_deref(), Some("四楼东区"));
        assert_eq!(r.date.as_deref(), Some("2026-10-16"));
        assert_eq!(r.start_time.as_deref(), Some("08:00"));
        assert_eq!(r.status_name.as_deref(), Some("已预约"));
        assert!(view.recent_reservations.is_empty());
        // 服务端时间优先取响应字段
        assert_eq!(
            view.server_now.as_deref(),
            Some("2026-10-15T23:31:03.073+08:00")
        );
        assert_eq!(view.server_now_source, Some("response"));
        // 原始 data 原样保留（前端可兜底取未建模字段）
        assert!(view.raw.get("seatConfig").is_some());
    }

    #[test]
    fn seat_index_falls_back_to_page_server_now() {
        let mut ctx = seat_context(None);
        ctx.page_server_now = Some("2026-10-15T23:31:03.073+08:00".to_string());
        // 响应里没有可用的时间字段（"08:00" 是时段，必须被拒）
        let data = serde_json::json!({
            "seatConfig": {"id": 3597, "timeUnit": 60},
            "curReserves": [],
            "nearReserves": [],
            "currentTime": "08:00"
        });
        let view = SeatIndexView::from_data(&data, &ctx);
        assert_eq!(
            view.server_now.as_deref(),
            Some("2026-10-15T23:31:03.073+08:00")
        );
        assert_eq!(view.server_now_source, Some("page"));

        // 两处都没有 → 留空，绝不回退到本地时间
        let view =
            SeatIndexView::from_data(&serde_json::json!({"seatConfig": {}}), &seat_context(None));
        assert!(view.server_now.is_none());
        assert!(view.server_now_source.is_none());
    }

    #[test]
    fn seat_index_tolerates_missing_config_and_odd_shapes() {
        // 缺 seatConfig：不报错，raw 保留，配置字段全为 None
        let view = SeatIndexView::from_data(
            &serde_json::json!({"curReserves": "not-an-array"}),
            &seat_context(None),
        );
        assert!(view.config.seat_id.is_none());
        assert!(view.config.common_time_config.is_none());
        assert!(view.current_reservations.is_empty());
        assert!(view.recent_reservations.is_empty());

        // 数字字符串 / 布尔字符串也要能解析
        let cfg = SeatConfigView::from_value(&serde_json::json!({
            "id": "3597", "reserveBeforeDay": "1", "onlySupportsApiSignIn": "true"
        }));
        assert_eq!(cfg.seat_id, Some(3597));
        assert_eq!(cfg.reserve_before_day, Some(1));
        assert_eq!(cfg.only_supports_api_sign_in, Some(true));
    }

    #[test]
    fn entrance_config_parses_recon_sample() {
        // 勘察实测样本
        let data = serde_json::json!({
            "onlySupportsApiSignIn": true,
            "defaultReserve": false,
            "liveReserve": true,
            "recentlyReserve": true,
            "againReserve": true
        });
        let cfg = SeatEntranceConfig::from_value(&data);
        assert_eq!(cfg.only_supports_api_sign_in, Some(true));
        assert_eq!(cfg.default_reserve, Some(false));
        assert_eq!(cfg.live_reserve, Some(true));
        assert_eq!(cfg.recently_reserve, Some(true));
        assert_eq!(cfg.again_reserve, Some(true));
    }

    #[test]
    fn identity_verify_is_best_effort() {
        // 结构未实测：能识别常见「通过」字段
        assert_eq!(
            SeatIdentityVerify::from_value(&serde_json::json!({"verified": true})).verified,
            Some(true)
        );
        assert_eq!(
            SeatIdentityVerify::from_value(&serde_json::json!({"isPass": 1})).verified,
            Some(true)
        );
        // 未知结构不 panic，raw 保留
        let v = SeatIdentityVerify::from_value(&serde_json::json!({"weird": "x"}));
        assert!(v.verified.is_none());
        assert_eq!(v.raw.get("weird").and_then(|x| x.as_str()), Some("x"));
    }

    #[test]
    fn seat_reservation_parses_best_effort_fields() {
        let r = SeatReservation::from_value(&serde_json::json!({
            "recordId": 9, "seatCode": "B-12", "placeName": "四楼西区",
            "reserveDay": "2026-10-17", "reserveStartTime": "13:00",
            "reserveEndTime": "17:00", "reserveStatus": 2, "statusText": "已完成"
        }));
        assert_eq!(r.id, Some(9));
        assert_eq!(r.seat_no.as_deref(), Some("B-12"));
        assert_eq!(r.room_name.as_deref(), Some("四楼西区"));
        assert_eq!(r.date.as_deref(), Some("2026-10-17"));
        assert_eq!(r.start_time.as_deref(), Some("13:00"));
        assert_eq!(r.end_time.as_deref(), Some("17:00"));
        assert_eq!(r.status, Some(2));
        assert_eq!(r.status_name.as_deref(), Some("已完成"));
    }

    #[test]
    fn api_data_keeps_error_kinds_distinguishable() {
        // api_data 复用基础模块的分类：登录态失效 → 可重新登录
        let value = serde_json::json!({"success": false, "msg": "未登录或登录已失效"});
        let err = api_data(&value, "获取座位预约配置").expect_err("应失败");
        assert_eq!(
            err.kind,
            crate::modules::library_reserve::ERR_CHAOXING_NOT_LOGGED_IN
        );
        assert!(err.can_relogin);

        // 其它业务失败 → business_rejected，且重新登录无意义
        let value = serde_json::json!({"success": false, "msg": "未查询到座位信息"});
        let err = api_data(&value, "获取座位预约配置").expect_err("应失败");
        assert_eq!(
            err.kind,
            crate::modules::library_reserve::ERR_BUSINESS_REJECTED
        );
        assert!(!err.can_relogin);

        // 成功：取 data
        let value = serde_json::json!({"success": true, "data": {"seatConfig": {"id": 3597}}});
        let data = api_data(&value, "获取座位预约配置").expect("成功");
        assert_eq!(
            data.get("seatConfig")
                .and_then(|v| v.get("id"))
                .and_then(|v| v.as_i64()),
            Some(3597)
        );
    }

    #[test]
    fn ensure_seat_app_accepts_only_seat() {
        assert!(ensure_seat_app(LibraryApp::Seat).is_ok());
        assert_eq!(
            ensure_seat_app(LibraryApp::QuietRoom)
                .expect_err("应拒绝")
                .kind,
            ERR_INVALID_APP
        );
        // 与 #1053 的 ensure_pc_app 对称：错误类型可区分
        let err =
            SeatContext::from_entry(LibraryApp::Seat, &make_entry(LibraryApp::Seat, None, None))
                .err();
        assert!(err.is_none(), "座位预约自身必须可用");
        assert_ne!(
            ERR_INVALID_APP, ERR_UNEXPECTED_RESPONSE,
            "两种错误必须可区分"
        );
    }

    // ── 余量查询 / 找空座位：请求体构造（与第二轮实测契约逐字段对齐） ──

    #[test]
    fn room_list_params_match_contract() {
        // 实测：POST seatengine/room/list { seatId: '3597', seatIdEnc: '<enc>' }
        let p = room_list_params(&seat_context(Some("b146028eafa4eea9")));
        assert_eq!(p.get("seatId").map(String::as_str), Some("3597"));
        assert_eq!(
            p.get("seatIdEnc").map(String::as_str),
            Some("b146028eafa4eea9")
        );
        assert_eq!(p.len(), 2, "room/list 不应多带参数：{p:?}");

        // seatIdEnc 缺失时按既有逻辑「不带该参数」（与 seatIdEnc 的既有语义一致）
        let p = room_list_params(&seat_context(None));
        assert_eq!(p.get("seatId").map(String::as_str), Some("3597"));
        assert!(!p.contains_key("seatIdEnc"));
        assert_eq!(p.len(), 1);
    }

    #[test]
    fn levels_params_match_contract_by_level() {
        let ctx = seat_context(None);

        // type=0：仅 seatId + type
        let p = levels_params(&ctx, LEVEL_TYPE_FIRST, None, None);
        assert_eq!(p.get("seatId").map(String::as_str), Some("3597"));
        assert_eq!(p.get("type").map(String::as_str), Some("0"));
        assert_eq!(p.len(), 2, "一级区域不应多带参数：{p:?}");

        // type=1：追加 firstLevelName
        let p = levels_params(&ctx, LEVEL_TYPE_SECOND, Some("四楼D区（有插座）"), None);
        assert_eq!(p.get("type").map(String::as_str), Some("1"));
        assert_eq!(
            p.get("firstLevelName").map(String::as_str),
            Some("四楼D区（有插座）")
        );
        assert!(!p.contains_key("secondLevelName"));
        assert_eq!(p.len(), 3);

        // type=2：追加 firstLevelName + secondLevelName
        let p = levels_params(&ctx, LEVEL_TYPE_THIRD, Some("A区"), Some("A-1"));
        assert_eq!(p.get("type").map(String::as_str), Some("2"));
        assert_eq!(p.get("firstLevelName").map(String::as_str), Some("A区"));
        assert_eq!(p.get("secondLevelName").map(String::as_str), Some("A-1"));
        assert_eq!(p.len(), 4);

        // 空串上级区域名视同未提供（页面实参即空串 → 不带）
        let p = levels_params(&ctx, LEVEL_TYPE_FIRST, Some("   "), Some(""));
        assert!(!p.contains_key("firstLevelName"));
        assert!(!p.contains_key("secondLevelName"));
        assert_eq!(p.len(), 2);
    }

    #[test]
    fn time_range_params_always_send_dept_id_enc() {
        // 实测：POST seatengine/getstartendtime { deptIdEnc: '', seatId: '3597' }
        let p = time_range_params(&seat_context(None));
        assert_eq!(p.get("deptIdEnc").map(String::as_str), Some(""));
        assert_eq!(p.get("seatId").map(String::as_str), Some("3597"));
        assert_eq!(p.len(), 2, "时间范围接口不应多带参数：{p:?}");

        // 有 deptIdEnc 时用实时值
        let p = time_range_params(&seat_context_with_dept(None, Some("DEPT-ENC")));
        assert_eq!(p.get("deptIdEnc").map(String::as_str), Some("DEPT-ENC"));
    }

    #[test]
    fn match_params_always_send_level_names_and_dept_id_enc() {
        let ctx = seat_context(None);
        // 实测：三级区域名恒带（未指定即空串）
        let p = match_params(&ctx, "09:00", "11:00", None, None, None);
        assert_eq!(p.get("seatId").map(String::as_str), Some("3597"));
        assert_eq!(p.get("deptIdEnc").map(String::as_str), Some(""));
        assert_eq!(p.get("startTime").map(String::as_str), Some("09:00"));
        assert_eq!(p.get("endTime").map(String::as_str), Some("11:00"));
        assert_eq!(p.get("firstLevelName").map(String::as_str), Some(""));
        assert_eq!(p.get("secondLevelName").map(String::as_str), Some(""));
        assert_eq!(p.get("thirdLevelName").map(String::as_str), Some(""));
        assert_eq!(p.len(), 7, "getseatinfo 参数数固定为 7：{p:?}");

        // 指定区域 + deptIdEnc
        let ctx = seat_context_with_dept(Some("SEAT-ENC"), Some("DEPT-ENC"));
        let p = match_params(
            &ctx,
            "09:00",
            "11:00",
            Some("四楼D区（有插座）"),
            None,
            None,
        );
        assert_eq!(p.get("deptIdEnc").map(String::as_str), Some("DEPT-ENC"));
        assert_eq!(
            p.get("firstLevelName").map(String::as_str),
            Some("四楼D区（有插座）")
        );
    }

    #[test]
    fn normalize_hh_mm_pads_and_rejects_garbage() {
        assert_eq!(normalize_hh_mm("09:00").as_deref(), Some("09:00"));
        assert_eq!(normalize_hh_mm(" 9:5 ").as_deref(), Some("09:05"));
        assert_eq!(normalize_hh_mm("23:59").as_deref(), Some("23:59"));
        assert_eq!(normalize_hh_mm("0:00").as_deref(), Some("00:00"));
        // 非法：缺冒号 / 非数字 / 越界 / 空
        assert_eq!(normalize_hh_mm("0900"), None);
        assert_eq!(normalize_hh_mm("aa:bb"), None);
        assert_eq!(normalize_hh_mm("24:00"), None);
        assert_eq!(normalize_hh_mm("09:60"), None);
        assert_eq!(normalize_hh_mm(""), None);
    }

    // ── 余量查询 / 找空座位：响应解析（实测 JSON 作为 fixture） ──

    #[test]
    fn room_list_parses_recon_sample() {
        // 第二轮勘察实测（totalRow=2）
        let data = serde_json::json!({
            "totalRow": 2,
            "rows": [
                {"id": 10892, "firstLevelName": "四楼D区（有插座）", "capacity": 118,
                 "reserveBeforeDay": 1, "reserveBeforeTime": "08:00",
                 "reserveAfterDay": -1, "reserveAfterTime": "12:00",
                 "gridStyle": 1, "picSeatMode": 1},
                {"id": 13248, "firstLevelName": "二楼A区（现刊报纸阅览室）", "capacity": 240,
                 "reserveBeforeDay": 1, "reserveBeforeTime": "08:00",
                 "reserveAfterDay": -1, "reserveAfterTime": "12:00",
                 "gridStyle": 0, "picSeatMode": 2}
            ]
        });
        let rooms = SeatRooms::from_data(&data);
        assert_eq!(rooms.rooms.len(), 2);

        let first = &rooms.rooms[0];
        assert_eq!(first.id, Some(10892));
        assert_eq!(first.first_level_name.as_deref(), Some("四楼D区（有插座）"));
        assert_eq!(first.capacity, Some(118));
        assert_eq!(first.reserve_before_day, Some(1));
        assert_eq!(first.reserve_before_time.as_deref(), Some("08:00"));
        assert_eq!(first.reserve_after_day, Some(-1));
        assert_eq!(first.reserve_after_time.as_deref(), Some("12:00"));
        assert_eq!(first.grid_style, Some(1));
        assert_eq!(first.pic_seat_mode, Some(1));
        // 未提供 seatEngineSpecialTime → 开放时段为空（不 panic）
        assert!(first.open_hours.is_empty());
        // 原始条目原样保留
        assert_eq!(
            first.raw.get("capacity").and_then(|v| v.as_i64()),
            Some(118)
        );

        let second = &rooms.rooms[1];
        assert_eq!(second.id, Some(13248));
        assert_eq!(second.capacity, Some(240));
        assert_eq!(second.pic_seat_mode, Some(2));
        assert!(rooms.raw.get("totalRow").is_some());
    }

    #[test]
    fn room_list_tolerates_missing_array_and_odd_shapes() {
        // 无 rows / rooms / list：空列表，不 panic
        let rooms = SeatRooms::from_data(&serde_json::json!({"totalRow": 0}));
        assert!(rooms.rooms.is_empty());

        // data 本身即数组
        let rooms = SeatRooms::from_data(&serde_json::json!([{"id": 1, "capacity": 5}]));
        assert_eq!(rooms.rooms.len(), 1);
        assert_eq!(rooms.rooms[0].id, Some(1));

        // 数字字符串 / 缺字段也要能解析
        let rooms = SeatRooms::from_data(&serde_json::json!({
            "rows": [{"id": "10892", "capacity": "118", "reserveBeforeDay": "1"}]
        }));
        assert_eq!(rooms.rooms[0].id, Some(10892));
        assert_eq!(rooms.rooms[0].capacity, Some(118));
        assert_eq!(rooms.rooms[0].reserve_before_day, Some(1));
    }

    #[test]
    fn open_hours_from_special_time_handles_shapes() {
        // 对象（星期前缀键位，复用 CommonTimeConfig 思路）
        let days = open_hours_from_special_time(&serde_json::json!({
            "monStartTime": "08:00", "monEndTime": "22:00"
        }));
        assert_eq!(days.len(), 1);
        assert_eq!(days[0].day, "周一");
        assert_eq!(days[0].start.as_deref(), Some("08:00"));

        // JSON 字符串
        let days = open_hours_from_special_time(&serde_json::json!(
            "{\"monStartTime\":\"08:00\",\"monEndTime\":\"22:00\"}"
        ));
        assert_eq!(days.len(), 1);
        assert_eq!(days[0].day, "周一");

        // 对象数组：显式 day/start/end
        let days = open_hours_from_special_time(&serde_json::json!([
            {"day": "周一", "startTime": "08:00", "endTime": "22:00"},
            {"day": "周二", "startTime": "08:00", "endTime": "21:00"}
        ]));
        assert_eq!(days.len(), 2);
        assert_eq!(days[0].day, "周一");
        assert_eq!(days[1].end.as_deref(), Some("21:00"));

        // 对象数组：星期前缀键位
        let days = open_hours_from_special_time(&serde_json::json!([
            {"satStartTime": "09:00", "satEndTime": "18:00"}
        ]));
        assert_eq!(days.len(), 1);
        assert_eq!(days[0].day, "周六");

        // 无法识别：空列表，不 panic
        assert!(open_hours_from_special_time(&serde_json::json!("not json")).is_empty());
        assert!(open_hours_from_special_time(&serde_json::json!("")).is_empty());
        assert!(open_hours_from_special_time(&serde_json::json!(123)).is_empty());
        assert!(open_hours_from_special_time(&Value::Null).is_empty());
    }

    #[test]
    fn room_open_hours_reads_special_time_field() {
        let room = SeatRoom::from_value(&serde_json::json!({
            "id": 10892,
            "seatEngineSpecialTime": {"monStartTime": "08:00", "monEndTime": "22:00"}
        }));
        assert_eq!(room.open_hours.len(), 1);
        assert_eq!(room.open_hours[0].day, "周一");
    }

    #[test]
    fn levels_extracts_name_by_level_type() {
        // 实测（type=0）：data.levels[].firstLevelName
        let data = serde_json::json!({
            "levels": [
                {"firstLevelName": "四楼D区（有插座）"},
                {"firstLevelName": "二楼A区（现刊报纸阅览室）"}
            ]
        });
        assert_eq!(
            levels_of(&data, LEVEL_TYPE_FIRST),
            vec![
                "四楼D区（有插座）".to_string(),
                "二楼A区（现刊报纸阅览室）".to_string()
            ]
        );

        // type=1 → secondLevelName；type=2 → thirdLevelName（宽松：只认对应键）
        let data = serde_json::json!({
            "levels": [
                {"secondLevelName": "A-1", "firstLevelName": "忽略我"},
                {"secondLevelName": "A-2"}
            ]
        });
        assert_eq!(levels_of(&data, LEVEL_TYPE_SECOND), vec!["A-1", "A-2"]);

        let data = serde_json::json!({
            "levels": [{"thirdLevelName": "x"}, {"firstLevelName": "y"}]
        });
        assert_eq!(levels_of(&data, LEVEL_TYPE_THIRD), vec!["x"]);

        // 元素为裸字符串也要能取（宽松）
        let data = serde_json::json!({"levels": ["一层", "二层"]});
        assert_eq!(levels_of(&data, LEVEL_TYPE_FIRST), vec!["一层", "二层"]);

        // 实测（type=1 该区无二级）：空数组
        let data = serde_json::json!({"levels": []});
        assert!(levels_of(&data, LEVEL_TYPE_SECOND).is_empty());

        // 空串被过滤，缺字段不 panic
        let data = serde_json::json!({"levels": [{"firstLevelName": ""}, {"other": 1}]});
        assert!(levels_of(&data, LEVEL_TYPE_FIRST).is_empty());
        assert!(levels_of(&serde_json::json!({}), LEVEL_TYPE_FIRST).is_empty());
    }

    #[test]
    fn time_range_parses_recon_sample() {
        // 实测：{"ymd":"2026-10-16","commonPauseTimes":[],"startTime":0,"endTime":50400000}
        let data = serde_json::json!({
            "ymd": "2026-10-16",
            "commonPauseTimes": [],
            "startTime": 0,
            "endTime": 50400000
        });
        let range = SeatTimeRange::from_data(&data);
        assert_eq!(range.ymd.as_deref(), Some("2026-10-16"));
        assert_eq!(range.start_offset_ms, Some(0));
        assert_eq!(range.end_offset_ms, Some(50_400_000));
        assert!(range.pause_times.is_empty());
        assert!(range.raw.get("ymd").is_some());

        // 有暂停时段时原样透传元素
        let range = SeatTimeRange::from_data(&serde_json::json!({
            "ymd": "2026-10-16",
            "commonPauseTimes": [{"startTime": "12:00", "endTime": "13:00"}]
        }));
        assert_eq!(range.pause_times.len(), 1);
        assert!(range.start_offset_ms.is_none());

        // 缺字段不 panic
        let range = SeatTimeRange::from_data(&serde_json::json!({}));
        assert!(range.ymd.is_none());
        assert!(range.start_offset_ms.is_none());
        assert!(range.pause_times.is_empty());
    }

    #[test]
    fn seat_match_parses_recon_sample() {
        // 实测：seatNum 为带前导零的字符串；duration 为字符串 "2.0"
        let data = serde_json::json!({
            "matchReserve": {
                "duration": "2.0",
                "roomId": 13248,
                "seatNum": "136",
                "firstLevelName": "二楼A区（现刊报纸阅览室）",
                "startTime": 1792112400000i64,
                "endTime": 1792119600000i64
            }
        });
        let result = SeatMatchResult::from_data(&data);
        let m = &result.matched;
        assert_eq!(m.room_id, Some(13248));
        assert_eq!(m.seat_num.as_deref(), Some("136"));
        assert_eq!(
            m.first_level_name.as_deref(),
            Some("二楼A区（现刊报纸阅览室）")
        );
        assert_eq!(m.start_time_ms, Some(1792112400000));
        assert_eq!(m.end_time_ms, Some(1792119600000));
        assert_eq!(m.duration.as_deref(), Some("2.0"));
        // 样本未返回二级 / 三级区域名
        assert!(m.second_level_name.is_none());
        assert!(m.third_level_name.is_none());
        assert!(result.raw.get("matchReserve").is_some());

        // 前导零必须原样保留（当整数解析会变成 16 → 座位号错误）
        let data = serde_json::json!({
            "matchReserve": {"duration": "1.0", "roomId": 10892, "seatNum": "016",
                             "firstLevelName": "四楼D区（有插座）"}
        });
        let result = SeatMatchResult::from_data(&data);
        assert_eq!(result.matched.seat_num.as_deref(), Some("016"));
        assert_eq!(result.matched.room_id, Some(10892));

        // 缺 matchReserve → 回落到 data 本身（宽松，不 panic）
        let result = SeatMatchResult::from_data(&serde_json::json!({"roomId": 1}));
        assert_eq!(result.matched.room_id, Some(1));
        assert!(SeatMatchResult::from_data(&serde_json::json!({}))
            .matched
            .room_id
            .is_none());
    }

    #[test]
    fn match_business_failure_keeps_server_message() {
        // 业务失败（无可用座位等）必须保留服务端 msg，不能吞成 unknown
        let value = serde_json::json!({"success": false, "msg": "该时段已无可用座位"});
        let err = api_data(&value, "查询可用座位").expect_err("应失败");
        assert_eq!(err.kind, ERR_BUSINESS_REJECTED);
        assert!(
            err.message.contains("该时段已无可用座位"),
            "服务端 msg 必须保留：{}",
            err.message
        );
        assert_ne!(err.kind, ERR_UNEXPECTED_RESPONSE);

        // 登录态失效仍走登录类错误（可重新登录）
        let value = serde_json::json!({"success": false, "msg": "未登录或登录已失效"});
        let err = api_data(&value, "查询可用座位").expect_err("应失败");
        assert_eq!(
            err.kind,
            crate::modules::library_reserve::ERR_CHAOXING_NOT_LOGGED_IN
        );

        // 成功：取 data（matchReserve）
        let value = serde_json::json!({"success": true, "data": {"matchReserve": {"roomId": 1}}});
        let data = api_data(&value, "查询可用座位").expect("成功");
        assert!(data.get("matchReserve").is_some());
    }

    #[test]
    fn invalid_params_error_is_used_for_bad_time() {
        // 本地参数校验失败用 invalid_params（命令层 / 模块层共用同一 kind）
        let err = LibraryReserveError::business(ERR_INVALID_PARAMS, "开始时间非法");
        assert_eq!(err.kind, ERR_INVALID_PARAMS);
        assert!(!err.can_relogin, "参数错误不应提示重新登录");
    }

    // ── 提交预约（快速预约链路，实测契约） ──

    /// 指定 wfw 凭证的座位上下文（提交需要 wfwEngineEnc）
    fn seat_context_with_wfw(wfw_enc: Option<&str>, wfw_engine_enc: Option<&str>) -> SeatContext {
        let mut entry = make_entry(LibraryApp::Seat, None, None);
        entry.credentials.wfw_enc = wfw_enc.map(str::to_string);
        entry.credentials.wfw_engine_enc = wfw_engine_enc.map(str::to_string);
        SeatContext::from_entry(LibraryApp::Seat, &entry).expect("可构造")
    }

    #[test]
    fn captcha_params_match_contract() {
        // 实测：seat/captcha?appType=2&appId=3597
        let p = captcha_params(&seat_context(None));
        assert_eq!(p.get("appType").map(String::as_str), Some("2"));
        assert_eq!(p.get("appId").map(String::as_str), Some("3597"));
        assert_eq!(p.len(), 2, "验证码接口不应多带参数：{p:?}");
    }

    #[test]
    fn extract_submit_enc_handles_orders_and_missing() {
        // 实测原文形态（id 在 value 之前）
        let html = r#"<input type="hidden" id="submit_enc" value="c2e1ec6696a74df188850419513a1261_406591160"/>"#;
        assert_eq!(
            extract_submit_enc(html).as_deref(),
            Some("c2e1ec6696a74df188850419513a1261_406591160")
        );

        // value 在 id 之前也要能取（正则宽松）
        let html = r#"<input type="hidden" value="abc_123" id='submit_enc'>"#;
        assert_eq!(extract_submit_enc(html).as_deref(), Some("abc_123"));

        // 属性间任意空白 / 换行
        let html = "<input\n  id = \"submit_enc\"\n  value = \"xyz\"\n/>";
        assert_eq!(extract_submit_enc(html).as_deref(), Some("xyz"));

        // 取不到 / 空值 → None（不报错）
        assert_eq!(extract_submit_enc("<html>no such input</html>"), None);
        assert_eq!(
            extract_submit_enc(r#"<input id="submit_enc" value="">"#),
            None
        );
        // 同名但不相关（不同 id）不应误取
        assert_eq!(
            extract_submit_enc(r#"<input id="other" value="leak">"#),
            None
        );
    }

    #[test]
    fn live_select_url_swaps_path_and_keeps_credentials() {
        let ctx = seat_context(None);
        let url = live_select_url(&ctx);
        assert!(url.contains("/front/apps/seatengine/live/select"), "{url}");
        // 入口凭证（query）必须保留
        assert!(url.contains("seatId=3597"), "{url}");
        assert!(!url.contains("/index"), "路径应被替换：{url}");
    }

    #[test]
    fn submit_params_match_contract_and_keep_leading_zero() {
        let ctx = seat_context_with_wfw(Some("9C32209DB3CDFF7CC351BD42FF5C8270"), None);
        let req = SeatSubmitRequest {
            room_id: 10892,
            // 前导零必须原样保留（当整数解析会变成 16 → 座位号错误）
            seat_num: " 016 ".to_string(),
            start_time: " 09:00 ".to_string(),
            end_time: "11:00".to_string(),
            day: " 2026-10-17 ".to_string(),
            captcha: " 8a9b ".to_string(),
            enc: " SIGN ".to_string(),
        };
        let p = submit_params(&ctx, &req);
        assert_eq!(p.get("roomId").map(String::as_str), Some("10892"));
        assert_eq!(p.get("startTime").map(String::as_str), Some("09:00"));
        assert_eq!(p.get("endTime").map(String::as_str), Some("11:00"));
        assert_eq!(p.get("day").map(String::as_str), Some("2026-10-17"));
        assert_eq!(p.get("captcha").map(String::as_str), Some("8a9b"));
        assert_eq!(p.get("seatNum").map(String::as_str), Some("016"));
        // 风控关闭（riskCheckOpen:false）→ wyToken 恒空串
        assert_eq!(p.get("wyToken").map(String::as_str), Some(""));
        // 官方 live/select 页 wfwEngineEnc 恒为空串（2026-10-19 实测）
        assert_eq!(p.get("wfwEngineEnc").map(String::as_str), Some(""));
        assert_eq!(p.get("enc").map(String::as_str), Some("SIGN"));
        assert_eq!(p.len(), 9, "提交参数数固定为 9：{p:?}");

        // 入口链 wfwEnc / 显式 wfwEngineEnc 都不再影响提交体（必为空串）
        let ctx = seat_context_with_wfw(Some("W"), Some("E"));
        assert_eq!(
            submit_params(&ctx, &req)
                .get("wfwEngineEnc")
                .map(String::as_str),
            Some("")
        );
        let ctx = seat_context_with_wfw(None, None);
        assert_eq!(
            submit_params(&ctx, &req)
                .get("wfwEngineEnc")
                .map(String::as_str),
            Some("")
        );
    }

    #[test]
    fn normalize_day_validates_shape() {
        assert_eq!(normalize_day("2026-10-17").as_deref(), Some("2026-10-17"));
        assert_eq!(normalize_day(" 2026-10-17 ").as_deref(), Some("2026-10-17"));
        // 非法形态
        assert_eq!(normalize_day("2026/10/17"), None);
        assert_eq!(normalize_day("20261017"), None);
        assert_eq!(normalize_day("2026-1-7"), None);
        assert_eq!(normalize_day(""), None);
    }

    #[test]
    fn submit_write_judgement_never_defaults_to_success() {
        // 写操作：无显式成功标志 → 结果未知（unexpected_response），绝不默认成功
        let unknown = api_write_result(&serde_json::json!({"msg": "预约失败"}), "提交座位预约")
            .expect_err("不得默认成功");
        assert_eq!(unknown.kind, ERR_UNEXPECTED_RESPONSE);
        assert_ne!(unknown.kind, ERR_BUSINESS_REJECTED);

        // 显式失败：原样保留服务端 msg（经业务分类）
        let rejected = api_write_result(
            &serde_json::json!({"success": false, "msg": "该时段已无可用座位"}),
            "提交座位预约",
        )
        .expect_err("应失败");
        assert!(
            rejected.message.contains("该时段已无可用座位"),
            "服务端 msg 必须保留：{}",
            rejected.message
        );

        // 显式成功才判成功
        assert!(api_write_result(&serde_json::json!({"success": true}), "提交座位预约").is_ok());
        assert!(api_write_result(&serde_json::json!({"code": 200}), "提交座位预约").is_ok());
    }
}
