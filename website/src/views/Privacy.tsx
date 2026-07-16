import Link from 'next/link';
import Navbar from '@/components/Navbar';

const lastUpdated = '2026-07-17';

const sections = [
  {
    id: 'overview',
    title: '1. 概述',
    paragraphs: [
      'Mini-HBUT（以下简称「本应用」）是由个人开发者提供的校园信息聚合工具，用于在用户主动登录后查询课表、成绩、考试、通知、校园生活等相关信息。',
      '本隐私政策说明我们收集哪些信息、如何使用、是否离开设备，以及你如何控制与删除数据。使用本应用即表示你已阅读并理解本政策；若不同意，请停止使用并卸载。',
    ],
  },
  {
    id: 'controller',
    title: '2. 开发者与联系方式',
    paragraphs: [
      '本应用由个人开发者 superdaobo 维护，开源仓库见 GitHub：superdaobo/mini-hbut。',
      '问题反馈请通过 GitHub Issues 或应用内公告/文档指引的渠道联系。官网：https://hbut.6661111.xyz ；备用站点：https://superdaobo.github.io/mini-hbut/ 。',
    ],
  },
  {
    id: 'data-we-process',
    title: '3. 我们处理的数据',
    paragraphs: [
      '以下数据仅在你使用对应功能时处理，且多数保存在你的设备本地：',
    ],
    bullets: [
      '账号标识：学号/用户名（用于登录与会话恢复）。',
      '校园认证凭据：密码仅在你选择「记住密码」时可能存入系统密钥环；App Store 构建不会把密码备份到 localStorage。',
      '会话 Cookie：统一身份认证、教务、学习通等相关 Cookie，用于维持已登录状态。',
      '学业与校园数据缓存：课表、成绩、考试、排名、个人信息、电费、通知等接口返回的内容，用于离线查看与加速。',
      '应用设置：主题、布局、字体、更新频道等偏好。',
      '可选云同步标识：若你启用云同步，会生成设备标识并上传你选择同步的设置/学业缓存（不含密码与 Cookie）。',
      '可选功能数据：验证码图片（OCR）、论坛资料、模块中心远程模块、AI 对话内容等，仅在你主动使用时产生。',
      '演示账号 reviewer：仅使用本地演示数据，不向校园系统发送真实凭据。',
    ],
  },
  {
    id: 'not-collected',
    title: '4. 我们不主动收集的数据',
    bullets: [
      '不出售你的个人数据。',
      '不把密码或 Cookie 上传到第三方广告平台。',
      'App Store / 合规构建下：默认关闭远程云同步开关与用量上送，且不请求不必要的定位权限。',
      '不把调试日志、校园码、二维码默认发送到开发者服务器；仅在你主动反馈时可能由你自行提供。',
    ],
  },
  {
    id: 'purposes',
    title: '5. 使用目的',
    bullets: [
      '完成校园统一身份认证并代你访问已授权的教务/学习通等接口。',
      '在本地展示课表、成绩、考试、通知与校园生活相关信息。',
      '在你启用时提供云同步、远程模块、论坛、OCR、AI 等可选能力。',
      '检查应用更新、加载远程配置（公告、功能开关等）。',
      '改进稳定性（仅限你主动开启的诊断/调试能力）。',
    ],
  },
  {
    id: 'third-parties',
    title: '6. 第三方与数据离开设备的情况',
    paragraphs: [
      '本应用会在你操作时连接以下类型的服务（具体端点以远程配置与校园官方域名为准）：',
    ],
    bullets: [
      '校园官方系统：统一身份认证、教务、学习通、图书馆、电费等（登录与业务查询所必需）。',
      '更新与静态资源：腾讯云 EdgeOne Pages（主站 hbut.6661111.xyz）以及 GitHub Pages 备用站（superdaobo.github.io/mini-hbut）。',
      '可选 OCR / 论坛 / 资料分享 / 云同步代理：仅在对应功能启用且你使用时访问。',
      '字体或脚本 CDN（如 jsDelivr / unpkg）：仅在你选择远程字体等外观能力时。',
      '开源托管：GitHub（源码、Release 安装包下载）。',
    ],
    paragraphsAfter: [
      '第三方服务各自适用其隐私政策。校园系统由学校或官方平台运营，本应用无法控制其数据处理规则。',
    ],
  },
  {
    id: 'storage',
    title: '7. 存储位置与期限',
    bullets: [
      '本地：应用数据目录、SQLite 会话库、localStorage/缓存、系统密钥环（若可用）。',
      '会话 Cookie：随登录态存在，退出登录会清理运行态会话；彻底清除仍需删除应用数据。',
      '缓存数据：用于离线体验，可在设置中清理，或卸载应用删除。',
      '云端（仅你启用云同步时）：保留期限取决于云同步服务配置；关闭同步不保证远端历史立即删除。',
    ],
  },
  {
    id: 'security',
    title: '8. 安全说明（如实披露）',
    paragraphs: [
      '我们采取合理技术措施保护本地会话，但请理解：',
    ],
    bullets: [
      '本地 SQLite 与部分字段并非军用级加密；历史版本中可能存在 Base64 编码字段，不等于强加密。',
      '请勿将 Cookie 快照、数据库文件、调试截图、校园码、验证码图片发给不可信对象。',
      '公共 Wi‑Fi、代理或 HTTP 回退链路会改变传输风险；请优先使用可信网络。',
      '远程模块与自定义脚本应按不可信内容对待；仅从官方渠道安装应用与模块。',
    ],
  },
  {
    id: 'your-rights',
    title: '9. 你的控制权',
    bullets: [
      '退出登录：清除运行态会话与部分登录状态。',
      '清除缓存 / 清除本地数据：删除学业缓存、部分设置与同步状态（以设置页实际能力为准）。',
      '关闭可选功能：云同步、远程模块、OCR、论坛、AI、用量统计等。',
      '卸载应用：删除应用沙箱内数据（系统级行为）。',
      '查阅技术细节：见文档「安全与隐私」页（面向开发者的完整数据映射）。',
    ],
  },
  {
    id: 'children',
    title: '10. 未成年人',
    paragraphs: [
      '本应用面向高校学生与教职工场景。若你是未成年人，请在监护人指导下使用，并确认是否允许使用校园账号相关功能。',
    ],
  },
  {
    id: 'changes',
    title: '11. 政策更新',
    paragraphs: [
      '我们可能随功能迭代更新本政策，并在本页更新日期处标明。重大变更时会尽量通过官网公告或应用内通知提示。请定期查阅最新版本。',
    ],
  },
  {
    id: 'related',
    title: '12. 相关链接',
    bullets: [
      '用户文档总览：/docs',
      '安全与隐私（技术说明）：/docs/security-privacy',
      '下载与版本：/releases',
      '主站：https://hbut.6661111.xyz',
      'GitHub Pages 备用：https://superdaobo.github.io/mini-hbut/',
    ],
  },
];

