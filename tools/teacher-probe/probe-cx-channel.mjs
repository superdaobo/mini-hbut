import { probe } from "./probe-lib.mjs";
const r = await probe("https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1", { headers: { Accept: "application/json", Referer: "https://mooc1.chaoxing.com/" } });
const list = r.json?.channelList || [];
console.log("channel 数:", list.length);
const teacher = list.filter(c => c.content && c.content.roletype === 3);
console.log("教师 channel 数:", teacher.length);
if (teacher[0]) {
  const c = teacher[0].content;
  console.log("=== content 全部字段 ===");
  console.log(Object.keys(c).join(","));
  console.log("=== 关键值 ===");
  for (const k of ["id","name","cpi","courseid","courseId","clazzid","clazzId","studentcount","studentCount"]) {
    if (k in c) console.log(`  ${k} = ${JSON.stringify(c[k])}`);
  }
}
