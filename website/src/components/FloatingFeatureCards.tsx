'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
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
    subtitle: '知道下一步该去哪里',
    color: '#38bdf8',
    basePosition: [-1.4, 0.2, -2.2],
    phase: 'schedule',
  },
  {
    id: 'grades',
    title: '成绩',
    subtitle: '绩点与进度一眼看清',
    color: '#a78bfa',
    basePosition: [1.3, 0.35, -2.4],
    phase: 'grades',
  },
  {
    id: 'exam',
    title: '考试',
    subtitle: '倒计时与时间轴',
    color: '#f472b6',
    basePosition: [0, -0.3, -2.8],
    phase: 'grades',
  },
  {
    id: 'notify',
    title: '通知',
    subtitle: '聚合校园提醒',
    color: '#34d399',
    basePosition: [-1.8, -0.1, -3.6],
    phase: 'tunnel',
  },
  {
    id: 'campus',
    title: '校园服务',
    subtitle: '工具与快捷入口',
    color: '#fbbf24',
    basePosition: [1.6, 0.1, -3.8],
    phase: 'tunnel',
  },
  {
    id: 'community',
    title: '交流',
    subtitle: '连接校园生活',
    color: '#60a5fa',
    basePosition: [0.2, 0.5, -4.2],
    phase: 'tunnel',
  },
];

function phaseWeight(cardPhase: FeatureCard['phase'], spread: number): number {
  const phaseMap: Record<string, number> = {
    schedule: 0.42,
    grades: 0.6,
    tunnel: 0.71,
  };
  const center = phaseMap[cardPhase] ?? 0.5;
  const dist = Math.abs(spread - center);
  return Math.max(0, 1 - dist * 3.5);
}

export default function FloatingFeatureCards() {
  const groupRef = useRef<THREE.Group>(null);
  const { sample, pointer, reducedMotion } = useScrollProgress();

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      const card = FEATURE_CARDS[i];
      const weight = phaseWeight(card.phase, sample.globalProgress) * sample.cardSpread;
      const group = child as THREE.Group;
      group.visible = weight > 0.05;
      const parallaxX = reducedMotion ? 0 : pointer.x * 0.12;
      const parallaxY = reducedMotion ? 0 : pointer.y * 0.08;
      group.position.set(
        card.basePosition[0] + parallaxX + Math.sin(t * 0.8 + i) * 0.06 * weight,
        card.basePosition[1] + parallaxY + Math.cos(t * 0.7 + i) * 0.05 * weight,
        card.basePosition[2] - (1 - weight) * 1.5,
      );
      group.rotation.set(
        -0.1 + parallaxY * 0.2,
        parallaxX * 0.25,
        Math.sin(t * 0.5 + i) * 0.05,
      );
      const mesh = group.children[0] as THREE.Mesh;
      const mat = mesh.material as THREE.MeshPhysicalMaterial;
      mat.opacity = weight * 0.85;
      mat.emissiveIntensity = 0.2 + weight * 0.5;
    });
  });

  return (
    <group ref={groupRef}>
      {FEATURE_CARDS.map((card) => (
        <group key={card.id} position={card.basePosition}>
          <mesh>
            <boxGeometry args={[1.1, 0.62, 0.04]} />
            <meshPhysicalMaterial
              color={card.color}
              metalness={0.2}
              roughness={0.15}
              transmission={0.55}
              thickness={0.3}
              transparent
              opacity={0}
              emissive={card.color}
              emissiveIntensity={0.3}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
