//! Mini-HBUT MSI 卸载启动器（uninstall.exe）
//!
//! 用途：MSI 安装目录内没有 uninstall.exe（Windows Installer 的卸载走 msiexec），
//! 本启动器作为 INSTALLDIR 内的用户入口，双击后：
//!   1. 在注册表卸载项（HKLM / HKCU，含 WOW6432Node 变体）中查找 DisplayName == "Mini-HBUT"
//!   2. 读取 UninstallString（形如 `MsiExec.exe /I{GUID}` 或 `MsiExec.exe /X{GUID}`）
//!   3. 将 `/I` 规范为 `/X`，直接启动 `msiexec.exe /X{GUID}` 触发卸载
//!   4. 找不到或启动失败时，打开系统「设置 → 应用和功能」让用户手动卸载，退出码 1
//!
//! 全部用户可见输出为简体中文。

use std::process::{exit, Command};
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
use winreg::RegKey;

/// 产品显示名：与 tauri.conf.json 的 productName 一致
const PRODUCT_NAME: &str = "Mini-HBUT";

/// 需要枚举的注册表卸载根（覆盖 perMachine(HKLM) / perUser(HKCU) 与 WOW6432Node 32 位视图变体），
/// 在 find_uninstall_string 中以元组数组形式列出。

fn main() {
    // 1) 定位本产品的卸载串
    match find_uninstall_string() {
        Some(guid_command) => {
            // 2) 规范 /I{GUID} → /X{GUID} 后直接启动 msiexec
            if launch_uninstall(&guid_command) {
                exit(0);
            }
            report_failure_and_open_apps_settings();
        }
        None => report_failure_and_open_apps_settings(),
    }
}

/// 在固定注册表位置逐个子键查找 DisplayName == PRODUCT_NAME 的卸载项，
/// 返回其 UninstallString（例如 `MsiExec.exe /I{XXXXXXXX-...}`）。
fn find_uninstall_string() -> Option<String> {
    // (root hive, 注册表路径) —— 显式列出标准路径与 WOW6432Node 路径
    let roots: [(winreg::HKEY, &str); 4] = [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_CURRENT_USER, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
    ];

    for (hive, subpath) in roots {
        let root = RegKey::predef(hive);
        // 根路径打不开（权限/不存在）则跳过，不算致命
        let Ok(uninstall_root) = root.open_subkey(subpath) else {
            continue;
        };

        for key_name in uninstall_root.enum_keys().flatten() {
            let Ok(product_key) = uninstall_root.open_subkey(&key_name) else {
                continue;
            };

            // DisplayName 匹配才认账（避免误伤其他软件的卸载项）
            let display_name: String = product_key
                .get_value("DisplayName")
                .unwrap_or_default();
            if display_name.trim() != PRODUCT_NAME {
                continue;
            }

            let uninstall_string: String = product_key
                .get_value("UninstallString")
                .unwrap_or_default();
            if uninstall_string.trim().is_empty() {
                continue;
            }
            return Some(uninstall_string);
        }
    }
    None
}

/// 解析 UninstallString 并启动卸载。
/// 典型值：`MsiExec.exe /I{GUID}` / `MsiExec.exe /X{GUID}`。
/// 做法：把 `/I` 规范为 `/X`，用 `msiexec` + 参数数组直接执行（不经 shell）。
fn launch_uninstall(uninstall_string: &str) -> bool {
    let normalized = normalize_to_x(uninstall_string);

    // 拆分：可执行部分（忽略，统一改调 msiexec）+ 产品码参数（含 /X 前缀的 GUID）
    // 典型形态 "MsiExec.exe /I{GUID}" → 取 "/I{GUID}" → 替换为 "/X{GUID}"
    let argument = normalized
        .split_whitespace()
        .find(|token| {
            let lower = token.to_ascii_lowercase();
            (lower.starts_with("/i") || lower.starts_with("/x")) && token.len() > 2
        });

    let Some(argument) = argument else {
        eprintln!("无法解析卸载参数：{uninstall_string}");
        return false;
    };

    let msiexec_argument = format!("/X{}", &argument[2..]);

    // 直接调用系统 msiexec（不经过 shell，避免引号转义问题）
    let status = Command::new("msiexec.exe").arg(msiexec_argument).status();
    match status {
        Ok(_) => true,
        Err(err) => {
            eprintln!("启动 msiexec 卸载失败：{err}");
            false
        }
    }
}

/// 将 UninstallString 中的 `/I`（interactive）规范为 `/X`（uninstall）。
fn normalize_to_x(uninstall_string: &str) -> String {
    // 大小写不敏感地把 "/I{...}" 替换为 "/X{...}"
    if let Some(idx) = uninstall_string
        .to_ascii_lowercase()
        .find("/i{")
    {
        let mut chars: Vec<char> = uninstall_string.chars().collect();
        chars[idx + 1] = 'X';
        chars.into_iter().collect()
    } else {
        uninstall_string.to_string()
    }
}

/// 失败兜底：提示用户 + 打开系统「应用和功能」让其手动卸载，退出码 1。
fn report_failure_and_open_apps_settings() -> ! {
    eprintln!("未能自动启动卸载程序。正在打开系统「应用和功能」，请手动卸载 {PRODUCT_NAME}。");

    // 无依赖场景下的提示音：借助 rundll32 调用 user32!MessageBeep
    let _ = Command::new("rundll32.exe")
        .args(["user32.dll,MessageBeep"])
        .status();

    // 打开 Windows 设置的「应用和功能」页面（Win10 1709+ 支持 ms-settings:appsfeatures）
    let opened = Command::new("cmd.exe")
        .args(["/C", "start", "", "ms-settings:appsfeatures"])
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    if !opened {
        eprintln!("打开「应用和功能」失败。请手动进入 设置 → 应用 → 安装的应用 中卸载。");
    }

    exit(1);
}
