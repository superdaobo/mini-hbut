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
                    Bridge 固定监听本机。除健康检查外，外部脚本必须在启动应用前配置 HBUT_BRIDGE_TOKEN，并发送同值 Bearer Token。
                </p>
            </section>

            <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Terminal className="text-purple" size={22} />
                    请求示例
                </h2>
                <pre className="bg-black/60 rounded-xl p-5 text-xs text-gray-300 overflow-x-auto border border-gray-800">
{`GET  http://127.0.0.1:4399/health
POST http://127.0.0.1:4399/login        Authorization: Bearer $HBUT_BRIDGE_TOKEN
POST http://127.0.0.1:4399/sync_grades  Authorization: Bearer $HBUT_BRIDGE_TOKEN`}
                </pre>
                <p className="text-sm text-gray-400">完整接口清单请参考「Tauri API 手册」。</p>
            </section>

            <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Send className="text-green-400" size={22} />
                    NoneBot 调用示例
                </h2>
                <pre className="bg-black/60 rounded-xl p-5 text-xs text-gray-300 overflow-x-auto border border-gray-800">
{`import os
import httpx
from nonebot import on_command

cmd = on_command("成绩")
token = os.environ["HBUT_BRIDGE_TOKEN"]

@cmd.handle()
async def handle():
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "http://127.0.0.1:4399/sync_grades",
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()
        await cmd.finish(f"课程数: {len(data.get('data', {}).get('grades', []))}")`}
                </pre>
            </section>

            <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Shield className="text-orange-400" size={22} />
                    安全与限频
                </h2>
                <ul className="list-disc list-inside text-gray-400 space-y-2">
                    <li>Bridge 固定监听 127.0.0.1，不接受局域网或公网绑定。</li>
                    <li>除 /health 和只读嵌入资源外，脚本请求必须携带 HBUT_BRIDGE_TOKEN。</li>
                    <li>缓存 API 还会按接口要求校验 JWT scope。</li>
                    <li>高频任务建议加本地缓存，避免触发登录频率限制。</li>
                </ul>
            </section>
        </div>
    );
};

export default Nonebot;
