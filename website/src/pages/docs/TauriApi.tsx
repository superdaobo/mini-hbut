import { Server, Shield, FileText, Database } from 'lucide-react';

const TauriApi = () => {
    return (
        <div className="space-y-10">
            <div className="border-b border-gray-800 pb-6">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                    Tauri API 手册
                </h1>
                <p className="text-xl text-gray-400">
                    本页集中说明 HTTP Bridge 的接口规范、输入输出结构与关键示例，便于对接与调试。
                </p>
            </div>

            <section className="space-y-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Server className="text-cyan" size={22} />
                    基本信息
                </h2>
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-2 text-gray-300">
                    <div>默认地址：<span className="text-cyan">http://127.0.0.1:4399</span></div>
                    <div>接口统一返回 ApiResponse：success / data / error / time。</div>
                    <div>前端统一使用 /v2 语义调用，内部映射至 Bridge。</div>
                    <div>新增模块（图书/资料分享）已接入同一 Bridge 层，便于统一鉴权和日志追踪。</div>
                </div>
            </section>

            <section className="space-y-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Shield className="text-purple" size={22} />
                    响应结构
                </h2>
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4">
                    <p className="text-gray-300">成功示例：</p>
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto">
                        <code>{`{
  "success": true,
  "data": { "...": "..." },
  "error": null,
  "time": "2026-02-04 12:00:00"
}`}</code>
                    </pre>
                    <p className="text-gray-300">失败示例：</p>
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto">
                        <code>{`{
  "success": false,
  "data": null,
  "error": { "kind": "请求失败", "message": "登录失效" },
  "time": "2026-02-04 12:01:10"
}`}</code>
                    </pre>
                </div>
            </section>

            <section className="space-y-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <FileText className="text-cyan" size={22} />
                    HTTP Bridge 全量接口
                </h2>
                <div className="overflow-x-auto rounded-xl border border-gray-800">
                    <table className="w-full text-left text-sm text-gray-400 border-collapse">
                        <thead className="bg-white/5 text-cyan">
                            <tr>
                                <th className="p-4">路径</th>
                                <th className="p-4">方法</th>
                                <th className="p-4">输入</th>
                                <th className="p-4">输出</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {[
                                { path: '/health', method: 'GET', req: '-', res: '健康状态' },
                                { path: '/login', method: 'POST', req: 'username, password, captcha?, lt?, execution?', res: '登录结果与会话' },
                                { path: '/restore_session', method: 'POST', req: 'cookies', res: '恢复会话' },
                                { path: '/export_cookies', method: 'GET', req: '-', res: '导出 Cookie' },
                                { path: '/import_cookies', method: 'POST', req: 'cookies', res: '导入 Cookie' },
                                { path: '/sync_grades', method: 'POST', req: '-', res: '成绩列表 + meta' },
                                { path: '/sync_schedule', method: 'POST', req: '-', res: '课表 + meta' },
                                { path: '/export_schedule_calendar', method: 'POST', req: 'student_id, semester, week, events[]', res: 'ics 链接' },
                                { path: '/exports/{filename}', method: 'GET', req: '-', res: '下载 .ics 文件' },
                                { path: '/fetch_exams', method: 'POST', req: 'semester?', res: '考试安排' },
                                { path: '/fetch_ranking', method: 'POST', req: 'student_id?, semester?', res: '绩点排名' },
                                { path: '/fetch_student_info', method: 'POST', req: '-', res: '学生信息' },
                                { path: '/fetch_personal_login_access_info', method: 'POST', req: '-', res: '当前登录认证信息与设备信息' },
                                { path: '/fetch_semesters', method: 'POST', req: '-', res: '学期列表' },
                                { path: '/fetch_classroom_buildings', method: 'POST', req: '-', res: '教学楼列表' },
                                { path: '/fetch_classrooms', method: 'POST', req: 'week, weekday, periods, building', res: '空教室列表' },
                                { path: '/fetch_training_plan_options', method: 'POST', req: '-', res: '培养方案选项' },
                                { path: '/fetch_training_plan_jys', method: 'POST', req: 'yxid', res: '教研室列表' },
                                { path: '/fetch_training_plan_courses', method: 'POST', req: 'grade, kkxq, kkyx, kkjys, kcxz, kcgs, kcbh, kcmc, page, page_size', res: '课程列表' },
                                { path: '/fetch_calendar_data', method: 'POST', req: 'semester?', res: '校历与周次' },
                                { path: '/fetch_academic_progress', method: 'POST', req: 'fasz', res: '学业完成情况' },
                                { path: '/qxzkb/options', method: 'GET', req: '-', res: '全校课表选项' },
                                { path: '/qxzkb/jcinfo', method: 'POST', req: 'xnxq', res: '全校课表节次' },
                                { path: '/qxzkb/zyxx', method: 'POST', req: 'yxid, nj', res: '专业信息' },
                                { path: '/qxzkb/kkjys', method: 'POST', req: 'kkyxid', res: '开课教研室' },
                                { path: '/qxzkb/query', method: 'POST', req: '多参数查询', res: '课表列表' },
                                { path: '/library/dict', method: 'POST', req: 'term', res: '图书检索筛选字典' },
                                { path: '/library/search', method: 'POST', req: 'query + filters + page', res: '图书检索结果' },
                                { path: '/library/detail', method: 'POST', req: 'book_id / marc_no', res: '图书详情与馆藏信息' },
                                { path: '/resource_share/proxy', method: 'GET', req: 'endpoint,path,username,password', res: '资料分享代理流（预览/下载）' },
                                { path: '/electricity_query_location', method: 'POST', req: 'payload', res: '电费位置' },
                                { path: '/electricity_query_account', method: 'POST', req: 'payload', res: '电费余额' },
                                { path: '/fetch_transaction_history', method: 'POST', req: 'startDate, endDate, pageNo, pageSize', res: '交易记录' },
                                { path: '/one_code_token', method: 'POST', req: '-', res: '一码通 token' },
                                { path: '/ai_init', method: 'POST', req: 'model, provider?', res: 'AI 初始化' },
                                { path: '/ai_upload', method: 'POST', req: 'file_content, filename', res: '上传结果' },
                                { path: '/ai_chat', method: 'POST', req: 'content, context', res: 'AI 回复' },
                                { path: '/ai_chat_stream', method: 'POST', req: 'content, context', res: 'SSE 流' },
                                { path: '/cache/get', method: 'GET', req: 'table, key + JWT', res: '缓存读取' },
                            ].map(api => (
                                <tr key={api.path} className="hover:bg-white/5 transition-colors">
                                    <td className="p-4 font-mono text-white">{api.path}</td>
                                    <td className="p-4"><span className={`px-2 py-0.5 rounded text-[10px] ${api.method === 'POST' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>{api.method}</span></td>
                                    <td className="p-4 text-[10px] italic">{api.req}</td>
                                    <td className="p-4">{api.res}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="space-y-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Server className="text-green-400" size={22} />
                    远程配置关键字段（运行时）
                </h2>
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-3 text-sm text-gray-300">
                    <div><span className="text-cyan">ocr.endpoint</span>：验证码识别服务地址（优先远程；失效时客户端自动回退本地兜底）。</div>
                    <div><span className="text-cyan">temp_file_server.schedule_upload_endpoint</span>：课表导出临时上传接口地址。</div>
                    <div><span className="text-cyan">resource_share.endpoint</span>：资料分享 WebDAV 源地址。</div>
                    <div><span className="text-cyan">resource_share.office_preview_proxy</span>：Office 文档在线预览代理地址。</div>
                    <div><span className="text-cyan">announcements</span>：首页滚动公告、置顶公告、确认公告内容。</div>
                    <div><span className="text-cyan">force_update</span>：最低可用版本控制与更新提示策略。</div>
                </div>
            </section>

            <section className="space-y-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Database className="text-pink" size={22} />
                    关键接口示例
                </h2>
                <div className="space-y-6">
                    <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800">
                        <h3 className="text-lg font-bold text-cyan mb-3">课表导出 (本周 / 本学期)</h3>
                        <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto">
                            <code>{`POST /export_schedule_calendar
{
  "student_id": "2025xxxxxx",
  "semester": "2025-2026-2",
  "week": 10,
  "events": [
    {
      "summary": "高等数学",
      "start": "2026-02-04T08:20:00",
      "end": "2026-02-04T10:00:00",
      "description": "时间: 第10周 周3 第1-2节 08:20-09:55\n地点: 教一 3-003",
      "location": "教一 3-003"
    }
  ]
}

响应:
{
  "success": true,
  "url": "http://127.0.0.1:4399/exports/schedule_xxx.ics",
  "filename": "schedule_xxx.ics",
  "count": 56
}`}</code>
                        </pre>
                    </div>

                    <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800">
                        <h3 className="text-lg font-bold text-purple mb-3">电费查询</h3>
                        <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto">
                            <code>{`POST /electricity_query_account
{
  "payload": {
    "utilityType": "electric",
    "bigArea": "",
    "area": "01",
    "building": "03",
    "unit": "",
    "level": "04",
    "room": "410",
    "subArea": ""
  }
}

响应:
{
  "success": true,
  "resultData": {
    "utilityStatusName": "正常",
    "templateList": [
      { "code": "balance", "value": "28.50" }
    ]
  }
}`}</code>
                        </pre>
                    </div>

                    <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800">
                        <h3 className="text-lg font-bold text-green-400 mb-3">交易记录</h3>
                        <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto">
                            <code>{`POST /fetch_transaction_history
{
  "startDate": "2025-02-04",
  "endDate": "2026-02-04",
  "pageNo": 1,
  "pageSize": 1000
}

响应:
{
  "success": true,
  "resultData": [
    {
      "tradeTime": "2026-02-03 11:14:01",
      "merchantName": "食堂",
      "amount": "-12.00",
      "balance": "35.60"
    }
  ]
}`}</code>
                        </pre>
                    </div>

                    <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800">
                        <h3 className="text-lg font-bold text-cyan mb-3">图书详情查询</h3>
                        <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto">
                            <code>{`POST /library/detail
{
  "book_id": "123456"
}

响应:
{
  "success": true,
  "data": {
    "title": "高等数学",
    "cover": "https://.../cover.jpg",
    "items": [
      {
        "call_no": "O13/123",
        "barcode": "01906124",
        "location": "文学馆[5楼D区]",
        "status": "在架"
      }
    ]
  }
}`}</code>
                        </pre>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default TauriApi;