export default function Privacy() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#03060d] text-white">
      <Navbar />
      <main className="relative z-10 mx-auto max-w-3xl px-4 pb-24 pt-28 sm:px-6 lg:px-8">
        <header className="mb-10 space-y-4 border-b border-white/10 pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan/80">Legal</p>
          <h1 className="bg-gradient-to-r from-cyan to-purple bg-clip-text text-4xl font-bold text-transparent">
            隐私政策
          </h1>
          <p className="text-sm text-gray-400">
            Mini-HBUT Privacy Policy · 最近更新：{lastUpdated}
          </p>
          <p className="leading-7 text-gray-300">
            本页面向终端用户。若你需要更细的源码级数据映射与安全边界说明，请阅读{' '}
            <Link href="/docs/security-privacy" className="text-cyan underline-offset-4 hover:underline">
              安全与隐私文档
            </Link>
            。
          </p>
        </header>

        <nav className="mb-10 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">目录</h2>
          <ol className="grid gap-2 text-sm text-gray-400 sm:grid-cols-2">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="hover:text-cyan">
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-10">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-28 space-y-4">
              <h2 className="text-2xl font-bold text-white">{section.title}</h2>
              {section.paragraphs?.map((p) => (
                <p key={p} className="leading-7 text-gray-300">
                  {p}
                </p>
              ))}
              {section.bullets?.length ? (
                <ul className="list-disc space-y-2 pl-5 text-gray-300">
                  {section.bullets.map((item) => (
                    <li key={item} className="leading-7">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
              {section.paragraphsAfter?.map((p) => (
                <p key={p} className="leading-7 text-gray-300">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>

        <footer className="mt-16 border-t border-white/10 pt-8 text-sm text-gray-500">
          <p>
            开源协议 GPL-3.0 · © {new Date().getFullYear()} Mini-HBUT ·{' '}
            <Link href="/" className="text-cyan hover:underline">
              返回首页
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
