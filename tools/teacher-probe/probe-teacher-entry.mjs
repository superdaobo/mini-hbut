import fs from "node:fs";
import { probe, mask } from "./probe-lib.mjs";
const C={courseid:258434894,clazzid:134848762,cpi:446042523};
const enc="63186a9cb49ccbb4b706689318a33599";
const q=`courseid=${C.courseid}&clazzid=${C.clazzid}&cpi=${C.cpi}`;
const tests=[
  ["teacher-page", `https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/teacher?${q}&enc=${enc}`],
  ["teacher-middle", `https://mooc1.chaoxing.com/mooc-ans/visit/teachercoursemiddle?${q}&vc=1`],
  ["work-list", `https://mooc1.chaoxing.com/mooc2/work/list?${q}`],
  ["exam-list", `https://mooc1.chaoxing.com/exam-ans/mooc2/exam/exam-list?${q}`],
  ["bbs-topic", `https://groupweb.chaoxing.com/course/topic/topicList?${q}`],
  ["coursedata", `https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/stu-datalist?${q}`],
];
for (const [n,u] of tests) {
  const r = await probe(u, { headers: { Referer: "https://mooc1.chaoxing.com/visit/interaction" } });
  const title=(r.text.match(/<title>([^<]*)<\/title>/)||[,""])[1].trim().slice(0,40);
  console.log(`[${r.status}] ${n} len=${r.text.length} loc=${(r.location||"").slice(0,90)} title=${title}`);
  if (r.text.length>5000) fs.writeFileSync(`cx-${n}.html`, r.text, "utf8");
  await new Promise(x=>setTimeout(x,300));
}
