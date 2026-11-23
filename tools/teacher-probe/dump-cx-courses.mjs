import fs from "node:fs";
import { probe } from "./probe-lib.mjs";
const r = await probe("https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1", { headers: { Accept: "application/json, text/plain, */*", Referer: "https://mooc1.chaoxing.com/" } });
const j = r.json;
const rows = [];
for (const ch of j.channelList) {
  const c = ch.content || {};
  const course = c.course || {};
  const data = course.data;
  const arr = Array.isArray(data) ? data : (data ? [data] : []);
  for (const item of arr) {
    rows.push({ clazzName: c.name, studentcount: c.studentcount, roletype: c.roletype, cpi: c.cpi || item.cpi, clazzid: item.id || c.id, courseid: item.courseid, name: item.name });
  }
}
fs.writeFileSync("cx-courses.json", JSON.stringify(rows, null, 2), "utf8");
console.log("课程条数:", rows.length);
console.log(JSON.stringify(rows.slice(0, 6), null, 2));
