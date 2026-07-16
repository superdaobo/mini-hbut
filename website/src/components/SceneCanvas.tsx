'use client';

import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, Grid, Float } from '@react-three/drei';
import CameraRig from './CameraRig';
import PhoneModel from './PhoneModel';
import ParticleField from './ParticleField';
import LightRibbons from './LightRibbons';
import FloatingFeatureCards from './FloatingFeatureCards';
import SceneErrorBoundary from './SceneErrorBoundary';

function supportsWebGL() {
  if (typeof window === 'undefined') return true;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

function SceneContent() {
  return (
    <>
      <color attach="background" args={['#03060d']} />
      <fog attach="fog" args={['#03060d', 5, 14]} />

      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#b8e7ff', '#0a1020', 0.65]} />
      <directionalLight position={[3.2, 4.5, 2.2]} intensity={1.25} color="#d7f3ff" castShadow />
      <directionalLight position={[-3.5, 1.8, -1.5]} intensity={0.55} color="#a78bfa" />
      <pointLight position={[0.4, 1.2, 1.8]} intensity={0.85} color="#38bdf8" distance={8} />
      <spotLight
        position={[1.5, 3.2, 2.5]}
        angle={0.35}
        penumbra={0.6}
        intensity={1.1}
        color="#7dd3fc"
        castShadow
      />

      <CameraRig />

      <Float speed={1.1} rotationIntensity={0.08} floatIntensity={0.18}>
        <PhoneModel />
      </Float>

      <ParticleField />
      <LightRibbons />
      <FloatingFeatureCards />

      <ContactShadows
        position={[0, -0.95, 0]}
        opacity={0.55}
        scale={8}
        blur={2.4}
        far={4}
        color="#000000"
      />

      <Grid
        position={[0, -0.96, 0]}
        args={[16, 16]}
        cellSize={0.28}
        cellThickness={0.45}
        sectionSize={1.2}
        sectionThickness={0.9}
        fadeDistance={10}
        fadeStrength={1.4}
        cellColor="#16304f"
        sectionColor="#22d3ee"
        infiniteGrid
      />

      {/* 轻量环境光，避免部分 GPU 上 Environment HDR 刷 shader 警告 */}
      <Environment preset="night" environmentIntensity={0.22} />
    </>
  );
}

function CanvasFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#03060d]">
      <div className="h-40 w-40 animate-pulse rounded-full bg-cyan-500/10 blur-2xl" aria-hidden />
    </div>
  );
}

export default function SceneCanvas() {
  const [dpr, setDpr] = useState(1.5);
  const [webglReady, setWebglReady] = useState(false);
  const [webglSupported, setWebglSupported] = useState(true);

  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio || 1, 2));
    setWebglSupported(supportsWebGL());
    setWebglReady(true);
  }, []);

  if (!webglReady || !webglSupported) {
    return <CanvasFallback />;
  }

  return (
    <div className="absolute inset-0">
      <SceneErrorBoundary fallback={<CanvasFallback />}>
        <Canvas
          dpr={dpr}
          camera={{ position: [1.15, 0.55, 2.85], fov: 38, near: 0.05, far: 40 }}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          shadows
          onCreated={({ gl }) => {
            gl.setClearColor('#03060d');
          }}
        >
          <SceneContent />
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}
