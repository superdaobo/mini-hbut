import fs from "node:fs";
import { probe } from "./probe-lib.mjs";
for (const [tag, url, ref] of [
  ["space", "https://i.chaoxing.com/base", "https://i.chaoxing.com/"],
  ["visit", "https://mooc1.chaoxing.com/visit/interaction", "https://mooc1.chaoxing.com/"],
]) {
  const r = await probe(url, { headers: { Referer: ref } });
  fs.writeFileSync(`cx-${tag}.html`, r.text, "utf8");
  console.log(`\n=== ${tag} status=${r.status} len=${r.text.length} ===`);
  const links = [...r.text.matchAll(/(?:href|src)\s*=\s*["']([^"']{5,200})["']/g)].map(m=>m[1]);
  const uniq = [...new Set(links)].filter(l => /teacher|course|clazz|work|exam|sign|stat|mooc2|mycourse/i.test(l));
  for (const l of uniq.slice(0, 30)) console.log("  ", l.slice(0,150));
}
