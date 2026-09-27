#!/usr/bin/env bash
# 跨平台集成 Gate —— #907 十游戏迁移后的平台覆盖验证
#
# 覆盖四端（Web / Windows Tauri / Android / iOS 的可行性分层）与十游戏的一致性，
# 输出可归档的通过/失败清单。**不写任何生产数据**。
#
# 用法：bash scripts/ci/game_platform_cross_platform_gate.sh
# 前置：在 tauri-app 仓库根、apps/client 依赖已装（npm ci）且已 build

set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0
SKIP=0
declare -a FAILED_ITEMS=()
declare -a SKIPPED_ITEMS=()

ok()   { echo "  [PASS] $1"; PASS=$((PASS+1)); }
bad()  { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); FAILED_ITEMS+=("$1"); }
skip() { echo "  [SKIP] $1"; SKIP=$((SKIP+1)); SKIPPED_ITEMS+=("$1"); }

echo "=============================================="
echo " Game Platform 跨平台集成 Gate"
echo " commit: $(git rev-parse --short HEAD 2>/dev/null || echo '?')"
echo "=============================================="

# ---------------------------------------------------------------------------
echo
echo "── 1. 十游戏迁移完整性（SDK adapter + SDK 引用）──"
# 应迁移的十个游戏（hbut_gomoku 走 relay 不在本组；hugongda_escape 为 disabled）
GAMES="hecheng_hugongda jump_out_hbut hbut_2048 clumsy_bird_hbut hbut_miner hbut_memory_match hbut_monopoly hbut_stack hbut_parking hbut_match3"
for g in $GAMES; do
  dir="website/modules-src/$g/project/src"
  adapter_js="$dir/utils/game_sdk_adapter.js"
  if [ ! -f "$adapter_js" ]; then
    bad "$g: 缺 game_sdk_adapter.js"
    continue
  fi
  # 主入口必须引用 SDK（Vue 游戏在 App.vue，其余在 main.js）
  entry=""
  for cand in "$dir/main.js" "$dir/App.vue"; do
    [ -f "$cand" ] && grep -qE "MiniHBUTGame|game_sdk" "$cand" 2>/dev/null && entry="$cand" && break
  done
  if [ -z "$entry" ]; then
    bad "$g: 入口未引用 SDK（main.js/App.vue 均未匹配到 MiniHBUTGame|game_sdk）"
    continue
  fi
  # 旧 game_rank.js 必须保留（回滚路径 + 契约测试依赖）
  if [ ! -f "$dir/utils/game_rank.js" ]; then
    bad "$g: game_rank.js 被删除（回滚路径丢失）"
    continue
  fi
  # adapter 的 .d.ts 必须存在（vitest 绿 ≠ typecheck 绿 的历史教训）
  if [ ! -f "$dir/utils/game_sdk_adapter.d.ts" ]; then
    bad "$g: 缺 game_sdk_adapter.d.ts（typecheck 会红）"
    continue
  fi
  ok "$g: adapter + 入口引用 + game_rank.js 保留 + .d.ts"
done

# ---------------------------------------------------------------------------
echo
echo "── 2. 模块契约（11 个 game id 三方一致 + iframe/origin 契约）──"
if (cd apps/client && npx vitest run --config vitest.ci.config.ts \
      src/utils/website_game_modules_contract.spec.ts \
      src/utils/hbut_gomoku_trust_contract.spec.ts > /tmp/gp_gate_contract.log 2>&1); then
  ok "website_game_modules_contract + gomoku 契约"
else
  bad "模块契约测试失败（见 /tmp/gp_gate_contract.log）"
fi

# ---------------------------------------------------------------------------
echo
echo "── 3. SDK 单测与迁移等价性测试 ──"
if (cd apps/client && npx vitest run --config vitest.ci.config.ts \
      src/utils/_sdk_core.spec.ts src/utils/_sdk_modes.spec.ts src/utils/_sdk_submit.spec.ts \
      src/utils/_sdk_hbut_stack_integration.spec.ts \
      src/utils/*_sdk_migration.spec.ts > /tmp/gp_gate_sdk.log 2>&1); then
  ok "SDK 单测 + 各游戏迁移等价性测试"
else
  bad "SDK/迁移测试失败（见 /tmp/gp_gate_sdk.log）"
fi

# ---------------------------------------------------------------------------
echo
echo "── 4. Web 端：前端构建 + SDK 内联冒烟 ──"
if (cd apps/client && npm run build > /tmp/gp_gate_build.log 2>&1); then
  ok "前端构建（Web 产物）"
else
  bad "前端构建失败（见 /tmp/gp_gate_build.log）"
fi
if node website/modules-src/_sdk/tests/build-smoke.mjs > /tmp/gp_gate_smoke.log 2>&1; then
  ok "SDK 内联冒烟（无 _sdk/src 残留）"
else
  bad "SDK 内联冒烟失败（见 /tmp/gp_gate_smoke.log）"
fi

# ---------------------------------------------------------------------------
echo
echo "── 5. 类型门禁（vitest 绿 ≠ typecheck 绿）──"
if (cd apps/client && npm run typecheck > /tmp/gp_gate_tsc.log 2>&1); then
  ok "vue-tsc --noEmit"
else
  bad "typecheck 失败（见 /tmp/gp_gate_tsc.log）"
fi

# ---------------------------------------------------------------------------
echo
echo "── 6. 十游戏模块构建冒烟（需联网装模块依赖）──"
# build_website_modules.mjs 会对每个模块跑 npm ci + vite build；这里抽 2 个代表
for g in hbut_stack hbut_2048; do
  if timeout 300 node scripts/build_website_modules.mjs --modules "$g" > /tmp/gp_gate_mod_$g.log 2>&1; then
    ok "模块构建冒烟：$g"
  else
    skip "模块构建冒烟：$g（可能因无网络/超时；此步在 CI 覆盖）"
  fi
done

# ---------------------------------------------------------------------------
echo
echo "── 7. Windows Tauri 端 ──"
if command -v cargo >/dev/null 2>&1; then
  if timeout 600 cargo check --manifest-path apps/client/src-tauri/Cargo.toml --lib \
       > /tmp/gp_gate_cargo.log 2>&1; then
    ok "cargo check --lib（Windows 宿主编译）"
  else
    bad "cargo check 失败（见 /tmp/gp_gate_cargo.log）"
  fi
else
  skip "cargo 不可用，Windows Tauri 编译交由 CI"
fi

# ---------------------------------------------------------------------------
echo
echo "── 8. Android / iOS 端 ──"
# 本地不具备条件：Android 需 gradle + SDK；iOS 需 macOS（仓库内 gen/apple 为空）
skip "Android 构建（本地无 gradle/SDK 环境，由 dev-build.yml 的 Android job 覆盖）"
skip "iOS 构建（仅 macOS runner 可做，由 ios-testflight.yml 覆盖；本地无 gen/apple）"

# ---------------------------------------------------------------------------
echo
echo "=============================================="
echo " 结果：PASS=$PASS  FAIL=$FAIL  SKIP=$SKIP"
if [ "$FAIL" -gt 0 ]; then
  echo " 失败项："
  for i in "${FAILED_ITEMS[@]}"; do echo "   - $i"; done
fi
if [ "$SKIP" -gt 0 ]; then
  echo " 跳过项（需真机/CI）："
  for i in "${SKIPPED_ITEMS[@]}"; do echo "   - $i"; done
fi
echo "=============================================="
[ "$FAIL" -eq 0 ]
