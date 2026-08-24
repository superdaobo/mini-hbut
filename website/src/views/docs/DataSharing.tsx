const scopes = [
    {
        id: 'student.grades.read',
        desc: '全部成绩单：含各学期成绩与绩点的完整成绩数据。',
    },
    {
        id: 'student.timetable.read',
        desc: '完整课表：当前学期的完整课表数据。',
    },
];

const DataSharing = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">开发者文档 · 数据共享</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                数据共享说明
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                第三方应用如何经用户明确授权后，通过云端数据快照读取 Mini-HBUT 用户的成绩与课表数据：
                覆盖数据范围、授权流程、时效与撤回、隐私声明和泄露处置。
            </p>
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm leading-7 text-amber-100">
                <strong>一句话边界：</strong> 云端永远不会有你的教务密码；云端只保存你<strong>明确勾选</strong>的数据
                的<strong>加密副本</strong>，有效期最长 7 天，随时可在 App 内清除。
            </div>
        </header>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">1. 机制概述</h2>
            <p className="text-sm leading-7 text-gray-300">
                数据共享采用<strong>快照机制</strong>：第三方网站不能实时登录教务系统拉取你的数据，
                它能拿到的只是你在 App 内点击“允许”那一刻生成的一份加密快照。快照由 App 加密上传到云端，
                网站在有效期内读取这份快照；到期即失效。整个过程里：
            </p>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                <li>共享哪些数据由你在 App 弹窗中逐项勾选决定，勾选项就是共享的上限；</li>
                <li>App 使用你本地的登录会话生成快照，<strong>教务密码永不上云</strong>；</li>
                <li>网站读取的是静态快照，不是你的教务会话，也无法代替你执行任何操作。</li>
            </ul>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">2. 数据范围（Scope）清单</h2>
            <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="bg-white/[0.05] text-gray-200">
                        <tr><th className="p-3">Scope</th><th className="p-3">共享内容</th></tr>
                    </thead>
                    <tbody>
                        {scopes.map((scope) => (
                            <tr key={scope.id} className="border-t border-white/10">
                                <td className="p-3"><code className="break-all font-semibold text-cyan">{scope.id}</code></td>
                                <td className="p-3 text-gray-300">{scope.desc}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="rounded-xl border border-cyan/20 bg-cyan/5 p-5 text-sm leading-7 text-gray-300">
                <strong>申请要求：</strong> 第三方开发者申请数据 Scope 时，必须提供不少于 <strong>10 字</strong>的用途说明，
                并经过<strong>人工审核</strong>才会生效。审核会在授权弹窗中如实向用户展示用途，
                没有说清用途的申请不会通过。
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">3. 授权与共享流程</h2>
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-7 text-gray-300">
                <li>
                    <strong>第三方发起授权：</strong> 第三方网站发起数据授权请求，把你引导至 Mini-HBUT 的授权入口；
                </li>
                <li>
                    <strong>App 弹窗逐项勾选：</strong> Mini-HBUT App 弹出授权窗口，逐项列出可共享的数据，
                    由你自主勾选，任何一步都可以取消；
                </li>
                <li>
                    <strong>允许瞬间加密上传：</strong> 你点击“允许”的那一刻，App 把勾选的数据加密上传到云端形成快照——
                    <strong className="text-amber-100">教务密码永不上云！</strong>上传内容只有你勾选的数据本身；
                </li>
                <li>
                    <strong>网站在有效期内读取：</strong> 第三方网站在快照有效期内从云端读取这份加密快照，
                    过期后无法再读到任何内容。
                </li>
            </ol>
            <p className="text-sm leading-7 text-gray-400">
                流程上这与 <a className="text-cyan hover:underline" href="/docs/identity-oidc">OIDC 接入指南</a> 中的
                App Approval 同源：Deep Link / 授权页只是把请求带到 App，真正的决定权和数据出口始终在你手中的 App 里。
            </p>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">4. 时效与撤回</h2>
            <div className="grid gap-4 md:grid-cols-3">
                <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="text-base font-bold text-cyan">最长 7 天</h3>
                    <p className="mt-3 text-sm leading-7 text-gray-300">
                        快照有效期最长 7 天，到期自动失效删除；第三方不能“续期”旧快照，
                        需要新数据就必须重新走一次授权。
                    </p>
                </article>
                <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="text-base font-bold text-cyan">App 内随时管理</h3>
                    <p className="mt-3 text-sm leading-7 text-gray-300">
                        在 App 内可以随时查看已共享了哪些数据、共享给了谁，并可以一键清除已共享的数据快照。
                    </p>
                </article>
                <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="text-base font-bold text-cyan">撤销即删除</h3>
                    <p className="mt-3 text-sm leading-7 text-gray-300">
                        撤销某个应用的授权后，该应用对应的云端数据快照会被立即删除，它从此读不到你的任何数据。
                    </p>
                </article>
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">5. 隐私声明</h2>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <ul className="list-disc space-y-3 pl-5 text-sm leading-7 text-gray-300">
                    <li>
                        Mini-HBUT 是<strong>非官方学生工具</strong>，与湖北工业大学官方无关；
                        数据共享能力由 Mini-HBUT 自身提供，不代表学校官方的数据服务；
                    </li>
                    <li>
                        <strong>教务密码永不上云。</strong> 密码仅保存在你的设备本地，用于维持你自己的登录状态，
                        不参与任何上传、同步或共享；
                    </li>
                    <li>
                        云端仅保存你<strong>明确勾选</strong>的数据的<strong>加密副本</strong>，
                        未勾选的数据不会离开你的设备；
                    </li>
                    <li>
                        第三方每一次读取快照都有<strong>审计记录</strong>，出现争议时可用于追溯是哪个应用在何时读取了数据。
                    </li>
                </ul>
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">6. 安全须知：泄露处置步骤</h2>
            <div className="grid gap-4 md:grid-cols-2">
                <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="text-base font-bold text-purple">第三方开发者：Key 泄露</h3>
                    <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-7 text-gray-300">
                        <li>立即在 Developer Portal 轮换 Client Key / Secret，使旧凭据失效；</li>
                        <li>吊销受影响的用户授权与相关会话，阻止旧凭据继续读取快照；</li>
                        <li>结合平台审计记录排查泄露期间发生了哪些读取；</li>
                        <li>如实通知受影响用户，并说明已采取的措施。</li>
                    </ol>
                </article>
                <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="text-base font-bold text-purple">用户：怀疑共享数据泄露</h3>
                    <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-7 text-gray-300">
                        <li>打开 App 的“已共享数据”页面，清除对应共享或直接撤销该应用授权（撤销即删除快照）；</li>
                        <li>必要时在 App 内退出登录并重新登录，刷新本地会话状态；</li>
                        <li>如担心账号安全，前往学校教务系统修改密码（Mini-HBUT 从不上传你的密码）；</li>
                        <li>向开发者反馈渠道报告情况，平台可依据审计记录协助排查。</li>
                    </ol>
                </article>
            </div>
            <div className="rounded-xl border border-cyan/20 bg-cyan/5 p-5 text-sm leading-7 text-gray-300">
                开发者自查底线：不要把 Client Key 打进前端代码、开源仓库或日志；只在服务端保存凭据；
                只申请业务真正需要的 Scope；拿到快照数据后按承诺的用途使用，不做二次分发。
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">7. 相关文档</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                <li><a className="text-cyan hover:underline" href="/docs/identity-oidc">OIDC 接入指南：应用注册、Scope 审核与标准授权流程</a></li>
                <li><a className="text-cyan hover:underline" href="/docs/local-agent">本地 Agent 接入指南：同一台电脑上的 Agent 直连 App 只读数据</a></li>
                <li><a className="text-cyan hover:underline" href="/docs/security-privacy">安全与隐私：凭据、缓存与数据的整体安全边界</a></li>
            </ul>
        </section>
    </div>
);

export default DataSharing;
