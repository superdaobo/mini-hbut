'use client';

import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Float, Grid } from '@react-three/drei';
import CameraRig from './CameraRig';
import PhoneModel from './PhoneModel';
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

/** 唯一 3D 产品手机（Html 贴屏）+ 氛围 */
function SceneContent() {
  return (
    <>
      <color attach="background" args={['#03060d']} />
      <fog attach="fog" args={['#03060d', 5.5, 14]} />

      <ambientLight intensity={0.42} />
      <hemisphereLight args={['#c8ecff', '#0a1020', 0.6]} />
      <directionalLight position={[2.8, 4.2, 2.4]} intensity={1.15} color="#e8f7ff" castShadow />
      <directionalLight position={[-3.2, 1.6, -1.2]} intensity={0.5} color="#a78bfa" />
      <pointLight position={[0.6, 1.1, 1.6]} intensity={0.9} color="#38bdf8" distance={9} />
      <spotLight position={[1.2, 2.8, 2.2]} angle={0.4} penumbra={0.55} intensity={0.85} color="#7dd3fc" />

      <CameraRig />

      <Float speed={1.05} rotationIntensity={0.06} floatIntensity={0.12}>
        <PhoneModel />
      </Float>

      <ParticleField />
      <LightRibbons />

      <ContactShadows
        position={[0, -0.95, 0]}
        opacity={0.48}
        scale={9}
        blur={2.5}
        far={4.5}
        color="#000000"
      />

      <Grid
        position={[0, -0.97, 0]}
        args={[14, 14]}
        cellSize={0.3}
        cellThickness={0.35}
        sectionSize={1.3}
        sectionThickness={0.75}
        fadeDistance={10}
        fadeStrength={1.45}
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
          camera={{ position: [0.55, 0.35, 2.65], fov: 36, near: 0.05, far: 40 }}
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
