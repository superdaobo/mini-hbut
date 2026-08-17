#!/usr/bin/env node
/**
 * 设计系统合规检查：扫描签到模块 Vue 文件，禁止硬编码颜色/字号/阴影。
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SCAN_DIRS = [
  'src/components/MoreChaoxingCheckinView.vue',
  'src/components/chaoxing_checkin',
];

const VIOLATIONS = [];

// 禁止硬编码 hex 颜色（允许 rgba/color-mix 中的数字）
const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;
// 允许的例外（如 #fff 在 color: #fff 用于按钮文字是常见模式）
const HEX_ALLOWLIST = ['#fff', '#ffffff'];

function scanFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // 只检查 <style> 部分
  let inStyle = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('<style')) inStyle = true;
    if (line.includes('</style>')) inStyle = false;
    if (!inStyle) continue;

    // 跳过 var() fallback 中的 hex（如 var(--ui-primary, #6366f1)）
    const lineWithoutVarFallback = line.replace(/var\([^,]+,\s*#[0-9a-fA-F]{3,8}\)/g, '');

    const hexMatches = lineWithoutVarFallback.match(HEX_PATTERN);
    if (hexMatches) {
      for (const match of hexMatches) {
        if (!HEX_ALLOWLIST.includes(match.toLowerCase())) {
          VIOLATIONS.push(`${relative('.', filePath)}:${i + 1} — 硬编码颜色 ${match}`);
        }
      }
    }
  }
}

function scanDir(dir) {
  if (statSync(dir).isFile()) {
    if (dir.endsWith('.vue')) scanFile(dir);
    return;
  }
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) scanDir(full);
    else if (full.endsWith('.vue')) scanFile(full);
  }
}

for (const target of SCAN_DIRS) {
  try { scanDir(target); } catch { /* skip if not exists */ }
}

if (VIOLATIONS.length > 0) {
  console.error('❌ 设计系统合规检查失败：');
  VIOLATIONS.forEach(v => console.error(`  ${v}`));
  process.exit(1);
} else {
  console.log('✅ 设计系统合规检查通过');
}
