// 构建脚本：为可执行文件嵌入 UAC manifest（requireAdministrator）。
// 仅 MSVC toolchain 生效（本项目 Windows 构建链为 MSVC）。
// 说明：MSI 卸载（msiexec /x）对 perMachine 安装需要管理员权限；
// 启动器以 requireAdministrator 启动可保证 UAC 提示一次到位。
//
// 实现方式：在 OUT_DIR 生成完整 manifest XML，
// 通过 MSVC 链接器选项 /MANIFEST:EMBED + /MANIFESTINPUT:<file> 嵌入。
// （不使用 /MANIFESTUAC：经 rustc 传递时引号转义不可靠，易生成损坏的 manifest。）
use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();

    if target_os == "windows" && target_env == "msvc" {
        // 1) 在 OUT_DIR 生成 manifest 文件
        let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR 未设置"));
        let manifest_path = out_dir.join("app.manifest");
        let manifest = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="requireAdministrator" uiAccess="false" />
      </requestedPrivileges>
    </security>
  </trustInfo>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">
    <application>
      <!-- Windows 10 / 11 -->
      <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}" />
    </application>
  </compatibility>
</assembly>
"#;
        fs::write(&manifest_path, manifest).expect("写入 app.manifest 失败");

        // 2) 通过链接器选项嵌入 manifest：
        //    /MANIFESTUAC:NO 抑制链接器生成的默认 asInvoker UAC 片段，
        //    避免与 /MANIFESTINPUT 中的 requireAdministrator 片段合并冲突（c1010001）。
        println!("cargo:rustc-link-arg-bins=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg-bins=/MANIFESTUAC:NO");
        println!(
            "cargo:rustc-link-arg-bins=/MANIFESTINPUT:{}",
            manifest_path.display()
        );
    }

    // 源码变更时重新构建
    println!("cargo:rerun-if-changed=build.rs");
}
