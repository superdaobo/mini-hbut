#!/usr/bin/env node
/**
 * check_tauri_command_grants.mjs —— Tauri v2「应用命令」ACL 收窄守门脚本
 *
 * 背景：Tauri v2 默认把 invoke_handler 注册的所有应用命令开放给**所有** webview
 *（含远程内容）。要收窄，必须两份声明都对齐：
 *   1) src-tauri/build.rs 里 `tauri_build::AppManifest::new().commands(&[...])`
 *      声明命令清单（AppManifest）；
 *   2) src-tauri/capabilities/*.json 的 permissions 里为每个命令显式授权
 *      `allow-<command-name>`。
 *
 * 本脚本对齐检查三份数据：
 *   A：src-tauri/src/lib.rs 中 `tauri::generate_handler![ ... ]` 注册的命令
 *      （支持 `module::path::command_name` 形式，取最后一段；支持字符串字面量与裸标识符）
 *   B：src-tauri/build.rs 中 `AppManifest::new().commands(&[...])` 声明的命令
 *      （文件或语句缺失时标 MISSING，按空集参与对比）
 *   C：src-tauri/capabilities/*.json 所有 permissions 数组里形如 `allow-<name>`
 *      的条目（插件权限如 `core:webview:allow-...` 带命名空间，不算应用命令，忽略）
 *
 * 三类差异及后果：
 *   1. A - B：注册了但没在 AppManifest 里声明
 *      → 命令清单收窄不生效：该命令仍对所有 webview（含远程内容）开放，ACL 管不到它。
 *   2. B - C：声明了但没有任何 capability 授权
 *      → 命令会被 ACL 拒绝：主窗口调用时会得到 permission-denied，功能直接失效。
 *   3. C - B：授权了但 AppManifest 里没有对应命令
 *      → 冗余/拼写错误：授权白写，或命令名拼错导致真正的授权漏网。
 *
 * 用法：
 *   node scripts/check_tauri_command_grants.mjs [--root <apps/client 路径>] [--json]
 *   --root 缺省取脚本所在目录的上一级（即 apps/client）。
 *
 * 退出码：0 = 三份清单全对齐；1 = 存在任一差异；2 = 用法/IO 错误。
 *
 * 实现约束：只用 node:fs / node:path（JSON.parse 为内置能力），正则提取字符串字面量
 * 与裸标识符，不做 Rust AST 解析。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_PRINT_PER_DIFF = 30; // 每类差异最多逐条打印 30 条，其余只报总数

/* ---------------- 参数解析 ---------------- */

function parseArgs(argv) {
  const opts = { root: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') {
      opts.json = true;
    } else if (a === '--root') {
      if (i + 1 >= argv.length) fail('缺少 --root 的路径参数');
      opts.root = path.resolve(argv[++i]);
    } else if (a.startsWith('--root=')) {
      opts.root = path.resolve(a.slice('--root='.length));
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(
        '用法: node check_tauri_command_grants.mjs [--root <apps/client 路径>] [--json]\n',
      );
      process.exit(0);
    } else {
      fail(`未知参数: ${a}（支持 --root <路径> / --json）`);
    }
  }
  return opts;
}

function fail(msg) {
  process.stderr.write(`[check_tauri_command_grants] ${msg}\n`);
  process.exit(2);
}

/* ---------------- 文本级提取工具（非 Rust AST） ---------------- */

/**
 * 从 src 的 startIdx（'[' 的位置）起做括号配对，返回中括号内的子串；未配对返回 null。
 */
function extractBracketBody(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return src.slice(openIdx + 1, i);
    }
  }
  return null;
}

/**
 * 去掉 Rust 注释（行注释 // 与块注释 /* ... *\/），保留字符串字面量原样
 *（字符串里的 // 或 /* 不当作注释）。
 */
function stripRustComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      // 字符串/字符字面量：原样拷贝（处理反斜杠转义）
      const quote = ch;
      out += ch;
      i++;
      while (i < src.length) {
        out += src[i];
        if (src[i] === '\\' && i + 1 < src.length) {
          out += src[i + 1];
          i += 2;
        } else {
          i++;
          if (src[i - 1] === quote) break;
        }
      }
    } else if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2; // 跳过块注释结尾
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** `a::b::cmd` / `"a::b::cmd"` → `cmd`；非法标识符返回 null。 */
function lastPathSegment(raw) {
  const t = raw.trim();
  if (!t) return null;
  const parts = t.split('::').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(last) ? last : null;
}

/** 去掉 `#[ ... ]` 属性宏（如 `#[cfg(feature = "bridge")]`），避免其内的标识符/字符串混入命令清单。 */
function stripRustAttributes(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] === '#' && src[i + 1] === '[') {
      const end = skipMatchingBracket(src, i + 1);
      if (end === -1) {
        out += src[i];
        i++;
      } else {
        i = end + 1; // 整个属性丢弃
      }
    } else {
      out += src[i];
      i++;
    }
  }
  return out;
}

/** 从 src[openIdx]（'['）跳到配对 ']' 的下标（跳过字符串字面量）；未配对返回 -1。 */
function skipMatchingBracket(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') i++;
        else if (src[i] === quote) break;
        i++;
      }
      continue;
    }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 从宏/调用体内提取命令名：
 *  1) 字符串字面量（如 "transport::tauri::auth::get_login_page" 或 "get_login_page"），取最后一段；
 *  2) 去掉字符串后，剩下的裸标识符路径（如 transport::tauri::auth::get_login_page），取最后一段。
 * 返回排序后的去重数组。
 */
function extractCommandNames(body) {
  // 先剥注释，再剥属性宏（#[cfg(...)] 里的 cfg/feature/字符串都不是命令）
  const cleaned = stripRustAttributes(stripRustComments(body));
  const names = new Set();
  const strRe = /"(?:[^"\\]|\\.)*"/g;
  for (const m of cleaned.matchAll(strRe)) {
    const seg = lastPathSegment(m[0].slice(1, -1));
    if (seg) names.add(seg);
  }
  const bareSource = cleaned.replace(strRe, ' ');
  const idRe = /[A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*/g;
  for (const m of bareSource.matchAll(idRe)) {
    const seg = lastPathSegment(m[0]);
    if (seg) names.add(seg);
  }
  return [...names].sort();
}

/* ---------------- 三份清单采集 ---------------- */

/** A：lib.rs 的 tauri::generate_handler![...] */
function collectRegistered(root) {
  const file = path.join(root, 'src-tauri', 'src', 'lib.rs');
  const result = { file, found: false, list: [] };
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    return { ...result, missing: 'file' };
  }
  const macroName = 'generate_handler!';
  const idx = src.indexOf(macroName);
  if (idx === -1) return { ...result, missing: 'macro' };
  const openIdx = src.indexOf('[', idx + macroName.length);
  if (openIdx === -1) return { ...result, missing: 'bracket' };
  const body = extractBracketBody(src, openIdx);
  if (body === null) return { ...result, missing: 'unbalanced-bracket' };
  result.found = true;
  result.list = extractCommandNames(body);
  return result;
}

/**
 * B：build.rs 的 AppManifest::new().commands(&[...])
 * 文件缺失或没有该语句 → MISSING（按空集参与对比，这是当前仓库的真实状态）。
 */
