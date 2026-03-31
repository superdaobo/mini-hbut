import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Github, Heart, ExternalLink, Code2, Terminal } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const footerLinks = [
  {
    title: '项目',
    links: [
      { name: 'GitHub', href: 'https://github.com/superdaobo/mini-hbut', icon: Github },
      { name: 'Releases', href: 'https://github.com/superdaobo/mini-hbut/releases', icon: ExternalLink },
    ],
  },
  {
    title: '文档',
    links: [
      { name: 'README', href: 'https://github.com/superdaobo/mini-hbut#readme', icon: Code2 },
      { name: 'Issues', href: 'https://github.com/superdaobo/mini-hbut/issues', icon: Terminal },
    ],
  },
];

export default function Footer() {
  const footerRef = useRef<HTMLElement>(null);
  const watermarkRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (watermarkRef.current) {
        gsap.fromTo(
          watermarkRef.current,
          { opacity: 0 },
          {
            opacity: 0.03,
            duration: 1,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: footerRef.current,
              start: 'top 80%',
              toggleActions: 'play none none reverse',
            },
          }
        );
      }

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
              trigger: footerRef.current,
              start: 'top 80%',
              toggleActions: 'play none none reverse',
            },
          }
        );
      }
    }, footerRef);

    return () => ctx.revert();
  }, []);

  return (
    <footer ref={footerRef} className="relative py-16 overflow-hidden">
      <div ref={watermarkRef} className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="font-pixel text-[20vw] text-white whitespace-nowrap">Mini-HBUT</span>
      </div>

      <div className="absolute inset-0 grid-bg opacity-20" />
      <div className="section-divider mb-12" />

      <div ref={contentRef} className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-3 gap-12 mb-12">
          <div>
            <h3 className="font-pixel text-xl text-cyan mb-4 neon-text-cyan">Mini-HBUT</h3>
            <p className="text-gray-400 text-sm font-mono mb-4">湖北工业大学教务助手</p>
            <p className="text-gray-500 text-xs font-mono">基于 Tauri 2.0 + Vue 3 构建</p>

            <div className="mt-4 font-mono text-xs text-gray-600">
              <span className="text-cyan">$</span> system.status
              <span className="terminal-cursor" />
            </div>
          </div>

          {footerLinks.map((group) => (
            <div key={group.title}>
              <h4 className="font-mono text-sm text-white mb-4">{group.title}</h4>
              <ul className="space-y-3">
                {group.links.map((link) => {
                  const Icon = link.icon;
                  return (
                    <li key={link.name}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 text-sm font-mono hover:text-cyan transition-colors flex items-center gap-2 group"
                      >
                        <Icon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        {link.name}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-gray-800">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-xs font-mono text-center md:text-left">
              开源协议遵循 GPL v3，使用、修改与再分发请保留相应版权与开源义务。
            </p>

            <p className="text-gray-500 text-xs font-mono flex items-center gap-1">
              Made with <Heart className="w-3 h-3 text-pink fill-pink" /> by superdaobo
            </p>
          </div>

          <div className="mt-4 text-center space-y-2">
            <a
              href="https://www.gnu.org/licenses/gpl-3.0.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-cyan text-xs font-mono transition-colors"
            >
              GNU General Public License v3.0 (GPL v3) © 2026 Mini-HBUT
            </a>
            <div>
              <a
                href="https://icp.gov.moe/?keyword=20266111"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-cyan text-xs font-mono transition-colors"
              >
                萌ICP备20266111号
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
