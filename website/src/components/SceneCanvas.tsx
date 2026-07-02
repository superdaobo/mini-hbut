'use client';

import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Grid } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import CameraRig from './CameraRig';
import PhoneModel from './PhoneModel';
import ParticleField from './ParticleField';
import LightRibbons from './LightRibbons';
import FloatingFeatureCards from './FloatingFeatureCards';
import { useScrollProgress } from '@/hooks/use-scroll-progress';

function SceneContent() {
  const { isMobile, reducedMotion } = useScrollProgress();
  const enableBloom = !isMobile && !reducedMotion;

  return (
    <>
      <color attach="background" args={['#03060d']} />
      <fog attach="fog" args={['#03060d', 6, 16]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 5, 2]} intensity={1.1} color="#9bdcff" />
      <directionalLight position={[-4, 2, -2]} intensity={0.45} color="#a78bfa" />
      <pointLight position={[0, 1.5, 2]} intensity={0.6} color="#38bdf8" />

      <CameraRig />
      <PhoneModel />
      <ParticleField />
      <LightRibbons />
      <FloatingFeatureCards />

      <Grid
        position={[0, -2.5, -3]}
        args={[18, 18]}
        cellSize={0.35}
        cellThickness={0.4}
        sectionSize={1.4}
        sectionThickness={0.8}
        fadeDistance={14}
        fadeStrength={1.2}
        cellColor="#1e3a5f"
        sectionColor="#38bdf8"
        infiniteGrid
      />

      <Environment preset="night" />

      {enableBloom && (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.45} luminanceThreshold={0.2} luminanceSmoothing={0.85} mipmapBlur />
        </EffectComposer>
      )}
    </>
  );
}

function CanvasFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#03060d] text-sm text-white/50">
      加载 3D 场景…
    </div>
  );
}

export default function SceneCanvas() {
  const [dpr, setDpr] = useState(1.5);

  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio, 2));
  }, []);

  return (
    <div className="absolute inset-0">
      <Suspense fallback={<CanvasFallback />}>
        <Canvas
          dpr={dpr}
          camera={{ position: [0, 5.5, 4.2], fov: 42, near: 0.1, far: 50 }}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        >
          <SceneContent />
        </Canvas>
      </Suspense>
    </div>
  );
}
