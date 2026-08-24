const TOKEN_FILE = '%APPDATA%/mini-hbut/local-agent-token';

const curlProfile = `# 读取令牌并请求基本档案（Git Bash / macOS / Linux）
TOKEN=$(cat "$APPDATA/mini-hbut/local-agent-token")

curl -s "http://127.0.0.1:<端口>/local/profile" \\
  -H "Authorization: LocalToken $TOKEN"`;

const curlGrades = `TOKEN=$(cat "$APPDATA/mini-hbut/local-agent-token")

curl -s "http://127.0.0.1:<端口>/local/grades" \\
  -H "Authorization: LocalToken $TOKEN"`;

const curlTimetable = `TOKEN=$(cat "$APPDATA/mini-hbut/local-agent-token")

curl -s "http://127.0.0.1:<端口>/local/timetable" \\
  -H "Authorization: LocalToken $TOKEN"`;

const profileSample = `{
  "student_id": "2312345678",
  "name": "张三",
  "gender": "男",
  "faculty": "计算机学院",
  "major": "计算机科学与技术",
  "class_name": "23计科1班",
  "grade": "2023"
}`;

const gradesSample = `{
  "terms": [
    {
      "term": "2024-2025-1",
      "gpa": 3.42,
      "courses": [
        {
          "course_name": "数据结构",
          "course_type": "必修",
          "credit": 3.0,
          "score": 92,
          "grade_point": 4.0
        }
      ]
    }
  ]
}`;

const timetableSample = `{
  "term": "2024-2025-1",
  "weeks": 20,
  "courses": [
    {
      "name": "操作系统",
      "teacher": "李老师",
      "classroom": "教1-301",
      "week_start": 1,
      "week_end": 16,
      "day_of_week": 1,
      "section_start": 1,
      "section_end": 2
    }
  ]
}`;

const errorSample = `HTTP/1.1 401 Unauthorized

{
  "error": "LOCAL_TOKEN_INVALID",
  "message": "本地令牌缺失、格式不正确或不匹配"
}`;

const notLoggedInSample = `HTTP/1.1 401 Unauthorized

{
  "error": "NOT_LOGGED_IN",
  "message": "App 当前未登录，请先在 Mini-HBUT 中登录学号账号"
}`;

const pythonSample = `import os
from pathlib import Path

import requests  # pip install requests

# 端口以 Mini-HBUT 运行日志输出的实际值为准，此处仅为占位
PORT = 0

base_url = 'http://127.0.0.1:' + str(PORT)
token_path = Path(os.environ['APPDATA']) / 'mini-hbut' / 'local-agent-token'
token = token_path.read_text(encoding='utf-8').strip()

resp = requests.get(
    base_url + '/local/profile',
    headers={'Authorization': 'LocalToken ' + token},
    timeout=5,
)

if resp.status_code == 401:
    body = resp.json()
    print('请求被拒绝:', body.get('error'), '-', body.get('message', ''))
else:
    print(resp.json())`;

const nodeSample = `// 需要 Node.js 18+（内置全局 fetch），以 ESM 方式运行
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

// 端口以 Mini-HBUT 运行日志输出的实际值为准，此处仅为占位
const PORT = 0;

const baseUrl = 'http://127.0.0.1:' + String(PORT);
const tokenPath = join(process.env.APPDATA || '', 'mini-hbut', 'local-agent-token');
const token = readFileSync(tokenPath, 'utf8').trim();

const resp = await fetch(baseUrl + '/local/profile', {
  headers: { Authorization: 'LocalToken ' + token },
});

if (!resp.ok) {
  const body = await resp.json().catch(() => ({}));
  console.error('请求被拒绝:', resp.status, body.error);
} else {
  console.log(await resp.json());
}`;

const endpoints = [
    {
        path: '/local/profile',
        title: '基本档案',
        desc: '返回当前登录学号账号的基本档案信息：学号、姓名、学院、专业、班级等。',
        curl: curlProfile,
        sample: profileSample,
    },
    {
        path: '/local/grades',
        title: '全部成绩单',
        desc: '返回全部成绩单，按学期分组，包含各学期课程成绩、学分与绩点。',
        curl: curlGrades,
        sample: gradesSample,
    },
    {
        path: '/local/timetable',
        title: '课表',
        desc: '返回当前学期完整课表：课程名称、上课时间节次、教室与任课教师。',
        curl: curlTimetable,
        sample: timetableSample,
    },
];

