import { Heart, Scale, ExternalLink, Users, Terminal, Plug, Send, Shield, Wrench } from 'lucide-react';

const More = () => {
    return (
        <div className="space-y-12">
            {/* 页面标题 */}
            <div className="border-b border-gray-800 pb-6">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                    更多
                </h1>
                <p className="text-xl text-gray-400">
                    开发指南、NoneBot 集成、参与贡献、开源协议和相关链接。
                </p>
            </div>

            {/* ===== 开发指南 ===== */}
            <section className="space-y-6" id="dev-guide">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Wrench className="text-cyan" size={26} />
                    开发指南
                </h2>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4">
                    <h3 className="text-lg font-bold text-white">环境准备</h3>
                    <ul className="list-disc list-inside text-gray-300 space-y-2">
                        <li><strong>Node.js 20+ 与 npm</strong> — 前端构建和开发服务器。</li>
                        <li><strong>Rust stable（建议 1.78+）</strong> — Tauri 2.x 桌面后端需要 Rust 编译环境。</li>
                        <li><strong>Android SDK / NDK</strong> — 构建 Android 版本时需要（通过 Android Studio 安装最便捷）。</li>
                        <li><strong>macOS + Xcode 15+</strong> — 构建 iOS 版本时需要。</li>
                        <li><strong>Git</strong> — 版本管理。</li>
                    </ul>

                    <h3 className="text-lg font-bold text-white mt-4">快速开始</h3>
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto">
                        <code>{`# 1. 克隆仓库
git clone https://github.com/RollRoll520/Mini-HBUT.git
cd Mini-HBUT/tauri-app

# 2. 安装前端依赖
npm install

# 3. 启动开发模式（前端 + Tauri 桌面端）
npm run tauri dev

# 4. 仅启动前端开发（用于 Web 模式调试）
npm run dev

# 5. 构建桌面端
npm run tauri build

# 6. 构建 Android 端
npm run tauri android build

# 7. 构建 iOS 端（macOS only）
npm run tauri ios build`}</code>
                    </pre>

                    <h3 className="text-lg font-bold text-white mt-4">目录结构速览</h3>
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto font-mono">
                        <code>{`tauri-app/
├── src/                          # Vue 前端
│   ├── components/               #   业务组件（30+）
│   ├── utils/                    #   工具函数
│   │   └── axios_adapter.js      #   HTTP 适配层
│   ├── platform/                 #   平台桥接
│   └── config/                   #   UI 配置
├── src-tauri/
│   └── src/
│       ├── lib.rs                #   Tauri Commands 入口
│       ├── http_client/          #   网络请求模块
│       ├── http_server.rs        #   HTTP Bridge
│       └── db.rs                 #   SQLite
├── android/                      #   Capacitor Android
├── ios/                          #   Capacitor iOS
└── cloudflare/worker/            #   云同步 Worker`}</code>
                    </pre>

                    <h3 className="text-lg font-bold text-white mt-4">新增功能流程</h3>
                    <ol className="list-decimal list-inside text-gray-300 space-y-2">
                        <li>在 <code className="text-sm text-cyan">src-tauri/src/</code>（如 modules、http_client）新增 Rust 业务逻辑。</li>
                        <li>在 <code className="text-sm text-cyan">src-tauri/src/lib.rs</code> 中注册 Tauri Command。</li>
                        <li>前端通过 <code className="text-sm text-cyan">axios_adapter.js</code> 新增 /v2 API 映射。</li>
                        <li>在 <code className="text-sm text-cyan">src/components/</code> 中添加或修改 Vue 组件。</li>
                        <li>补充缓存策略、降级逻辑和错误处理路径。</li>
                    </ol>

                    <h3 className="text-lg font-bold text-white mt-4">质量与安全规范</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-300 space-y-2">
                            <div className="font-semibold text-cyan mb-1">代码安全</div>
                            <div>• 禁止在日志中输出密码、token、cookie。</div>
                            <div>• Rust 端避免 unwrap / expect，统一返回 Result。</div>
                            <div>• 请求失败必须给出可读错误信息。</div>
                        </div>
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-300 space-y-2">
                            <div className="font-semibold text-cyan mb-1">接口规范</div>
                            <div>• Bridge 默认仅监听本地回环（127.0.0.1）。</div>
                            <div>• 高频接口需要限频与缓存。</div>
                            <div>• 新增接口必须给出输入输出示例。</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ===== NoneBot 集成 ===== */}
            <section className="space-y-6" id="nonebot">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Plug className="text-purple" size={26} />
                    NoneBot 集成与自动化
                </h2>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4">
                    <p className="text-gray-300">
                        Mini-HBUT 的 HTTP Bridge（<code className="text-sm text-cyan">127.0.0.1:4399</code>）可以被 NoneBot、脚本或其他程序调用，
                        实现自动通知、定时查询等自动化能力。
                    </p>

                    <h3 className="text-lg font-bold text-white">接入方式</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                        <div className="p-4 rounded-lg bg-black/40 border border-gray-800">
                            <div className="text-xs text-gray-500 mb-1">Bridge 地址</div>
                            <div className="font-mono text-cyan">http://127.0.0.1:4399</div>
                        </div>
                        <div className="p-4 rounded-lg bg-black/40 border border-gray-800">
                            <div className="text-xs text-gray-500 mb-1">响应格式</div>
                            <div className="font-mono text-white text-sm">ApiResponse (success / data / error / time)</div>
                        </div>
                    </div>
                    <p className="text-sm text-gray-400 mt-2">
                        Bridge 仅监听本机，若需跨设备访问请通过安全通道转发并增加鉴权。
                    </p>

                    <h3 className="text-lg font-bold text-white mt-4">常用接口</h3>
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto">
                        <code>{`GET  /health          — 检查 Bridge 是否在线
POST /login           — 触发登录
POST /fetch_grades    — 获取最新成绩
POST /fetch_schedule  — 获取课表
POST /fetch_exams     — 获取考试安排
POST /fetch_ranking   — 获取绩点排名`}</code>
                    </pre>

                    <h3 className="text-lg font-bold text-white mt-4">
                        <Send className="text-green-400 inline mr-1" size={18} />
                        NoneBot 调用示例
                    </h3>
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto">
                        <code>{`import httpx
from nonebot import on_command

cmd = on_command("成绩")

@cmd.handle()
async def handle():
    async with httpx.AsyncClient() as client:
        resp = await client.get("http://127.0.0.1:4399/fetch_grades")
        if resp.status_code == 200:
            data = resp.json()
            await cmd.finish(f"GPA: {data.get('data', {}).get('gpa', '-')}")`}</code>
                    </pre>

                    <h3 className="text-lg font-bold text-white mt-4">
                        <Terminal className="text-purple inline mr-1" size={18} />
                        cURL 调用示例
                    </h3>
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto">
                        <code>{`# 检查服务状态
curl http://127.0.0.1:4399/health

# 获取成绩
curl -X POST http://127.0.0.1:4399/fetch_grades

# 获取课表
curl -X POST http://127.0.0.1:4399/fetch_schedule`}</code>
                    </pre>

                    <h3 className="text-lg font-bold text-white mt-4">
                        <Shield className="text-orange-400 inline mr-1" size={18} />
                        安全与限频
                    </h3>
                    <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                        <li>Bridge 端口仅监听 127.0.0.1，外网访问需自行转发。</li>
                        <li>涉及缓存读取的接口需要 JWT 或本地信任策略。</li>
                        <li>高频任务建议加本地缓存，避免触发登录频率限制。</li>
                    </ul>
                </div>
            </section>

            {/* ===== 参与贡献 ===== */}
            <section className="space-y-6" id="contributing">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Users className="text-cyan" size={26} />
                    参与贡献
                </h2>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4">
                    <p className="text-gray-300">
                        Mini-HBUT 是开源项目，欢迎任何形式的贡献！无论是提交 Bug 报告、功能建议，还是代码贡献。
                    </p>

                    <h3 className="text-lg font-bold text-white">如何贡献</h3>
                    <ol className="list-decimal list-inside text-gray-300 space-y-2">
                        <li><strong>Fork 仓库：</strong>在 GitHub 上 Fork Mini-HBUT 仓库到你的账号。</li>
                        <li><strong>创建分支：</strong>基于 <code className="text-sm text-cyan">main</code> 分支创建你的功能分支（<code className="text-sm text-cyan">feature/你的功能名</code>）。</li>
                        <li><strong>开发测试：</strong>完成开发后确保功能正常运行，并通过基本测试。</li>
                        <li><strong>提交 PR：</strong>向主仓库的 <code className="text-sm text-cyan">main</code> 分支发起 Pull Request。</li>
                        <li><strong>代码审查：</strong>等待维护者审查，可能需要根据反馈修改。</li>
                    </ol>

                    <h3 className="text-lg font-bold text-white mt-4">贡献方式</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
                            <div className="text-2xl mb-2">🐛</div>
                            <div className="font-semibold text-white text-sm">报告 Bug</div>
                            <div className="text-xs text-gray-400 mt-1">在 GitHub Issues 中提交详细的问题描述和复现步骤</div>
                        </div>
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
                            <div className="text-2xl mb-2">💡</div>
                            <div className="font-semibold text-white text-sm">功能建议</div>
                            <div className="text-xs text-gray-400 mt-1">在 Issues 中提出功能请求，描述需求场景</div>
                        </div>
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
                            <div className="text-2xl mb-2">📖</div>
                            <div className="font-semibold text-white text-sm">完善文档</div>
                            <div className="text-xs text-gray-400 mt-1">帮助改进文档、翻译或修正错误</div>
                        </div>
                    </div>

                    <h3 className="text-lg font-bold text-white mt-4">提交规范</h3>
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto">
                        <code>{`# Commit Message 格式
<type>(<scope>): <subject>

# 示例
feat(grade): 添加成绩趋势图表
fix(login): 修复验证码识别失败重试
docs(readme): 更新安装说明
style(schedule): 优化课表卡片布局
refactor(api): 重构缓存管理模块`}</code>
                    </pre>
                </div>
            </section>

            {/* ===== 开源协议 ===== */}
            <section className="space-y-6" id="license">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Scale className="text-purple" size={26} />
                    开源协议
                </h2>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4">
                    <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-cyan/20 text-cyan rounded-full text-sm font-semibold">GPL v3</span>
                        <span className="text-gray-300">GNU General Public License v3.0</span>
                    </div>
                    <p className="text-gray-300 text-sm">简单来说：</p>
                    <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                        <li><strong>可以：</strong>自由使用、修改、分发本软件。</li>
                        <li><strong>要求：</strong>修改后的衍生作品也需要使用 GPL v3 协议发布源代码。</li>
                        <li><strong>禁止：</strong>将本软件闭源后用于商业分发。</li>
                    </ul>
                    <p className="text-gray-400 text-sm mt-2">
                        这意味着你可以自由使用 Mini-HBUT 的代码来学习和开发，但如果你基于它创建了新项目并分发，
                        你需要以相同的开源协议发布你的源代码。
                    </p>
                </div>
            </section>

            {/* ===== 相关链接 ===== */}
            <section className="space-y-6" id="links">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <ExternalLink className="text-cyan" size={26} />
                    相关链接
                </h2>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                            { label: 'GitHub 仓库', url: 'https://github.com/RollRoll520/Mini-HBUT', desc: '源代码、Issue 跟踪、Release 下载' },
                            { label: 'QQ 交流群', url: '#', desc: '加入社区，与其他用户交流（群号见 README）' },
                            { label: '官方网站', url: '/', desc: '你正在浏览的这个网站' },
                            { label: 'Cloudflare Worker 模板', url: 'https://github.com/RollRoll520/Mini-HBUT/tree/main/tauri-app/cloudflare/worker', desc: '云同步服务端代码' },
                        ].map(link => (
                            <a
                                key={link.label}
                                href={link.url}
                                target={link.url.startsWith('http') ? '_blank' : undefined}
                                rel={link.url.startsWith('http') ? 'noopener noreferrer' : undefined}
                                className="p-4 rounded-lg bg-white/5 border border-white/10 hover:border-cyan/50 transition-colors block"
                            >
                                <div className="font-semibold text-white text-sm flex items-center gap-1">
                                    {link.label}
                                    {link.url.startsWith('http') && <ExternalLink size={12} className="text-gray-500" />}
                                </div>
                                <div className="text-xs text-gray-400 mt-1">{link.desc}</div>
                            </a>
                        ))}
                    </div>
                </div>
            </section>

            {/* ===== 致谢 ===== */}
            <section className="space-y-6" id="credits">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Heart className="text-red-400" size={26} />
                    致谢
                </h2>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4">
                    <p className="text-gray-300">Mini-HBUT 的开发离不开以下开源项目和服务：</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                        {[
                            'Vue 3', 'Tauri 2', 'Capacitor', 'Vant 4',
                            'Rust', 'Tokio', 'reqwest', 'scraper',
                            'Vite', 'Pinia', 'Cloudflare Workers', 'jsDelivr',
                        ].map(name => (
                            <div key={name} className="p-2 rounded bg-white/5 text-center text-sm text-gray-300 border border-white/5">
                                {name}
                            </div>
                        ))}
                    </div>
                    <p className="text-gray-400 text-sm mt-3">
                        感谢所有为 Mini-HBUT 提交过代码、报告过问题、提出过建议的贡献者们。
                    </p>
                </div>
            </section>
        </div>
    );
};

export default More;
