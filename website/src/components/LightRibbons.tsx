'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useScrollProgress } from '@/hooks/use-scroll-progress';

const RIBBON_COUNT = 5;

export default function LightRibbons() {
  const groupRef = useRef<THREE.Group>(null);
  const { sample, isMobile } = useScrollProgress();

  const ribbons = useMemo(() => {
    return Array.from({ length: isMobile ? 3 : RIBBON_COUNT }, (_, i) => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-3 + i * 0.4, -1.2 + i * 0.2, -4 - i * 0.6),
        new THREE.Vector3(-1.5, 0.2, -2.5 - i * 0.4),
        new THREE.Vector3(0.5, 0.6, -1.2 - i * 0.3),
        new THREE.Vector3(2, -0.2, -3 - i * 0.5),
      ]);
      const geometry = new THREE.TubeGeometry(curve, 64, 0.015 + i * 0.004, 8, false);
      const hue = i % 2 === 0 ? '#38bdf8' : '#a78bfa';
      const material = new THREE.MeshBasicMaterial({
        color: hue,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      return { geometry, material, offset: i * 0.6 };
    });
  }, [isMobile]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const intensity = sample.ribbonIntensity;
    groupRef.current.visible = intensity > 0.02;
    groupRef.current.children.forEach((child, i) => {
      child.position.z = -2.5 - i * 0.4 + Math.sin(t * 0.5 + ribbons[i].offset) * 0.15 * intensity;
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = 0.08 + intensity * 0.35;
    });
    groupRef.current.rotation.y = t * 0.05 * intensity;
  });

  return (
    <group ref={groupRef} position={[0, 0.1, -2]}>
      {ribbons.map((ribbon, i) => (
        <mesh key={i} geometry={ribbon.geometry} material={ribbon.material} />
      ))}
    </group>
  );
}
