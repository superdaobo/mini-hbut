import { probe } from "./probe-lib.mjs";
const C={courseid:258434894,clazzid:134848762,cpi:446042523,fid:25368};
const ts=Date.now();
const tests=[
 ["active-teacher", `https://mobilelearn.chaoxing.com/v2/apis/active/teacher/activelist?fid=${C.fid}&courseId=${C.courseid}&classId=${C.clazzid}&_=${ts}`],
 ["active-teacher2", `https://mobilelearn.chaoxing.com/v2/apis/active/activelist?fid=${C.fid}&courseId=${C.courseid}&classId=${C.clazzid}&_=${ts}`],
 ["work-list2", `https://mooc1.chaoxing.com/mooc2/work/list?courseId=${C.courseid}&classId=${C.clazzid}&cpi=${C.cpi}&isdisplaytable=2&mooc2=1`],
 ["work-list3", `https://mooc1.chaoxing.com/mooc2/work/list?courseId=${C.courseid}&classId=${C.clazzid}&cpi=${C.cpi}`],
 ["stu-list", `https://mooc1.chaoxing.com/mooc2-ans/students/studentList?courseid=${C.courseid}&clazzid=${C.clazzid}&cpi=${C.cpi}`],
 ["tea-stat", `https://mooc1.chaoxing.com/mooc2-ans/statistics/teacherStatistic?courseid=${C.courseid}&clazzid=${C.clazzid}&cpi=${C.cpi}`],
 ["ppt-list", `https://mobilelearn.chaoxing.com/page/ppt/teacherCourseware/teacherCoursewareList?courseId=${C.courseid}&classId=${C.clazzid}`],
];
for (const [n,u] of tests) {
  const r = await probe(u, { headers: { Referer: "https://mooc1.chaoxing.com/", "X-Requested-With":"XMLHttpRequest" } });
  const t=(r.text.match(/<title>([^<]*)<\/title>/)||[,""])[1].trim().slice(0,30);
  console.log(`[${r.status}] ${n} len=${r.text.length} title=${t} ${r.json?("json:"+Object.keys(r.json).join(",")):""}`);
  await new Promise(x=>setTimeout(x,250));
}
