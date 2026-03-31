import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ChevronDown, Sparkles, Shield, Zap, User, Link as LinkIcon, BarChart3, Building2, FileText, Trophy, BookOpen, GraduationCap, BookCopy, Home, CalendarDays, Bell, Download } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const badgesRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Title animation - 3D assembly
      if (titleRef.current) {
        const chars = titleRef.current.querySelectorAll('.char');
        gsap.fromTo(
          chars,
          {
            opacity: 0,
            z: 500,
            rotateX: 90,
            transformOrigin: 'center center'
          },
          {
            opacity: 1,
            z: 0,
            rotateX: 0,
            duration: 1.2,
            stagger: 0.05,
            ease: 'elastic.out(1, 0.5)',
            delay: 0.1
          }
        );
      }

      // Subtitle fade in
      if (subtitleRef.current) {
        gsap.fromTo(
          subtitleRef.current,
          { opacity: 0, y: 30 },
          { opacity: 1, y: 0, duration: 0.8, delay: 0.3, ease: 'power2.out' }
        );
      }

      // Badges stagger
      if (badgesRef.current) {
        const badges = badgesRef.current.querySelectorAll('.badge');
        gsap.fromTo(
          badges,
          { opacity: 0, scale: 0.8, y: 20 },
          {
            opacity: 1,
            scale: 1,
            y: 0,
            duration: 0.6,
            stagger: 0.1,
            delay: 0.4,
            ease: 'back.out(1.7)'
          }
        );
      }

      // CTA buttons
      if (ctaRef.current) {
        const buttons = ctaRef.current.querySelectorAll('a');
        gsap.fromTo(
          buttons,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.6, stagger: 0.15, delay: 0.5, ease: 'power2.out' }
        );
      }

      // Phone orbit entrance
      if (phoneRef.current) {
        gsap.fromTo(
          phoneRef.current,
          {
            opacity: 0,
            rotateY: 180,
            scale: 0.8
          },
          {
            opacity: 1,
            rotateY: -15,
            scale: 1,
            duration: 1.5,
            delay: 0.2,
            ease: 'expo.out'
          }
        );

        // Floating animation
        gsap.to(phoneRef.current, {
          y: -10,
          duration: 2,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut'
        });
      }

      // Scroll effects
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top top',
        end: 'bottom top',
        scrub: 1,
        onUpdate: (self) => {
          if (phoneRef.current) {
            gsap.to(phoneRef.current, {
              rotateY: -15 + self.progress * 60,
              scale: 1 + self.progress * 0.2,
              duration: 0.1
            });
          }
          if (titleRef.current) {
            gsap.to(titleRef.current, {
              letterSpacing: `${self.progress * 30}px`,
              duration: 0.1
            });
          }
        }
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const title = 'Mini-HBUT';

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20"
    >
      {/* Grid Background Overlay */}
      <div className="absolute inset-0 grid-bg opacity-50" />

      {/* Scanlines */}
      <div className="absolute inset-0 scanlines pointer-events-none" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="text-center lg:text-left">
            {/* Title */}
            <h1
              ref={titleRef}
              className="font-pixel text-5xl sm:text-6xl md:text-7xl lg:text-8xl mb-6 perspective-1000 tracking-wider"
              style={{ transformStyle: 'preserve-3d' }}
            >
              {title.split('').map((char, i) => (
                <span
                  key={i}
                  className="char inline-block glitch"
                  data-text={char}
                  style={{
                    color: i < 4 ? '#0FF0FC' : '#FE53BB',
                    textShadow: i < 4
                      ? '0 0 10px #0FF0FC, 0 0 20px #0FF0FC, 0 0 40px #0FF0FC'
                      : '0 0 10px #FE53BB, 0 0 20px #FE53BB, 0 0 40px #FE53BB'
                  }}
                >
                  {char}
                </span>
              ))}
            </h1>

            {/* Subtitle */}
            <p
              ref={subtitleRef}
              className="text-lg sm:text-xl text-gray-300 mb-4 font-mono"
            >
              湖北工业大学教务助手
            </p>
            <p className="text-sm text-gray-400 mb-8 font-mono">
              基于 Tauri 2.0 + Vue 3 的跨平台客户端应用
            </p>

            {/* Badges */}
            <div ref={badgesRef} className="flex flex-wrap justify-center lg:justify-start gap-3 mb-8">
              <span className="badge flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan/10 border border-cyan/30 text-cyan text-xs font-mono">
                <Sparkles className="w-3 h-3" />
                高性能
              </span>
              <span className="badge flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple/10 border border-purple/30 text-purple text-xs font-mono">
                <Shield className="w-3 h-3" />
                本地安全
              </span>
              <span className="badge flex items-center gap-2 px-3 py-1.5 rounded-full bg-pink/10 border border-pink/30 text-pink text-xs font-mono">
                <Zap className="w-3 h-3" />
                实时同步
              </span>
            </div>

            {/* CTA Buttons */}
            <div ref={ctaRef} className="flex flex-wrap justify-center lg:justify-start gap-4">
              <a
                href="#download"
                className="cyber-btn px-6 py-3 text-sm font-mono flex items-center gap-2"
                onClick={(e) => {
                  e.preventDefault();
                  document.querySelector('#download')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <Download className="w-4 h-4" />
                立即下载
              </a>
              <a
                href="http://score.6661111.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 text-sm font-mono border border-gray-600 text-gray-300 hover:border-purple hover:text-purple transition-all flex items-center gap-2"
                style={{
                  clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))'
                }}
              >
                <Zap className="w-4 h-4" />
                在线体验
              </a>
              <a
                href="#features"
                className="px-6 py-3 text-sm font-mono border border-gray-600 text-gray-300 hover:border-cyan hover:text-cyan transition-all flex items-center gap-2"
                style={{
                  clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))'
                }}
                onClick={(e) => {
                  e.preventDefault();
                  document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                了解更多
              </a>
            </div>
          </div>

          {/* Right Content - Phone Mockup */}
          <div
            ref={phoneRef}
            className="relative flex justify-center lg:justify-end"
            style={{
              perspective: '1000px',
              transformStyle: 'preserve-3d'
            }}
          >
            {/* Phone Frame */}
            <div className="relative w-64 sm:w-72 md:w-80">
              {/* Glow Effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-cyan/30 to-pink/30 blur-3xl rounded-full scale-110" />

              {/* Phone Body */}
              <div
                className="relative bg-gradient-to-br from-gray-900 to-black rounded-[3rem] p-2 border-2 border-cyan/30 shadow-neon aspect-[9/19.5] h-auto"
                style={{
                  boxShadow: '0 0 30px rgba(15, 240, 252, 0.3), inset 0 0 30px rgba(15, 240, 252, 0.1)'
                }}
              >
                {/* Screen */}
                {/* Screen */}
                <div className="bg-[#6B71D8] w-full h-full rounded-[2.5rem] overflow-hidden flex flex-col relative font-sans">
                  {/* Status Bar */}
                  <div className="flex items-center justify-between px-6 py-3 text-xs text-white z-10">
                    <span>9:41</span>
                    <div className="flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">
                        <span className="w-2 h-2 rounded-full bg-white" />
                      </span>
                    </div>
                  </div>

                  {/* Main Content Area */}
                  <div className="flex-1 overflow-y-auto no-scrollbar pb-20">
                    {/* Header Card */}
                    <div className="mx-3 sm:mx-4 mt-2 bg-white rounded-[1.5rem] p-3 sm:p-4 shadow-lg mb-4 sm:mb-5">
                      <div className="flex items-center justify-center gap-2 mb-3 sm:mb-4">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 border-[#6B71D8] flex items-center justify-center text-[#6B71D8] font-bold text-xs sm:text-base">
                          Φ
                        </div>
                        <span className="text-[#6B71D8] font-bold text-base sm:text-lg">HBUT 校园助手</span>
                      </div>

                      <div className="flex items-center justify-between px-1 sm:px-2">
                        <div className="flex items-center gap-2 text-[#3D3D3D]">
                          <User className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                          <span className="font-bold text-base sm:text-lg">2510114514</span>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3">
                          <button className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                            <LinkIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </button>
                          <button className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-red-50 text-red-500 text-xs sm:text-sm font-medium">
                            退出
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Banner Carousel */}
                    <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6 px-1 overflow-hidden">
                      {/* Left Partial */}
                      <div className="w-8 sm:w-12 h-24 sm:h-32 bg-[#FFB088] rounded-r-2xl shrink-0 opacity-90"></div>

                      {/* Center Main */}
                      <div className="flex-1 h-28 sm:h-36 bg-gradient-to-br from-[#80F4C5] to-[#7AD3FF] rounded-2xl flex flex-col items-center justify-center text-white shadow-md relative overflow-hidden">
                        {/* Shine effect */}
                        <div className="absolute inset-0 bg-white/10 skew-x-12 -ml-10"></div>
                        <h3 className="font-bold text-base sm:text-lg mb-2 relative z-10">开发者自述</h3>
                        <button className="bg-white/20 backdrop-blur-sm px-3 sm:px-4 py-1 rounded-full text-[10px] sm:text-xs relative z-10">
                          查看详情
                        </button>
                      </div>

                      {/* Right Partial */}
                      <div className="w-6 sm:w-8 h-24 sm:h-32 bg-[#C5A6F5] rounded-l-2xl shrink-0 opacity-90"></div>
                    </div>

                    {/* Grid Menu */}
                    <div className="grid grid-cols-4 gap-1.5 sm:gap-3 px-3 sm:px-4 mb-4">
                      {/* Row 1 */}
                      <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm">
                          <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-purple-500 fill-purple-100" />
                        </div>
                        <span className="text-white text-[10px] sm:text-xs font-medium text-center">成绩查询</span>
                      </div>
                      <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm">
                          <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-orange-500 fill-orange-100" />
                        </div>
                        <span className="text-white text-[10px] sm:text-xs font-medium text-center">空教室</span>
                      </div>
                      <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm">
                          <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-500 fill-yellow-100" />
                        </div>
                        <span className="text-white text-[10px] sm:text-xs font-medium text-center">电费查询</span>
                      </div>
                      <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm">
                          <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-red-400 fill-red-100" />
                        </div>
                        <span className="text-white text-[10px] sm:text-xs font-medium text-center">考试安排</span>
                      </div>

                      {/* Row 2 */}
                      <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm">
                          <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600 fill-yellow-100" />
                        </div>
                        <span className="text-white text-[10px] sm:text-xs font-medium text-center">绩点排名</span>
                      </div>
                      <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm">
                          <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500 fill-blue-100" />
                        </div>
                        <span className="text-white text-[10px] sm:text-xs font-medium text-center">校历</span>
                      </div>
                      <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm">
                          <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-500 fill-indigo-100" />
                        </div>
                        <span className="text-white text-[10px] sm:text-xs font-medium text-center">学业情况</span>
                      </div>
                      <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm">
                          <BookCopy className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500 fill-emerald-100" />
                        </div>
                        <span className="text-white text-[10px] sm:text-xs font-medium text-center">培养方案</span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Dock */}
                  <div className="absolute bottom-3 sm:bottom-4 left-3 sm:left-4 right-3 sm:right-4 bg-white/90 backdrop-blur-md rounded-2xl p-1.5 sm:p-2 flex justify-between items-center px-4 sm:px-6 shadow-xl">
                    <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Home className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 fill-blue-500" />
                      </div>
                      <span className="text-[9px] sm:text-[10px] text-blue-500 font-bold">首页</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5 sm:gap-1 opacity-50">
                      <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
                      <span className="text-[9px] sm:text-[10px] text-gray-500">课表</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5 sm:gap-1 opacity-50">
                      <Bell className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
                      <span className="text-[9px] sm:text-[10px] text-gray-500">通知</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5 sm:gap-1 opacity-50">
                      <User className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
                      <span className="text-[9px] sm:text-[10px] text-gray-500">我的</span>
                    </div>
                  </div>
                </div>

                {/* Home Indicator */}
                <div className="flex justify-center py-2">
                  <div className="w-24 h-1 bg-gray-700 rounded-full" />
                </div>
              </div>

              {/* Decorative Elements */}
              <div className="absolute -top-4 -right-4 w-8 h-8 border border-cyan/50 rounded-full animate-pulse" />
              <div className="absolute -bottom-6 -left-6 w-12 h-12 border border-purple/50 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <span className="text-xs text-gray-500 font-mono">向下滚动</span>
        <ChevronDown className="w-5 h-5 text-cyan animate-bounce" />
      </div>
    </section>
  );
}


