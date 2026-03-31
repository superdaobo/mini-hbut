import { Wrench, Terminal, GitBranch, ShieldCheck } from 'lucide-react';

const DevRules = () => {
  return (
    <div className="space-y-10">
      <div className="border-b border-gray-800 pb-6">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
          开发与构建
        </h1>
        <p className="text-xl text-gray-400">
          本页覆盖本地开发、构建规则、发布注意事项和 iOS 侧载安装流程。
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Wrench className="text-cyan" size={22} />
          环境准备
        </h2>
        <ul className="list-disc list-inside text-gray-400 space-y-2">
          <li>Node.js 20+ 与 npm。</li>
          <li>Rust stable（建议 1.78+）与 Tauri 2.x。</li>
          <li>Android 构建需要 Android SDK/NDK。</li>
          <li>iOS 构建需要 macOS + Xcode。</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Terminal className="text-purple" size={22} />
          目录结构速览
        </h2>
        <pre className="bg-black/60 rounded-xl p-5 text-xs text-gray-300 overflow-x-auto border border-gray-800">
{`tauri-app/
  src/                # Vue UI
  src/utils/axios_adapter.js
  src-tauri/
    src/http_client/  # 业务网络层
    src/modules/      # 业务模块
    src/http_server.rs
    src/lib.rs
    src/main.rs`}
        </pre>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <GitBranch className="text-green-400" size={22} />
          新增功能流程
        </h2>
        <ol className="list-decimal list-inside text-gray-400 space-y-2">
          <li>在 <code>src-tauri/src/modules</code> 新增业务逻辑。</li>
          <li>在 <code>src-tauri/src/lib.rs</code> 注册 Tauri Command。</li>
          <li>前端通过 <code>axios_adapter</code> 新增 /v2 映射。</li>
          <li>补充缓存、降级和错误处理路径。</li>
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <ShieldCheck className="text-orange-400" size={22} />
          质量与安全规范
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-xl bg-gray-900/50 border border-gray-800 text-sm text-gray-400 space-y-2">
            <div>禁止在日志中输出密码、token、cookie。</div>
            <div>避免 unwrap / expect，统一返回 Result。</div>
            <div>请求失败必须给出可读错误信息。</div>
          </div>
          <div className="p-5 rounded-xl bg-gray-900/50 border border-gray-800 text-sm text-gray-400 space-y-2">
            <div>Bridge 默认仅监听本地回环。</div>
            <div>高频接口需要限频与缓存。</div>
            <div>新增接口必须给出输入输出示例。</div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <ShieldCheck className="text-cyan" size={22} />
          iOS 侧载安装流程（iLoader + LiveContainer + SideStore）
        </h2>
        <div className="p-5 rounded-xl bg-gray-900/50 border border-gray-800 text-sm text-gray-300 space-y-3">
          <p>目标文件：<code>Mini-HBUT_&lt;version&gt;_iOS.ipa</code>（GitHub Release 提供）。</p>
          <ol className="list-decimal list-inside text-gray-400 space-y-2">
            <li>先完成 SideStore 安装、Apple ID 绑定与证书信任。</li>
            <li>在 SideStore 安装 LiveContainer 与 iLoader。</li>
            <li>把 IPA 传到 iPhone（文件 App / AirDrop / 网盘）。</li>
            <li>在 iLoader 中选择 IPA，完成导入与签名安装。</li>
            <li>回到 SideStore 刷新签名，再启动 Mini-HBUT。</li>
          </ol>
          <div className="text-gray-400">常见问题排查：</div>
          <ul className="list-disc list-inside text-gray-400 space-y-1">
            <li>“无法验证完整性”：重新信任证书并刷新 SideStore。</li>
            <li>“AFC invalid pairing”：重新做手机和电脑配对。</li>
            <li>出现 localhost 开发地址报错：请使用最新 Release IPA，不要用 dev 包。</li>
          </ul>
        </div>
      </section>
    </div>
  );
};

export default DevRules;
