import { Download, Smartphone, Monitor, Apple, Terminal, BookOpen, Zap, Star, Shield, HardDrive, Scan, GraduationCap, Calendar, BarChart3, Building, Bolt, CreditCard, BookMarked, Map, FolderOpen, FileOutput, Bot, Globe, Bell, CloudUpload } from 'lucide-react';

const Guide = () => {
    return (
        <div className="space-y-12">
            {/* 页面标题 */}
            <div className="border-b border-gray-800 pb-6">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                    使用指南
                </h1>
                <p className="text-xl text-gray-400">
                    从安装到精通——这份指南将帮助你在 Windows、macOS、Linux、Android、iOS 上安装并使用 Mini-HBUT 的全部功能。
                </p>
            </div>

            {/* ===== 第一部分：安装 ===== */}
            <section className="space-y-8" id="install">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Download className="text-cyan" size={26} />
                    安装
                </h2>
                <p className="text-gray-400">
                    Mini-HBUT 支持 Windows、macOS、Linux、Android、iOS 五大平台。所有安装包均可在{' '}
                    <a href="https://github.com/superdaobo/mini-hbut/releases" target="_blank" className="text-cyan hover:underline">GitHub Releases</a>{' '}
                    页面下载，国内用户也可通过 jsDelivr CDN 加速获取。
                </p>

                {/* Windows */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="install-windows">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Monitor className="text-cyan" size={20} />
                        Windows 安装
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p><strong>系统要求：</strong>Windows 10（1803+）或 Windows 11，64 位系统。</p>
                        <p><strong>安装步骤：</strong></p>
                        <ol className="list-decimal list-inside space-y-2 ml-4">
                            <li>
                                前往{' '}
                                <a href="https://github.com/superdaobo/mini-hbut/releases" target="_blank" className="text-cyan hover:underline">Releases 页面</a>
                                ，下载最新版的 <code className="bg-black/40 px-2 py-0.5 rounded text-cyan text-sm">Mini-HBUT_x.x.x_x64-setup.exe</code>（推荐）或{' '}
                                <code className="bg-black/40 px-2 py-0.5 rounded text-cyan text-sm">.msi</code> 安装包。
                            </li>
                            <li>双击运行安装程序，按照向导提示完成安装。</li>
                            <li>安装完成后，在开始菜单或桌面找到 <strong>Mini-HBUT</strong> 图标，点击启动。</li>
                            <li>首次启动会自动初始化本地数据库和配置，等待几秒即可进入登录页面。</li>
                        </ol>
                        <div className="mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 text-sm">
                            <strong>💡 提示：</strong>如果 Windows Defender SmartScreen 弹出警告，点击「更多信息」→「仍要运行」即可。这是因为软件使用开源证书签名，不影响安全性。
                        </div>
                    </div>
                </div>

                {/* macOS */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="install-macos">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Apple className="text-cyan" size={20} />
                        macOS 安装
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p><strong>系统要求：</strong>macOS 10.15 (Catalina) 或更高版本，支持 Intel 和 Apple Silicon (M1/M2/M3)。</p>
                        <p><strong>安装步骤：</strong></p>
                        <ol className="list-decimal list-inside space-y-2 ml-4">
                            <li>
                                下载最新版的 <code className="bg-black/40 px-2 py-0.5 rounded text-cyan text-sm">Mini-HBUT_x.x.x_universal.dmg</code>。
                            </li>
                            <li>双击打开 DMG 文件，将 <strong>Mini-HBUT</strong> 拖拽到 Applications 文件夹。</li>
                            <li>首次打开时，macOS 可能提示「无法验证开发者」。</li>
                            <li>
                                解决方法：打开「系统设置」→「隐私与安全性」→ 找到 Mini-HBUT 的提示 → 点击「仍要打开」。
                                <br />或者在终端执行：
                            </li>
                        </ol>
                        <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto mt-2">
                            <code>xattr -cr /Applications/Mini-HBUT.app</code>
                        </pre>
                        <ol className="list-decimal list-inside space-y-2 ml-4" start={5}>
                            <li>之后即可正常打开应用。</li>
                        </ol>
                    </div>
                </div>

                {/* Linux */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="install-linux">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Terminal className="text-cyan" size={20} />
                        Linux 安装
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p><strong>系统要求：</strong>支持主流 Linux 发行版（Ubuntu 20.04+、Debian 11+、Fedora 36+ 等），需要 64 位系统和图形桌面环境。</p>
                        <p><strong>安装方式一：AppImage（通用，推荐）</strong></p>
                        <ol className="list-decimal list-inside space-y-2 ml-4">
                            <li>
                                下载 <code className="bg-black/40 px-2 py-0.5 rounded text-cyan text-sm">Mini-HBUT_x.x.x_amd64.AppImage</code>。
                            </li>
                            <li>赋予执行权限并运行：</li>
                        </ol>
                        <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto mt-2">
                            <code>{`chmod +x Mini-HBUT_*.AppImage
./Mini-HBUT_*.AppImage`}</code>
                        </pre>
                        <p className="mt-3"><strong>安装方式二：DEB 包（Debian/Ubuntu）</strong></p>
                        <ol className="list-decimal list-inside space-y-2 ml-4">
                            <li>
                                下载 <code className="bg-black/40 px-2 py-0.5 rounded text-cyan text-sm">Mini-HBUT_x.x.x_amd64.deb</code>。
                            </li>
                            <li>使用以下命令安装：</li>
                        </ol>
                        <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto mt-2">
                            <code>{`sudo dpkg -i Mini-HBUT_*.deb
# 如果缺少依赖
sudo apt-get install -f`}</code>
                        </pre>
                        <ol className="list-decimal list-inside space-y-2 ml-4" start={3}>
                            <li>安装完成后在应用菜单中找到 Mini-HBUT 并启动。</li>
                        </ol>
                        <div className="mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-200 text-sm">
                            <strong>ℹ️ 注意：</strong>Linux 版本需要系统安装 WebKit2GTK 运行时（大多数主流发行版已预装）。如果启动报错，请安装：
                            <code className="block mt-1 bg-black/40 px-2 py-1 rounded text-sm">sudo apt install libwebkit2gtk-4.1-0</code>
                        </div>
                    </div>
                </div>

                {/* Android */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="install-android">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Smartphone className="text-cyan" size={20} />
                        Android 安装
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p><strong>系统要求：</strong>Android 7.0 (API 24) 或更高版本。</p>
                        <p><strong>安装步骤：</strong></p>
                        <ol className="list-decimal list-inside space-y-2 ml-4">
                            <li>
                                下载最新版的 <code className="bg-black/40 px-2 py-0.5 rounded text-cyan text-sm">Mini-HBUT_x.x.x_arm64.apk</code>。
                            </li>
                            <li>在手机上打开下载的 APK 文件。</li>
                            <li>如果提示「不允许安装未知来源应用」，按提示跳转到设置页面，开启「允许此来源」。</li>
                            <li>按照安装向导完成安装。</li>
                            <li>在主屏幕或应用列表中找到 <strong>Mini-HBUT</strong> 图标，点击启动。</li>
                        </ol>
                        <div className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-200 text-sm">
                            <strong>✅ Android 特色功能：</strong>
                            <ul className="list-disc list-inside mt-1 space-y-1">
                                <li>支持后台静默检查（成绩/考试/电费变更自动推送通知）</li>
                                <li>支持开机自启后台任务</li>
                                <li>建议在省电策略中将 Mini-HBUT 设为「不受限制」以保证后台正常运行</li>
                            </ul>
                        </div>
                    </div>
                </div>
                {/* iOS */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="install-ios">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Apple className="text-purple" size={20} />
                        iOS 安装（侧载）
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>
                            由于 Mini-HBUT 暂未上架 App Store，iOS 版本需要通过<strong>侧载</strong>安装。
                            个人 Apple ID 免费签名只有 7 天有效期，建议优先使用支持续签的工具。
                        </p>
                        <p><strong>系统要求：</strong>iOS 15.0 或更高版本。</p>

                        <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 text-sm">
                            <strong>⚠️ 安装前提醒：</strong>建议使用 Apple ID 小号；个人签名应用最多保留 3 个；请在证书到期前完成续签，否则应用会闪退。
                        </div>

                        <div className="mt-4 p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
                            <h4 className="text-lg font-semibold text-white">方案一：NB 助手（推荐新手）</h4>
                            <p className="text-sm text-gray-400">流程直观，适合第一次给 iPhone 侧载应用的用户。建议配合自动续签使用。</p>
                            <ol className="list-decimal list-inside space-y-2 ml-2 text-sm">
                                <li>
                                    先在电脑安装{' '}
                                    <a href="https://www.i4.cn" target="_blank" rel="noreferrer" className="text-cyan hover:underline">爱思助手</a>
                                    ，连接 iPhone 确认驱动和设备识别正常。
                                </li>
                                <li>
                                    前往{' '}
                                    <a href="https://nbtool8.com" target="_blank" rel="noreferrer" className="text-cyan hover:underline">NB 助手官网</a>
                                    下载电脑版客户端。
                                </li>
                                <li>打开电脑端 NB 助手，连接手机后先安装 iOS 端 NB 助手。</li>
                                <li>
                                    从{' '}
                                    <a href="https://github.com/superdaobo/mini-hbut/releases" target="_blank" rel="noreferrer" className="text-cyan hover:underline">Mini-HBUT Releases</a>{' '}
                                    下载最新 <code className="bg-black/40 px-2 py-0.5 rounded text-cyan text-sm">Mini-HBUT_x.x.x_iOS.ipa</code>。
                                </li>
                                <li>在手机端 NB 助手中导入 Apple ID（建议小号）和 IPA，按提示完成签名安装。</li>
                                <li>首次安装后进入「设置 → 通用 → VPN 与设备管理」信任开发者证书。</li>
                                <li>快到 7 天有效期时，在“已安装”列表点击<strong>一键续签</strong>即可继续使用。</li>
                            </ol>
                        </div>

                        <div className="mt-4 p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
                            <h4 className="text-lg font-semibold text-white">方案二：SideStore（进阶方案）</h4>
                            <p className="text-sm text-gray-400">适合长期使用。完成首次部署后，可以在手机端自行刷新签名，但需要可用的 TUN 环回环境。</p>
                            <ol className="list-decimal list-inside space-y-2 ml-2 text-sm">
                                <li>
                                    先在电脑下载并安装{' '}
                                    <a href="https://hk.gh-proxy.org/https://github.com/nab138/iloader/releases/latest/download/iloader-windows-x64.msi" target="_blank" rel="noreferrer" className="text-cyan hover:underline">iLoader for Windows</a>
                                    ，按引导完成 SideStore 初次部署。
                                </li>
                                <li>首次部署完成后，在 iPhone 上信任 SideStore 开发者证书。</li>
                                <li>
                                    准备支持 TUN 环回的网络工具，例如 Karing，并把环回地址设置为 <code className="bg-black/40 px-2 py-0.5 rounded text-cyan text-sm">10.7.0.1</code>。
                                </li>
                                <li>打开 LiveContainer 进入 SideStore，导入 Apple ID。</li>
                                <li>将 Mini-HBUT 的 IPA 传到手机本地，在 SideStore 或 iLoader 中选择 IPA 进行安装。</li>
                                <li>安装完成后执行一次刷新，确认签名有效，再从桌面启动 Mini-HBUT。</li>
                            </ol>
                            <div className="p-2 rounded bg-green-500/10 border border-green-500/30 text-green-200 text-xs">
                                <strong>✅ 优势：</strong>SideStore 更适合长期使用，后续续签不需要每次再连接电脑。
                            </div>
                        </div>

                        <div className="mt-4 p-4 rounded-lg bg-red-500/5 border border-red-500/20 space-y-2">
                            <h4 className="text-base font-semibold text-red-300">iOS 安装常见问题</h4>
                            <ul className="list-disc list-inside text-sm text-gray-400 space-y-1">
                                <li><strong>提示“无法验证应用完整性”</strong>：重新信任证书，再刷新一次签名。</li>
                                <li><strong>打开即闪退</strong>：通常是证书过期，重新续签或重新安装即可。</li>
                                <li><strong>打开后请求 localhost:1420</strong>：下载到了开发包，请重新安装 Release 版 IPA。</li>
                                <li><strong>SideStore 刷新失败</strong>：优先检查 TUN 是否开启、环回地址是否为 <code className="bg-black/40 px-2 py-0.5 rounded text-cyan text-sm">10.7.0.1</code>。</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* 版本更新 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="update">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Zap className="text-cyan" size={20} />
                        版本更新
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>Mini-HBUT 内置自动更新检查机制：</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>桌面端（Windows/macOS/Linux）：</strong>启动时自动检查新版本，发现更新后会弹出提示框，点击即可打开下载页面。</li>
                            <li><strong>Android：</strong>同样启动时检查，点击更新会下载新版 APK。</li>
                            <li><strong>iOS：</strong>需要手动下载新 IPA 并重新侧载安装（覆盖安装即可，数据不丢失）。</li>
                            <li><strong>强制更新：</strong>当服务端检测到当前版本过低时，会阻止使用并提示更新。</li>
                        </ul>
                        <p>下载渠道（按优先级）：</p>
                        <ol className="list-decimal list-inside space-y-1 ml-4 text-sm">
                            <li>GitHub Releases（推荐，最新最快）</li>
                            <li>gh-proxy 代理（国内加速镜像）</li>
                            <li>jsDelivr CDN 加速</li>
                        </ol>
                    </div>
                </div>
            </section>

            {/* ===== 第二部分：快速入门 ===== */}
            <section className="space-y-8" id="quick-start">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Star className="text-purple" size={26} />
                    快速入门
                </h2>

                {/* 登录 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="login">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Shield className="text-cyan" size={20} />
                        登录
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>Mini-HBUT 支持<strong>三种登录方式</strong>，选择你最方便的一种即可：</p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                                <h4 className="font-semibold text-white mb-2">🏫 新融合门户</h4>
                                <p className="text-sm text-gray-400">使用湖工大统一身份认证平台（CAS）的学号 + 密码登录。这是最常用的方式。</p>
                                <ul className="list-disc list-inside text-xs text-gray-500 mt-2 space-y-1">
                                    <li>支持记住密码</li>
                                    <li>支持扫码临时登录</li>
                                    <li>需要识别验证码（自动 OCR）</li>
                                </ul>
                            </div>
                            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                                <h4 className="font-semibold text-white mb-2">📱 学习通</h4>
                                <p className="text-sm text-gray-400">使用超星学习通的账号密码登录，自动绑定教务系统。</p>
                                <ul className="list-disc list-inside text-xs text-gray-500 mt-2 space-y-1">
                                    <li>支持扫码登录</li>
                                    <li>登录后自动解析学号</li>
                                    <li>密码 AES 加密传输</li>
                                </ul>
                            </div>
                            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                                <h4 className="font-semibold text-white mb-2">📷 扫码临时登录</h4>
                                <p className="text-sm text-gray-400">在手机端打开门户/学习通 App，扫描 Mini-HBUT 显示的二维码完成登录。</p>
                                <ul className="list-disc list-inside text-xs text-gray-500 mt-2 space-y-1">
                                    <li>无需输入密码</li>
                                    <li>临时会话，有效期有限</li>
                                    <li>适合公共电脑使用</li>
                                </ul>
                            </div>
                        </div>

                        <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-200 text-sm">
                            <strong>ℹ️ 登录流程说明：</strong>
                            <ol className="list-decimal list-inside mt-1 space-y-1">
                                <li>输入账号密码 → 自动获取验证码页面 → OCR 识别验证码 → 提交登录</li>
                                <li>登录成功后自动保存会话（Cookie）到本地</li>
                                <li>下次启动时自动恢复会话，无需重新登录</li>
                                <li>会话过期时自动尝试使用保存的密码重新登录</li>
                            </ol>
                        </div>
                    </div>
                </div>

                {/* 首页仪表盘 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="dashboard">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <HardDrive className="text-cyan" size={20} />
                        首页仪表盘
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>登录成功后进入首页仪表盘，这里是 Mini-HBUT 的核心导航区域：</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>今日课程：</strong>实时显示今天的课程安排，包括课程名称、时间和教室。</li>
                            <li><strong>公告栏：</strong>显示来自服务端推送的滚动公告、置顶通知和重要提示。</li>
                            <li><strong>模块导航网格：</strong>所有功能模块的快捷入口，点击即可跳转对应功能页面。</li>
                            <li><strong>离线指示：</strong>当检测到网络不可用时，会显示离线标识，此时使用本地缓存数据。</li>
                        </ul>
                    </div>
                </div>
            </section>

            {/* ===== 第三部分：功能详解 ===== */}
            <section className="space-y-8" id="features">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <BookOpen className="text-cyan" size={26} />
                    功能详解
                </h2>

                {/* 成绩查询 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="grades">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <GraduationCap className="text-cyan" size={20} />
                        成绩查询
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>查询你所有学期的课程成绩，支持多种筛选和统计方式。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>学期筛选：</strong>在顶部下拉框中选择学期，或选择「全部」查看所有成绩。</li>
                            <li><strong>课程搜索：</strong>在搜索框中输入课程名称关键词进行实时筛选。</li>
                            <li><strong>状态筛选：</strong>可以按「合格」「不合格」「补考」等状态过滤。</li>
                            <li><strong>学分统计：</strong>页面顶部展示已获总学分和当前学期学分。</li>
                            <li><strong>缓存机制：</strong>首次查询从服务器获取，后续使用本地缓存（缓存时间 3 天），可手动刷新。</li>
                            <li><strong>变更检测：</strong>后台静默检查会比较最新成绩与缓存，发现新成绩自动推送通知。</li>
                        </ul>
                    </div>
                </div>

                {/* 课表查询 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="schedule">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Calendar className="text-cyan" size={20} />
                        课表查询
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>以<strong>周视图</strong>形式展示你的课程安排，直观清晰。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>周切换：</strong>左右滑动或点击箭头切换周次，顶部显示当前是第几周。</li>
                            <li><strong>今日标记：</strong>今天的列会高亮显示。</li>
                            <li><strong>课程详情：</strong>点击课程卡片查看详细信息（教师、教室、节次、周次范围）。</li>
                            <li><strong>自定义课程：</strong>支持手动添加/编辑/删除自定义课程，自定义课程按学期存储，与教务课程区分显示。</li>
                            <li><strong>课表导出：</strong>支持导出为 iCalendar (.ics) 格式，可导入到 Google Calendar、Outlook、Apple Calendar 等。</li>
                            <li><strong>云同步：</strong>登录后自动将课表数据（含自定义课程）同步到云端，换设备时自动恢复。</li>
                        </ul>
                    </div>
                </div>

                {/* 考试安排 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="exams">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <BookMarked className="text-cyan" size={20} />
                        考试安排
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>查看本学期所有考试的时间、地点和状态。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>分类显示：</strong>自动按日期排序，区分「未考」和「已考」。</li>
                            <li><strong>考试详情：</strong>包括考试名称、时间、地点、座位号等信息。</li>
                            <li><strong>次日提醒：</strong>后台检查发现明天有考试时会推送通知提醒。</li>
                        </ul>
                    </div>
                </div>

                {/* 排名查询 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="ranking">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <BarChart3 className="text-cyan" size={20} />
                        绩点排名
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>查看你在班级、专业和年级中的绩点排名情况。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>三维排名：</strong>分别展示班级排名、专业排名和学院排名。</li>
                            <li><strong>GPA 展示：</strong>显示你的平均绩点和排名百分比。</li>
                            <li><strong>实时查询：</strong>每次打开时从教务系统实时获取最新排名数据。</li>
                        </ul>
                    </div>
                </div>

                {/* 学业进度 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="academic-progress">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <GraduationCap className="text-purple" size={20} />
                        学业完成情况 & 培养方案
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>以进度条和树形结构直观展示你的学业完成度。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>学分统计：</strong>多维度展示总学分、必修/选修/实践学分的完成进度。</li>
                            <li><strong>培养方案树：</strong>按课程模块（通识、专业基础、专业核心等）分层展示每门课程的完成状态。</li>
                            <li><strong>完成标记：</strong>已修课程标绿色，未修标灰色，一目了然。</li>
                        </ul>
                    </div>
                </div>

                {/* 电费查询 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="electricity">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Bolt className="text-yellow-400" size={20} />
                        电费查询
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>查询宿舍电费余额，支持低电量自动提醒。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>宿舍选择：</strong>首次使用通过级联选择器选择「校区 → 楼栋 → 楼层 → 房间」，选择后自动保存。</li>
                            <li><strong>余额展示：</strong>显示当前电费余额（度数）和账户金额。</li>
                            <li><strong>离线缓存：</strong>无网络或服务异常时显示上次缓存的数据，并标注同步时间。</li>
                            <li><strong>低电量提醒：</strong>后台检查发现余额低于 10 度时自动推送通知，智能去重避免重复打扰。</li>
                            <li><strong>自动重试：</strong>查询失败时自动重试（默认 2 次），应对服务器临时不稳定。</li>
                        </ul>
                    </div>
                </div>

                {/* 校园一码通 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="campus-code">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Scan className="text-cyan" size={20} />
                        校园一码通
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>在手机/桌面上生成和显示校园消费二维码。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>在线模式：</strong>每隔一定时间（默认 60 秒）自动刷新二维码，保持有效性。</li>
                            <li><strong>高能模式：</strong>手动刷新，适合网络不稳定或离线场景。</li>
                            <li><strong>余额显示：</strong>消费后实时显示剩余金额。</li>
                            <li><strong>订单状态：</strong>自动轮询检查支付/消费状态（3 秒一次），展示结果。</li>
                            <li><strong>设备码：</strong>本地自动生成唯一设备码并持久化存储。</li>
                        </ul>
                    </div>
                </div>

                {/* 交易记录 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="transactions">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <CreditCard className="text-cyan" size={20} />
                        交易记录
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>查看一码通的消费流水，支持多维度筛选和统计。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>月份筛选：</strong>支持按月份查看最近 12 个月的交易记录。</li>
                            <li><strong>收支统计：</strong>自动计算当月总收入和总支出。</li>
                            <li><strong>详情展示：</strong>每笔交易显示时间、类型、金额和余额。</li>
                        </ul>
                    </div>
                </div>

                {/* 空教室查询 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="classroom">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Building className="text-cyan" size={20} />
                        空教室查询
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>查找指定日期和时间段内的空闲教室。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>时间段选择：</strong>选择日期和节次范围（如第 1-2 节、第 3-4 节等）。</li>
                            <li><strong>教学楼筛选：</strong>可按教学楼过滤结果。</li>
                            <li><strong>自动重试：</strong>请求失败时自动重试（默认 2 次）。</li>
                        </ul>
                    </div>
                </div>

                {/* 图书查询 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="library">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <BookMarked className="text-purple" size={20} />
                        图书馆查询
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>检索学校图书馆的馆藏书籍，查看详情和借阅状态。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>关键词搜索：</strong>输入书名、作者或 ISBN 进行搜索。</li>
                            <li><strong>高级筛选：</strong>支持按学科分类、出版社、出版年份等多维度筛选。</li>
                            <li><strong>馆藏信息：</strong>展示每本书的馆藏位置、可借数量和在馆状态。</li>
                            <li><strong>书籍详情：</strong>点击查看完整信息，包括封面、简介和目录。</li>
                        </ul>
                    </div>
                </div>

                {/* 资料分享 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="resource-share">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <FolderOpen className="text-cyan" size={20} />
                        资料分享
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>连接校内 WebDAV 共享网络，浏览和下载学习资料。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>文件浏览：</strong>以文件管理器的形式浏览远程目录结构。</li>
                            <li><strong>在线预览：</strong>
                                <ul className="list-disc list-inside ml-6 text-sm text-gray-400">
                                    <li>PDF 文件：使用 pdf.js 在线预览</li>
                                    <li>Office 文件：通过代理服务转换预览</li>
                                    <li>图片：直接在线查看</li>
                                    <li>视频：使用 XGPlayer 播放器</li>
                                </ul>
                            </li>
                            <li><strong>文件下载：</strong>支持单文件下载，可配置下载并发线程数。</li>
                            <li><strong>CDN 缓存：</strong>预览所需的 pdf.js、xgplayer 等库首次使用时自动下载并缓存，后续离线可用。</li>
                        </ul>
                    </div>
                </div>

                {/* 导出中心 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="export">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <FileOutput className="text-cyan" size={20} />
                        导出中心
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>将你的学业数据导出为多种格式，方便保存和分享。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>成绩单导出：</strong>导出为图片或 JSON 格式。</li>
                            <li><strong>课表导出：</strong>导出为 iCalendar (.ics) 文件，可导入各大日历应用。</li>
                            <li><strong>个人信息导出：</strong>导出基本学籍信息。</li>
                            <li><strong>批量导出：</strong>支持在导出中心一站式操作所有模块的导出。</li>
                        </ul>
                    </div>
                </div>

                {/* 校历 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="calendar">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Calendar className="text-purple" size={20} />
                        校历
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>查看学校校历安排，了解学期时间节点。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>学期周次显示，当前周高亮标记。</li>
                            <li>假期安排与节假日识别。</li>
                            <li>开学/放假日期一目了然。</li>
                        </ul>
                    </div>
                </div>

                {/* 全校课表 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="global-schedule">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Globe className="text-cyan" size={20} />
                        全校课表查询
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>查询全校开设的课程安排，适合选课参考和旁听。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>高级筛选：</strong>按学年/学期、院系、专业、年级、班级等条件组合查询。</li>
                            <li><strong>分页展示：</strong>支持查看 3000+ 课程的完整列表。</li>
                            <li><strong>课程信息：</strong>展示授课教师、上课时间地点、班级等详细信息。</li>
                        </ul>
                    </div>
                </div>

                {/* 校园地图 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="campus-map">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Map className="text-cyan" size={20} />
                        校园地图
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>查看学校的校园地图，支持缩放和拖拽操作。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>远程加载高清校园地图并缓存到本地。</li>
                            <li>支持手势缩放和平移查看。</li>
                            <li>集成微信小程序版地图入口。</li>
                        </ul>
                    </div>
                </div>

                {/* 个人信息 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="student-info">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Shield className="text-cyan" size={20} />
                        个人信息
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>查看你的学籍信息和登录安全记录。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>基本信息：</strong>学号、姓名、学院、专业、班级、身份证号等。</li>
                            <li><strong>登录记录：</strong>查看历史登录设备、IP 地址和登录地点。</li>
                            <li><strong>App 授权：</strong>查看已授权的第三方应用列表。</li>
                        </ul>
                    </div>
                </div>

                {/* AI 助手 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="ai-chat">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Bot className="text-purple" size={20} />
                        AI 助手
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>内置 AI 对话功能，支持多个大模型切换。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>可用模型：</strong>Qwen-Plus、Qwen-Max、DeepSeek-R1、Doubao1.5-Pro（通过远程配置可扩展）。</li>
                            <li><strong>流式对话：</strong>使用 SSE（Server-Sent Events）流式传输，实时显示 AI 回复。</li>
                            <li><strong>Markdown 渲染：</strong>AI 回复支持完整的 Markdown 格式，包括代码高亮和 LaTeX 数学公式。</li>
                            <li><strong>历史记录：</strong>对话历史自动保存在本地，支持查看和继续历史会话。</li>
                        </ul>
                    </div>
                </div>
            </section>

            {/* ===== 第四部分：高级功能 ===== */}
            <section className="space-y-8" id="advanced">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Zap className="text-purple" size={26} />
                    高级功能
                </h2>

                {/* 后台通知 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="notifications">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Bell className="text-cyan" size={20} />
                        后台通知与静默检查
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>Mini-HBUT 可以在后台定期检查你的学业数据变化，并在发现新内容时推送通知。</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                                <h4 className="font-semibold text-white mb-2">📊 成绩检测</h4>
                                <p className="text-sm text-gray-400">自动比较最新成绩与本地缓存，发现新成绩立即通知。告别反复刷教务系统。</p>
                            </div>
                            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                                <h4 className="font-semibold text-white mb-2">📝 考试提醒</h4>
                                <p className="text-sm text-gray-400">检测到明天有考试时自动推送提醒，附带考试名称、时间和地点。</p>
                            </div>
                            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                                <h4 className="font-semibold text-white mb-2">🔋 电费监控</h4>
                                <p className="text-sm text-gray-400">定期查询宿舍电费，余额低于 10 度时推送提醒，智能去重不会反复打扰。</p>
                            </div>
                            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                                <h4 className="font-semibold text-white mb-2">📅 课表刷新</h4>
                                <p className="text-sm text-gray-400">后台自动刷新课表数据，确保始终显示最新课程安排。</p>
                            </div>
                        </div>

                        <div className="mt-4 space-y-3">
                            <p><strong>平台差异：</strong></p>
                            <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                                <li><strong>桌面端：</strong>应用运行时自动执行启动检查并定期轮询。</li>
                                <li><strong>Android：</strong>使用 Capacitor Background Fetch 实现后台任务，支持开机自启（startOnBoot）和进程退出后继续运行（stopOnTerminate=false）。最小检查间隔 15 分钟。</li>
                                <li><strong>iOS：</strong>受系统限制，后台任务可能被系统优化策略影响，不保证准时触发。</li>
                            </ul>
                        </div>

                        <div className="mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 text-sm">
                            <strong>💡 建议：</strong>Android 用户在系统设置中将 Mini-HBUT 设为「不受限制」的电池优化策略，以确保后台任务正常运行。不同厂商手机的设置路径可能不同（华为：应用启动管理；小米：省电策略；OPPO/vivo：后台管理）。
                        </div>
                    </div>
                </div>

                {/* 云同步 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="cloud-sync">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <CloudUpload className="text-cyan" size={20} />
                        云同步
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>Mini-HBUT 支持将你的数据同步到云端（Cloudflare Workers），实现跨设备数据共享。</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li><strong>同步的数据：</strong>
                                <ul className="list-disc list-inside ml-6 text-sm text-gray-400">
                                    <li>应用设置（UI 配置、字体、登录偏好）</li>
                                    <li>自定义课程（按学期存储）</li>
                                    <li>学业数据（成绩、排名、课表缓存）</li>
                                </ul>
                            </li>
                            <li><strong>自动同步：</strong>
                                <ul className="list-disc list-inside ml-6 text-sm text-gray-400">
                                    <li>首次在新设备登录时自动下载云端数据并应用</li>
                                    <li>每次登录后自动上传最新数据到云端</li>
                                </ul>
                            </li>
                            <li><strong>冷却机制：</strong>为避免频繁请求，上传和下载分别有冷却时间（默认上传 120 秒、下载 10 秒）。</li>
                            <li><strong>学号验证：</strong>通过 10 位学号标识用户数据，上传/下载需要通过 challenge 认证。</li>
                        </ul>
                    </div>
                </div>

                {/* 字体系统 */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="fonts">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Star className="text-purple" size={20} />
                        字体与主题
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>Mini-HBUT 提供丰富的字体和主题个性化选项。</p>

                        <p><strong>可用字体：</strong></p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                            {[
                                { name: '默认', desc: '系统默认字体' },
                                { name: '得意黑', desc: '开源美观，推荐' },
                                { name: '黑体', desc: '标准中文黑体' },
                                { name: '宋体', desc: '经典衬线字体' },
                                { name: '楷体', desc: '手写风格' },
                                { name: '仿宋', desc: '传统印刷风格' },
                            ].map(f => (
                                <div key={f.name} className="p-3 rounded-lg bg-white/5 border border-white/10 text-sm">
                                    <div className="font-semibold text-white">{f.name}</div>
                                    <div className="text-gray-400 text-xs mt-1">{f.desc}</div>
                                </div>
                            ))}
                        </div>

                        <p className="mt-3"><strong>CDN 线路：</strong>字体通过 CDN 加载，支持切换线路：</p>
                        <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                            <li><strong>自动（推荐）：</strong>自动选择最快的 CDN（jsDelivr → unpkg 降级）</li>
                            <li><strong>jsDelivr：</strong>国内一般较快</li>
                            <li><strong>unpkg：</strong>备用线路</li>
                        </ul>
                        <p className="mt-2">字体下载后会缓存到 IndexedDB，后续使用无需重新下载。</p>

                        <p className="mt-4"><strong>主题预设：</strong></p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                            {[
                                { name: '校园晴空', type: 'light', color: '#2563eb', desc: '清爽蓝色调，日常学习模式' },
                                { name: '深海石墨', type: 'dark', color: '#60a5fa', desc: '深色模式，夜间护眼' },
                                { name: '薄荷森林', type: 'vivid', color: '#059669', desc: '绿色调，柔和不刺眼' },
                                { name: '夕照暖橙', type: 'vivid', color: '#f97316', desc: '暖色调，高辨识度' },
                                { name: '极简岩灰', type: 'neutral', color: '#334155', desc: '灰色调，信息密集场景' },
                            ].map(t => (
                                <div key={t.name} className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                                    <div>
                                        <div className="font-semibold text-white text-sm">{t.name} <span className="text-xs text-gray-500">({t.type})</span></div>
                                        <div className="text-gray-400 text-xs">{t.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <p className="mt-3 text-sm text-gray-400">
                            除主题颜色外，还可以自定义卡片风格（毛玻璃/实色/描边）、导航样式（浮动/胶囊/紧凑）、界面密度（舒适/均衡/紧凑）、图标风格（双色/线条/单色）、背景装饰（网格/颗粒/无）等。
                        </p>
                    </div>
                </div>

                {/* HTTP Bridge API */}
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4" id="api">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Terminal className="text-cyan" size={20} />
                        本地 HTTP Bridge API
                    </h3>
                    <div className="text-gray-300 space-y-3">
                        <p>
                            Mini-HBUT 桌面端内置了一个本地 HTTP 服务（默认 <code className="bg-black/40 px-2 py-0.5 rounded text-cyan text-sm">http://127.0.0.1:4399</code>），
                            你可以通过这个接口在外部程序中调用 Mini-HBUT 的能力。
                        </p>

                        <p><strong>统一响应格式：</strong></p>
                        <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto">
                            <code>{`// 成功
{ "success": true, "data": { ... }, "error": null, "time": "2026-03-10 12:00:00" }

// 失败
{ "success": false, "data": null, "error": { "kind": "请求失败", "message": "登录失效" }, "time": "..." }`}</code>
                        </pre>

                        <p className="mt-3"><strong>主要接口列表：</strong></p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="py-2 px-3 text-gray-400">模块</th>
                                        <th className="py-2 px-3 text-gray-400">接口</th>
                                        <th className="py-2 px-3 text-gray-400">方法</th>
                                        <th className="py-2 px-3 text-gray-400">说明</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-300">
                                    {[
                                        ['认证', '/api/v2/login', 'POST', '账号密码登录'],
                                        ['认证', '/api/v2/login/qr/init', 'POST', '初始化扫码登录'],
                                        ['认证', '/api/v2/login/qr/check', 'POST', '检查扫码状态'],
                                        ['成绩', '/api/v2/grades/sync', 'POST', '同步最新成绩'],
                                        ['成绩', '/api/v2/grades/local', 'GET', '获取本地缓存成绩'],
                                        ['课表', '/api/v2/schedule/sync', 'POST', '同步课表'],
                                        ['课表', '/api/v2/schedule/local', 'GET', '获取本地缓存课表'],
                                        ['考试', '/api/v2/exams', 'GET', '查询考试安排'],
                                        ['排名', '/api/v2/ranking', 'GET', '查询绩点排名'],
                                        ['电费', '/api/v2/electricity/balance', 'POST', '查询电费余额'],
                                        ['交易', '/api/v2/transactions', 'GET', '查询一码通流水'],
                                        ['教室', '/api/v2/classroom', 'GET', '查询空教室'],
                                        ['图书', '/api/v2/library/search', 'POST', '搜索图书馆藏'],
                                        ['信息', '/api/v2/student/info', 'GET', '获取学生信息'],
                                        ['一码通', '/api/v2/campus_code/qrcode', 'POST', '生成校园码'],
                                        ['AI', '/api/v2/ai/chat', 'POST', 'AI 对话'],
                                        ['课表', '/api/v2/schedule/export/ics', 'POST', '导出课表 ICS'],
                                        ['全校', '/api/v2/global_schedule', 'GET', '查询全校课表'],
                                    ].map((row, i) => (
                                        <tr key={i} className="border-b border-gray-800/50">
                                            <td className="py-2 px-3">{row[0]}</td>
                                            <td className="py-2 px-3"><code className="bg-black/40 px-1.5 py-0.5 rounded text-xs text-cyan">{row[1]}</code></td>
                                            <td className="py-2 px-3"><code className="text-xs">{row[2]}</code></td>
                                            <td className="py-2 px-3">{row[3]}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
                            <strong>🔒 安全提示：</strong>HTTP Bridge 默认仅监听 127.0.0.1（本机），不对外暴露。请勿在公网环境直接转发此端口。如需对外集成，建议通过 NoneBot 等中间层转发并添加鉴权。
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default Guide;

