'use client';

import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
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
      <fog attach="fog" args={['#03060d', 6, 16]} />
      <ambientLight intensity={0.4} />
      <hemisphereLight args={['#9bdcff', '#0a1628', 0.55]} />
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
  const [webglReady, setWebglReady] = useState(false);
  const [webglSupported, setWebglSupported] = useState(true);

  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio, 2));
    setWebglSupported(supportsWebGL());
    setWebglReady(true);
  }, []);

  if (!webglReady) {
    return <CanvasFallback />;
  }

  if (!webglSupported) {
    return <CanvasFallback />;
  }

  return (
    <div className="absolute inset-0">
      <SceneErrorBoundary fallback={<CanvasFallback />}>
        <Canvas
          dpr={dpr}
          camera={{ position: [0, 10.8, 13.6], fov: 58, near: 0.1, far: 60 }}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
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
