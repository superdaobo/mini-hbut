import { probe } from "./probe-lib.mjs";
const r = await probe("https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1", { headers: { Accept: "application/json", Referer: "https://mooc1.chaoxing.com/" } });
const t = (r.json?.channelList || []).filter(c => c.content && c.content.roletype === 3);
const c = t[0]?.content;
const cd = c?.course?.data;
console.log("course.data 类型:", typeof cd, Array.isArray(cd) ? `数组(${cd.length})` : "");
if (cd) {
  const x = Array.isArray(cd) ? cd[0] : cd;
  console.log("键:", Object.keys(x).slice(0, 20).join(","));
  for (const k of ["courseid","courseId","id","name"]) if (k in x) console.log(`  ${k} = ${JSON.stringify(x[k])}`);
}
