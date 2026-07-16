'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useScrollProgress } from '@/hooks/use-scroll-progress';
import {
  BEVEL_RADIUS,
  PHONE_DEPTH,
  PHONE_HEIGHT,
  PHONE_WIDTH,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  createPhoneProfile,
  phoneExtrudeSettings,
} from './phone-app/phone-geometry';

export default function PhoneModel() {
  const groupRef = useRef<THREE.Group>(null);
  const { sample, pointer, reducedMotion } = useScrollProgress();

  const frameGeometry = useMemo(() => {
    const shape = createPhoneProfile(PHONE_WIDTH, PHONE_HEIGHT, BEVEL_RADIUS);
    const geo = new THREE.ExtrudeGeometry(shape, phoneExtrudeSettings);
    geo.center();
    return geo;
  }, []);

  const frameMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#141a28',
        metalness: 0.94,
        roughness: 0.18,
      }),
    [],
  );

  const bezelMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#05080f',
        metalness: 0.6,
        roughness: 0.35,
      }),
    [],
  );

  const glassMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#0a1628',
        metalness: 0,
        roughness: 0.05,
        transmission: 0.15,
        thickness: 0.05,
        transparent: true,
        opacity: 0.92,
      }),
    [],
  );

  const buttonMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#2a3142',
        metalness: 0.85,
        roughness: 0.3,
      }),
    [],
  );

  const deskMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#0d1118',
        metalness: 0.1,
        roughness: 0.15,
        transmission: 0.65,
        thickness: 0.8,
        transparent: true,
        opacity: 0.55,
      }),
    [],
  );

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const floatY = Math.sin(t * 1.15) * sample.phone.float * 0.12;
    const parallaxX = reducedMotion ? 0 : pointer.x * 0.1;
    const parallaxY = reducedMotion ? 0 : pointer.y * 0.06;
    // 与 DOM 产品框错位：3D 机身略偏左后，作景深与光影，UI 由前景 chrome 呈现
    const stageOffsetX = -0.55;
    const stageOffsetZ = -0.35;

    groupRef.current.position.set(
      sample.phone.position.x + parallaxX + stageOffsetX,
      sample.phone.position.y + floatY + parallaxY,
      sample.phone.position.z + stageOffsetZ,
    );
    groupRef.current.rotation.set(
      sample.phone.rotation.x * 0.85,
      sample.phone.rotation.y + 0.55 + parallaxX * 0.2,
      sample.phone.rotation.z,
    );
    groupRef.current.scale.setScalar(sample.phone.scale * 0.92);
  });

  const deskOpacity = 1 - Math.min(1, sample.globalProgress * 4);
  const zFront = PHONE_DEPTH / 2;

  return (
    <group ref={groupRef}>
      {/* 磨砂玻璃桌面 */}
      <mesh position={[0, -0.42, 0]} rotation={[-Math.PI / 2, 0, 0]} material={deskMaterial}>
        <planeGeometry args={[4.5, 3.2]} />
      </mesh>
      <mesh position={[0, -0.415, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.2, 2.9]} />
        <meshStandardMaterial
          color="#0ff0fc"
          transparent
          opacity={0.04 * deskOpacity}
          emissive="#0ff0fc"
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* 机身 — 挤出圆角矩形 */}
      <mesh geometry={frameGeometry} material={frameMaterial} castShadow />

      {/* 屏幕黑边 */}
      <mesh position={[0, 0, zFront + 0.001]}>
        <planeGeometry args={[SCREEN_WIDTH + 0.02, SCREEN_HEIGHT + 0.02]} />
        <primitive object={bezelMaterial} attach="material" />
      </mesh>

      {/* 屏幕玻璃 */}
      <mesh position={[0, 0, zFront + 0.0025]}>
        <planeGeometry args={[SCREEN_WIDTH, SCREEN_HEIGHT]} />
        <primitive object={glassMaterial} attach="material" />
      </mesh>

      {/* 屏幕反光 */}
      <mesh position={[0.06, 0.2, zFront + 0.004]} rotation={[0, 0, 0.3]}>
        <planeGeometry args={[0.14, 0.42]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.06 + sample.phone.screenBrightness * 0.05} />
      </mesh>

      {/* 动态岛 */}
      <mesh position={[0, PHONE_HEIGHT / 2 - 0.095, zFront + 0.003]}>
        <capsuleGeometry args={[0.028, 0.1, 4, 12]} />
        <meshStandardMaterial color="#030508" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[-0.022, PHONE_HEIGHT / 2 - 0.095, zFront + 0.004]}>
        <circleGeometry args={[0.006, 16]} />
        <meshStandardMaterial color="#111827" metalness={1} roughness={0.1} />
      </mesh>

      {/* 侧边电源键 */}
      <mesh position={[PHONE_WIDTH / 2 + 0.003, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.09, 0.01, 0.018]} />
        <primitive object={buttonMaterial} attach="material" />
      </mesh>
      {/* 音量键 */}
      <mesh position={[-PHONE_WIDTH / 2 - 0.003, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.05, 0.01, 0.018]} />
        <primitive object={buttonMaterial} attach="material" />
      </mesh>
      <mesh position={[-PHONE_WIDTH / 2 - 0.003, 0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.05, 0.01, 0.018]} />
        <primitive object={buttonMaterial} attach="material" />
      </mesh>

      {/* 底部扬声器开孔 */}
      {[-0.06, -0.03, 0, 0.03, 0.06].map((x) => (
        <mesh key={x} position={[x, -PHONE_HEIGHT / 2 + 0.04, zFront + 0.002]}>
          <circleGeometry args={[0.004, 8]} />
          <meshStandardMaterial color="#1a2030" />
        </mesh>
      ))}

      {/* 发光屏幕（具体 App UI 由前景产品框 PhoneScreenOverlay 呈现） */}
      <mesh position={[0, 0, zFront + 0.003]}>
        <planeGeometry args={[SCREEN_WIDTH, SCREEN_HEIGHT]} />
        <meshStandardMaterial
          color="#0c1a2e"
          emissive="#38bdf8"
          emissiveIntensity={0.25 + sample.phone.screenBrightness * 0.85}
          metalness={0.1}
          roughness={0.2}
        />
      </mesh>
      <mesh position={[0, 0, zFront + 0.004]}>
        <planeGeometry args={[SCREEN_WIDTH * 0.92, SCREEN_HEIGHT * 0.55]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.06 + sample.phone.screenBrightness * 0.08} />
      </mesh>
    </group>
  );
}
