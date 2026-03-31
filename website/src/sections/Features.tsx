import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  BarChart3,
  Bell,
  Calendar,
  BookOpen,
  BookText,
  CloudDownload,
  Database,
  DoorOpen,
  FileText,
  FolderOpen,
  Gauge,
  MapPinned,
  Palette,
  QrCode,
  ReceiptText,
  Settings2,
  ShieldCheck,
  Trophy,
  TrendingUp,
  Zap,
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const features = [
  {
    icon: ReceiptText,
    title: '交易记录',
    description: '一卡通流水查询、明细筛选与时间维度回溯',
    color: 'cyan',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: FolderOpen,
    title: '资料分享',
    description: 'WebDAV 目录浏览、视频/文档预览与浏览器下载',
    color: 'purple',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: BookText,
    title: '图书查询',
    description: '馆藏检索、详情查看与状态追踪',
    color: 'pink',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: MapPinned,
    title: '校园地图',
    description: '地图缩放拖拽、远程更新与本地缓存',
    color: 'cyan',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: BarChart3,
    title: '成绩查询',
    description: '学期成绩、绩点与变更检测（支持离线缓存）',
    color: 'purple',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: Calendar,
    title: '课表与自定义课程',
    description: '学期锁定、周次切换、手动加课与冲突提示',
    color: 'pink',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: DoorOpen,
    title: '空教室查询',
    description: '按时间与教学楼筛选可用教室',
    color: 'cyan',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: FileText,
    title: '考试安排',
    description: '考试列表、状态识别与提醒联动',
    color: 'purple',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: Trophy,
    title: '绩点排名',
    description: '班级/专业排名解析与历史缓存对照',
    color: 'pink',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: TrendingUp,
    title: '培养方案与学业进度',
    description: '培养方案解析、课程结构与完成度统计',
    color: 'cyan',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: Zap,
    title: '电费查询',
    description: '宿舍电费实时获取、低电阈值通知与去重提醒',
    color: 'purple',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: QrCode,
    title: '校园码',
    description: '在线/高能模式二维码，状态轮询与自动刷新',
    color: 'pink',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: Bell,
    title: '通知中心',
    description: '后台静默检查课表/成绩/考试/电费并统一推送',
    color: 'cyan',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: BookOpen,
    title: '导出中心',
    description: '成绩/课表/考试等模块导出为 JSON 与图片',
    color: 'purple',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: ShieldCheck,
    title: '双通道登录体系',
    description: '新融合门户与学习通登录，临时会话自动失效处理',
    color: 'pink',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: Database,
    title: '本地数据互通',
    description: '学号维度缓存统一，跨登录渠道共享核心数据',
    color: 'cyan',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: Settings2,
    title: '设置中心',
    description: '远程/仅本地配置切换，模块参数自动保存并即时应用',
    color: 'purple',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: Gauge,
    title: '功能测速',
    description: 'OCR/上传/门户/教务/超星/一码通/图书馆延迟监测',
    color: 'pink',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: Palette,
    title: '主题与字体系统',
    description: '主题联动、字体持久化与按需 CDN 下载切换',
    color: 'cyan',
    span: 'col-span-1 row-span-1',
  },
  {
    icon: CloudDownload,
    title: '运行时 CDN 资源缓存',
    description: 'pdf.js / xgplayer / KaTeX 首次按需加载并缓存',
    color: 'purple',
    span: 'col-span-1 row-span-1',
  },
];

const colorMap: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  cyan: {
    bg: 'bg-cyan/5',
    border: 'border-cyan/30',
    text: 'text-cyan',
    glow: 'shadow-neon',
  },
  purple: {
    bg: 'bg-purple/5',
    border: 'border-purple/30',
    text: 'text-purple',
    glow: 'shadow-neon-purple',
  },
  pink: {
    bg: 'bg-pink/5',
    border: 'border-pink/30',
    text: 'text-pink',
    glow: 'shadow-neon-pink',
  },
};

export default function Features() {
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (titleRef.current) {
        gsap.fromTo(
          titleRef.current,
          { opacity: 0, y: 50 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: titleRef.current,
              start: 'top 80%',
              toggleActions: 'play none none reverse',
            },
          }
        );
      }

      cardsRef.current.forEach((card, i) => {
        if (card) {
          gsap.fromTo(
            card,
            {
              opacity: 0,
              y: 50,
            },
            {
              opacity: 1,
              y: 0,
              duration: 0.8,
              delay: i * 0.1,
              ease: 'back.out(1.7)',
              scrollTrigger: {
                trigger: card,
                start: 'top 85%',
                toggleActions: 'play none none reverse',
              },
            }
          );
        }
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mouse-x', `${x}%`);
    card.style.setProperty('--mouse-y', `${y}%`);
  };

  return (
    <section ref={sectionRef} id="features" className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="section-divider mb-16" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 ref={titleRef} className="font-pixel text-2xl sm:text-3xl md:text-4xl mb-4">
            <span className="gradient-text">功能特性</span>
          </h2>
          <p className="text-gray-400 font-mono text-sm max-w-2xl mx-auto">
            覆盖教务核心、一卡通能力、后台监控、资源预览与跨端配置体系
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feature, i) => {
            const colors = colorMap[feature.color];
            const Icon = feature.icon;

            return (
              <div
                key={feature.title}
                ref={(el) => {
                  cardsRef.current[i] = el;
                }}
                className={`
                  ${feature.span}
                  card-spotlight
                  group
                  relative
                  p-6
                  rounded-xl
                  border
                  ${colors.border}
                  ${colors.bg}
                  backdrop-blur-sm
                  transition-all
                  duration-300
                  hover:scale-[1.02]
                  hover:${colors.glow}
                  cursor-pointer
                  flex flex-row items-center gap-4
                `}
                onMouseMove={handleMouseMove}
              >
                <div
                  className={`
                  w-12 h-12 rounded-lg shrink-0
                  ${colors.bg}
                  border ${colors.border}
                  flex items-center justify-center
                  group-hover:scale-110
                  transition-transform
                  duration-300
                `}
                >
                  <Icon className={`w-6 h-6 ${colors.text}`} />
                </div>

                <div className="flex flex-col">
                  <h3 className={`text-lg font-mono font-semibold ${colors.text} mb-1`}>
                    {feature.title}
                  </h3>
                  <p className="text-gray-400 text-sm leading-relaxed line-clamp-2">{feature.description}</p>
                </div>

                <div
                  className={`
                  absolute top-0 right-0 w-8 h-8
                  border-t-2 border-r-2
                  ${colors.border}
                  rounded-tr-xl
                  opacity-0
                  group-hover:opacity-100
                  transition-opacity
                  duration-300
                `}
                />
                <div
                  className={`
                  absolute bottom-0 left-0 w-8 h-8
                  border-b-2 border-l-2
                  ${colors.border}
                  rounded-bl-xl
                  opacity-0
                  group-hover:opacity-100
                  transition-opacity
                  duration-300
                `}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
