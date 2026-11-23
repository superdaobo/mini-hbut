// 把旧的 fetch_class_schedule_with（自带完整实现）替换为调用公共函数，消除重复
import fs from 'node:fs';

const p =
  'D:/wt/teacher-portal-probe-1120/apps/client/src-tauri/src/http_client/academic/teacher/class_schedule.rs';
let c = fs.readFileSync(p, 'utf8');

const startMark = '/// 拉取某班级的课表。';
const endMark = '/// 拉取某**教室**的课表（goal-22 / T02 实测接口）。';

const start = c.indexOf(startMark);
const end = c.indexOf(endMark);

if (start < 0 || end < 0 || end <= start) {
  console.log('定位失败 start=', start, 'end=', end);
  process.exit(1);
}

const replacement = `/// 拉取某班级的课表。
///
/// 参数 \`encode_id\` 来自 \`qryBjxx\` 的 \`encodeId\`（**不是** \`bjbh\`），
/// \`campus_id\` 来自 \`xqdm\`。
pub(crate) async fn fetch_class_schedule_with(
    client: &HbutClient,
    encode_id: Option<String>,
    semester: Option<String>,
    campus_id: Option<String>,
) -> Result<Value, String> {
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_CLASS_SCHEDULE_LIST
    ));
    fetch_schedule_common(
        client,
        readonly::PATH_CLASS_SCHEDULE_LIST,
        "kcxz",
        "班级",
        encode_id,
        semester,
        campus_id,
    )
    .await
}

`;

c = c.slice(0, start) + replacement + c.slice(end);
fs.writeFileSync(p, c, 'utf8');

console.log('已替换 fetch_class_schedule_with 为公共调用');
console.log('fetch_schedule_common 出现次数:', (c.match(/fetch_schedule_common/g) || []).length);
console.log('文件行数:', c.split('\n').length);
