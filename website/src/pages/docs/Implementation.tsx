import { Activity, Bell, Database, Layers, Layout } from 'lucide-react';

const Implementation = () => {
  return (
    <div className="space-y-10">
      <div className="border-b border-gray-800 pb-6">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
          架构与数据流
        </h1>
        <p className="text-xl text-gray-400">
          本页聚焦客户端核心架构、会话生命周期、后台任务与主要业务链路，帮助快速理解整体运行方式。
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Layout className="text-cyan" size={22} />
          总体架构
        </h2>
        <pre className="bg-black/60 rounded-xl p-5 text-xs text-cyan-200 overflow-x-auto border border-gray-800">
{`Vue UI (前端)
   |  /v2 API
   v
HTTP Bridge (127.0.0.1:4399)
   |  调用 Rust Core
   v
Rust Core (业务模块 + 会话 + 缓存)
   |  访问校内系统 / 解析数据
   v
SQLite 缓存与本地快照`}
        </pre>
        <p className="text-gray-400 text-sm">
          UI 与 Core 完全分离，所有业务请求通过 Bridge 统一封装为结构化响应，便于外部应用对接。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Activity className="text-purple" size={22} />
          启动与会话流程
        </h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-400">
          <li>启动时读取本地 cookie 快照与用户缓存。</li>
          <li>检测会话有效性，失效则触发 CAS 重新登录。</li>
          <li>Bridge 启动监听，UI 通过 /v2 语义调用。</li>
          <li>业务数据写入 SQLite 缓存，离线可读。</li>
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Layers className="text-green-400" size={22} />
          业务链路概览
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              title: '成绩 / 课表',
              desc: '拉取教务系统页面并解析，写入 grades_cache / schedule_cache。'
            },
            {
              title: '电费 / 消费记录',
              desc: '通过 SSO 获取 token，调用一码通接口，失败时走刷新与重试。'
            },
            {
              title: '全校课表',
              desc: '先获取选项与节次，再分页请求列表并清洗 HTML。'
            },
            {
              title: '空教室 / 排名 / 考试',
              desc: '统一走 HbutClient 会话，结果落入缓存，支持离线展示。'
            },
            {
              title: '图书查询',
              desc: '通过馆藏接口检索并解析详情，前端侧支持筛选和封面展示。'
            },
            {
              title: '资料分享（WebDAV）',
              desc: '目录列表与文件流通过统一代理链路处理，支持预览、下载与分享。'
            }
          ].map((item) => (
            <div key={item.title} className="p-5 rounded-xl bg-gray-900/50 border border-gray-800">
              <div className="text-white font-bold mb-2">{item.title}</div>
              <div className="text-sm text-gray-400">{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Bell className="text-cyan" size={22} />
          后台检查与通知链路
        </h2>
        <div className="p-6 rounded-xl bg-gray-900/50 border border-gray-800 space-y-2 text-sm text-gray-300">
          <div>检查项：课表静默刷新、成绩变更检测、考试提醒、电费余额监控。</div>
          <div>触发策略：应用启动立即执行 1 次，之后按通知设置周期轮询。</div>
          <div>电费逻辑：读取电费模块已选房间缓存，实时请求余额，低于 10 度触发通知。</div>
          <div>去重策略：基于签名缓存避免重复发送同一类通知。</div>
          <div>移动端：基于 Capacitor Background Fetch，支持 kill 后周期拉起任务（受系统省电策略约束）。</div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Database className="text-pink" size={22} />
          缓存与离线策略
        </h2>
        <div className="p-6 rounded-xl bg-gray-900/50 border border-gray-800 space-y-2 text-sm text-gray-400">
          <div>所有可复用数据统一写入 SQLite，避免频繁登录与重复请求。</div>
          <div>当网络不可用时，优先读取缓存并标记“缓存时间”。</div>
          <div>缓存更新失败不会阻塞 UI，提示用户手动刷新或稍后重试。</div>
          <div>目录类数据（如资料分享）采用 TTL 机制（默认 15 分钟）避免重复远程请求。</div>
          <div>OCR 识别链路支持远程配置优先 + 本地兜底，保障验证码登录可用性。</div>
          <div>字体、pdf.js、xgplayer、katex 等资源采用首次加载 + 缓存复用策略，降低包体积。</div>
        </div>
      </section>
    </div>
  );
};

export default Implementation;
