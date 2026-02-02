#!/usr/bin/env python3
"""
Mini-HBUT 版本发布脚本
自动递增版本号并推送到 GitHub，触发 CI 构建

使用方法:
    python release.py          # 递增 patch 版本 (1.0.0 → 1.0.1)
    python release.py minor    # 递增 minor 版本 (1.0.0 → 1.1.0)
    python release.py major    # 递增 major 版本 (1.0.0 → 2.0.0)
    python release.py --no-confirm  # 跳过确认直接发布
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from datetime import datetime

REPO_URL = "https://github.com/superdaobo/mini-hbut.git"
# release.py 在 tauri-app 目录下，tauri-app 本身就是 git 仓库根目录
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR  # tauri-app 就是项目根目录
# 不要上传到 GitHub 的调试文件/工具目录
EXCLUDE_GLOBS = [
    "debug_*",
]
EXCLUDE_DIRS = [
    "tools",
]

def collect_excluded_paths() -> list:
    """收集需要排除提交的文件/目录（相对路径）"""
    excluded = set()
    for pattern in EXCLUDE_GLOBS:
        for path in PROJECT_DIR.rglob(pattern):
            if path.is_file():
                excluded.add(path.relative_to(PROJECT_DIR).as_posix())
    for dirname in EXCLUDE_DIRS:
        dir_path = PROJECT_DIR / dirname
        if dir_path.exists():
            excluded.add(dir_path.relative_to(PROJECT_DIR).as_posix())
    return sorted(excluded)

def read_json(path: Path) -> dict:
    """读取 JSON 文件"""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def write_json(path: Path, data: dict):
    """写入 JSON 文件"""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

def read_toml(path: Path) -> str:
    """读取 TOML 文件内容"""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def write_toml(path: Path, content: str):
    """写入 TOML 文件"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

def parse_version(version_str: str) -> tuple:
    """解析版本号"""
    match = re.match(r"(\d+)\.(\d+)\.(\d+)", version_str)
    if match:
        return tuple(map(int, match.groups()))
    return (1, 0, 0)

def increment_version(version_str: str, bump: str = "patch") -> str:
    """递增版本号
    bump: major, minor, patch
    """
    major, minor, patch = parse_version(version_str)
    
    if bump == "major":
        major += 1
        minor = 0
        patch = 0
    elif bump == "minor":
        minor += 1
        patch = 0
    else:  # patch
        patch += 1
    
    return f"{major}.{minor}.{patch}"

def get_current_version() -> str:
    """获取当前版本号"""
    package_json = PROJECT_DIR / "package.json"
    if package_json.exists():
        data = read_json(package_json)
        return data.get("version", "1.0.0")
    return "1.0.0"

def update_version_in_files(new_version: str):
    """更新所有文件中的版本号"""
    updated_files = []
    
    # 1. package.json
    package_json = PROJECT_DIR / "package.json"
    if package_json.exists():
        data = read_json(package_json)
        data["version"] = new_version
        write_json(package_json, data)
        updated_files.append("package.json")
        print(f"  ✅ package.json: {new_version}")
    
    # 2. tauri.conf.json
    tauri_conf = PROJECT_DIR / "src-tauri" / "tauri.conf.json"
    if tauri_conf.exists():
        data = read_json(tauri_conf)
        data["version"] = new_version
        write_json(tauri_conf, data)
        updated_files.append("src-tauri/tauri.conf.json")
        print(f"  ✅ tauri.conf.json: {new_version}")
    
    # 3. Cargo.toml
    cargo_toml = PROJECT_DIR / "src-tauri" / "Cargo.toml"
    if cargo_toml.exists():
        content = read_toml(cargo_toml)
        # 使用正则替换版本号 (只替换第一个，即 package 中的版本)
        content = re.sub(
            r'^version = "[^"]*"',
            f'version = "{new_version}"',
            content,
            count=1,
            flags=re.MULTILINE
        )
        write_toml(cargo_toml, content)
        updated_files.append("src-tauri/Cargo.toml")
        print(f"  ✅ Cargo.toml: {new_version}")
    
    return updated_files

def run_command(cmd: list, cwd: Path = None, check: bool = True) -> tuple:
    """运行命令，返回 (success, stdout, stderr)"""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd or PROJECT_DIR,
            check=check,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        stdout = result.stdout.strip() if result.stdout else ""
        stderr = result.stderr.strip() if result.stderr else ""
        return True, stdout, stderr
    except subprocess.CalledProcessError as e:
        stdout = e.stdout.strip() if e.stdout else ""
        stderr = e.stderr.strip() if e.stderr else ""
        return False, stdout, stderr
    except Exception as e:
        return False, "", str(e)

