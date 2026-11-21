import fs from "node:fs";
import { probe } from "./probe-lib.mjs";
// 1. 取一个真实班级
const list = await probe("https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb/qryBjxx?qx=1&showLastRxnf=&kyzt=&gridtype=jqgrid&page=1&rows=1", { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb?qx=1" } });
const row = (list.json?.results || [])[0];
console.log("班级样例:", JSON.stringify({ bjmc: row?.bjmc, bjbh: row?.bjbh, xqdm: row?.xqdm, xnxq: row?.xnxq, hasEncode: !!row?.encodeId }));
const url = `https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb/ckbjkb?id=${encodeURIComponent(row?.encodeId||"")}&xnxq=${row?.xnxq||"2026-2027-1"}&bjbh=${row?.bjbh||""}&xqdm=${row?.xqdm||"1"}`;
const r = await probe(url, { headers: { Referer: "https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb?qx=1" } });
console.log(`ckbjkb status=${r.status} len=${r.text.length}`);
fs.writeFileSync("page-ckbjkb.html", r.text, "utf8");
// 找课表数据变量
const vars = [...r.text.matchAll(/(?:var|let|const)\s+(\w*(?:kb|Kb|course|Course|pkxx|Pkxx)\w*)\s*=\s*(\[|\{)/g)].map(m => m[1]);
console.log("疑似课表数据变量:", [...new Set(vars)].slice(0, 12).join(", ") || "(无)");
const urls = [...new Set([...r.text.matchAll(/url\s*:\s*['"]([^'"]{4,120})['"]/g)].map(m => m[1]))];
console.log("页面 url 定义:", urls.slice(0, 6).join(" | ") || "(无)");
