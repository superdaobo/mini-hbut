import { probe } from "./probe-lib.mjs";
const r0 = await probe("https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1", { headers: { Accept: "application/json", Referer: "https://mooc1.chaoxing.com/" } });
console.log("backclazzdata:", r0.status, r0.json ? `result=${r0.json.result} channels=${r0.json.channelList?.length}` : "非JSON");
if (r0.json?.result !== 1) { console.log("会话可能过期，需要重建"); process.exit(0); }
// 找一门教师课程的 courseid/clazzid
const C = { courseid: 267998043, clazzid: 157018968, cpi: 446042523 };
const apis = [
  ["课程列表", "https://fycourse.fanya.chaoxing.com/fyportal/courselist/getMyCourseJson"],
  ["学情teach-data", `https://stat2-ans.chaoxing.com/stat2/teach-data/worknum?courseid=${C.courseid}&clazzid=${C.clazzid}&cpi=${C.cpi}&ut=t`],
  ["全班成绩", `https://stat2-ans.chaoxing.com/stat2/score-data/scoreList?courseid=${C.courseid}&clazzid=${C.clazzid}&cpi=${C.cpi}&ut=t`],
  ["学习监控", `https://stat2-ans.chaoxing.com/stat2/study-monitor/v2/studyList?courseid=${C.courseid}&clazzid=${C.clazzid}&cpi=${C.cpi}&ut=t`],
];
for (const [name, url] of apis) {
  const r = await probe(url, { headers: { Accept: "application/json", Referer: "https://mooc1.chaoxing.com/" } });
  const j = r.json;
  console.log(`[${r.status}] ${name} json=${!!j} len=${r.text.length}`);
  if (j) console.log(`   ${JSON.stringify(j).slice(0, 180)}`);
  else console.log(`   ${r.text.trim().slice(0, 80).replace(/\s+/g," ")}`);
  await new Promise(x => setTimeout(x, 300));
}