def get_recent_commits(count: int = 5) -> list:
    """获取最近的 commit 信息"""
    success, stdout, _ = run_command(["git", "log", f"-{count}", "--oneline"])
    if success and stdout:
        return stdout.split("\n")
    return []

def git_push(version: str, message: str = None):
    """Git 提交并推送"""
    if not message:
        message = f"🚀 Release v{version}"
    
    git_dir = PROJECT_DIR
    tag_name = f"v{version}"
    
    print(f"\n📤 Git 操作...")
    
    # 1. 确保远程仓库配置正确
    success, current_remote, _ = run_command(["git", "remote", "get-url", "origin"], check=False)
    if not success or current_remote != REPO_URL:
        run_command(["git", "remote", "remove", "origin"], check=False)
        run_command(["git", "remote", "add", "origin", REPO_URL])
        print(f"  ✅ 配置远程仓库: {REPO_URL}")
    
    # 2. 添加所有更改（排除调试文件/tools）
    run_command(["git", "add", "-A"])
    excluded = collect_excluded_paths()
    if excluded:
        run_command(["git", "reset", "--"] + excluded, check=False)
        print("  ✅ 已暂存所有更改（已排除调试文件/tools）")
    else:
        print("  ✅ 已暂存所有更改")
    
    # 3. 提交
    success, _, _ = run_command(["git", "commit", "-m", message], check=False)
    if success:
        print(f"  ✅ 提交: {message}")
    else:
        print("  ℹ️ 没有新的更改需要提交")
    
    # 4. 删除本地和远程的旧标签（如果存在）
    run_command(["git", "tag", "-d", tag_name], check=False)
    run_command(["git", "push", "origin", "--delete", tag_name], check=False)
    
    # 5. 创建新标签
    run_command(["git", "tag", "-a", tag_name, "-m", f"Release {tag_name}"])
    print(f"  ✅ 创建标签: {tag_name}")
    
    # 6. 推送代码
    print(f"\n📤 推送到 {REPO_URL}...")
    success, _, stderr = run_command(["git", "push", "-u", "origin", "main", "--force"])
    if success:
        print("  ✅ 推送代码成功")
    else:
        print(f"  ⚠️ 推送代码: {stderr}")
    
    # 7. 推送标签
    success, _, stderr = run_command(["git", "push", "origin", tag_name, "--force"])
    if success:
        print("  ✅ 推送标签成功")
    else:
        print(f"  ⚠️ 推送标签: {stderr}")
    
    print(f"\n✅ 成功发布 {tag_name} 到 GitHub!")
    print(f"🔗 查看发布: https://github.com/superdaobo/mini-hbut/releases/tag/{tag_name}")
    print(f"🔗 查看 Actions: https://github.com/superdaobo/mini-hbut/actions")

def main():
    """主函数"""
    print("=" * 55)
    print("🚀 Mini-HBUT 版本发布脚本")
    print("=" * 55)
    
    # 解析参数
    args = sys.argv[1:]
    bump_type = "patch"
    no_confirm = "--no-confirm" in args or "-y" in args
    
    for arg in args:
        if arg in ["major", "minor", "patch"]:
            bump_type = arg
    
    # 获取当前版本
    current_version = get_current_version()
    print(f"\n📦 当前版本: v{current_version}")
    
    # 计算新版本
    new_version = increment_version(current_version, bump_type)
    print(f"📈 新版本: v{new_version} ({bump_type})")
    
    # 显示最近的提交
    print(f"\n📜 最近提交:")
    for commit in get_recent_commits(3):
        print(f"  • {commit}")
    
    # 确认
    if not no_confirm:
        print(f"\n即将发布 v{new_version}")
        print("此操作将:")
        print("  1. 更新 package.json, tauri.conf.json, Cargo.toml 中的版本号")
        print("  2. 提交更改到 Git")
        print(f"  3. 创建并推送标签 v{new_version}")
        print("  4. 触发 GitHub Actions 自动构建")
        
        confirm = input(f"\n确认发布? [y/N]: ").strip().lower()
        if confirm != "y":
            print("❌ 取消发布")
            return
    
    # 更新版本号
    print(f"\n📝 更新版本号到 {new_version}...")
    update_version_in_files(new_version)
    
    # Git 操作
    git_push(new_version)
    
    print("\n" + "=" * 55)
    print(f"✅ v{new_version} 发布成功!")
    print("GitHub Actions 将自动构建:")
    print("  • Android APK (arm64)")
    print("  • Windows 安装包 (MSI/EXE)")
    print("  • macOS 安装包 (DMG)")
    print("=" * 55)

if __name__ == "__main__":
    main()
