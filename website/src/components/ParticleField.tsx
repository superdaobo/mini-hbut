'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useScrollProgress } from '@/hooks/use-scroll-progress';

interface ParticleFieldProps {
  count?: number;
}

export default function ParticleField({ count }: ParticleFieldProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const { sample, isMobile } = useScrollProgress();
  const particleCount = count ?? (isMobile ? 280 : 720);

  const { positions, speeds } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const spd = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 12 - 2;
      spd[i] = 0.2 + Math.random() * 0.8;
    }
    return { positions: pos, speeds: spd };
  }, [particleCount]);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const geo = pointsRef.current.geometry;
    const attr = geo.getAttribute('position') as THREE.BufferAttribute;
    const t = state.clock.elapsedTime;
    const intensity = sample.particleIntensity;

    for (let i = 0; i < particleCount; i += 1) {
      const yIndex = i * 3 + 1;
      attr.array[yIndex] += speeds[i] * 0.003 * intensity;
      if (attr.array[yIndex] > 5) attr.array[yIndex] = -5;
      attr.array[i * 3] += Math.sin(t * 0.3 + i) * 0.0004 * intensity;
    }
    attr.needsUpdate = true;
    pointsRef.current.rotation.y = t * 0.02 * intensity;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.025}
        color="#7dd3fc"
        transparent
        opacity={0.35 + sample.particleIntensity * 0.45}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
