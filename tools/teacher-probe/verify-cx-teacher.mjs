import { probe, mask } from "./probe-lib.mjs";
const r = await probe("https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1", { headers: { Accept: "application/json, text/plain, */*", Referer: "https://mooc1.chaoxing.com/" } });
const j = r.json;
console.log("status=", r.status, "result=", j?.result, "msg=", j?.msg);
const ch = j?.channelList || [];
console.log("频道数=", ch.length);
for (const c of ch) {
  console.log(" -", c.cataName, "| courses=", (c.content?.courselist||[]).length, "| studentcount=", c.content?.studentcount, "| role=", c.content?.role, "| isTeacher=", c.content?.isTeacher);
}
// 教师身份字段
const first = ch.flatMap(c => c.content?.courselist || [])[0];
if (first) console.log("\n首门课程字段:", Object.keys(first).join(","));
