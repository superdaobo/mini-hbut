import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { 
  Code2, 
  Cpu, 
  Shield, 
  Sparkles,
  Terminal,
  GitBranch,
  Github
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const techStack = [
  { name: 'Tauri 2.0', icon: Cpu, color: 'cyan', desc: '跨平台应用框架' },
  { name: 'Vue 3', icon: Code2, color: 'purple', desc: '前端框架' },
  { name: 'Rust', icon: Terminal, color: 'pink', desc: '后端语言' },
  { name: 'Vant', icon: Sparkles, color: 'cyan', desc: 'UI 组件库' }
];

const highlights = [
  {
    icon: Shield,
    title: '本地安全',
    description: '所有数据存储在本地，避免隐私泄露风险'
  },
  {
    icon: Cpu,
    title: '高性能',
    description: '直接发起网络请求，无需服务器中转'
  },
  {
    icon: GitBranch,
    title: '开源',
    description: '代码已开源至 GitHub，欢迎贡献'
  }
];

export default function About() {
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const techRef = useRef<HTMLDivElement>(null);
  const highlightsRef = useRef<HTMLDivElement>(null);
  const [displayText, setDisplayText] = useState('');
  
  const fullText = `这是一个由电院不知名学生开发的简单项目，采用前端 Vue + 后端 Rust 的 Tauri 2 框架构建，初衷是作为 "Mini湖工" 服务不可用时的临时替代方案。

项目最初使用 Python 编写后端，通过 Playwright 进行教务系统爬取，并部署在服务器上运行。其技术原理与"Mini湖工"类似，也因此遭遇了相同的问题：由于所有请求均来自服务器同一 IP，最终被学校系统封禁。

为解决该问题，项目后期进行了两项关键改进：一是将爬虫方式从 Playwright 替换为直接发起网络请求（requests），以提升性能；二是将整个项目移植到 Tauri，借助 AI 辅助将原 Python 代码转化为 Rust，并构建为安卓与 PC 双端本地应用。新版本改为在用户本地发起请求，数据也全部存储在本地，既避免了隐私泄露风险，也彻底解决了学校封禁服务器 IP 的问题。目前服务器仅保留验证码 OCR 识别功能。

项目代码已开源至 GitHub，计划Mini湖工恢复正常后本项目将暂停维护，目前仍存在不少 Bug，欢迎大家使用并提供反馈。`;

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Title animation
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
              toggleActions: 'play none none reverse'
            }
          }
        );
      }

      // Content animation
      if (contentRef.current) {
        gsap.fromTo(
          contentRef.current,
          { opacity: 0, y: 30 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: contentRef.current,
              start: 'top 80%',
              toggleActions: 'play none none reverse'
            }
          }
        );
      }

      // Tech stack animation
      if (techRef.current) {
        const items = techRef.current.querySelectorAll('.tech-item');
        gsap.fromTo(
          items,
          { opacity: 0, scale: 0.8, y: 20 },
          {
            opacity: 1,
            scale: 1,
            y: 0,
            duration: 0.6,
            stagger: 0.1,
            ease: 'back.out(1.7)',
            scrollTrigger: {
              trigger: techRef.current,
              start: 'top 85%',
              toggleActions: 'play none none reverse'
            }
          }
        );
      }

      // Highlights animation
      if (highlightsRef.current) {
        const items = highlightsRef.current.querySelectorAll('.highlight-item');
        gsap.fromTo(
          items,
          { opacity: 0, x: -30 },
          {
            opacity: 1,
            x: 0,
            duration: 0.6,
            stagger: 0.15,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: highlightsRef.current,
              start: 'top 85%',
              toggleActions: 'play none none reverse'
            }
          }
        );
      }
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  // Typewriter effect
  useEffect(() => {
    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex <= fullText.length) {
        setDisplayText(fullText.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(interval);
      }
    }, 15);

    return () => clearInterval(interval);
  }, []);

  return (
    <section
      ref={sectionRef}
      id="about"
      className="relative py-24 overflow-hidden"
    >
      {/* Background */}
      <div className="absolute inset-0 grid-bg opacity-30" />
      
      {/* CRT Effect Overlay */}
      <div className="absolute inset-0 scanlines pointer-events-none opacity-30" />
      
      {/* Section Divider */}
      <div className="section-divider mb-16" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2
            ref={titleRef}
            className="font-pixel text-2xl sm:text-3xl md:text-4xl mb-4"
          >
            <span className="gradient-text">开发者自述</span>
          </h2>
          <p className="text-gray-400 font-mono text-sm">
            项目背后的故事
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Left - Story */}
          <div ref={contentRef}>
            <div className="glass rounded-2xl p-6 md:p-8 border border-cyan/20">
              {/* Terminal Header */}
              <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-700/50">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <span className="text-gray-500 text-xs font-mono ml-2">developer_story.md</span>
              </div>
              
              {/* Terminal Content */}
              <div className="font-mono text-sm text-gray-300 leading-relaxed whitespace-pre-wrap min-h-[300px]">
                {displayText}
                <span className="terminal-cursor" />
              </div>
            </div>

            {/* GitHub Link */}
            <div className="mt-6 flex justify-center">
              <a
                href="https://github.com/superdaobo/mini-hbut"
                target="_blank"
                rel="noopener noreferrer"
                className="cyber-btn px-6 py-3 flex items-center gap-3"
              >
                <Github className="w-5 h-5" />
                查看源码
              </a>
            </div>
          </div>

          {/* Right - Tech Stack & Highlights */}
          <div className="space-y-8">
            {/* Tech Stack */}
            <div ref={techRef}>
              <h3 className="font-mono text-lg text-cyan mb-4 flex items-center gap-2">
                <Code2 className="w-5 h-5" />
                技术栈
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {techStack.map((tech) => {
                  const Icon = tech.icon;
                  const colorClass = tech.color === 'cyan' ? 'text-cyan border-cyan/30 bg-cyan/10' :
                                    tech.color === 'purple' ? 'text-purple border-purple/30 bg-purple/10' :
                                    'text-pink border-pink/30 bg-pink/10';
                  
                  return (
                    <div
                      key={tech.name}
                      className={`tech-item p-4 rounded-xl border ${colorClass} flex items-center gap-3`}
                    >
                      <Icon className="w-6 h-6" />
                      <div>
                        <p className="font-mono font-semibold">{tech.name}</p>
                        <p className="text-xs opacity-70">{tech.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Highlights */}
            <div ref={highlightsRef}>
              <h3 className="font-mono text-lg text-purple mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                项目亮点
              </h3>
              <div className="space-y-4">
                {highlights.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="highlight-item flex items-start gap-4 p-4 rounded-xl bg-gray-800/30 border border-gray-700/50"
                    >
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan/20 to-purple/20 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-cyan" />
                      </div>
                      <div>
                        <h4 className="font-mono font-semibold text-white mb-1">
                          {item.title}
                        </h4>
                        <p className="text-gray-400 text-sm">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI Contributors */}
            <div className="glass rounded-xl p-4 border border-pink/20">
              <h4 className="font-mono text-sm text-pink mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                参与开发的 AI
              </h4>
              <div className="space-y-2 text-xs font-mono text-gray-400">
                <p><span className="text-cyan">框架:</span> Claude Opus 4.5 thinking</p>
                <p><span className="text-purple">Bug修复:</span> GPT-5.2-Codex</p>
                <p><span className="text-pink">前端:</span> Gemini 3.0 Pro</p>
                <p><span className="text-purple">后续开发:</span> GPT-5.3-Codex</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