function collectManifest(root) {
  const file = path.join(root, 'src-tauri', 'build.rs');
  const result = { file, status: 'OK', list: [] };
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    return { ...result, status: 'MISSING', reason: 'build.rs 文件不存在' };
  }
  const amIdx = src.indexOf('AppManifest');
  if (amIdx === -1) {
    return { ...result, status: 'MISSING', reason: 'build.rs 中没有 AppManifest 语句' };
  }
  const callIdx = src.indexOf('commands(', amIdx);
  if (callIdx === -1) {
    return { ...result, status: 'MISSING', reason: 'AppManifest 链上找不到 .commands(...)' };
  }
  const argStart = callIdx + 'commands('.length;
  // 两种受支持写法：
  //   a) 内联数组：.commands(&["a", "b"])
  //   b) 变量间接：.commands(app_commands)，其中 `let app_commands: &[&str] = &[...];`
  //      （生成器脚本 sync_tauri_command_grants.mjs 采用 b，便于长清单可读）
  if (src.startsWith('&[', argStart)) {
    const body = extractBracketBody(src, argStart + 1);
    if (body === null) return { ...result, status: 'MISSING', reason: 'commands(&[...]) 括号未配对' };
    result.list = extractCommandNames(body);
    return result;
  }
  const identMatch = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(src.slice(argStart));
  if (!identMatch) {
    return { ...result, status: 'MISSING', reason: '.commands(...) 参数既不是内联数组也不是标识符' };
  }
  const ident = identMatch[1];
  // 注意：模板字符串里必须写 `\\s`（写成 `\s` 会被解析成普通字符 s，正则永远匹配不到）
  const declIdx = src.search(new RegExp(`let\\s+${ident}\\s*:`));
  if (declIdx === -1) {
    return { ...result, status: 'MISSING', reason: `找不到 .commands(${ident}) 对应的 let 声明` };
  }
  // 必须定位到 `= &[`（值），不能只找 `&[`：类型标注 `&[&str]` 里也有 `&[`，
  // 否则会把 `str` 当成命令名解析出来。
  const assignIdx = src.indexOf('= &[', declIdx);
  if (assignIdx === -1) {
    return { ...result, status: 'MISSING', reason: `let ${ident} 的数组字面量缺失` };
  }
  const body = extractBracketBody(src, assignIdx + 3);
  if (body === null) return { ...result, status: 'MISSING', reason: `let ${ident} 数组括号未配对` };
  result.list = extractCommandNames(body);
  return result;
}

/** C：capabilities/*.json 所有 permissions 数组里 `allow-<name>`（无命名空间）的条目 */
function collectGrants(root) {
  const dir = path.join(root, 'src-tauri', 'capabilities');
  const result = { dir, files: [], errors: [], list: [] };
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    result.missing = 'capabilities 目录不存在';
    return result;
  }
  const names = new Set();
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    result.files.push(name);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      result.errors.push(`${name}: JSON 解析失败（${e.message}）`);
      continue;
    }
    const perms = Array.isArray(data && data.permissions) ? data.permissions : [];
    for (const p of perms) {
      // 只认裸 `allow-<name>`；插件权限（core:xxx:allow-... 等带冒号）不属于应用命令
      if (typeof p === 'string' && /^allow-([A-Za-z_][A-Za-z0-9_-]*)$/.test(p)) {
        // Tauri 生成权限时把命令名 snake_case → kebab-case（`add_schedule_event` →
        // `allow-add-schedule-event`，见 tauri-utils 的 autogenerate_command_permissions），
        // 因此这里统一归一化回 snake_case 再与 A/B 对比。
        names.add(p.slice('allow-'.length).replace(/-/g, '_'));
      }
    }
  }
  result.list = [...names].sort();
  return result;
}

/* ---------------- 对比与报告 ---------------- */

