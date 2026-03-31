import { Settings, Server, Palette, Bell, Globe, Database, Gauge, CloudUpload, Scan, Wrench } from 'lucide-react';

const Configuration = () => {
    return (
        <div className="space-y-12">
            {/* 页面标题 */}
            <div className="border-b border-gray-800 pb-6">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                    配置
                </h1>
                <p className="text-xl text-gray-400">
                    Mini-HBUT 提供丰富的配置选项。本页详细说明每个可设置的选项、远程配置结构、以及如何自行部署 OCR 服务和云同步文件服务器。
                </p>
            </div>

            {/* ===== 应用设置 ===== */}
            <section className="space-y-8" id="app-settings">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Settings className="text-cyan" size={26} />
                    应用设置
                </h2>
                <p className="text-gray-400">
                    打开应用后，点击底部导航的「我的」→「设置」即可进入设置中心。设置分为外观、后端、调试三大模块。
                </p>

                {/* 外观设置 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="appearance">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Palette className="text-purple" size={20} />
                        外观设置
                    </h3>
                    <div className="text-gray-300 space-y-4">
                        <p>Mini-HBUT 提供高度可定制的界面外观。</p>

                        <h4 className="text-base font-semibold text-white mt-4">主题预设</h4>
                        <p className="text-sm">内置 5 套精心设计的主题：</p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left mt-2">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="py-2 px-3 text-gray-400">名称</th>
                                        <th className="py-2 px-3 text-gray-400">类型</th>
                                        <th className="py-2 px-3 text-gray-400">主色</th>
                                        <th className="py-2 px-3 text-gray-400">适用场景</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-300">
                                    <tr className="border-b border-gray-800/50">
                                        <td className="py-2 px-3">校园晴空</td>
                                        <td className="py-2 px-3">亮色</td>
                                        <td className="py-2 px-3"><span className="inline-block w-4 h-4 rounded" style={{backgroundColor: '#2563eb'}} /> #2563eb</td>
                                        <td className="py-2 px-3">日常学习，清爽稳定</td>
                                    </tr>
                                    <tr className="border-b border-gray-800/50">
                                        <td className="py-2 px-3">深海石墨</td>
                                        <td className="py-2 px-3">暗色</td>
                                        <td className="py-2 px-3"><span className="inline-block w-4 h-4 rounded" style={{backgroundColor: '#60a5fa'}} /> #60a5fa</td>
                                        <td className="py-2 px-3">夜间护眼，低亮度</td>
                                    </tr>
                                    <tr className="border-b border-gray-800/50">
                                        <td className="py-2 px-3">薄荷森林</td>
                                        <td className="py-2 px-3">鲜明</td>
                                        <td className="py-2 px-3"><span className="inline-block w-4 h-4 rounded" style={{backgroundColor: '#059669'}} /> #059669</td>
                                        <td className="py-2 px-3">柔和护眼，信息清晰</td>
                                    </tr>
                                    <tr className="border-b border-gray-800/50">
                                        <td className="py-2 px-3">夕照暖橙</td>
                                        <td className="py-2 px-3">鲜明</td>
                                        <td className="py-2 px-3"><span className="inline-block w-4 h-4 rounded" style={{backgroundColor: '#f97316'}} /> #f97316</td>
                                        <td className="py-2 px-3">高识别度，功能入口</td>
                                    </tr>
                                    <tr className="border-b border-gray-800/50">
                                        <td className="py-2 px-3">极简岩灰</td>
                                        <td className="py-2 px-3">中性</td>
                                        <td className="py-2 px-3"><span className="inline-block w-4 h-4 rounded" style={{backgroundColor: '#334155'}} /> #334155</td>
                                        <td className="py-2 px-3">信息密集，高效操作</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <h4 className="text-base font-semibold text-white mt-4">界面微调选项</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left mt-2">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="py-2 px-3 text-gray-400">选项</th>
                                        <th className="py-2 px-3 text-gray-400">可选值</th>
                                        <th className="py-2 px-3 text-gray-400">说明</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-300">
                                    {[
                                        ['卡片风格', 'glass / solid / outline', '毛玻璃（半透明模糊）、实色填充、描边线框'],
                                        ['导航样式', 'floating / pill / compact', '浮动按钮、胶囊标签、紧凑模式'],
                                        ['界面密度', 'comfortable / balanced / compact', '舒适（大间距）、均衡、紧凑（小间距）'],
                                        ['图标风格', 'duotone / line / mono', '双色图标、线条图标、单色图标'],
                                        ['背景装饰', 'mesh / grain / none', '网格背景、颗粒噪点、纯色'],
                                    ].map((row, i) => (
                                        <tr key={i} className="border-b border-gray-800/50">
                                            <td className="py-2 px-3 font-medium">{row[0]}</td>
                                            <td className="py-2 px-3"><code className="bg-black/40 px-1.5 py-0.5 rounded text-xs text-cyan">{row[1]}</code></td>
                                            <td className="py-2 px-3">{row[2]}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <h4 className="text-base font-semibold text-white mt-4">快捷交互方案</h4>
                        <p className="text-sm">预定义的交互参数组合，影响圆角、字号、间距和动画速度：</p>
                        <ul className="list-disc list-inside space-y-1 ml-4 text-sm mt-2">
                            <li><strong>mobile_focus：</strong>适合移动端操作，大圆角、大字号、大间距、慢动画</li>
                            <li><strong>desktop_dense：</strong>适合桌面端，小圆角、标准字号、紧凑间距、快动画</li>
                            <li><strong>presentation：</strong>演示模式，中等圆角、大字号、适中间距、适中动画</li>
                        </ul>

                        <h4 className="text-base font-semibold text-white mt-4">缩放参数</h4>
                        <p className="text-sm mt-1">每套主题和交互方案包含以下缩放因子（0.8 ~ 1.4）：</p>
                        <ul className="list-disc list-inside space-y-1 ml-4 text-sm mt-1">
                            <li><code className="bg-black/40 px-1.5 py-0.5 rounded text-xs text-cyan">radiusScale</code> - 圆角缩放</li>
                            <li><code className="bg-black/40 px-1.5 py-0.5 rounded text-xs text-cyan">fontScale</code> - 字号缩放</li>
                            <li><code className="bg-black/40 px-1.5 py-0.5 rounded text-xs text-cyan">spaceScale</code> - 间距缩放</li>
                            <li><code className="bg-black/40 px-1.5 py-0.5 rounded text-xs text-cyan">motionScale</code> - 动画速度缩放</li>
                            <li><code className="bg-black/40 px-1.5 py-0.5 rounded text-xs text-cyan">surfaceOpacity</code> - 卡片透明度</li>
                            <li><code className="bg-black/40 px-1.5 py-0.5 rounded text-xs text-cyan">borderOpacity</code> - 边框透明度</li>
                        </ul>
                    </div>
                </div>

                {/* 后端设置 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="backend-settings">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Server className="text-cyan" size={20} />
                        后端设置
                    </h3>
                    <div className="text-gray-300 space-y-4">
                        <p>后端设置控制 Mini-HBUT 与外部服务的连接方式。进入方式：设置 → 后端。</p>

                        <h4 className="text-base font-semibold text-white">配置源</h4>
                        <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                            <li><strong>启用远程配置（推荐）：</strong>应用启动时自动拉取服务端的远程配置，覆盖 OCR 端点、云同步地址等。</li>
                            <li><strong>仅本地配置：</strong>关闭远程配置，完全使用本地手动填写的地址。适合网络受限或自架服务的场景。</li>
                        </ul>

                        <h4 className="text-base font-semibold text-white mt-4">服务地址</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left mt-2">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="py-2 px-3 text-gray-400">配置项</th>
                                        <th className="py-2 px-3 text-gray-400">说明</th>
                                        <th className="py-2 px-3 text-gray-400">默认值</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-300">
                                    <tr className="border-b border-gray-800/50">
                                        <td className="py-2 px-3 font-medium">OCR 服务地址</td>
                                        <td className="py-2 px-3">验证码识别服务的 URL；用于登录时自动识别验证码。</td>
                                        <td className="py-2 px-3"><code className="text-xs text-cyan">由远程配置下发</code></td>
                                    </tr>
                                    <tr className="border-b border-gray-800/50">
                                        <td className="py-2 px-3 font-medium">临时文件上传地址</td>
                                        <td className="py-2 px-3">课表图片等临时文件上传服务的 URL。</td>
                                        <td className="py-2 px-3"><code className="text-xs text-cyan">由远程配置下发</code></td>
                                    </tr>
                                    <tr className="border-b border-gray-800/50">
                                        <td className="py-2 px-3 font-medium">云同步中转地址</td>
                                        <td className="py-2 px-3">课表/设置云同步的中转服务 URL。</td>
                                        <td className="py-2 px-3"><code className="text-xs text-cyan">由远程配置下发</code></td>
                                    </tr>
                                    <tr className="border-b border-gray-800/50">
                                        <td className="py-2 px-3 font-medium">云同步秘钥引用</td>
                                        <td className="py-2 px-3">标识使用哪个 KV 命名空间的引用名称。</td>
                                        <td className="py-2 px-3"><code className="text-xs text-cyan">kv1-main</code></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <h4 className="text-base font-semibold text-white mt-4">模块参数</h4>
                        <p className="text-sm">以下参数影响应用的网络行为，修改后自动保存并立即生效：</p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left mt-2">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="py-2 px-3 text-gray-400">参数</th>
                                        <th className="py-2 px-3 text-gray-400">默认值</th>
                                        <th className="py-2 px-3 text-gray-400">范围</th>
                                        <th className="py-2 px-3 text-gray-400">说明</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-300">
                                    {[
                                        ['请求超时（ms）', '15000', '5000 - 60000', '网络请求的最大等待时间'],
                                        ['探针超时（ms）', '8000', '3000 - 30000', '功能测速时每个目标的超时时间'],
                                        ['电费查询重试', '2', '0 - 5', '电费查询失败后的重试次数'],
                                        ['空教室查询重试', '2', '0 - 5', '空教室查询失败后的重试次数'],
                                        ['重试延迟（ms）', '1000', '500 - 10000', '两次重试之间的等待间隔'],
                                        ['移动端预览线程', '3', '1 - 8', '移动端文件预览的并发数'],
                                        ['移动端下载线程', '4', '1 - 8', '移动端文件下载的并发数'],
                                        ['桌面端预览线程', '4', '1 - 12', '桌面端文件预览的并发数'],
                                        ['桌面端下载线程', '6', '1 - 12', '桌面端文件下载的并发数'],
                                        ['云同步冷却（s）', '180', '10 - 3600', '云同步操作的通用冷却时间'],
                                        ['上传冷却（s）', '120', '120 - 3600', '云同步上传的最小间隔'],
                                        ['下载冷却（s）', '10', '10 - 3600', '云同步下载的最小间隔'],
                                    ].map((row, i) => (
                                        <tr key={i} className="border-b border-gray-800/50">
                                            <td className="py-2 px-3 font-medium">{row[0]}</td>
                                            <td className="py-2 px-3"><code className="text-xs text-cyan">{row[1]}</code></td>
                                            <td className="py-2 px-3 text-xs">{row[2]}</td>
                                            <td className="py-2 px-3">{row[3]}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <h4 className="text-base font-semibold text-white mt-4">功能测速</h4>
                        <p className="text-sm">设置中心提供并发测速功能，可同时测试以下服务的延迟：</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                            {['OCR 服务', '临时上传', '云同步', '融合门户', '教务系统', '超星学习通', '一卡通', '图书馆'].map(s => (
                                <div key={s} className="p-2 rounded bg-white/5 border border-white/10 text-xs text-center text-gray-300">
                                    {s}
                                </div>
                            ))}
                        </div>
                        <p className="text-sm text-gray-400 mt-2">
                            测速结果以颜色标记延迟等级：🟢 良好（{'<'}500ms）🟡 一般（500-2000ms）🔴 较差（{'>'}2000ms 或超时）。
                        </p>
                    </div>
                </div>

                {/* 字体设置 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="font-settings">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Palette className="text-cyan" size={20} />
                        字体设置
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>字体设置提供 6 种中文字体选择和 3 种 CDN 线路配置。</p>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left mt-2">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="py-2 px-3 text-gray-400">字体</th>
                                        <th className="py-2 px-3 text-gray-400">标识</th>
                                        <th className="py-2 px-3 text-gray-400">来源</th>
                                        <th className="py-2 px-3 text-gray-400">说明</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-300">
                                    {[
                                        ['默认', 'default', '系统内置', '使用操作系统默认中文字体'],
                                        ['得意黑', 'deyihei', 'CDN 下载', '开源免费装饰字体，所有平台可用，推荐下载缓存'],
                                        ['黑体', 'heiti', '系统内置', 'Noto Sans SC / 微软雅黑'],
                                        ['宋体', 'songti', '系统内置', 'Noto Serif SC / 宋体'],
                                        ['楷体', 'kaiti', '系统内置', 'LXGW WenKai / 楷体_GB2312'],
                                        ['仿宋', 'fangsong', '系统内置', '仿宋_GB2312'],
                                    ].map((row, i) => (
                                        <tr key={i} className="border-b border-gray-800/50">
                                            <td className="py-2 px-3 font-medium">{row[0]}</td>
                                            <td className="py-2 px-3"><code className="text-xs text-cyan">{row[1]}</code></td>
                                            <td className="py-2 px-3">{row[2]}</td>
                                            <td className="py-2 px-3">{row[3]}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <p className="mt-3"><strong>CDN 线路设置：</strong></p>
                        <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                            <li><code className="bg-black/40 px-1.5 py-0.5 rounded text-xs text-cyan">auto</code>（推荐）：自动选择最快的节点，jsDelivr 优先，失败自动降级到 unpkg。</li>
                            <li><code className="bg-black/40 px-1.5 py-0.5 rounded text-xs text-cyan">jsdelivr</code>：固定使用 jsDelivr CDN，国内通常较快。</li>
                            <li><code className="bg-black/40 px-1.5 py-0.5 rounded text-xs text-cyan">unpkg</code>：固定使用 unpkg CDN，作为备用选择。</li>
                        </ul>

                        <p className="mt-3"><strong>缓存机制：</strong></p>
                        <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                            <li>字体文件下载后存储在 IndexedDB（<code className="text-xs text-cyan">hbu_font_binary_cache_v1</code>）中。</li>
                            <li>字体选择存储在 localStorage（<code className="text-xs text-cyan">hbu_font_settings_v1</code>）中。</li>
                            <li>每次启动自动恢复上次选择的字体，无需重新下载。</li>
                            <li>得意黑字体支持可视化下载进度条和失败重试。</li>
                        </ul>
                    </div>
                </div>

                {/* 通知设置 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="notification-settings">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Bell className="text-cyan" size={20} />
                        通知设置
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>在「通知」页面配置后台静默检查的行为（仅移动端 Capacitor 版支持完整后台通知）。</p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left mt-2">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="py-2 px-3 text-gray-400">Preferences 键</th>
                                        <th className="py-2 px-3 text-gray-400">说明</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-300">
                                    {[
                                        ['hbu_bg_student_id', '后台检查使用的学号（自动填充）'],
                                        ['hbu_bg_api_base', 'API 基础地址（自动配置）'],
                                        ['hbu_bg_enable_grade', '是否启用成绩通知（true/false）'],
                                        ['hbu_bg_enable_exam', '是否启用考试提醒（true/false）'],
                                        ['hbu_bg_enable_power', '是否启用电费监控（true/false）'],
                                        ['hbu_bg_interval_min', '检查间隔（分钟），最小 15 分钟'],
                                        ['hbu_bg_dorm_selection', '宿舍选择（JSON 格式，自动保存）'],
                                    ].map((row, i) => (
                                        <tr key={i} className="border-b border-gray-800/50">
                                            <td className="py-2 px-3"><code className="text-xs text-cyan">{row[0]}</code></td>
                                            <td className="py-2 px-3">{row[1]}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* 调试设置 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="debug-settings">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Gauge className="text-cyan" size={20} />
                        调试设置
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>调试模块提供实时日志查看功能，便于排查问题。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>日志过滤：</strong>支持按级别过滤（all / debug / info / warn / error / log）。</li>
                            <li><strong>日志查看：</strong>实时滚动显示应用运行日志。</li>
                            <li><strong>日志操作：</strong>支持一键复制全部日志和清空日志。</li>
                            <li><strong>统计面板：</strong>显示日志总数、警告数和错误数。</li>
                        </ul>
                    </div>
                </div>
            </section>

            {/* ===== 远程配置 ===== */}
            <section className="space-y-8" id="remote-config">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Globe className="text-purple" size={26} />
                    远程配置
                </h2>
                <p className="text-gray-400">
                    Mini-HBUT 支持从服务端拉取远程配置（remote_config.json），用于动态下发公告、OCR 端点、云同步配置、AI 模型列表等信息，无需更新客户端即可调整行为。
                </p>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4">
                    <h3 className="text-lg font-bold text-white">远程配置拉取流程</h3>
                    <ol className="list-decimal list-inside space-y-2 ml-4 text-gray-300 text-sm">
                        <li>应用启动时，依次尝试以下源获取远程配置：
                            <ul className="list-disc list-inside ml-6 text-gray-400">
                                <li>GitCode Raw（国内直连最快）</li>
                                <li>gh-proxy 代理（GitHub 代理）</li>
                                <li>GitHub 直连（海外/VPN 用户）</li>
                            </ul>
                        </li>
                        <li>成功获取后缓存到本地，后续离线时使用缓存版本。</li>
                        <li>如果用户关闭了「启用远程配置」，则跳过拉取，仅使用本地设置。</li>
                    </ol>
                </div>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4">
                    <h3 className="text-lg font-bold text-white">远程配置字段详解</h3>
                    <p className="text-sm text-gray-400">以下是 remote_config.json 的完整字段说明：</p>

                    {/* 公告系统 */}
                    <div className="mt-4 p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
                        <h4 className="text-base font-semibold text-white">📢 announcements - 公告系统</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="py-1.5 px-2 text-gray-400">字段</th>
                                        <th className="py-1.5 px-2 text-gray-400">类型</th>
                                        <th className="py-1.5 px-2 text-gray-400">说明</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-300">
                                    {[
                                        ['ticker', '数组', '滚动公告列表，在首页顶部横向滚动显示'],
                                        ['pinned', '数组', '置顶公告，始终显示在首页最上方'],
                                        ['confirm', '数组', '需确认公告，用户必须点击确认后才能继续使用'],
                                        ['list', '数组', '普通公告列表，在公告页面展示'],
                                    ].map((row, i) => (
                                        <tr key={i} className="border-b border-gray-800/50">
                                            <td className="py-1.5 px-2"><code className="text-cyan">{row[0]}</code></td>
                                            <td className="py-1.5 px-2">{row[1]}</td>
                                            <td className="py-1.5 px-2">{row[2]}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-xs text-gray-500">每条公告包含：id、title、summary、content（HTML）、image、link、updated_at。</p>
                    </div>

                    {/* 强制更新 */}
                    <div className="mt-2 p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
                        <h4 className="text-base font-semibold text-white">🔄 force_update - 强制更新</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="py-1.5 px-2 text-gray-400">字段</th>
                                        <th className="py-1.5 px-2 text-gray-400">说明</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-300">
                                    <tr className="border-b border-gray-800/50"><td className="py-1.5 px-2"><code className="text-cyan">min_version</code></td><td className="py-1.5 px-2">最低版本号（如 "1.2.0"），低于此版本的客户端将被强制更新</td></tr>
                                    <tr className="border-b border-gray-800/50"><td className="py-1.5 px-2"><code className="text-cyan">message</code></td><td className="py-1.5 px-2">更新提示消息</td></tr>
                                    <tr className="border-b border-gray-800/50"><td className="py-1.5 px-2"><code className="text-cyan">download_url</code></td><td className="py-1.5 px-2">下载链接</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* OCR */}
                    <div className="mt-2 p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
                        <h4 className="text-base font-semibold text-white">🔍 ocr - 验证码识别</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="py-1.5 px-2 text-gray-400">字段</th>
                                        <th className="py-1.5 px-2 text-gray-400">说明</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-300">
                                    <tr className="border-b border-gray-800/50"><td className="py-1.5 px-2"><code className="text-cyan">endpoint</code></td><td className="py-1.5 px-2">主 OCR 服务地址</td></tr>
                                    <tr className="border-b border-gray-800/50"><td className="py-1.5 px-2"><code className="text-cyan">endpoints</code></td><td className="py-1.5 px-2">备用 OCR 端点列表（数组）</td></tr>
                                    <tr className="border-b border-gray-800/50"><td className="py-1.5 px-2"><code className="text-cyan">local_fallback_endpoints</code></td><td className="py-1.5 px-2">本地回退端点（如局域网内的 OCR 服务）</td></tr>
                                    <tr className="border-b border-gray-800/50"><td className="py-1.5 px-2"><code className="text-cyan">enabled</code></td><td className="py-1.5 px-2">是否启用 OCR 功能</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 云同步 */}
                    <div className="mt-2 p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
                        <h4 className="text-base font-semibold text-white">☁️ cloud_sync - 云同步</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="py-1.5 px-2 text-gray-400">字段</th>
                                        <th className="py-1.5 px-2 text-gray-400">说明</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-300">
                                    <tr className="border-b border-gray-800/50"><td className="py-1.5 px-2"><code className="text-cyan">enabled</code></td><td className="py-1.5 px-2">是否启用云同步</td></tr>
                                    <tr className="border-b border-gray-800/50"><td className="py-1.5 px-2"><code className="text-cyan">mode</code></td><td className="py-1.5 px-2">同步模式，推荐 "proxy"（通过中转服务）</td></tr>
                                    <tr className="border-b border-gray-800/50"><td className="py-1.5 px-2"><code className="text-cyan">proxy_endpoint</code></td><td className="py-1.5 px-2">中转服务地址</td></tr>
                                    <tr className="border-b border-gray-800/50"><td className="py-1.5 px-2"><code className="text-cyan">secret_ref</code></td><td className="py-1.5 px-2">KV 命名空间引用名称</td></tr>
                                    <tr className="border-b border-gray-800/50"><td className="py-1.5 px-2"><code className="text-cyan">timeout_ms</code></td><td className="py-1.5 px-2">超时时间（毫秒）</td></tr>
                                    <tr className="border-b border-gray-800/50"><td className="py-1.5 px-2"><code className="text-cyan">cooldown_seconds</code></td><td className="py-1.5 px-2">冷却时间（秒）</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* AI 模型 */}
                    <div className="mt-2 p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
                        <h4 className="text-base font-semibold text-white">🤖 ai_models - AI 模型列表</h4>
                        <p className="text-xs text-gray-400">数组格式，每项包含 label（显示名称）和 value（模型标识）。当前默认模型：</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {['Qwen-Plus', 'Qwen-Max', 'DeepSeek-R1', 'Doubao1.5-Pro'].map(m => (
                                <span key={m} className="px-3 py-1 rounded-full bg-cyan/10 text-cyan text-xs border border-cyan/30">{m}</span>
                            ))}
                        </div>
                    </div>

                    {/* 资源共享 */}
                    <div className="mt-2 p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
                        <h4 className="text-base font-semibold text-white">📁 resource_share - 资源共享</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="py-1.5 px-2 text-gray-400">字段</th>
                                        <th className="py-1.5 px-2 text-gray-400">说明</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-300">
                                    <tr className="border-b border-gray-800/50"><td className="py-1.5 px-2"><code className="text-cyan">endpoint</code></td><td className="py-1.5 px-2">WebDAV 服务地址</td></tr>
                                    <tr className="border-b border-gray-800/50"><td className="py-1.5 px-2"><code className="text-cyan">username / password</code></td><td className="py-1.5 px-2">WebDAV 认证凭据</td></tr>
                                    <tr className="border-b border-gray-800/50"><td className="py-1.5 px-2"><code className="text-cyan">office_preview_proxy</code></td><td className="py-1.5 px-2">Office 文件在线预览代理地址</td></tr>
                                    <tr className="border-b border-gray-800/50"><td className="py-1.5 px-2"><code className="text-cyan">temp_upload_endpoint</code></td><td className="py-1.5 px-2">临时文件上传地址</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 配置示例 */}
                    <div className="mt-4">
                        <h4 className="text-base font-semibold text-white mb-2">完整远程配置示例</h4>
                        <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto max-h-96 overflow-y-auto">
                            <code>{`{
  "announcements": {
    "ticker": [
      { "id": "ticker-001", "title": "滚动公告标题", "summary": "简短描述", "content": "<p>HTML 内容</p>", "image": "https://...", "updated_at": "2026-01-25" }
    ],
    "pinned": [
      { "id": "pinned-001", "title": "置顶公告", "summary": "...", "content": "...", "pinned": true }
    ],
    "confirm": [
      { "id": "confirm-001", "title": "需确认公告", "require_confirm": true, "content": "..." }
    ],
    "list": [
      { "id": "notice-001", "title": "普通公告", "summary": "...", "content": "..." }
    ]
  },
  "force_update": {
    "min_version": "1.2.0",
    "message": "请更新到最新版本",
    "download_url": "https://github.com/superdaobo/mini-hbut/releases"
  },
  "ocr": {
    "endpoint": "http://your-ocr-server:5080/api/ocr/recognize",
    "enabled": true
  },
  "cloud_sync": {
    "enabled": true,
    "mode": "proxy",
    "proxy_endpoint": "https://your-sync-service/api/cloud-sync",
    "secret_ref": "kv1-main",
    "timeout_ms": 12000,
    "cooldown_seconds": 180
  },
  "ai_models": [
    { "label": "Qwen-Plus", "value": "qwen-plus" },
    { "label": "DeepSeek-R1", "value": "deepseek-r1" }
  ],
  "config_admin_ids": []
}`}</code>
                        </pre>
                    </div>
                </div>
            </section>

            {/* ===== 自部署指南 ===== */}
            <section className="space-y-8" id="self-deploy">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Wrench className="text-cyan" size={26} />
                    自部署指南
                </h2>
                <p className="text-gray-400">
                    如果你希望使用自己的 OCR 服务或云同步服务器而不依赖公共服务，可以参照以下指南进行部署。
                </p>

                {/* 部署 OCR */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="deploy-ocr">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Scan className="text-purple" size={20} />
                        部署 OCR 服务
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>OCR 服务用于登录时自动识别教务系统的验证码图片。Mini-HBUT 使用统一的 HTTP 接口调用 OCR。</p>

                        <h4 className="text-base font-semibold text-white">接口规范</h4>
                        <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto">
                            <code>{`POST /api/ocr/recognize
Content-Type: application/json

请求体：
{ "image": "<base64 编码的验证码图片>" }

成功响应：
{ "success": true, "result": "ABCD" }

失败响应：
{ "success": false, "error": "识别失败" }`}</code>
                        </pre>

                        <h4 className="text-base font-semibold text-white mt-4">部署要求</h4>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>服务器：</strong>需要一台可公网访问的服务器（或局域网内可达的服务器）。</li>
                            <li><strong>端口：</strong>默认使用 5080 端口，可自定义。</li>
                            <li><strong>HTTPS：</strong>移动端要求 HTTPS（或者移动端添加安全例外），桌面端 HTTP 也可以。</li>
                            <li><strong>CORS：</strong>需要允许跨域请求（<code className="text-xs text-cyan">Access-Control-Allow-Origin: *</code>）。</li>
                        </ul>

                        <h4 className="text-base font-semibold text-white mt-4">推荐部署方式</h4>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>Docker 部署（推荐）：</strong>可以使用常见的 OCR 服务 Docker 镜像（如 ddddocr、TesseractOCR 等基于 Python 的服务），暴露 API 接口即可。</li>
                            <li><strong>HuggingFace Spaces：</strong>可以在 HuggingFace 上部署免费的 OCR 服务，公共访问。</li>
                            <li><strong>Vercel/Cloudflare Workers：</strong>如果 OCR 库支持 Serverless 环境。</li>
                        </ul>

                        <h4 className="text-base font-semibold text-white mt-4">配置到客户端</h4>
                        <ol className="list-decimal list-inside space-y-2 ml-4 text-sm">
                            <li><strong>方式一（远程配置）：</strong>修改 remote_config.json 中的 <code className="text-xs text-cyan">ocr.endpoint</code> 字段。</li>
                            <li><strong>方式二（本地覆盖）：</strong>在应用「设置 → 后端」中手动填写 OCR 服务地址。</li>
                        </ol>

                        <div className="mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 text-sm">
                            <strong>💡 注意：</strong>
                            <ul className="list-disc list-inside mt-1 space-y-1">
                                <li>OCR 服务仅做验证码文字识别，不涉及用户密码或学号上传。</li>
                                <li>识别准确率直接影响登录成功率，建议使用针对教务验证码训练过的模型。</li>
                                <li>客户端支持配置多个 OCR 端点（endpoints 数组），主端点失败后自动使用备用端点。</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* 部署云同步服务 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="deploy-sync">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <CloudUpload className="text-cyan" size={20} />
                        部署云同步服务（Cloudflare Workers）
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>云同步服务基于 Cloudflare Workers + KV 实现，用于跨设备同步课表、设置和学业数据。</p>

                        <h4 className="text-base font-semibold text-white">前置条件</h4>
                        <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                            <li>Cloudflare 账号（免费即可）</li>
                            <li>Node.js 环境</li>
                            <li>Wrangler CLI 工具</li>
                        </ul>

                        <h4 className="text-base font-semibold text-white mt-4">部署步骤</h4>
                        <ol className="list-decimal list-inside space-y-3 ml-4 text-sm">
                            <li>
                                <strong>安装 Wrangler 并登录：</strong>
                                <pre className="bg-black/60 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto mt-1">
                                    <code>{`npm i -g wrangler
wrangler login`}</code>
                                </pre>
                            </li>
                            <li>
                                <strong>创建 KV 命名空间：</strong>
                                <pre className="bg-black/60 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto mt-1">
                                    <code>{`# 生产 KV
wrangler kv namespace create SYNC_KV
# 预览 KV
wrangler kv namespace create SYNC_KV --preview`}</code>
                                </pre>
                            </li>
                            <li>
                                <strong>配置 wrangler.toml：</strong>
                                <p className="mt-1">将 <code className="text-xs text-cyan">wrangler.toml.example</code> 复制为 <code className="text-xs text-cyan">wrangler.toml</code>，填入 KV 的 id 和 preview_id：</p>
                                <pre className="bg-black/60 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto mt-1">
                                    <code>{`name = "mini-hbut-cloud-sync"
main = "src/index.js"
compatibility_date = "2026-03-05"

[vars]
RATE_LIMIT_SECONDS = "60"
RATE_LIMIT_UPLOAD_SECONDS = "120"
RATE_LIMIT_DOWNLOAD_SECONDS = "10"
RATE_LIMIT_PING_SECONDS = "15"

[[kv_namespaces]]
binding = "SYNC_KV"
id = "你的生产 KV ID"
preview_id = "你的预览 KV ID"`}</code>
                                </pre>
                            </li>
                            <li>
                                <strong>设置鉴权令牌（推荐）：</strong>
                                <pre className="bg-black/60 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto mt-1">
                                    <code>wrangler secret put SYNC_API_TOKEN</code>
                                </pre>
                                <p className="mt-1 text-gray-400">如果不设置，服务将允许匿名访问。</p>
                            </li>
                            <li>
                                <strong>部署：</strong>
                                <pre className="bg-black/60 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto mt-1">
                                    <code>wrangler deploy</code>
                                </pre>
                                <p className="mt-1 text-gray-400">部署后获得 <code className="text-xs text-cyan">https://{'<worker-name>'}.{'<subdomain>'}.workers.dev</code> 地址。</p>
                            </li>
                            <li>
                                <strong>健康检查：</strong>
                                <pre className="bg-black/60 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto mt-1">
                                    <code>{`curl "https://your-worker.workers.dev/sync/ping"
# 启用了 Token 时：
curl -H "Authorization: Bearer <TOKEN>" "https://your-worker.workers.dev/sync/ping"`}</code>
                                </pre>
                            </li>
                        </ol>

                        <h4 className="text-base font-semibold text-white mt-4">Worker API 接口</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left mt-2">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="py-2 px-3 text-gray-400">接口</th>
                                        <th className="py-2 px-3 text-gray-400">方法</th>
                                        <th className="py-2 px-3 text-gray-400">说明</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-300">
                                    <tr className="border-b border-gray-800/50">
                                        <td className="py-2 px-3"><code className="text-xs text-cyan">/sync/ping</code></td>
                                        <td className="py-2 px-3">GET</td>
                                        <td className="py-2 px-3">健康检查</td>
                                    </tr>
                                    <tr className="border-b border-gray-800/50">
                                        <td className="py-2 px-3"><code className="text-xs text-cyan">/sync/upload</code></td>
                                        <td className="py-2 px-3">POST</td>
                                        <td className="py-2 px-3">上传用户数据（student_id + payload）</td>
                                    </tr>
                                    <tr className="border-b border-gray-800/50">
                                        <td className="py-2 px-3"><code className="text-xs text-cyan">/sync/download</code></td>
                                        <td className="py-2 px-3">GET</td>
                                        <td className="py-2 px-3">下载用户数据（query: student_id）</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <h4 className="text-base font-semibold text-white mt-4">速率限制配置</h4>
                        <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                            <li><code className="text-xs text-cyan">RATE_LIMIT_SECONDS</code>：默认最小请求间隔（建议 ≥ 60s）</li>
                            <li><code className="text-xs text-cyan">RATE_LIMIT_UPLOAD_SECONDS</code>：上传间隔</li>
                            <li><code className="text-xs text-cyan">RATE_LIMIT_DOWNLOAD_SECONDS</code>：下载间隔</li>
                            <li><code className="text-xs text-cyan">RATE_LIMIT_PING_SECONDS</code>：健康检查间隔</li>
                        </ul>
                        <p className="text-xs text-gray-500 mt-1">注意：Cloudflare KV 的 expiration_ttl 最小值为 60 秒。</p>

                        <h4 className="text-base font-semibold text-white mt-4">配置到客户端</h4>
                        <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-sm space-y-2">
                            <p><strong>推荐方式：</strong>通过中转服务（如 OCR 服务）代理 Worker API，不要在客户端直接暴露 Worker Token。</p>
                            <p>在远程配置中设置：</p>
                            <pre className="bg-black/60 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto mt-1">
                                <code>{`{
  "cloud_sync": {
    "enabled": true,
    "mode": "proxy",
    "proxy_endpoint": "https://your-proxy-service/api/cloud-sync",
    "secret_ref": "kv1-main"
  }
}`}</code>
                            </pre>
                            <p>或者在应用「设置 → 后端」中手动填写：</p>
                            <ul className="list-disc list-inside ml-4 text-xs text-gray-400">
                                <li>云同步中转地址</li>
                                <li>云同步秘钥引用（secret_ref）</li>
                            </ul>
                        </div>

                        <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
                            <strong>🔒 安全注意事项：</strong>
                            <ul className="list-disc list-inside mt-1 space-y-1">
                                <li>Token 不应保存在客户端或远程配置 JSON 中，只应保存在中转服务的 Secrets 中。</li>
                                <li>启用 SYNC_API_TOKEN 可防止匿名访问，建议在生产环境启用。</li>
                                <li>速率限制可防止恶意刷接口，建议保持默认配置。</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* 部署 WebDAV */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="deploy-webdav">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Database className="text-cyan" size={20} />
                        部署 WebDAV 文件服务器（资料分享）
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>资料分享功能通过 WebDAV 协议连接文件服务器，你可以自行搭建 WebDAV 服务来提供学习资料共享。</p>

                        <h4 className="text-base font-semibold text-white">推荐方案</h4>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>
                                <strong>Nginx + WebDAV 模块：</strong>轻量高效，适合有 Linux 服务器的场景。
                            </li>
                            <li>
                                <strong>Nextcloud / ownCloud：</strong>功能丰富的自建云盘，自带 WebDAV 支持。
                            </li>
                            <li>
                                <strong>Caddy + WebDAV：</strong>简洁配置，自动 HTTPS。
                            </li>
                        </ul>

                        <h4 className="text-base font-semibold text-white mt-4">注意事项</h4>
                        <ul className="list-disc list-inside space-y-2 ml-4 text-sm">
                            <li><strong>CORS 配置：</strong>必须允许跨域（客户端从不同域名访问 WebDAV）。</li>
                            <li><strong>认证方式：</strong>支持 Basic Auth（用户名 + 密码），在远程配置中下发。</li>
                            <li><strong>HTTPS：</strong>移动端要求 HTTPS 协议。</li>
                            <li><strong>Office 预览：</strong>如需在线预览 Word/Excel/PPT，需额外配置 Office 预览代理服务（如 ONLYOFFICE 或使用第三方转换 API）。</li>
                        </ul>
                    </div>
                </div>
            </section>

            {/* ===== 数据缓存策略 ===== */}
            <section className="space-y-6" id="cache-strategy">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Database className="text-purple" size={26} />
                    数据缓存策略
                </h2>
                <p className="text-gray-400">
                    Mini-HBUT 实现了多层缓存机制，在保证数据新鲜度的同时优化性能和离线体验。
                </p>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead>
                                <tr className="border-b border-gray-700">
                                    <th className="py-2 px-3 text-gray-400">缓存类型</th>
                                    <th className="py-2 px-3 text-gray-400">TTL</th>
                                    <th className="py-2 px-3 text-gray-400">适用数据</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-300">
                                <tr className="border-b border-gray-800/50">
                                    <td className="py-2 px-3 font-medium">短时缓存</td>
                                    <td className="py-2 px-3"><code className="text-xs text-cyan">30 秒</code></td>
                                    <td className="py-2 px-3">实时性要求高的数据（如排名）</td>
                                </tr>
                                <tr className="border-b border-gray-800/50">
                                    <td className="py-2 px-3 font-medium">默认缓存</td>
                                    <td className="py-2 px-3"><code className="text-xs text-cyan">5 分钟</code></td>
                                    <td className="py-2 px-3">一般查询数据</td>
                                </tr>
                                <tr className="border-b border-gray-800/50">
                                    <td className="py-2 px-3 font-medium">长时缓存</td>
                                    <td className="py-2 px-3"><code className="text-xs text-cyan">3 天</code></td>
                                    <td className="py-2 px-3">成绩、课表等不常变化的数据</td>
                                </tr>
                                <tr className="border-b border-gray-800/50">
                                    <td className="py-2 px-3 font-medium">超长缓存</td>
                                    <td className="py-2 px-3"><code className="text-xs text-cyan">7 天</code></td>
                                    <td className="py-2 px-3">校历、培养方案等极少变化的数据</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div className="mt-4 text-sm text-gray-400 space-y-1">
                        <p>• 前端使用 localStorage 缓存（最多 220 条记录，单条最大 180KB）。</p>
                        <p>• 后端使用 SQLite 数据库持久化缓存（成绩、课表、考试、电费等）。</p>
                        <p>• 教务系统维护期间自动检测并切换到离线缓存模式。</p>
                        <p>• 缓存数据标记 <code className="text-xs text-cyan">offline: true</code> + <code className="text-xs text-cyan">sync_time</code> 表示为离线数据。</p>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default Configuration;
