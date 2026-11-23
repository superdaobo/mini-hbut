import fs from "node:fs";
import { probe } from "./probe-lib.mjs";
// 取一个有课的班级：25建筑学2
const list = await probe("https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb/qryBjxx?qx=1&showLastRxnf=&kyzt=&gridtype=jqgrid&page=1&rows=200&xnxq=2026-2027-1&query.bjmc||=" + encodeURIComponent("25建筑学2"), { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb?qx=1" } });
const rows = list.json?.results || [];
console.log("匹配班级:", rows.length, rows.map(r=>r.bjmc).join(" / "));
const r0 = rows.find(r => String(r.bjmc).includes("25建筑学2")) || rows[0];
if (!r0) { console.log("无班级"); process.exit(0); }
const url = `https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb/ckbjkb?id=${encodeURIComponent(r0.encodeId)}&xnxq=${r0.xnxq}&bjbh=${encodeURIComponent(r0.bjbh)}&xqdm=${r0.xqdm}`;
const r = await probe(url, { headers: { Referer: "https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb?qx=1" } });
fs.writeFileSync("page-ckbjkb-real.html", r.text, "utf8");
console.log("ckbjkb:", r.status, r.text.length, "bytes");
// 找课表格子
const cells = [...r.text.matchAll(/<td[^>]*class="[^"]*(?:kb|cell|course)[^"]*"[^>]*>([\s\S]{0,300}?)<\/td>/g)];
console.log("疑似课表格子:", cells.length);
if (cells[0]) console.log("首格:", cells[0][0].replace(/\s+/g," ").slice(0,300));
