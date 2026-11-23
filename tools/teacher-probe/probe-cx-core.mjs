// 学习通教师端核心接口验证（Lead 保底探测，避免与子代理产出冲突）
// 教师真实课程：数字化创新设计表达2 / courseid=264704234 / clazzid=149003601 / cpi=446042523
import fs from 'node:fs';
import { probe, mask } from './probe-lib.mjs';

const C = { courseid: 264704234, clazzid: 149003601, cpi: 446042523 };
const OUT = '../../data/teacher-portal-recon-1120/raw/chaoxing-teacher-probe-lead.json';
const rows = [];

async function rec(name, url, opts = {}) {
  try {
    const r = await probe(url, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        Referer: opts.referer || 'https://mooc1.chaoxing.com/',
        ...(opts.headers || {}),
      },
      method: opts.method || 'GET',
      body: opts.body,
    });
    const title = (r.text.match(/<title>([^<]*)<\/title>/) || [, ''])[1].trim().slice(0, 50);
    const isJson = !!r.json;
    const keys = isJson && r.json && typeof r.json === 'object' ? Object.keys(r.json).slice(0, 12) : [];
    rows.push({ name, url: url.split('?')[0], status: r.status, ms: r.ms, kind: isJson ? 'json' : 'html', title, jsonKeys: keys, len: r.text.length, sample: mask(r.text).slice(0, 300) });
    console.log(`[${r.status}] ${name}  ${isJson ? 'JSON ' + keys.join(',') : 'HTML ' + title}  (${r.ms}ms)`);
  } catch (e) {
    rows.push({ name, url: url.split('?')[0], error: String(e).slice(0, 150) });
    console.log(`[ERR] ${name}  ${String(e).slice(0, 100)}`);
  }
  await new Promise(r => setTimeout(r, 250));
}

const q = `courseid=${C.courseid}&clazzid=${C.clazzid}&cpi=${C.cpi}`;

// 课程与章节
await rec('teachercourse', `https://mooc1.chaoxing.com/mooc2-ans/mycourse/teachercourse?${q}&ut=t`);
await rec('studentcourse', `https://mooc1.chaoxing.com/mooc2-ans/mycourse/studentcourse?${q}&ut=t`);
await rec('courselist-api', `https://mooc1-api.chaoxing.com/mycourse/studentcourse?${q}&ut=t`);
await rec('chapter-list', `https://mooc1.chaoxing.com/mooc-ans/mycourse/studentstudycourselist?courseId=${C.courseid}&clazzid=${C.clazzid}&cpi=${C.cpi}&mooc2=1`);

// 作业（教师侧）
await rec('work-list', `https://mooc1.chaoxing.com/mooc2-ans/work/list?courseId=${C.courseid}&classId=${C.clazzid}&cpi=${C.cpi}&isdisplaytable=2&mooc2=1`);
await rec('work-list-ans', `https://mooc1.chaoxing.com/mooc2-ans/work/index?courseId=${C.courseid}&classId=${C.clazzid}&cpi=${C.cpi}`);

// 考试
await rec('exam-list', `https://mooc1.chaoxing.com/mooc2-ans/exam/test/reVersionTestStartNew?courseid=${C.courseid}&classid=${C.clazzid}&cpi=${C.cpi}`);
await rec('exam-ans-list', `https://mooc1.chaoxing.com/exam-ans/mooc2/exam/exam-list?courseId=${C.courseid}&classId=${C.clazzid}&cpi=${C.cpi}`);

// 学生名单 / 统计
await rec('student-list', `https://mooc1.chaoxing.com/mooc2-ans/students/studentList?courseid=${C.courseid}&clazzid=${C.clazzid}&cpi=${C.cpi}`);
await rec('statistic', `https://mooc1.chaoxing.com/mooc2-ans/statistics/statistic?courseid=${C.courseid}&clazzid=${C.clazzid}&cpi=${C.cpi}`);
await rec('course-data', `https://mooc1.chaoxing.com/mooc2-ans/course/statistics?courseId=${C.courseid}&classId=${C.clazzid}&cpi=${C.cpi}`);

// 签到（历史记录，不发起）
await rec('sign-history', `https://mobilelearn.chaoxing.com/widget/activeList?courseId=${C.courseid}&classId=${C.clazzid}&cpi=${C.cpi}`, { referer: 'https://mobilelearn.chaoxing.com/' });
await rec('ppt-list', `https://mooc1.chaoxing.com/mooc2-ans/ppt/list?courseId=${C.courseid}&classId=${C.clazzid}&cpi=${C.cpi}`);

// 通知 / 讨论
await rec('notice-list', `https://mooc1.chaoxing.com/mooc2-ans/notice/list?courseId=${C.courseid}&classId=${C.clazzid}&cpi=${C.cpi}`);
await rec('bbs-list', `https://mooc1.chaoxing.com/mooc2-ans/bbs/list?courseId=${C.courseid}&classId=${C.clazzid}&cpi=${C.cpi}`);

// 教师工作台 / 我的课程页
await rec('space-index', 'https://i.chaoxing.com/base', { referer: 'https://i.chaoxing.com/' });
await rec('fanya-portal', 'https://hbutsie1.fanya.chaoxing.com/portal', { referer: 'https://hbutsie1.fanya.chaoxing.com/' });
await rec('jw-mirror-teacher', 'https://hbut.jw.chaoxing.com/admin/login2?role=js', { referer: 'https://hbut.jw.chaoxing.com/' });

fs.writeFileSync(OUT, JSON.stringify(rows, null, 2), 'utf8');
console.log('\n落盘:', OUT, '条数:', rows.length);
