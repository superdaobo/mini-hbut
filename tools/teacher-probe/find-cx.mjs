import { probe } from "./probe-lib.mjs";
const r = await probe("https://jwxt.hbut.edu.cn/admin/?loginType=1");
const t = r.text;
console.log("len=", t.length);
const links = [...t.matchAll(/https?:\/\/[a-z0-9.-]*chaoxing\.com[^"'\s<>]*/gi)].map(m=>m[0]);
console.log("chaoxing 链接:", [...new Set(links)].slice(0,20));
const kw = ["学习通","超星","泛雅","chaoxing","一码通","校园码"];
for (const k of kw) { const i = t.indexOf(k); if (i>=0) console.log(`\n[${k}] @${i}:`, t.slice(Math.max(0,i-150), i+150).replace(/\s+/g," ")); }
