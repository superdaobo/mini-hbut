import { probe } from "./probe-lib.mjs";
const r = await probe("https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1", { headers: { Accept: "application/json", Referer: "https://mooc1.chaoxing.com/" } });
const teacher = (r.json?.channelList || []).filter(c => c.content && c.content.roletype === 3);
const c = teacher[0]?.content;
console.log("course 字段类型:", typeof c?.course, Array.isArray(c?.course) ? `数组(${c.course.length})` : "");
if (c?.course) {
  const cr = Array.isArray(c.course) ? c.course[0] : c.course;
  console.log("course 键:", Object.keys(cr).join(","));
  console.log("courseid =", cr.courseid ?? cr.courseId ?? cr.id);
}
console.log("");
console.log("=== 5 个教师 channel 的 id/cpi ===");
teacher.forEach((t,i) => { const x=t.content; console.log(`  ${i+1}. ${x.name}  clazzid=${x.id} cpi=${x.cpi} courseid=${x.course?.[0]?.courseid ?? x.course?.courseid ?? "?"}`) });
