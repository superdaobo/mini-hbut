// 修复 <button> 与 </article> 不匹配 + 补「查看课表」提示
import fs from 'node:fs';

const p =
  'D:/wt/teacher-portal-probe-1120/apps/client/src/features/teacher/views/TeacherRoomScheduleView.vue';
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);

// 找到教室卡片区块：<button v-for="item in rooms" 开始，到 </article> 结束
let start = -1;
let end = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<button v-for="item in rooms"')) start = i;
  if (start >= 0 && lines[i].trim() === '</article>') {
    end = i;
    break;
  }
}

if (start < 0 || end < 0) {
  console.log('定位失败 start=', start, 'end=', end);
  process.exit(1);
}

// 在 </article> 之前插入「查看课表」提示，并把 </article> 换成 </button>
const indent = lines[start].match(/^\s*/)[0];
lines.splice(
  end,
  1,
  `${indent}  <span class="tch-rs-open">查看课表 ›</span>`,
  `${indent}</button>`,
);

// 注释也更新（不再是"不可点击"）
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('教室卡片流（不可点击：无教室课表 URL）')) {
    lines[i] = lines[i].replace(
      '教室卡片流（不可点击：无教室课表 URL）',
      '教室卡片流（goal-22：可点击，页内渲染课表）',
    );
  }
}

fs.writeFileSync(p, lines.join('\n'), 'utf8');
console.log('已修复闭合标签并加提示');
console.log('</article> 残留:', (lines.join('\n').match(/<\/article>/g) || []).length);