const faqs = [
    {
        q: '端口是多少？我怎么知道端口？',
        a: (
            <>
                本地服务的监听端口<strong>以应用运行日志输出的为准</strong>。Mini-HBUT
                桌面版启动本地服务后，会在运行日志中打印实际监听地址与端口；如果你在开发 Agent
                工具，请引导用户查看应用运行日志获取端口号。
                <strong>这是当前已知的待改进项</strong>：后续版本计划提供固定端口或在界面中直接展示监听地址，
                在此之前请一律以日志输出为准，不要猜测或硬编码端口。
            </>
        ),
    },
    {
        q: '能否从局域网内的其他设备访问这个服务？',
        a: (
            <>
                不能。服务<strong>仅监听 127.0.0.1 回环地址</strong>，局域网内其他设备不可达；
                这是有意为之的安全边界。请不要尝试通过任何方式把该服务暴露到局域网或公网。
            </>
        ),
    },
    {
        q: '找不到 local-agent-token 令牌文件怎么办？',
        a: (
            <>
                请确认已安装 Mini-HBUT 桌面版并至少完整启动过一次；令牌文件在应用启动后于本机数据目录
                <code>{TOKEN_FILE}</code>生成。若目录下没有该文件，重启桌面版后重试；
                仍不存在时检查是否被安全软件拦截或清理。
            </>
        ),
    },
];

