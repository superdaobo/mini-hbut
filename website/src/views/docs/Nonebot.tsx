import { Plug, Terminal, Shield, Send } from 'lucide-react';

const Nonebot = () => {
    return (
        <div className="space-y-10">
            <div className="border-b border-gray-800 pb-6">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                    集成与自动化
                </h1>
                <p className="text-xl text-gray-400">
                    通过本地 HTTP Bridge 将能力提供给 NoneBot、脚本或其他应用，适合自动化通知与二次调用。
                </p>
            </div>

            <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Plug className="text-cyan" size={22} />
                    接入方式
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-black/40 border border-gray-800 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">Bridge 地址</div>
                        <div className="font-mono text-cyan">http://127.0.0.1:4399</div>
                    </div>
                    <div className="p-4 bg-black/40 border border-gray-800 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">响应格式</div>
                        <div className="font-mono text-white">ApiResponse (success/data/error/time)</div>
                    </div>
                </div>
                <p className="text-sm text-gray-400">
                    推荐在本机调用；若需跨设备访问，请通过安全通道转发并增加鉴权。
                </p>
            </section>

            <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Terminal className="text-purple" size={22} />
                    请求示例
                </h2>
                <pre className="bg-black/60 rounded-xl p-5 text-xs text-gray-300 overflow-x-auto border border-gray-800">
{`GET  http://127.0.0.1:4399/health
POST http://127.0.0.1:4399/login
POST http://127.0.0.1:4399/fetch_grades`}
                </pre>
                <p className="text-sm text-gray-400">完整接口清单请参考「Tauri API 手册」。</p>
            </section>

            <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Send className="text-green-400" size={22} />
                    NoneBot 调用示例
                </h2>
                <pre className="bg-black/60 rounded-xl p-5 text-xs text-gray-300 overflow-x-auto border border-gray-800">
{`import httpx
from nonebot import on_command

cmd = on_command("成绩")

@cmd.handle()
async def handle():
    async with httpx.AsyncClient() as client:
        resp = await client.get("http://127.0.0.1:4399/fetch_grades")
        if resp.status_code == 200:
            data = resp.json()
            await cmd.finish(f"GPA: {data.get('data', {}).get('gpa', '-')}")`}
                </pre>
            </section>

            <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Shield className="text-orange-400" size={22} />
                    安全与限频
                </h2>
                <ul className="list-disc list-inside text-gray-400 space-y-2">
                    <li>桥接端口仅监听 127.0.0.1，外网访问需自行转发。</li>
                    <li>涉及缓存读取的接口需要 JWT 或本地信任策略。</li>
                    <li>高频任务建议加本地缓存，避免触发登录频率限制。</li>
                </ul>
            </section>
        </div>
    );
};

export default Nonebot;
