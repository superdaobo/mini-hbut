#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::library_reserve::{
        LibraryReserveCredentials, ERR_INVALID_APP, ERR_UNEXPECTED_RESPONSE,
    };

    /// 构造一个最小可用的入口解析结果（仅测试用）
    fn make_entry(
        app: LibraryApp,
        fid_enc: Option<&str>,
        reserve_id_enc: Option<&str>,
    ) -> LibraryAppEntry {
        let (business_key, business_value) = app.business_id();
        LibraryAppEntry {
            app: app.key().to_string(),
            app_name: app.name().to_string(),
            m_app_id: app.m_app_id().to_string(),
            entry_url:
                "https://reserve.chaoxing.com/front/web/apps/reservepc/index?reserveId=24727"
                    .to_string(),
            system_base: "https://reserve.chaoxing.com".to_string(),
            system_path: app.system_path().to_string(),
            api_base: RESERVE_API_BASE.to_string(),
            business_key: business_key.to_string(),
            business_value: business_value.to_string(),
            credentials: LibraryReserveCredentials {
                fid_enc: fid_enc.map(str::to_string),
                reserve_id_enc: reserve_id_enc.map(str::to_string),
                reserve_id: Some(business_value.to_string()),
                ..Default::default()
            },
            params: BTreeMap::new(),
            contract_match: true,
            redirect_chain: Vec::new(),
            resolved_at_ms: 0,
            hint: String::new(),
        }
    }

    // ── 上下文与保护 ──

    #[test]
    fn context_extracts_credentials_and_rejects_seat() {
        let entry = make_entry(LibraryApp::QuietRoom, Some("FID"), Some("ENC"));
        let ctx = ReserveContext::from_entry(LibraryApp::QuietRoom, &entry).expect("可构造");
        assert_eq!(ctx.fid_enc, "FID");
        assert_eq!(ctx.reserve_id, "24727");
        assert_eq!(ctx.reserve_id_enc.as_deref(), Some("ENC"));
        assert_eq!(ctx.resv_app_id, "24727");

        // 座位预约不属于本模块（reservepc）
        let seat = make_entry(LibraryApp::Seat, Some("FID"), None);
        let err = ReserveContext::from_entry(LibraryApp::Seat, &seat).expect_err("应拒绝座位预约");
        assert_eq!(err.kind, ERR_INVALID_APP);

        // 缺 fidEnc → 非预期响应（链路形态变更）
        let no_fid = make_entry(LibraryApp::SeminarRoom, None, None);
        let err = ReserveContext::from_entry(LibraryApp::SeminarRoom, &no_fid).expect_err("应报错");
        assert_eq!(err.kind, ERR_UNEXPECTED_RESPONSE);
    }

    #[test]
    fn context_keeps_reserve_id_enc_optional() {
        // reserveIdEnc 缺失不阻断：仍可构造，只是不带该参数
        let entry = make_entry(LibraryApp::SeminarRoom, Some("FID"), None);
        let ctx = ReserveContext::from_entry(LibraryApp::SeminarRoom, &entry).expect("可构造");
        assert!(ctx.reserve_id_enc.is_none());
        assert!(!ctx.base_params().contains_key("reserveIdEnc"));
        assert_eq!(ctx.reserve_id, "24679");
    }

    #[test]
    fn require_reserve_id_enc_reports_credential_invalid() {
        // 需要该参数的接口在缺失时必须报「凭证未取到」（credential_invalid），
        // 绝不能带缺失参数发请求、再被打成 no_permission。
        let missing = ReserveContext::from_entry(
            LibraryApp::QuietRoom,
            &make_entry(LibraryApp::QuietRoom, Some("FID"), None),
        )
        .expect("可构造");
        let err = missing
            .require_reserve_id_enc()
            .expect_err("应报凭证未取到");
        assert_eq!(
            err.kind,
            crate::modules::library_reserve::ERR_CREDENTIAL_INVALID
        );
        assert!(err.can_relogin, "凭证问题应可重新登录 / 重试");
        assert!(
            err.message.contains("reserveIdEnc"),
            "错误应点名缺失的凭证：{}",
            err.message
        );

        // 已有凭证时正常返回
        let present = ReserveContext::from_entry(
            LibraryApp::QuietRoom,
            &make_entry(LibraryApp::QuietRoom, Some("FID"), Some("838c48dae07db28c")),
        )
        .expect("可构造");
        assert_eq!(
            present.require_reserve_id_enc().expect("应有凭证"),
            "838c48dae07db28c"
        );
    }

    // ── P1：我的预约（reservepc/user/histroy）端点与字段映射 ──

    #[test]
    fn my_reservation_parses_measured_histroy_row() {
        // 实测条目（2026-10-16）：starttime/endtime 为 Unix 毫秒，aprvId 恒为 0
        let v: Value = serde_json::json!({
            "id": 29589158, "itemId": 49136, "name": "4号静音仓", "today": "2026-07-11",
            "starttime": 1783760400000i64, "endtime": 1783767600000i64,
            "status": 2, "isCancel": 0, "reserveDuration": 206000,
            "remark": "讨论问题", "aprvId": 0, "reserveId": 24727, "resvAppId": 24727
        });
        let r = MyReservation::from_value(&v);
        assert_eq!(r.id, Some(29589158));
        assert_eq!(r.item_id, Some(49136));
        assert_eq!(r.item_name.as_deref(), Some("4号静音仓"));
        assert_eq!(r.date.as_deref(), Some("2026-07-11"));
        assert_eq!(r.status, Some(2));
        assert_eq!(r.is_cancel, Some(false));
        assert_eq!(r.aprv_id, Some(0), "实测 aprvId 恒为 0");
        assert_eq!(r.reserve_id, Some(24727));
        assert_eq!(r.resv_app_id, Some(24727));
        assert_eq!(r.reserve_duration, Some(206000));
        assert_eq!(r.remark.as_deref(), Some("讨论问题"));
        // 毫秒时间戳：原值保留 + 按北京时间渲染 HH:mm（1783760400000 = 09:00Z = 17:00+08:00）
        assert_eq!(r.start_time_ms, Some(1783760400000));
        assert_eq!(r.end_time_ms, Some(1783767600000));
        assert_eq!(r.start_time.as_deref(), Some("17:00"));
        assert_eq!(r.end_time.as_deref(), Some("19:00"));
        assert_eq!(r.raw.get("id").and_then(|x| x.as_i64()), Some(29589158));
    }

    #[test]
    fn my_reservation_list_reads_rows_and_total_row() {
        // 实测响应形态：{"totalRow":N,"totalPage":N,"rows":[…]}
        let data: Value = serde_json::json!({
            "totalRow": 1, "totalPage": 1,
            "rows": [{"id": 1, "name": "4号静音仓", "starttime": 1783760400000i64}]
        });
        let items: Vec<MyReservation> = extract_list(&data)
            .iter()
            .map(MyReservation::from_value)
            .collect();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].item_name.as_deref(), Some("4号静音仓"));
        // 分页总数取 totalRow
        assert_eq!(
            value_i64(&data, &["totalRow", "total", "totalCount", "count"]),
            Some(1)
        );
    }

    #[test]
    fn ms_to_hhmm_handles_missing_and_converts_epoch() {
        assert_eq!(ms_to_hhmm(None), None);
        // 北京时间固定 UTC+8（与用户本机时区无关，可复现）
        assert_eq!(ms_to_hhmm(Some(1783760400000)).as_deref(), Some("17:00"));
        assert_eq!(ms_to_hhmm(Some(1783767600000)).as_deref(), Some("19:00"));
        // 非法值（超出可表示范围）不 panic
        assert_eq!(ms_to_hhmm(Some(i64::MAX)), None);
    }

    // ── 请求体构造（与实测契约逐字段对齐） ──

    #[test]
    fn info_params_match_contract() {
        let ctx = ReserveContext::from_entry(
            LibraryApp::QuietRoom,
            &make_entry(
                LibraryApp::QuietRoom,
                Some("c7450f13f8a0e9ab"),
                Some("838c48dae07db28c"),
            ),
        )
        .expect("可构造");
        let p = info_params(&ctx);
        assert_eq!(p.get("reserveId").map(String::as_str), Some("24727"));
        assert_eq!(
            p.get("reserveIdEnc").map(String::as_str),
            Some("838c48dae07db28c")
        );
        assert_eq!(
            p.get("fidEnc").map(String::as_str),
            Some("c7450f13f8a0e9ab")
        );
        assert_eq!(p.len(), 3, "详情接口不应多带参数：{p:?}");
    }

    #[test]
    fn time_list_params_match_contract() {
        let ctx = ReserveContext::from_entry(
            LibraryApp::QuietRoom,
            &make_entry(LibraryApp::QuietRoom, Some("FID"), Some("ENC")),
        )
        .expect("可构造");
        let p = time_list_params(&ctx, None, None);
        // 实测：sw=&reserveId=24727&resvAppId=24727&sortIds=&startTime=&endTime=&reserveIdEnc=<enc>&fidEnc=<fidEnc>
        assert_eq!(p.get("sw").map(String::as_str), Some(""));
        assert_eq!(p.get("reserveId").map(String::as_str), Some("24727"));
        assert_eq!(p.get("resvAppId").map(String::as_str), Some("24727"));
        assert_eq!(p.get("sortIds").map(String::as_str), Some(""));
        assert_eq!(p.get("startTime").map(String::as_str), Some(""));
        assert_eq!(p.get("endTime").map(String::as_str), Some(""));
        assert_eq!(p.get("reserveIdEnc").map(String::as_str), Some("ENC"));
        assert_eq!(p.get("fidEnc").map(String::as_str), Some("FID"));
        assert_eq!(p.len(), 8);

        // 传入时间范围时原样透传
        let p = time_list_params(&ctx, Some(" 2026-10-16 "), Some("2026-10-17"));
        assert_eq!(p.get("startTime").map(String::as_str), Some("2026-10-16"));
        assert_eq!(p.get("endTime").map(String::as_str), Some("2026-10-17"));
    }

    // ── P0：房间列表归一化（reserve/item/list/time 不传时间窗口） ──

    #[test]
    fn room_item_parses_measured_interval_list() {
        // 实测房间形态（2026-10-16）：静音仓房间自带按星期几的可用时段
        let v: Value = serde_json::json!({
            "id": 49136,
            "name": "1号静音仓",
            "minUserNum": 1,
            "maxUserNum": 20,
            "formId": 12345,
            "advanceDays": 14,
            "timeUnit": 0,
            "rangestime": 0,
            "rangeetime": 36000000,
            "reserveInterval": {"startTime": "08:00", "endTime": "21:30"},
            "reserveIntervalList": [
                {"available": 1, "startTime": "08:00", "endTime": "21:30", "week": 1},
                {"available": 0, "startTime": "08:00", "endTime": "18:00", "week": 2}
            ],
            "customFormConfig": "[{\"fieldName\":\"userName\"}]"
        });
        let item = ReserveRoomItem::from_value(&v);
        assert_eq!(item.item_id, Some(49136));
        assert_eq!(item.name.as_deref(), Some("1号静音仓"));
        assert_eq!(item.min_user_num, Some(1));
        assert_eq!(item.max_user_num, Some(20));
        assert_eq!(item.form_id, Some(12345));
        assert_eq!(item.advance_days, Some(14));
        assert_eq!(item.time_unit, Some(0));
        assert_eq!(item.range_start_ms, Some(0));
        assert_eq!(item.range_end_ms, Some(36_000_000));

        // intervals 归一化：week / available / startTime / endTime 逐字段保留
        assert_eq!(item.intervals.len(), 2);
        assert_eq!(item.intervals[0].week, Some(1));
        assert_eq!(item.intervals[0].available, Some(1));
        assert_eq!(item.intervals[0].start_time.as_deref(), Some("08:00"));
        assert_eq!(item.intervals[0].end_time.as_deref(), Some("21:30"));
        assert_eq!(item.intervals[1].week, Some(2));
        assert_eq!(item.intervals[1].available, Some(0));
        assert_eq!(item.intervals[1].end_time.as_deref(), Some("18:00"));

        // 未建模字段（customFormConfig / reserveInterval）保留在 raw
        assert!(item.raw.get("customFormConfig").is_some());
        assert!(item.raw.get("reserveInterval").is_some());
    }

    #[test]
    fn room_item_tolerates_missing_intervals_and_odd_shapes() {
        // 缺 reserveIntervalList → 空列表，不 panic
        let item = ReserveRoomItem::from_value(&serde_json::json!({"id": "49136"}));
        assert_eq!(item.item_id, Some(49136));
        assert!(item.intervals.is_empty());
        assert!(item.name.is_none());
        assert!(item.min_user_num.is_none());

        // reserveIntervalList 非数组 → 空列表
        let item = ReserveRoomItem::from_value(&serde_json::json!({
            "reserveIntervalList": "oops"
        }));
        assert!(item.intervals.is_empty());

        // 驼峰兜底键名也要能取（服务端字段大小写不稳定）
        let item = ReserveRoomItem::from_value(&serde_json::json!({
            "rangeStartTime": 0, "rangeEndTime": 1, "formid": 7
        }));
        assert_eq!(item.range_start_ms, Some(0));
        assert_eq!(item.range_end_ms, Some(1));
        assert_eq!(item.form_id, Some(7));
    }

    #[test]
    fn room_items_of_extracts_array_by_common_keys() {
        // 首选 reserveItemList
        let data = serde_json::json!({
            "reserveItemList": [{"id": 1}, {"id": 2}]
        });
        assert_eq!(room_items_of(&data).len(), 2);

        // 其它常见键
        assert_eq!(
            room_items_of(&serde_json::json!({"rows": [{"id": 1}]})).len(),
            1
        );
        assert_eq!(
            room_items_of(&serde_json::json!({"rooms": [{"id": 1}]})).len(),
            1
        );
        // data 本身即数组
        assert_eq!(room_items_of(&serde_json::json!([{"id": 1}])).len(), 1);
        // 未知键但含对象数组 → 兜底
        assert_eq!(
            room_items_of(&serde_json::json!({"whatever": [{"id": 1}]})).len(),
            1
        );
        // 无数组 → 空
        assert!(room_items_of(&serde_json::json!({"totalRow": 0})).is_empty());
        assert!(room_items_of(&Value::Null).is_empty());
    }

    #[test]
    fn time_list_items_serialize_as_plain_arrays() {
        // 两种形态序列化后都是数组（前端按调用形态解析 items）
        let rooms = ReserveTimeListItems::Rooms(vec![ReserveRoomItem::from_value(
            &serde_json::json!({"id": 1, "name": "1号静音仓"}),
        )]);
        let value = serde_json::to_value(&rooms).expect("可序列化");
        assert!(value.is_array());
        assert_eq!(value[0].get("itemId").and_then(|v| v.as_i64()), Some(1));
        assert!(value[0]
            .get("intervals")
            .map(|v| v.is_array())
            .unwrap_or(false));

        let slots = ReserveTimeListItems::Slots(vec![ReserveTimeItem::from_value(
            &serde_json::json!({"aprvId": 0, "startTime": "08:00"}),
        )]);
        let value = serde_json::to_value(&slots).expect("可序列化");
        assert!(value.is_array());
        assert_eq!(value[0].get("aprvId").and_then(|v| v.as_i64()), Some(0));
    }

    #[test]
    fn role_and_dialog_params_match_contract() {
        let ctx = ReserveContext::from_entry(
            LibraryApp::QuietRoom,
            &make_entry(LibraryApp::QuietRoom, Some("FID"), Some("ENC")),
        )
        .expect("可构造");
        let r = role_params(&ctx);
        assert_eq!(r.get("fidEnc").map(String::as_str), Some("FID"));
        assert_eq!(r.len(), 1, "角色接口只带 fidEnc：{r:?}");

        let d = dialog_params(&ctx, false);
        assert_eq!(d.get("reserveId").map(String::as_str), Some("24727"));
        assert_eq!(d.get("fidEnc").map(String::as_str), Some("FID"));
        assert_eq!(
            d.get("dialogAgreeStatus").map(String::as_str),
            Some("false")
        );
        assert_eq!(d.len(), 3);
    }

    #[test]
    fn submit_params_inject_required_and_protect_keys() {
        let ctx = ReserveContext::from_entry(
            LibraryApp::QuietRoom,
            &make_entry(LibraryApp::QuietRoom, Some("FID"), Some("ENC")),
        )
        .expect("可构造");
        let mut form_data = BTreeMap::new();
        form_data.insert("userName".to_string(), "张三".to_string());
        // 恶意/误传：试图覆盖受保护键，必须被忽略
        form_data.insert("fidEnc".to_string(), "HACK".to_string());
        form_data.insert("reserveId".to_string(), "99999".to_string());
        let mut extra = BTreeMap::new();
        extra.insert("extraFlag".to_string(), "1".to_string());
        extra.insert("cycleType".to_string(), "9".to_string());

        let req = SubmitReserveRequest {
            aprv_id: Some(" 42 ".to_string()),
            aprv_status_type_id: Some("1".to_string()),
            form_user_id: Some("406591160".to_string()),
            cycle_type: None,
            form_data,
            extra,
        };
        let p = submit_params(&ctx, &req);

        assert_eq!(p.get("ua").map(String::as_str), Some("pc"));
        assert_eq!(p.get("cycleType").map(String::as_str), Some("0"));
        assert_eq!(p.get("fidEnc").map(String::as_str), Some("FID"));
        assert_eq!(p.get("reserveId").map(String::as_str), Some("24727"));
        assert_eq!(p.get("resvAppId").map(String::as_str), Some("24727"));
        assert_eq!(p.get("aprvId").map(String::as_str), Some("42"), "应 trim");
        assert_eq!(p.get("aprvStatusTypeId").map(String::as_str), Some("1"));
        assert_eq!(p.get("formUserId").map(String::as_str), Some("406591160"));
        // 透传字段保留
        assert_eq!(p.get("userName").map(String::as_str), Some("张三"));
        assert_eq!(p.get("extraFlag").map(String::as_str), Some("1"));
    }

    #[test]
    fn submit_params_omit_empty_optionals() {
        let ctx = ReserveContext::from_entry(
            LibraryApp::SeminarRoom,
            &make_entry(LibraryApp::SeminarRoom, Some("FID"), Some("ENC")),
        )
        .expect("可构造");
        let p = submit_params(&ctx, &SubmitReserveRequest::default());
        assert!(!p.contains_key("aprvId"));
        assert!(!p.contains_key("aprvStatusTypeId"));
        assert!(!p.contains_key("formUserId"));
        assert_eq!(p.get("cycleType").map(String::as_str), Some("0"));
    }

    #[test]
    fn cancel_params_use_record_id_and_all_cancel() {
        let ctx = ReserveContext::from_entry(
            LibraryApp::QuietRoom,
            &make_entry(LibraryApp::QuietRoom, Some("FID"), Some("ENC")),
        )
        .expect("可构造");
        let req = CancelReserveRequest {
            id: " 30035270 ".to_string(),
            all_cancel: true,
        };
        let p = cancel_params(&ctx, &req);
        // 实测（2026-10-19）：取消主键是记录 id，不是 aprvId
        assert_eq!(p.get("id").map(String::as_str), Some("30035270"));
        assert_eq!(p.get("allCancel").map(String::as_str), Some("1"));
        assert_eq!(p.get("ua").map(String::as_str), Some("pc"));
        assert_eq!(p.get("fidEnc").map(String::as_str), Some("FID"));
        assert!(!p.contains_key("aprvId"), "aprvId 恒为 0，不得再下发");

        // all_cancel 默认 0
        let p = cancel_params(
            &ctx,
            &CancelReserveRequest {
                id: "30035270".to_string(),
                all_cancel: false,
            },
        );
        assert_eq!(p.get("allCancel").map(String::as_str), Some("0"));
    }

    #[test]
    fn item_setting_flattens_common_interval_map() {
        let data = serde_json::json!({
            "commonIntervalMap": {
                "1": [
                    {"id": 2035233, "week": 1, "startTime": "08:00", "endTime": "09:00", "available": 1},
                    {"id": 2035234, "week": 1, "startTime": "09:00", "endTime": "10:00", "available": 0}
                ],
                "2": [
                    {"id": 2035300, "startTime": "08:00", "endTime": "09:00"}
                ]
            }
        });
        let setting = item_setting_of(&data);
        assert_eq!(setting.intervals.len(), 3);
        assert_eq!(setting.intervals[0].id, 2035233);
        assert_eq!(setting.intervals[0].week, Some(1));
        assert!(setting.intervals[0].available);
        assert!(
            !setting.intervals[1].available,
            "available=0 必须置为不可用"
        );
        // week 缺失时回落到 map 键；available 缺失按开放处理
        assert_eq!(setting.intervals[2].week, Some(2));
        assert!(setting.intervals[2].available);
    }

    // ── #1080：实时占用（reserve/item/user/list） ──

    #[test]
    fn item_setting_keeps_capacity_from_user_num() {
        // #1080：判定「已满」需要容量（服务端 userNum），必须原样带出；
        // 缺失 / 非法（<=0）时按 1（一次一人）处理，绝不放大容量。
        let data = serde_json::json!({
            "commonIntervalMap": {
                "1": [
                    {"id": 1, "week": 1, "startTime": "08:00", "endTime": "09:00", "available": 1, "userNum": 3},
                    {"id": 2, "week": 1, "startTime": "09:00", "endTime": "10:00", "available": 1},
                    {"id": 3, "week": 1, "startTime": "10:00", "endTime": "11:00", "available": 1, "userNum": 0}
                ]
            }
        });
        let setting = item_setting_of(&data);
        assert_eq!(setting.intervals[0].user_num, 3);
        assert_eq!(setting.intervals[1].user_num, 1, "缺失按 1");
        assert_eq!(setting.intervals[2].user_num, 1, "非法值按 1");
        // 序列化为 camelCase（前端读 userNum）
        let value = serde_json::to_value(&setting).expect("可序列化");
        assert_eq!(
            value["intervals"][0]
                .get("userNum")
                .and_then(|v| v.as_i64()),
            Some(3)
        );
    }

    #[test]
    fn occupancy_records_parse_measured_user_list() {
        // 实测响应（2026-10-19，静音仓 1 号 49091）：同一笔预约跨 3 个时段 → 3 条记录
        let data: Value = serde_json::json!({
            "expiredCountShow": false,
            "expiredReserveList": [],
            "reserveUserList": [
                {"aprvId": 0, "deptId": 25285, "endtime": 1792503000000i64, "id": 30031777,
                 "itemId": 49091, "remark": "学习", "reserveId": 24727,
                 "reserveIntervalId": 2035215, "reserveNum": 1, "starttime": 1792490400000i64,
                 "teamLeaderCancel": 0, "today": "2026-10-20", "uid": 360838955, "uname": "廖宏伟"},
                {"aprvId": 0, "endtime": 1792503000000i64, "id": 30031777,
                 "reserveIntervalId": 2035216, "reserveNum": 1, "starttime": 1792490400000i64,
                 "today": "2026-10-20", "uid": 360838955, "uname": "廖宏伟"},
                {"aprvId": 0, "endtime": 1792503000000i64, "id": 30031777,
                 "reserveIntervalId": 2035217, "reserveNum": 1, "starttime": 1792490400000i64,
                 "today": "2026-10-20", "uid": 360838955, "uname": "廖宏伟"}
            ]
        });
        let (records, unkeyed) = occupancy_records_of(&data);
        assert_eq!(unkeyed, 0);
        assert_eq!(records.len(), 3);
        assert_eq!(records[0].interval_id, 2035215);
        assert_eq!(records[0].date.as_deref(), Some("2026-10-20"));
        assert_eq!(records[0].reserve_num, 1);
        assert_eq!(records[0].uid, Some(360838955));
        assert_eq!(records[0].user_name.as_deref(), Some("廖宏伟"));
        assert_eq!(records[0].id, Some(30031777));
        assert_eq!(records[0].remark.as_deref(), Some("学习"));
        assert_eq!(records[0].start_time_ms, Some(1792490400000));
        assert_eq!(records[0].end_time_ms, Some(1792503000000));
    }

    #[test]
    fn occupancy_records_count_unkeyable_and_use_ms_date_fallback() {
        // 缺 reserveIntervalId → 无法归属，计入 unkeyed（调用方据此降级为「占用未知」）
        let (records, unkeyed) = occupancy_records_of(&serde_json::json!({
            "reserveUserList": [
                {"id": 1, "today": "2026-10-20", "reserveNum": 2},
                {"id": 2, "reserveIntervalId": 9, "today": "2026-10-20", "reserveNum": 0}
            ]
        }));
        assert_eq!(unkeyed, 1);
        assert_eq!(records.len(), 1);
        // reserveNum 缺失 / 0 → 按 1（官方页面同样兜底），绝不按 0（会漏算占用）
        assert_eq!(records[0].reserve_num, 1);

        // today 缺失时用 starttime（Unix 毫秒）按北京时间换算日期
        let (records, unkeyed) = occupancy_records_of(&serde_json::json!({
            "reserveUserList": [
                {"reserveIntervalId": 7, "starttime": 1792490400000i64, "reserveNum": 1}
            ]
        }));
        assert_eq!(unkeyed, 0);
        assert_eq!(records[0].date.as_deref(), Some("2026-10-20"));

        // 既无 today 又无 starttime → 计入 unkeyed
        let (_, unkeyed) = occupancy_records_of(&serde_json::json!({
            "reserveUserList": [{"reserveIntervalId": 7}]
        }));
        assert_eq!(unkeyed, 1);

        // 形态异常 / 缺失 → 空列表且不 panic（未归属计数为 0：没有「疑似记录」可言）
        assert_eq!(occupancy_records_of(&serde_json::json!({})).0.len(), 0);
        assert_eq!(
            occupancy_records_of(&serde_json::json!({"reserveUserList": "oops"})).1,
            0
        );
        assert_eq!(occupancy_records_of(&Value::Null).1, 0);
    }

    #[test]
    fn occupancy_params_match_contract() {
        let ctx = ReserveContext::from_entry(
            LibraryApp::QuietRoom,
            &make_entry(LibraryApp::QuietRoom, Some("FID"), Some("ENC")),
        )
        .expect("可构造");
        // 实测（2026-10-19）：GET query = reserveId/itemId/fidEnc/startTime/endTime
        // （不含 reserveIdEnc —— 该端点实测不需要）
        let p = occupancy_params(&ctx, 49091, "2026-10-19", "2026-10-25");
        assert_eq!(p.get("reserveId").map(String::as_str), Some("24727"));
        assert_eq!(p.get("itemId").map(String::as_str), Some("49091"));
        assert_eq!(p.get("fidEnc").map(String::as_str), Some("FID"));
        assert_eq!(p.get("startTime").map(String::as_str), Some("2026-10-19"));
        assert_eq!(p.get("endTime").map(String::as_str), Some("2026-10-25"));
        assert_eq!(p.len(), 5, "占用查询不应多带参数：{p:?}");

        // 服务端时间：reserveId + itemId
        let s = server_now_params(&ctx, 49091);
        assert_eq!(s.get("reserveId").map(String::as_str), Some("24727"));
        assert_eq!(s.get("itemId").map(String::as_str), Some("49091"));
        assert_eq!(s.len(), 2);
    }

    #[test]
    fn normalize_date_rejects_malformed_input() {
        assert_eq!(
            normalize_date(" 2026-10-19 ", "startTime").unwrap(),
            "2026-10-19"
        );
        // 服务端对日期强校验（缺失 → HTTP 400 HTML），必须在本地先拦住
        for bad in [
            "",
            "  ",
            "2026-10-19 12:00",
            "2026/10/19",
            "2026-1-9",
            "abcd-ef-gh",
            "2026-10-19T00:00:00",
        ] {
            let err = normalize_date(bad, "startTime").expect_err("应报参数非法");
            assert_eq!(err.kind, ERR_INVALID_PARAMS, "「{bad}」应被拦截");
            assert!(
                err.message.contains("startTime"),
                "错误应点名参数：{}",
                err.message
            );
        }
    }

    #[test]
    fn ms_to_date_key_converts_beijing_date() {
        // 1792490400000 = 2026-10-19T22:00:00Z = 北京时间 2026-10-20 06:00
        assert_eq!(
            ms_to_date_key(Some(1792490400000)).as_deref(),
            Some("2026-10-20")
        );
        assert_eq!(ms_to_date_key(None), None);
        assert_eq!(ms_to_date_key(Some(i64::MAX)), None);
    }

    #[test]
    fn occupancy_records_serialize_as_camel_case() {
        let (records, _) = occupancy_records_of(&serde_json::json!({
            "reserveUserList": [
                {"reserveIntervalId": 2035215, "today": "2026-10-20", "reserveNum": 1, "uid": 1, "uname": "甲"}
            ]
        }));
        let value = serde_json::to_value(&records[0]).expect("可序列化");
        // 前端按 camelCase 读取（命令层 rename_all 不影响嵌套结构体）
        assert_eq!(
            value.get("intervalId").and_then(|v| v.as_i64()),
            Some(2035215)
        );
        assert_eq!(value.get("reserveNum").and_then(|v| v.as_i64()), Some(1));
        assert_eq!(value.get("userName").and_then(|v| v.as_str()), Some("甲"));
        assert!(value.get("interval_id").is_none(), "不得出现 snake_case 键");
    }

    #[test]
    fn protected_keys_cannot_be_overridden_by_extra_or_form_data() {
        let ctx = ReserveContext::from_entry(
            LibraryApp::QuietRoom,
            &make_entry(LibraryApp::QuietRoom, Some("FID"), Some("ENC")),
        )
        .expect("可构造");

        // 提交：extra 试图改写身份 / 审批目标 / 凭证，必须被静默忽略
        let mut extra = BTreeMap::new();
        extra.insert("formUserId".to_string(), "HACKER".to_string());
        extra.insert("aprvId".to_string(), "999999".to_string());
        extra.insert("aprvStatusTypeId".to_string(), "9".to_string());
        extra.insert("fidEnc".to_string(), "HACK".to_string());
        let req = SubmitReserveRequest {
            aprv_id: Some("42".to_string()),
            aprv_status_type_id: Some("1".to_string()),
            form_user_id: Some("406591160".to_string()),
            cycle_type: None,
            form_data: BTreeMap::new(),
            extra,
        };
        let p = submit_params(&ctx, &req);
        assert_eq!(p.get("formUserId").map(String::as_str), Some("406591160"));
        assert_eq!(p.get("aprvId").map(String::as_str), Some("42"));
        assert_eq!(p.get("aprvStatusTypeId").map(String::as_str), Some("1"));
        assert_eq!(p.get("fidEnc").map(String::as_str), Some("FID"));

        // 取消：取消体只由显式字段构成（id / allCancel），不接受透传改写
        let p = cancel_params(
            &ctx,
            &CancelReserveRequest {
                id: "30035270".to_string(),
                all_cancel: false,
            },
        );
        assert_eq!(p.get("id").map(String::as_str), Some("30035270"));
        assert_eq!(p.get("allCancel").map(String::as_str), Some("0"));

        // form_data（动态表单字段）同样受保护，不能覆盖注入键
        let mut form_data = BTreeMap::new();
        form_data.insert("formUserId".to_string(), "HACKER".to_string());
        form_data.insert("aprvId".to_string(), "999999".to_string());
        let req = SubmitReserveRequest {
            aprv_id: Some("42".to_string()),
            form_user_id: Some("406591160".to_string()),
            form_data,
            ..Default::default()
        };
        let p = submit_params(&ctx, &req);
        assert_eq!(p.get("formUserId").map(String::as_str), Some("406591160"));
        assert_eq!(p.get("aprvId").map(String::as_str), Some("42"));

        // 保护键大小写不敏感（服务端字段大小写不稳定）
        let mut extra = BTreeMap::new();
        extra.insert("FORMUSERID".to_string(), "HACKER".to_string());
        let req = SubmitReserveRequest {
            form_user_id: Some("406591160".to_string()),
            extra,
            ..Default::default()
        };
        let p = submit_params(&ctx, &req);
        assert_eq!(p.get("formUserId").map(String::as_str), Some("406591160"));
        assert!(!p.contains_key("FORMUSERID"));
    }

    #[test]
    fn write_actions_use_strict_success_judgement() {
        // 写接口契约未实测：无 success/code 的响应必须报「结果未知」，不得默认成功
        let unknown = api_write_result(&serde_json::json!({"msg": "该时段已被预约"}), "提交预约")
            .expect_err("不得默认成功");
        assert_eq!(unknown.kind, ERR_UNEXPECTED_RESPONSE);

        // 显式成功仍要判成功（不得引入「成功误判为失败」的回归）
        assert!(api_write_result(&serde_json::json!({"success": true}), "提交预约").is_ok());
        assert!(api_write_result(&serde_json::json!({"code": 0}), "取消预约").is_ok());
        assert!(api_write_result(&serde_json::json!({"code": 200}), "取消预约").is_ok());
    }

    // ── 响应解析 ──

    #[test]
    fn item_info_parses_recon_sample() {
        // 契约文档里的实测响应
        let v: Value = serde_json::json!({
            "id": 24727, "deptId": 25285,
            "advanceDays": 3, "advanceTime": "00:00",
            "durationLimitOpen": 1, "durationLimitMin": 241,
            "confirmDialog": 1, "dialogTitle": "特别提醒",
            "dialogContent": "<p>静音仓要求使用人数为2-6人……</p>",
            "allowReserveSameTime": 1, "allowReserveNowTime": 0,
            "cancelLimit": -1.0, "cycleType": 0
        });
        let info = ReserveItemInfo::from_value(&v);
        assert_eq!(info.id, Some(24727));
        assert_eq!(info.dept_id, Some(25285));
        assert_eq!(info.advance_days, Some(3));
        assert_eq!(info.advance_time.as_deref(), Some("00:00"));
        assert_eq!(info.duration_limit_min, Some(241));
        assert_eq!(info.confirm_dialog, Some(1));
        assert_eq!(info.dialog_title.as_deref(), Some("特别提醒"));
        assert_eq!(info.allow_reserve_now_time, Some(0));
        assert_eq!(info.cancel_limit, Some(-1.0));
        assert_eq!(info.cycle_type, Some(0));
    }

    #[test]
    fn custom_form_config_parses_array_and_object() {
        // 数组形态
        let arr = r#"[{"fieldName":"userName","title":"姓名","fieldType":"input","required":true,"placeholder":"请输入姓名"}]"#;
        let cfg = CustomFormConfig::parse(arr);
        assert!(cfg.parsed);
        assert_eq!(cfg.fields.len(), 1);
        let f = &cfg.fields[0];
        assert_eq!(f.key.as_deref(), Some("userName"));
        assert_eq!(f.label.as_deref(), Some("姓名"));
        assert_eq!(f.field_type.as_deref(), Some("input"));
        assert_eq!(f.required, Some(true));
        assert_eq!(f.placeholder.as_deref(), Some("请输入姓名"));

        // 对象形态（字段数组在已知键下）
        let obj = r#"{"fields":[{"key":"num","label":"人数","type":"number","required":false,"defaultValue":2}],"bindFormField":[]}"#;
        let cfg = CustomFormConfig::parse(obj);
        assert!(cfg.parsed);
        assert_eq!(cfg.fields.len(), 1);
        assert_eq!(cfg.fields[0].key.as_deref(), Some("num"));
        assert_eq!(cfg.fields[0].default_value, Some(serde_json::json!(2)));

        // 对象形态（未知键，退回首个对象数组）
        let fallback = r#"{"whatever":[{"fieldName":"x"}],"other":"y"}"#;
        assert_eq!(CustomFormConfig::parse(fallback).fields.len(), 1);

        // 非法 JSON：不 panic，parsed=false，原样保留
        let bad = CustomFormConfig::parse("not-json");
        assert!(!bad.parsed);
        assert!(bad.fields.is_empty());
        assert_eq!(bad.raw, "not-json");

        // 空串
        let empty = CustomFormConfig::parse("   ");
        assert!(!empty.parsed);
        assert!(empty.fields.is_empty());
    }

    #[test]
    fn custom_form_config_of_handles_missing_and_inline_object() {
        // 缺失
        assert!(CustomFormConfig::of(&serde_json::json!({"aprvId": 0})).is_none());
        // 空字符串视为缺失
        assert!(CustomFormConfig::of(&serde_json::json!({"customFormConfig": "  "})).is_none());
        // 直接是结构（非字符串）
        let inline = CustomFormConfig::of(&serde_json::json!({
            "customFormConfig": [{"fieldName": "a"}]
        }))
        .expect("应解析内联结构");
        assert!(inline.parsed);
        assert_eq!(inline.fields.len(), 1);
    }

    #[test]
    fn time_item_parses_custom_form_config_and_core_fields() {
        let v: Value = serde_json::json!({
            "advanceDays": 14,
            "aprvId": 0,
            "customFormConfig": "[{\"fieldName\":\"userName\",\"title\":\"姓名\"}]",
            "startTime": "08:00",
            "endTime": "21:30"
        });
        let item = ReserveTimeItem::from_value(&v);
        assert_eq!(item.advance_days, Some(14));
        assert_eq!(item.aprv_id, Some(0));
        assert_eq!(item.start_time.as_deref(), Some("08:00"));
        assert_eq!(item.end_time.as_deref(), Some("21:30"));
        let cfg = item.custom_form_config.expect("应解析动态表单");
        assert_eq!(cfg.fields.len(), 1);
        assert_eq!(cfg.fields[0].key.as_deref(), Some("userName"));
    }

    #[test]
    fn extract_list_supports_common_shapes() {
        // 直接数组
        assert_eq!(extract_list(&serde_json::json!([1, 2])).len(), 2);
        // 常见外层键
        assert_eq!(extract_list(&serde_json::json!({"list": [1]})).len(), 1);
        assert_eq!(
            extract_list(&serde_json::json!({"reserveList": [1, 2, 3]})).len(),
            3
        );
        assert_eq!(extract_list(&serde_json::json!({"data": [1]})).len(), 1);
        // 无列表
        assert!(extract_list(&serde_json::json!({"foo": 1})).is_empty());
        assert!(extract_list(&Value::Null).is_empty());
    }

    #[test]
    fn person_role_and_open_team_parse_contract_samples() {
        // 实测样本：roleListSelf
        let roles: Value = serde_json::json!([
            {"alias": "2510231106", "aliasName": "2510231106", "roleId": 3}
        ]);
        let parsed: Vec<PersonRole> = roles
            .as_array()
            .expect("数组")
            .iter()
            .map(PersonRole::from_value)
            .collect();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].alias.as_deref(), Some("2510231106"));
        assert_eq!(parsed[0].role_id, Some(3));

        // 实测样本：openTeam=false
        let data: Value = serde_json::json!({"openTeam": false});
        assert_eq!(value_bool(&data, &["openTeam"]), Some(false));

        // 实测样本：showStyle="0"
        let view: Value = serde_json::json!({"showStyle": "0"});
        assert_eq!(value_string(&view, &["showStyle"]).as_deref(), Some("0"));
    }

    #[test]
    fn endpoints_match_recon_contract() {
        // 防止重构时误改路径（契约文档 01-api-contract.md）
        assert_eq!(ENDPOINT_ITEM_INFO, "reserve/info");
        assert_eq!(ENDPOINT_TIME_LIST, "reserve/item/list/time");
        // 实测新增（2026-10-19）：时段 ID 来自 reserve/item/setting
        assert_eq!(ENDPOINT_ITEM_SETTING, "reserve/item/setting");
        // #1080 实时占用 + 服务端时间（2026-10-19 实测：GET / POST）
        assert_eq!(ENDPOINT_ITEM_USER_LIST, "reserve/item/user/list");
        assert_eq!(ENDPOINT_SPECIAL_RULE, "reserve/special/rule");
        assert_eq!(ENDPOINT_USER_VIEW_FLAG, "reservepc/user/view/flag");
        assert_eq!(ENDPOINT_OPEN_TEAM, "reservepc/open/team");
        assert_eq!(ENDPOINT_TEAM_LIST, "reservepc/team/list");
        assert_eq!(ENDPOINT_PERSON_ROLE, "seat/person/role");
        assert_eq!(ENDPOINT_DIALOG, "reserve/dialog");
        assert_eq!(ENDPOINT_SUBMIT, "reserve/multiple/submit");
        // 实测修正（2026-10-16）：我的预约端点为 reservepc/user/histroy
        // （旧值 reserve/latest/data 实测返回 HTTP 400，需要 itemId，并非列表接口）
        assert_eq!(ENDPOINT_MY_RESERVATIONS, "reservepc/user/histroy");
        // 取消端点与契约已实测（2026-10-19）：POST {id, allCancel}
        assert_eq!(ENDPOINT_CANCEL, "reserve/item/user/cancel");
        // 基址以 / 结尾，路径不得以 / 开头（否则拼接出错）
        for p in [
            ENDPOINT_ITEM_INFO,
            ENDPOINT_TIME_LIST,
            ENDPOINT_ITEM_SETTING,
            ENDPOINT_ITEM_USER_LIST,
            ENDPOINT_SPECIAL_RULE,
            ENDPOINT_SUBMIT,
            ENDPOINT_CANCEL,
            ENDPOINT_MY_RESERVATIONS,
        ] {
            assert!(!p.starts_with('/'), "路径不应以 / 开头：{p}");
        }
        assert!(RESERVE_API_BASE.ends_with('/'));
    }
}
