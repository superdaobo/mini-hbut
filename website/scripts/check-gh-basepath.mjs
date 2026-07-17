import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'dist');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(html|js)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(root);
const bareHash = [];
const goodHash = [];
const bareRootHome = [];

for (const file of files) {
  const t = readFileSync(file, 'utf8');
  if (t.includes('/mini-hbut/#')) goodHash.push(file);
  // bare absolute hash that drops basePath
  if (/(?:href|=)["'`]\/#(features|download|about)/.test(t)) bareHash.push(file);
  // client code that builds `/${hash}` without base
  if (t.includes('`/${') && t.includes('startsWith("#")')) bareHash.push(file);
  if (t.includes('/${href}') || t.includes('/${e}') ) {
    // old pattern: `/${href}` when href is #xxx
    if (t.includes('startsWith("#")') || t.includes(".startsWith('#')")) bareHash.push(file);
  }
}

console.log(JSON.stringify({
  fileCount: files.length,
  goodHashFiles: goodHash.length,
  bareHashFiles: [...new Set(bareHash)].map((f) => f.replace(root, 'dist')),
}, null, 2));

if (bareHash.length) process.exitCode = 1;
