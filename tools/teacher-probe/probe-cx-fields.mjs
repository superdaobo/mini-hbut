import { probe } from "./probe-lib.mjs";
const r = await probe("https://fycourse.fanya.chaoxing.com/fyportal/courselist/getMyCourseJson", { headers: { Accept: "application/json", Referer: "https://mooc1.chaoxing.com/" } });
console.log("status=", r.status, "json=", Array.isArray(r.json));
const arr = Array.isArray(r.json) ? r.json : [];
console.log("课程数:", arr.length);
if (arr[0]) {
  const c = arr[0];
  console.log("=== 全部字段 ===");
  console.log(Object.keys(c).join(","));
  console.log("=== 关键字段值 ===");
  for (const k of ["name","courseid","courseId","clazzid","clazzId","cpi","classid","id","role","studentcount","studentCount","clazzname"]) {
    if (k in c) console.log(`  ${k} = ${JSON.stringify(c[k])}`);
  }
}
