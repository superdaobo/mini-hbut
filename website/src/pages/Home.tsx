import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Navbar from '../components/Navbar';
import NeuralGrid from '../components/NeuralGrid';
import Particles from '../components/Particles';
import Hero from '../sections/Hero';
import Features from '../sections/Features';
import Download from '../sections/Download';
import About from '../sections/About';
import Footer from '../sections/Footer';

function ProgressBar() {
    const [progress, setProgress] = useState(0);
    const progressRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const updateProgress = () => {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollProgress = (scrollTop / docHeight) * 100;
            setProgress(scrollProgress);
        };

        window.addEventListener('scroll', updateProgress, { passive: true });
        return () => window.removeEventListener('scroll', updateProgress);
    }, []);

    return (
        <div className="fixed top-0 left-0 right-0 h-1 bg-gray-900 z-[60]">
            <div
                ref={progressRef}
                className="h-full bg-gradient-to-r from-cyan via-purple to-pink transition-all duration-100"
                style={{ width: `${progress}%` }}
            />
            <div
                className="absolute top-0 h-full w-20 bg-gradient-to-r from-transparent via-cyan to-transparent opacity-50 blur-sm"
                style={{ left: `calc(${progress}% - 40px)` }}
            />
        </div>
    );
}

function DataRain() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        const chars = '01アイウエオカキクケコサシスセソタチツテト';
        const fontSize = 14;
        const columns = Math.floor(canvas.width / fontSize);
        const drops: number[] = new Array(columns).fill(1);

        let animationId: number;
        let frameCount = 0;

        const draw = () => {
            frameCount++;
            if (frameCount % 2 === 0) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.fillStyle = '#0FF0FC';
                ctx.font = `${fontSize}px "Roboto Mono"`;

                for (let i = 0; i < drops.length; i++) {
                    const char = chars[Math.floor(Math.random() * chars.length)];
                    const x = i * fontSize;
                    const y = drops[i] * fontSize;

                    ctx.globalAlpha = Math.random() * 0.5 + 0.2;
                    ctx.fillText(char, x, y);
                    ctx.globalAlpha = 1;

                    if (y > canvas.height && Math.random() > 0.975) {
                        drops[i] = 0;
                    }
                    drops[i]++;
                }
            }
            animationId = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationId);
        };
    }, []);

    return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0 opacity-20" />;
}

function LoadingScreen({ onComplete }: { onComplete: () => void }) {
    const [progress, setProgress] = useState(0);
    const loaderRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const interval = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    clearInterval(interval);
                    if (loaderRef.current) {
                        gsap.to(loaderRef.current, {
                            opacity: 0,
                            duration: 0.5,
                            onComplete
                        });
                    }
                    return 100;
                }
                return prev + Math.random() * 15;
            });
        }, 100);

        return () => clearInterval(interval);
    }, [onComplete]);

    useEffect(() => {
        if (textRef.current) {
            const chars = 'アイウエオカキクケコサシスセソタチツテト0123456789';
            const originalText = 'SYSTEM INITIALIZING';
            let iteration = 0;

            const interval = setInterval(() => {
                if (textRef.current) {
                    textRef.current.textContent = originalText
                        .split('')
                        .map((_, index) => {
                            if (index < iteration) {
                                return originalText[index];
                            }
                            return chars[Math.floor(Math.random() * chars.length)];
                        })
                        .join('');
                }

                if (iteration >= originalText.length) {
                    clearInterval(interval);
                }
                iteration += 1 / 2;
            }, 30);

            return () => clearInterval(interval);
        }
    }, []);

    return (
        <div ref={loaderRef} className="fixed inset-0 bg-black z-[100] flex flex-col items-center justify-center">
            <div ref={textRef} className="font-pixel text-cyan text-xl mb-8">
                SYSTEM INITIALIZING
            </div>
            <div className="w-64 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                    className="h-full bg-gradient-to-r from-cyan via-purple to-pink transition-all duration-100"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                />
            </div>
            <div className="mt-4 font-mono text-cyan text-sm">{Math.min(Math.floor(progress), 100)}%</div>
            <div className="absolute inset-0 grid-bg opacity-20" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 border border-cyan/20 rounded-full animate-pulse" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 border border-purple/20 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }} />
        </div>
    );
}

function resetViewportToTop() {
    const doc = document.documentElement;
    const body = document.body;
    const prevDoc = doc.style.scrollBehavior;
    const prevBody = body.style.scrollBehavior;

    doc.style.scrollBehavior = 'auto';
    body.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    doc.scrollTop = 0;
    body.scrollTop = 0;

    requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        doc.scrollTop = 0;
        body.scrollTop = 0;
        doc.style.scrollBehavior = prevDoc;
        body.style.scrollBehavior = prevBody;
    });
}

function Home() {
    const [isLoading, setIsLoading] = useState(true);
    const mainRef = useRef<HTMLElement>(null);

    useEffect(() => {
        ScrollTrigger.clearScrollMemory?.();
        resetViewportToTop();
    }, []);

    useEffect(() => {
        if (!isLoading) {
            resetViewportToTop();
            requestAnimationFrame(() => {
                ScrollTrigger.clearScrollMemory?.();
                ScrollTrigger.refresh();
                resetViewportToTop();
            });
        }
    }, [isLoading]);

    return (
        <>
            {isLoading && <LoadingScreen onComplete={() => setIsLoading(false)} />}

            {!isLoading && (
                <div className="relative min-h-screen bg-black text-white overflow-x-hidden">
                    <ProgressBar />
                    <DataRain />
                    <NeuralGrid />
                    <Particles />
                    <Navbar />
                    <main ref={mainRef} className="relative z-10">
                        <Hero />
                        <Features />
                        <Download />
                        <About />
                        <Footer />
                    </main>
                </div>
            )}
        </>
    );
}

export default Home;
