'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useScrollProgress } from '@/hooks/use-scroll-progress';

interface FeatureCard {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  basePosition: [number, number, number];
  phase: 'schedule' | 'grades' | 'tunnel';
}

const FEATURE_CARDS: FeatureCard[] = [
  {
    id: 'schedule',
    title: '课表',
    subtitle: '下一步去哪',
    color: '#38bdf8',
    basePosition: [-1.55, 0.55, -0.6],
    phase: 'schedule',
  },
  {
    id: 'grades',
    title: '成绩',
    subtitle: '绩点一眼清',
    color: '#a78bfa',
    basePosition: [1.45, 0.7, -0.5],
    phase: 'grades',
  },
  {
    id: 'exam',
    title: '考试',
    subtitle: '倒计时提醒',
    color: '#f472b6',
    basePosition: [-1.35, -0.15, -0.9],
    phase: 'grades',
  },
  {
    id: 'notify',
    title: '通知',
    subtitle: '校园消息',
    color: '#34d399',
    basePosition: [1.5, -0.05, -1.0],
    phase: 'tunnel',
  },
  {
    id: 'campus',
    title: '电费',
    subtitle: '宿舍余额',
    color: '#fbbf24',
    basePosition: [-0.2, 1.05, -1.2],
    phase: 'tunnel',
  },
  {
    id: 'room',
    title: '空教室',
    subtitle: '自习找位',
    color: '#fb923c',
    basePosition: [0.15, -0.75, -0.8],
    phase: 'tunnel',
  },
];

function phaseWeight(cardPhase: FeatureCard['phase'], progress: number): number {
  const phaseMap: Record<string, number> = {
    schedule: 0.38,
    grades: 0.52,
    tunnel: 0.68,
  };
  const center = phaseMap[cardPhase] ?? 0.5;
  const dist = Math.abs(progress - center);
  return Math.max(0, 1 - dist * 3.2);
}

export default function FloatingFeatureCards() {
  const groupRef = useRef<THREE.Group>(null);
  const { sample, pointer, reducedMotion } = useScrollProgress();

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      const card = FEATURE_CARDS[i];
      const weight =
        Math.max(sample.cardSpread, sample.globalProgress > 0.18 ? 0.35 : 0) *
        Math.max(0.25, phaseWeight(card.phase, sample.globalProgress));
      const group = child as THREE.Group;
      group.visible = weight > 0.08;
      const parallaxX = reducedMotion ? 0 : pointer.x * 0.14;
      const parallaxY = reducedMotion ? 0 : pointer.y * 0.1;
      group.position.set(
        card.basePosition[0] + parallaxX + Math.sin(t * 0.85 + i) * 0.08 * weight,
        card.basePosition[1] + parallaxY + Math.cos(t * 0.75 + i) * 0.06 * weight,
        card.basePosition[2] - (1 - weight) * 0.8,
      );
      group.rotation.set(
        -0.08 + parallaxY * 0.15,
        parallaxX * 0.2,
        Math.sin(t * 0.55 + i) * 0.06,
      );
      group.scale.setScalar(0.85 + weight * 0.25);
      const mesh = group.children[0] as THREE.Mesh;
      if (mesh?.material && 'opacity' in mesh.material) {
        const mat = mesh.material as THREE.MeshPhysicalMaterial;
        mat.opacity = weight * 0.75;
        mat.emissiveIntensity = 0.25 + weight * 0.65;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {FEATURE_CARDS.map((card) => (
        <group key={card.id} position={card.basePosition}>
          <mesh>
            <planeGeometry args={[0.95, 0.52]} />
            <meshPhysicalMaterial
              color={card.color}
              metalness={0.15}
              roughness={0.2}
              transmission={0.35}
              thickness={0.25}
              transparent
              opacity={0}
              emissive={card.color}
              emissiveIntensity={0.4}
            />
          </mesh>
          <Html
            center
            distanceFactor={2.8}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
            zIndexRange={[5, 0]}
          >
            <div
              className="min-w-[92px] rounded-xl border border-white/15 px-3 py-2 text-center shadow-lg backdrop-blur-md"
              style={{
                background: `linear-gradient(145deg, ${card.color}33, rgba(3,6,13,0.82))`,
                boxShadow: `0 0 24px ${card.color}44`,
              }}
            >
              <div className="text-[11px] font-bold text-white">{card.title}</div>
              <div className="text-[9px] text-white/70">{card.subtitle}</div>
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}
