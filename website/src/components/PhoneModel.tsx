'use client';

import { useMemo, useRef } from 'react';
import { MeshTransmissionMaterial, RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useScrollProgress } from '@/hooks/use-scroll-progress';
import ScreenUI from './ScreenUI';

const PHONE_WIDTH = 0.62;
const PHONE_HEIGHT = 1.28;
const PHONE_DEPTH = 0.055;

export default function PhoneModel() {
  const groupRef = useRef<THREE.Group>(null);
  const { sample, pointer, reducedMotion } = useScrollProgress();

  const frameMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1a1f2e',
        metalness: 0.92,
        roughness: 0.22,
        envMapIntensity: 1.2,
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
    const floatY = Math.sin(t * 1.2) * sample.phone.float * 0.08;
    const parallaxX = reducedMotion ? 0 : pointer.x * 0.08;
    const parallaxY = reducedMotion ? 0 : pointer.y * 0.05;

    groupRef.current.position.set(
      sample.phone.position.x + parallaxX,
      sample.phone.position.y + floatY + parallaxY,
      sample.phone.position.z,
    );
    groupRef.current.rotation.set(
      sample.phone.rotation.x,
      sample.phone.rotation.y + parallaxX * 0.15,
      sample.phone.rotation.z,
    );
    const scale = sample.phone.scale;
    groupRef.current.scale.setScalar(scale);
  });

  const deskOpacity = 1 - Math.min(1, sample.globalProgress * 4);

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

      {/* 手机机身 */}
      <RoundedBox args={[PHONE_WIDTH, PHONE_HEIGHT, PHONE_DEPTH]} radius={0.045} smoothness={6} castShadow>
        <primitive object={frameMaterial} attach="material" />
      </RoundedBox>

      {/* 屏幕玻璃 */}
      <mesh position={[0, 0, PHONE_DEPTH / 2 + 0.002]}>
        <planeGeometry args={[PHONE_WIDTH * 0.9, PHONE_HEIGHT * 0.92]} />
        <MeshTransmissionMaterial
          backside
          samples={4}
          thickness={0.2}
          chromaticAberration={0.04}
          anisotropy={0.15}
          distortion={0.08}
          distortionScale={0.15}
          temporalDistortion={0.05}
          color="#9be8ff"
          attenuationColor="#0a1628"
          attenuationDistance={0.8}
        />
      </mesh>

      {/* 屏幕反光 */}
      <mesh position={[0.08, 0.22, PHONE_DEPTH / 2 + 0.004]} rotation={[0, 0, 0.35]}>
        <planeGeometry args={[0.18, 0.5]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.08 + sample.phone.screenBrightness * 0.06} />
      </mesh>

      {/* 摄像头区域（无品牌标识） */}
      <mesh position={[0, PHONE_HEIGHT / 2 - 0.06, PHONE_DEPTH / 2 + 0.003]}>
        <boxGeometry args={[0.14, 0.035, 0.008]} />
        <meshStandardMaterial color="#0a0e14" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[-0.035, PHONE_HEIGHT / 2 - 0.06, PHONE_DEPTH / 2 + 0.006]}>
        <circleGeometry args={[0.012, 24]} />
        <meshStandardMaterial color="#111827" metalness={1} roughness={0.1} />
      </mesh>
      <mesh position={[0.035, PHONE_HEIGHT / 2 - 0.06, PHONE_DEPTH / 2 + 0.006]}>
        <circleGeometry args={[0.008, 24]} />
        <meshStandardMaterial color="#1f2937" metalness={0.9} roughness={0.15} />
      </mesh>

      {/* 侧边按键 */}
      <mesh position={[PHONE_WIDTH / 2 + 0.004, 0.15, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.08, 0.012, 0.02]} />
        <meshStandardMaterial color="#252b38" metalness={0.85} roughness={0.25} />
      </mesh>

      <ScreenUI brightness={sample.phone.screenBrightness} insideScreen={sample.insideScreen} />
    </group>
  );
}
