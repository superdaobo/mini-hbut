// dump getPageInfo 完整（含菜单树） + 站点切换
import { probe, mask } from './probe-lib.mjs';
import fs from 'node:fs';
const OUT = 'D:/wt/teacher-portal-probe-1120/data/teacher-portal-recon-1120/raw';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

for (const [tag, q] of [['home', 'pageCode=home'], ['empty', '']]) {
  const r = await probe(`https://e.hbut.edu.cn/getPageInfo?${q}`);
  fs.writeFileSync(`${OUT}/pageinfo-${tag}.masked.json`, mask(r.text), 'utf8');
  const d = r.json?.data;
  console.log(`== ${tag}: errcode=${r.json?.errcode} keys=${d ? Object.keys(d) : ''}`);
  if (d?.menuTree) {
    const walk = (n, depth) => {
      console.log('  '.repeat(depth) + `${n.menuName || n.name || '?'} wid=${n.wid} pageCode=${n.pageCode || ''} url=${n.url || n.href || ''}`);
      (n.children || n.subMenus || n.menuList || []).forEach(c => walk(c, depth + 1));
    };
    (Array.isArray(d.menuTree) ? d.menuTree : [d.menuTree]).forEach(m => walk(m, 0));
  }
  await sleep(250);
}
