// goal-22 / T03：注册 teacher_class_schedule_fetch（命令 + lib.rs + bridge + 前端 API）
import fs from 'node:fs';

const ROOT = 'D:/wt/teacher-portal-probe-1120/apps/client';

// ── 1. transport/tauri/teacher.rs 追加命令 ──────────────────────────
const transportPath = `${ROOT}/src-tauri/src/transport/tauri/teacher.rs`;
let transport = fs.readFileSync(transportPath, 'utf8');
if (!transport.includes('teacher_class_schedule_fetch')) {
  const cmd = `
/// 班级课表结构化数据（goal-22：应用内网格渲染，不再外跳浏览器）。
#[tauri::command]
pub(crate) async fn teacher_class_schedule_fetch(
    state: State<'_, AppState>,
    encode_id: Option<String>,
    semester: Option<String>,
    campus_id: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_class_schedule(encode_id, semester, campus_id)
        .await
        .map_err(map_error)
}
`;
  transport += cmd;
  fs.writeFileSync(transportPath, transport, 'utf8');
  console.log('transport: 已追加命令');
} else {
  console.log('transport: 已存在');
}

// ── 2. lib.rs 注册 ────────────────────────────────────────────────
const libPath = `${ROOT}/src-tauri/src/lib.rs`;
let lib = fs.readFileSync(libPath, 'utf8');
if (!lib.includes('teacher_class_schedule_fetch')) {
  const anchor = 'transport::tauri::teacher::teacher_schedule_lists_fetch,';
  if (lib.includes(anchor)) {
    lib = lib.replace(
      anchor,
      anchor +
        '\n              transport::tauri::teacher::teacher_class_schedule_fetch,',
    );
    fs.writeFileSync(libPath, lib, 'utf8');
    console.log('lib.rs: 已注册');
  } else {
    console.log('lib.rs: 锚点未找到');
  }
} else {
  console.log('lib.rs: 已存在');
}

// ── 3. bridge 路由 ────────────────────────────────────────────────
const bridgePath = `${ROOT}/src-tauri/src/http_server/routes/teacher.rs`;
let bridge = fs.readFileSync(bridgePath, 'utf8');
if (!bridge.includes('teacher_class_schedule')) {
  // 3a 处理函数
  const handler = `
/// 班级课表结构化数据（goal-22）。
async fn teacher_class_schedule(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(request): Json<TeacherClassScheduleRequest>,
) -> Result<
    Json<ApiResponse<serde_json::Value>>,
    (StatusCode, Json<ApiResponse<serde_json::Value>>),
> {
    ensure_sensitive_bridge_auth(&headers, &state)?;
    service(&state)
        .fetch_class_schedule(request.encode_id, request.semester, request.campus_id)
        .await
        .map(ok)
        .map_err(map_error)
}
`;
  bridge += handler;

  // 3b 请求结构体
  const reqStruct = `
#[derive(Debug, Deserialize, Default)]
struct TeacherClassScheduleRequest {
    #[serde(alias = "encodeId")]
    encode_id: Option<String>,
    semester: Option<String>,
    #[serde(alias = "campusId")]
    campus_id: Option<String>,
}
`;
  bridge += reqStruct;

  // 3c 路由注册
  const routeAnchor =
    '        .route("/v2/teacher/schedule-lists", post(teacher_schedule_lists))';
  if (bridge.includes(routeAnchor)) {
    bridge = bridge.replace(
      routeAnchor,
      routeAnchor +
        '\n        .route("/v2/teacher/class-schedule", post(teacher_class_schedule))',
    );
  }
  fs.writeFileSync(bridgePath, bridge, 'utf8');
  console.log('bridge: 已追加路由与处理函数');
} else {
  console.log('bridge: 已存在');
}

// ── 4. 前端 API ──────────────────────────────────────────────────
const apiPath = `${ROOT}/src/features/teacher/api/teacherApi.ts`;
let api = fs.readFileSync(apiPath, 'utf8');
if (!api.includes('fetchTeacherClassSchedule')) {
  const fn = `
/**
 * 班级课表结构化数据（\`teacher_class_schedule_fetch\` / \`/v2/teacher/class-schedule\`）。
 *
 * goal-22：返回 46 条量级的课程条目（kcmc/xingqi/djc/zcstr/croommc…），
 * 供课表 Tab 在**应用内**用网格渲染 —— 不再打开外部浏览器。
 *
 * \`encodeId\` 来自班级列表（\`fetchTeacherScheduleLists\` 的 \`classes[].encodeId\`）。
 */
export const fetchTeacherClassSchedule = (
  params: { encodeId: string; semester?: string; campusId?: string },
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherRawPayload>> =>
  runTeacherFetch<TeacherRawPayload>(
    {
      command: 'teacher_class_schedule_fetch',
      tauriArgs: {
        encodeId: params.encodeId,
        semester: params.semester ?? null,
        campusId: params.campusId ?? null
      },
      bridgePath: '/v2/teacher/class-schedule',
      bridgePayload: {
        encodeId: params.encodeId,
        semester: params.semester ?? null,
        campusId: params.campusId ?? null
      },
      normalize: (raw) => raw as TeacherRawPayload,
      isEmpty: emptyWhenNoKeys
    },
    options
  )
`;
  api += fn;
  fs.writeFileSync(apiPath, api, 'utf8');
  console.log('前端 API: 已追加');
} else {
  console.log('前端 API: 已存在');
}
