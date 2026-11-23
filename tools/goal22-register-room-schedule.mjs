// goal-22 / T02：注册 teacher_room_schedule_fetch（服务层 + 命令 + lib + bridge + 前端 API）
import fs from 'node:fs';

const ROOT = 'D:/wt/teacher-portal-probe-1120/apps/client';

// ── 1. application/teacher.rs ─────────────────────────────────────
const appPath = `${ROOT}/src-tauri/src/application/teacher.rs`;
let app = fs.readFileSync(appPath, 'utf8');
if (!app.includes('fetch_room_schedule')) {
  const anchor = `        class_schedule::fetch_class_schedule_with(&client, encode_id, semester, campus_id)
            .await
            .map_err(ApplicationError::internal)
    }`;
  const anchorAlt = anchor.replace(/\n/g, '\r\n');
  const useAnchor = app.includes(anchor) ? anchor : app.includes(anchorAlt) ? anchorAlt : null;
  if (!useAnchor) {
    console.log('application: 锚点未找到');
  } else {
    const nl = useAnchor.includes('\r\n') ? '\r\n' : '\n';
    const add =
      nl +
      nl +
      '    /// 教室课表**结构化数据**（goal-22：应用内渲染）。' +
      nl +
      '    pub async fn fetch_room_schedule(' +
      nl +
      '        &self,' +
      nl +
      '        encode_id: Option<String>,' +
      nl +
      '        semester: Option<String>,' +
      nl +
      '        campus_id: Option<String>,' +
      nl +
      '    ) -> Result<Value, ApplicationError> {' +
      nl +
      '        self.ensure_teacher_session().await?;' +
      nl +
      '        let client = self.context.client_snapshot().await;' +
      nl +
      '        Self::ensure_registered_path(readonly::PATH_ROOM_SCHEDULE_LIST)?;' +
      nl +
      '        class_schedule::fetch_room_schedule_with(&client, encode_id, semester, campus_id)' +
      nl +
      '            .await' +
      nl +
      '            .map_err(ApplicationError::internal)' +
      nl +
      '    }';
    app = app.replace(useAnchor, useAnchor + add);
    fs.writeFileSync(appPath, app, 'utf8');
    console.log('application: 已追加 fetch_room_schedule');
  }
} else {
  console.log('application: 已存在');
}

// ── 2. transport/tauri/teacher.rs ────────────────────────────────
const transportPath = `${ROOT}/src-tauri/src/transport/tauri/teacher.rs`;
let transport = fs.readFileSync(transportPath, 'utf8');
if (!transport.includes('teacher_room_schedule_fetch')) {
  transport += `
/// 教室课表结构化数据（goal-22：应用内网格渲染）。
#[tauri::command]
pub(crate) async fn teacher_room_schedule_fetch(
    state: State<'_, AppState>,
    encode_id: Option<String>,
    semester: Option<String>,
    campus_id: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_room_schedule(encode_id, semester, campus_id)
        .await
        .map_err(map_error)
}
`;
  fs.writeFileSync(transportPath, transport, 'utf8');
  console.log('transport: 已追加命令');
} else {
  console.log('transport: 已存在');
}

// ── 3. lib.rs ────────────────────────────────────────────────────
const libPath = `${ROOT}/src-tauri/src/lib.rs`;
let lib = fs.readFileSync(libPath, 'utf8');
if (!lib.includes('teacher_room_schedule_fetch')) {
  const anchor = 'transport::tauri::teacher::teacher_class_schedule_fetch,';
  if (lib.includes(anchor)) {
    lib = lib.replace(
      anchor,
      anchor + '\n              transport::tauri::teacher::teacher_room_schedule_fetch,',
    );
    fs.writeFileSync(libPath, lib, 'utf8');
    console.log('lib.rs: 已注册');
  } else {
    console.log('lib.rs: 锚点未找到');
  }
} else {
  console.log('lib.rs: 已存在');
}

// ── 4. bridge 路由 ───────────────────────────────────────────────
const bridgePath = `${ROOT}/src-tauri/src/http_server/routes/teacher.rs`;
let bridge = fs.readFileSync(bridgePath, 'utf8');
if (!bridge.includes('teacher_room_schedule')) {
  bridge += `
/// 教室课表结构化数据（goal-22）。
async fn teacher_room_schedule(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(request): Json<TeacherClassScheduleRequest>,
) -> Result<
    Json<ApiResponse<serde_json::Value>>,
    (StatusCode, Json<ApiResponse<serde_json::Value>>),
> {
    ensure_sensitive_bridge_auth(&headers, &state)?;
    service(&state)
        .fetch_room_schedule(request.encode_id, request.semester, request.campus_id)
        .await
        .map(ok)
        .map_err(map_error)
}
`;
  const routeAnchor =
    '        .route("/v2/teacher/class-schedule", post(teacher_class_schedule))';
  if (bridge.includes(routeAnchor)) {
    bridge = bridge.replace(
      routeAnchor,
      routeAnchor + '\n        .route("/v2/teacher/room-schedule", post(teacher_room_schedule))',
    );
  }
  fs.writeFileSync(bridgePath, bridge, 'utf8');
  console.log('bridge: 已追加');
} else {
  console.log('bridge: 已存在');
}

// ── 5. 前端 API ──────────────────────────────────────────────────
const apiPath = `${ROOT}/src/features/teacher/api/teacherApi.ts`;
let api = fs.readFileSync(apiPath, 'utf8');
if (!api.includes('fetchTeacherRoomSchedule')) {
  api += `
/**
 * 教室课表结构化数据（\`teacher_room_schedule_fetch\` / \`/v2/teacher/room-schedule\`）。
 *
 * 与班级课表同一套解析（字段几乎相同），\`encodeId\` 来自教室列表的 \`rooms[].encodeId\`。
 * 大部分教室返回空数组属正常 —— 该教室本学期没排课。
 */
export const fetchTeacherRoomSchedule = (
  params: { encodeId: string; semester?: string; campusId?: string },
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherRawPayload>> =>
  runTeacherFetch<TeacherRawPayload>(
    {
      command: 'teacher_room_schedule_fetch',
      tauriArgs: {
        encodeId: params.encodeId,
        semester: params.semester ?? null,
        campusId: params.campusId ?? null
      },
      bridgePath: '/v2/teacher/room-schedule',
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
  fs.writeFileSync(apiPath, api, 'utf8');
  console.log('前端 API: 已追加');
} else {
  console.log('前端 API: 已存在');
}
