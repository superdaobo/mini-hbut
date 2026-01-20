#!/usr/bin/env python3
"""
Mini-HBUT 版本发布脚本
自动递增版本号并推送到 GitHub

使用方法:
    python release.py          # 递增 patch 版本 (1.0.0 → 1.0.1)
    python release.py minor    # 递增 minor 版本 (1.0.0 → 1.1.0)
    python release.py major    # 递增 major 版本 (1.0.0 → 2.0.0)
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO_URL = "https://github.com/superdaobo/mini-hbut.git"
# release.py 在 tauri-app 目录下，tauri-app 本身就是 git 仓库根目录
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR  # tauri-app 就是项目根目录

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
    # 1. package.json
    package_json = PROJECT_DIR / "package.json"
    if package_json.exists():
        data = read_json(package_json)
        data["version"] = new_version
        write_json(package_json, data)
        print(f"✅ 更新 package.json: {new_version}")
    
    # 2. tauri.conf.json
    tauri_conf = PROJECT_DIR / "src-tauri" / "tauri.conf.json"
    if tauri_conf.exists():
        data = read_json(tauri_conf)
        data["version"] = new_version
        write_json(tauri_conf, data)
        print(f"✅ 更新 tauri.conf.json: {new_version}")
    
    # 3. Cargo.toml
    cargo_toml = PROJECT_DIR / "src-tauri" / "Cargo.toml"
    if cargo_toml.exists():
        content = read_toml(cargo_toml)
        # 使用正则替换版本号
        content = re.sub(
            r'^version = "[^"]*"',
            f'version = "{new_version}"',
            content,
            count=1,
            flags=re.MULTILINE
        )
        write_toml(cargo_toml, content)
        print(f"✅ 更新 Cargo.toml: {new_version}")

def run_command(cmd: list, cwd: Path = None) -> bool:
    """运行命令"""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd or PROJECT_DIR,
            check=True,
            capture_output=True,
            text=True
        )
        if result.stdout.strip():
            print(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ 命令失败: {' '.join(cmd)}")
        if e.stderr:
            print(e.stderr)
        return False

def git_push(version: str, message: str = None):
    """Git 提交并推送"""
    if not message:
        message = f"🚀 Release v{version}"
    
    # Git 操作在 tauri-app 目录（这里就是 git 仓库根目录）
    git_dir = PROJECT_DIR
    
    # 检查是否已有远程仓库配置
    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            cwd=git_dir,
            capture_output=True,
            text=True
        )
        if result.returncode != 0 or result.stdout.strip() != REPO_URL:
            # 配置远程仓库
            subprocess.run(["git", "remote", "remove", "origin"], cwd=git_dir, capture_output=True)
            run_command(["git", "remote", "add", "origin", REPO_URL], cwd=git_dir)
    except Exception:
        run_command(["git", "remote", "add", "origin", REPO_URL], cwd=git_dir)
    
    # 添加所有更改
    run_command(["git", "add", "."], cwd=git_dir)
    
    # 提交
    run_command(["git", "commit", "-m", message], cwd=git_dir)
    
    # 创建标签
    tag_name = f"v{version}"
    # 删除本地已存在的同名标签
    subprocess.run(["git", "tag", "-d", tag_name], cwd=git_dir, capture_output=True)
    run_command(["git", "tag", "-a", tag_name, "-m", f"Release {tag_name}"], cwd=git_dir)
    
    # 推送代码和标签
    print(f"📤 推送到 {REPO_URL}...")
    run_command(["git", "push", "-u", "origin", "main", "--force"], cwd=git_dir)
    run_command(["git", "push", "origin", tag_name, "--force"], cwd=git_dir)
    
    print(f"✅ 成功推送 v{version} 到 GitHub!")
    print(f"🔗 查看发布: https://github.com/superdaobo/mini-hbut/releases/tag/{tag_name}")

def main():
    """主函数"""
    print("=" * 50)
    print("🚀 Mini-HBUT 版本发布脚本")
    print("=" * 50)
    
    # 获取当前版本
    current_version = get_current_version()
    print(f"📦 当前版本: v{current_version}")
    
    # 确定版本递增类型
    bump_type = "patch"
    if len(sys.argv) > 1:
        if sys.argv[1] in ["major", "minor", "patch"]:
            bump_type = sys.argv[1]
        else:
            print(f"⚠️ 未知的版本类型: {sys.argv[1]}, 使用默认 patch")
    
    # 计算新版本
    new_version = increment_version(current_version, bump_type)
    print(f"📈 新版本: v{new_version} ({bump_type})")
    
    # 确认
    confirm = input(f"\n确认发布 v{new_version}? [y/N]: ").strip().lower()
    if confirm != "y":
        print("❌ 取消发布")
        return
    
    # 更新版本号
    print("\n📝 更新版本号...")
    update_version_in_files(new_version)
    
    # Git 操作
    print("\n📤 Git 推送...")
    git_push(new_version)
    
    print("\n" + "=" * 50)
    print(f"✅ v{new_version} 发布成功!")
    print("GitHub Actions 将自动构建各平台应用")
    print("=" * 50)

if __name__ == "__main__":
    main()
