#!/usr/bin/env node
/**
 * 前端安全检查：禁止裸调超星域名 + 敏感字段落日志。
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const CHECKS = [
  {
    name: '前端裸调 *.chaoxing.com',
    pattern: /fetch\(['"]https?:\/\/[^'"]*chaoxing\.com/,
    dirs: ['src'],
    extensions: ['.ts', '.js', '.vue', '.tsx', '.jsx'],
    maxHits: 0,
  },
  {
    name: 'console.log 含敏感字段',
    pattern: /console\.log\([^)]*\b(cookie|(?<![a-zA-Z_])enc(?![a-zA-Z_])|object_id|student_id)\b/,
    dirs: ['src'],
    extensions: ['.ts', '.js', '.vue', '.tsx', '.jsx'],
    maxHits: 0,
  },
  {
    name: 'sleep(10 硬编码延迟',
    pattern: /sleep\(10/,
    dirs: ['src-tauri/src/modules/chaoxing_checkin'],
    extensions: ['.rs'],
    maxHits: 0,
  },
];

function walkFiles(dir, extensions) {
  const results = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git') continue;
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          results.push(...walkFiles(full, extensions));
        } else if (extensions.some(ext => full.endsWith(ext))) {
          results.push(full);
        }
      } catch { /* skip inaccessible */ }
    }
  } catch { /* skip missing dirs */ }
  return results;
}

let failed = false;

for (const check of CHECKS) {
  const hits = [];
  for (const dir of check.dirs) {
    const files = walkFiles(dir, check.extensions);
    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (check.pattern.test(lines[i])) {
            hits.push(`${relative('.', file)}:${i + 1}: ${lines[i].trim()}`);
          }
        }
      } catch { /* skip unreadable */ }
    }
  }

  if (hits.length > check.maxHits) {
    console.error(`❌ ${check.name}: 发现 ${hits.length} 处违规`);
    hits.forEach(h => console.error(`  ${h}`));
    failed = true;
  } else {
    console.log(`✅ ${check.name}: 通过`);
  }
}

if (failed) process.exit(1);
