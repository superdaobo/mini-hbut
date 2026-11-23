// 给 normalize_room 补 encodeId（教室课表必须要）
import fs from 'node:fs';

const p =
  'D:/wt/teacher-portal-probe-1120/apps/client/src-tauri/src/http_client/academic/teacher/schedule_extra.rs';
let c = fs.readFileSync(p, 'utf8');

const marker = '"encodeId": grid::text_field(record, "encodeId")';
if (c.includes(marker)) {
  console.log('已存在，跳过');
} else {
  const anchor = '"capacity": grid::number_field(record, "zdskrnrs"),';
  if (!c.includes(anchor)) {
    console.log('锚点未找到');
    process.exit(1);
  }
  const addition =
    anchor +
    '\n        // goal-22：教室课表接口必须要 encodeId，必须透传（否则前端无从发起查询）\n' +
    '        "encodeId": grid::text_field(record, "encodeId"),\n' +
    '        "semester": grid::text_field(record, "xnxq"),';
  c = c.replace(anchor, addition);
  fs.writeFileSync(p, c, 'utf8');
  console.log('已补 encodeId + semester');
}

const check = fs.readFileSync(p, 'utf8');
console.log('encodeId 出现次数:', (check.match(/"encodeId"/g) || []).length);
