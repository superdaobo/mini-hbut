import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'dist/_next/static/chunks');
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = walk(root);
for (const file of files) {
  const t = readFileSync(file, 'utf8');
  if (!t.includes('#features') || !t.includes('获取应用')) continue;
  console.log('file', file);
  console.log('has /mini-hbut', t.includes('/mini-hbut'));
  console.log('has bare /#features string', t.includes('/#features') || t.includes('/#download'));
  // find function near startsWith("#")
  const re = /startsWith\(["']#["']\)[\s\S]{0,250}/g;
  let m;
  while ((m = re.exec(t))) {
    console.log('snippet:', m[0].replace(/\s+/g, ' ').slice(0, 240));
  }
}