const LocalAgent = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">开发者文档 · 本地 Agent</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                本地 Agent 接入指南
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                面向运行在同一台电脑上的 AI Agent 与自动化脚本：通过 Mini-HBUT 桌面版内置的本地 HTTP 服务，
                以只读方式获取当前登录账号的成绩、课表等教务数据，无需自行处理学校统一身份认证。
            </p>
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm leading-7 text-amber-100">
                <strong>能力边界：</strong> 本地服务<strong>仅监听 127.0.0.1</strong>，局域网内不可达；
                全部端点均为 GET 只读接口，不会修改任何教务数据。访问需要携带本机令牌文件中的令牌，
                拿到令牌即等同于获得本机账号数据的只读权限，请按敏感凭据对待。
            </div>
        </header>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">1. 概述</h2>
            <p className="text-sm leading-7 text-gray-300">
                Mini-HBUT 桌面版启动后会同时在本机启动一个仅供本机访问的 HTTP 服务，用于向同一台电脑上的
                AI Agent、脚本或辅助工具开放<strong>只读</strong>的教务数据查询能力。整体模型非常简单：
            </p>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                <li>服务仅绑定 <code>127.0.0.1</code>，局域网与其他设备不可达；</li>
                <li>所有端点都是 GET 请求、只读语义，不会向教务系统发起任何写操作；</li>
                <li>认证方式为请求头 <code>Authorization: LocalToken &lt;令牌&gt;</code>，令牌来自本机令牌文件；</li>
                <li>数据由桌面版使用用户已登录的会话代为查询，Agent 不接触教务密码。</li>
            </ul>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">2. 前置条件</h2>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-gray-300">
                <li>安装并运行 <strong>Mini-HBUT 桌面版</strong>（本地服务随桌面版一起启动）；</li>
                <li>在 App 中<strong>登录学号账号</strong>，未登录时接口会返回 NOT_LOGGED_IN 提示；</li>
                <li>确认本机数据目录中存在令牌文件 <code>{TOKEN_FILE}</code>（内容为 64 位 hex 字符串）。</li>
            </ol>
            <p className="text-sm leading-7 text-gray-400">
                Windows 下 <code>%APPDATA%</code> 通常指向 <code>C:/Users/&lt;用户名&gt;/AppData/Roaming</code>；
                在 PowerShell 或脚本中读取时请展开环境变量后再拼接路径。
            </p>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">3. 令牌获取与认证</h2>
            <p className="text-sm leading-7 text-gray-300">
                App 启动后会自动生成本地代理令牌并写入令牌文件，路径固定为：
            </p>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-sm leading-7 text-cyan">{TOKEN_FILE}</pre>
            <p className="text-sm leading-7 text-gray-300">
                文件内容为一段 <strong>64 位 hex 字符串</strong>（去除首尾空白后使用）。调用接口时将其放入请求头：
            </p>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{`Authorization: LocalToken <64位hex令牌>`}</pre>
            <div className="rounded-xl border border-cyan/20 bg-cyan/5 p-5 text-sm leading-7 text-gray-300">
                令牌等同于本机账号数据的只读访问凭证：<strong>不要</strong>把它提交进 Git、写入日志、
                粘贴到聊天窗口或对话上下文中。推荐像上面示例那样，在脚本运行时从令牌文件即时读取。
            </div>
        </section>

        <section className="space-y-6">
            <h2 className="text-2xl font-bold text-white">4. 端点参考</h2>
            <p className="text-sm leading-7 text-gray-300">
                以下三个端点覆盖当前全部能力，均为 GET 请求。示例中的 <code>&lt;端口&gt;</code> 为占位符，
                实际端口以应用运行日志输出为准（见常见问题）。
            </p>
            {endpoints.map((endpoint, index) => (
                <article key={endpoint.path} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="flex flex-wrap items-center gap-3 text-lg font-bold text-white">
                        <span className="text-cyan">4.{index + 1}</span>
                        <code className="text-cyan">GET {endpoint.path}</code>
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-gray-400">{endpoint.title}</span>
                    </h3>
                    <p className="text-sm leading-7 text-gray-300">{endpoint.desc}</p>
                    <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{endpoint.curl}</pre>
                    <div className="text-xs uppercase tracking-[0.16em] text-gray-500">示意响应（JSON）</div>
                    <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{endpoint.sample}</pre>
                </article>
            ))}
            <p className="text-sm leading-7 text-gray-400">
                响应体均为 JSON；以上结构为示意，用于说明字段含义与分组方式，新增字段将保持向后兼容。
                成绩单按学期分组返回，课表以“星期 + 节次 + 周次区间”描述每门课的位置。
            </p>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">5. 错误处理</h2>
            <p className="text-sm leading-7 text-gray-300">
                认证类错误通过 HTTP 状态码与响应体中的 <code>error</code> 字段区分：
            </p>
            <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-white/[0.05] text-gray-200">
                        <tr><th className="p-3">HTTP</th><th className="p-3">error</th><th className="p-3">含义</th><th className="p-3">处理建议</th></tr>
                    </thead>
                    <tbody className="text-gray-300">
                        <tr className="border-t border-white/10">
                            <td className="p-3">401</td>
                            <td className="p-3"><code className="text-cyan">LOCAL_TOKEN_INVALID</code></td>
                            <td className="p-3">Authorization 头缺失、格式不对，或令牌与本机服务不匹配</td>
                            <td className="p-3">重新读取令牌文件，确认 <code>LocalToken &lt;令牌&gt;</code> 格式正确</td>
                        </tr>
                        <tr className="border-t border-white/10">
                            <td className="p-3">401</td>
                            <td className="p-3"><code className="text-cyan">NOT_LOGGED_IN</code></td>
                            <td className="p-3">令牌有效，但 App 当前未登录学号账号</td>
                            <td className="p-3">提示用户打开 Mini-HBUT 登录后再试</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{errorSample}</pre>
                <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{notLoggedInSample}</pre>
            </div>
            <p className="text-sm leading-7 text-gray-400">
                其余 5xx 表示本地服务内部异常；连接被拒绝通常意味着桌面版未启动或端口不正确。
            </p>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">6. Python 最小示例</h2>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{pythonSample}</pre>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">7. Node.js 最小示例</h2>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{nodeSample}</pre>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">8. 常见问题</h2>
            <div className="space-y-4">
                {faqs.map((faq) => (
                    <article key={faq.q} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="font-semibold text-cyan">{faq.q}</h3>
                        <p className="mt-3 text-sm leading-7 text-gray-300">{faq.a}</p>
                    </article>
                ))}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <h3 className="text-lg font-bold text-purple">Agent 安全须知</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    <li>把令牌当作敏感凭据处理：不入库、不打日志、不回显给用户；</li>
                    <li>只调用本文列出的三个只读端点，不要对本地服务做探测或 fuzzing；</li>
                    <li>展示成绩、课表数据时注意场景，避免把他人隐私数据发送到你自己的服务器留存。</li>
                </ul>
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">9. 相关文档</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                <li><a className="text-cyan hover:underline" href="/docs/data-sharing">数据共享说明：第三方网站经云端快照获取数据的机制</a></li>
                <li><a className="text-cyan hover:underline" href="/docs/identity-oidc">OIDC 接入指南：需要正式身份认证时的标准接入方式</a></li>
                <li><a className="text-cyan hover:underline" href="/docs/security-privacy">安全与隐私：凭据与数据的安全边界</a></li>
            </ul>
        </section>
    </div>
);

export default LocalAgent;
