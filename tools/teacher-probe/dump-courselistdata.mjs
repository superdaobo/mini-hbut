import fs from "node:fs";
import { probe } from "./probe-lib.mjs";
const r = await probe("https://mooc1.chaoxing.com/mooc-ans/visit/courselistdata", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: "https://mooc1.chaoxing.com/visit/interaction", "X-Requested-With": "XMLHttpRequest" },
  body: "courseType=1&courseFolderId=0&baseEducation=0&superstarClass=&courseFolderSize=0",
});
fs.writeFileSync("cx-courselistdata.html", r.text, "utf8");
console.log("status=", r.status, "len=", r.text.length);
const ids = [...new Set([...r.text.matchAll(/courseid=(\d+)/g)].map(m=>m[1]))];
const clz = [...new Set([...r.text.matchAll(/clazzid=(\d+)/g)].map(m=>m[1]))];
console.log("courseid:", ids.slice(0,12));
console.log("clazzid:", clz.slice(0,12));
const teacherTag = /教师|我教的|授课/.test(r.text);
console.log("含教师字样:", teacherTag);
// 打印片段
const i = r.text.indexOf("courseid=");
if (i>=0) console.log("\n片段:", r.text.slice(Math.max(0,i-300), i+300).replace(/\s+/g," "));