function diff(aSet, bSet) {
  return [...aSet].filter((x) => !bSet.has(x)).sort();
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  // 默认 root = 脚本所在目录（apps/client/scripts）的上一级 = apps/client
  const root = opts.root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  const A = collectRegistered(root);
  const B = collectManifest(root);
  const C = collectGrants(root);

  const setA = new Set(A.list);
  const setB = new Set(B.list);
  const setC = new Set(C.list);

  const aMinusB = diff(setA, setB); // 注册了但没声明 → 收窄不生效
  const bMinusC = diff(setB, setC); // 声明了但没授权 → ACL 拒绝
  const cMinusB = diff(setC, setB); // 授权了但没声明 → 冗余/拼写错

  const diffs = { aMinusB, bMinusC, cMinusB };
  const totalDiff = aMinusB.length + bMinusC.length + cMinusB.length;
  const ok = totalDiff === 0;

  if (opts.json) {
    const report = {
      root,
      sources: {
        generateHandler: { file: A.file, found: A.found, missingReason: A.missing ?? null },
        appManifest: {
          file: B.file,
          status: B.status, // 'OK' | 'MISSING'
          reason: B.reason ?? null,
        },
        capabilities: {
          dir: C.dir,
          files: C.files,
          missingReason: C.missing ?? null,
          parseErrors: C.errors,
        },
      },
      counts: { A: A.list.length, B: B.list.length, C: C.list.length },
      lists: { A: A.list, B: B.list, C: C.list },
      diffs: {
        aMinusB: { count: aMinusB.length, items: aMinusB, printed: aMinusB.slice(0, MAX_PRINT_PER_DIFF) },
        bMinusC: { count: bMinusC.length, items: bMinusC, printed: bMinusC.slice(0, MAX_PRINT_PER_DIFF) },
        cMinusB: { count: cMinusB.length, items: cMinusB, printed: cMinusB.slice(0, MAX_PRINT_PER_DIFF) },
      },
      ok,
    };
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    const out = [];
    out.push('== Tauri 应用命令 ACL 守门检查 ==');
    out.push(`root: ${root}`);
    out.push('');
    out.push(
      `A: ${A.list.length} 个 generate_handler! 注册命令` +
        (A.found ? '' : `（MISSING: ${A.missing}）`) +
        `  [${A.file}]`,
    );
    if (B.status === 'OK') {
      out.push(`B: ${B.list.length} 个 AppManifest 声明命令  [${B.file}]`);
    } else {
      out.push(`B: 0 个 AppManifest 声明命令（MISSING: ${B.reason}）  [${B.file}]`);
    }
    out.push(
      `C: ${C.list.length} 条 allow-<cmd> 授权` +
        (C.missing ? `（MISSING: ${C.missing}）` : `（${C.files.length} 个 capability 文件）`),
    );
    for (const e of C.errors) out.push(`  ! ${e}`);
    out.push('');

    const sections = [
      ['[1] A - B：注册了但没在 AppManifest 里声明 —— 收窄不生效，命令仍对所有 webview（含远程内容）开放', aMinusB],
      ['[2] B - C：声明了但没有任何 capability 授权 —— 命令会被 ACL 拒绝，主窗口调用直接失效', bMinusC],
      ['[3] C - B：授权了但 AppManifest 没有对应命令 —— 冗余/拼写错误', cMinusB],
    ];
    for (const [title, items] of sections) {
      out.push(`${title}`);
      if (items.length === 0) {
        out.push('  （空，通过）');
      } else {
        out.push(`  共 ${items.length} 条${items.length > MAX_PRINT_PER_DIFF ? `，仅列出前 ${MAX_PRINT_PER_DIFF} 条` : ''}:`);
        for (const item of items.slice(0, MAX_PRINT_PER_DIFF)) out.push(`    - ${item}`);
        if (items.length > MAX_PRINT_PER_DIFF) out.push(`    ... 其余 ${items.length - MAX_PRINT_PER_DIFF} 条省略（完整清单可用 --json）`);
      }
      out.push('');
    }

    if (ok) {
      out.push('结果: 三份清单完全对齐，通过 → exit 0');
    } else {
      out.push(
        `结果: 未通过 —— A-B ${aMinusB.length} 条 / B-C ${bMinusC.length} 条 / C-B ${cMinusB.length} 条` +
          `（合计 ${totalDiff} 条）→ exit 1`,
      );
    }
    process.stdout.write(out.join('\n') + '\n');
  }

  process.exitCode = ok ? 0 : 1;
}

main();
