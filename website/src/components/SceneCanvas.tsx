'use client';

import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Grid } from '@react-three/drei';
import CameraRig from './CameraRig';
import ParticleField from './ParticleField';
import LightRibbons from './LightRibbons';
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

/** 仅氛围 3D：粒子 / 光带 / 地面阴影。产品手机由 DOM 层唯一呈现，不再挂空壳机身。 */
function SceneContent() {
  return (
    <>
      <color attach="background" args={['#03060d']} />
      <fog attach="fog" args={['#03060d', 6, 16]} />

      <ambientLight intensity={0.4} />
      <hemisphereLight args={['#b8e7ff', '#0a1020', 0.55]} />
      <directionalLight position={[3, 4, 2]} intensity={0.9} color="#d7f3ff" />
      <directionalLight position={[-3, 2, -1]} intensity={0.4} color="#a78bfa" />
      <pointLight position={[0.5, 1.2, 1.5]} intensity={0.7} color="#38bdf8" distance={10} />

      <CameraRig />
      <ParticleField />
      <LightRibbons />

      <ContactShadows
        position={[0, -1.1, 0]}
        opacity={0.4}
        scale={10}
        blur={2.8}
        far={5}
        color="#000000"
      />

      <Grid
        position={[0, -1.12, 0]}
        args={[14, 14]}
        cellSize={0.32}
        cellThickness={0.35}
        sectionSize={1.4}
        sectionThickness={0.7}
        fadeDistance={11}
        fadeStrength={1.5}
        cellColor="#12263d"
        sectionColor="#0e7490"
        infiniteGrid
      />
    </>
  );
}

function CanvasFallback() {
  return (
    <div className="absolute inset-0 bg-[#03060d]" aria-hidden>
      <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-cyan-500/10 blur-3xl" />
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
          camera={{ position: [0.2, 1.2, 4.2], fov: 42, near: 0.1, far: 40 }}
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
