'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useScrollProgress } from '@/hooks/use-scroll-progress';
import { useDisplayScreen } from '@/hooks/use-display-screen';
import PhoneAppScreen from './phone-app/PhoneAppScreen';
import './phone-app/phone-app.css';
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

/** 屏幕 DOM 像素，配合 distanceFactor 贴合 3D 屏 */
const SCREEN_DOM_W = 270;
const SCREEN_DOM_H = 556;

/**
 * 唯一 3D 产品手机：居中主视觉 + 屏幕 Html 贴图。
 * 桌面主路径；移动端由 PhoneScreenOverlay DOM 降级。
 */
export default function PhoneModel() {
  const groupRef = useRef<THREE.Group>(null);
  const { sampleRef, pointerRef, reducedMotion, isMobile } = useScrollProgress();
  const display = useDisplayScreen();

  const frameGeometry = useMemo(() => {
    const shape = createPhoneProfile(PHONE_WIDTH, PHONE_HEIGHT, BEVEL_RADIUS);
    const geo = new THREE.ExtrudeGeometry(shape, phoneExtrudeSettings);
    geo.center();
    return geo;
  }, []);

  const frameMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1c2436',
        metalness: 0.92,
        roughness: 0.22,
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

  useFrame((state) => {
    if (!groupRef.current || isMobile) return;
    const phone = sampleRef.current.phone;
    const pointer = pointerRef.current;
    const t = state.clock.elapsedTime;
    const floatY = Math.sin(t * 1.1) * phone.float * 0.1;
    const parallaxX = reducedMotion ? 0 : pointer.x * 0.06;
    const parallaxY = reducedMotion ? 0 : pointer.y * 0.04;

    groupRef.current.position.set(
      phone.position.x * 0.12 + parallaxX,
      phone.position.y * 0.35 + floatY + parallaxY,
      phone.position.z * 0.2,
    );
    groupRef.current.rotation.set(
      phone.rotation.x * 0.9,
      phone.rotation.y * 0.95 + parallaxX * 0.1,
      phone.rotation.z,
    );
    groupRef.current.scale.setScalar(phone.scale);
  });

  if (isMobile) return null;

  const zFront = PHONE_DEPTH / 2;
  const htmlDistanceFactor = 0.98;

  return (
    <group ref={groupRef}>
      <mesh geometry={frameGeometry} material={frameMaterial} castShadow receiveShadow />

      <mesh position={[0, 0, zFront + 0.001]}>
        <planeGeometry args={[SCREEN_WIDTH + 0.02, SCREEN_HEIGHT + 0.02]} />
        <meshStandardMaterial color="#05080f" metalness={0.5} roughness={0.4} />
      </mesh>

      <mesh position={[0, PHONE_HEIGHT / 2 - 0.095, zFront + 0.004]}>
        <capsuleGeometry args={[0.028, 0.1, 4, 12]} />
        <meshStandardMaterial color="#030508" metalness={0.9} roughness={0.2} />
      </mesh>

      <mesh position={[PHONE_WIDTH / 2 + 0.003, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.09, 0.01, 0.018]} />
        <primitive object={buttonMaterial} attach="material" />
      </mesh>
      <mesh position={[-PHONE_WIDTH / 2 - 0.003, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.05, 0.01, 0.018]} />
        <primitive object={buttonMaterial} attach="material" />
      </mesh>

      <Html
        transform
        occlude={false}
        position={[0, 0, zFront + 0.006]}
        distanceFactor={htmlDistanceFactor}
        style={{
          width: SCREEN_DOM_W,
          height: SCREEN_DOM_H,
          borderRadius: 22,
          overflow: 'hidden',
          pointerEvents: 'none',
          userSelect: 'none',
          background: '#f0f4f8',
        }}
        zIndexRange={[12, 0]}
      >
        <div
          style={{
            width: SCREEN_DOM_W,
            height: SCREEN_DOM_H,
            overflow: 'hidden',
            borderRadius: 22,
            background: '#f0f4f8',
          }}
        >
          <PhoneAppScreen
            screenFrom={display.screenFrom}
            screenTo={display.screenTo}
            screenBlend={display.screenBlend}
          />
        </div>
      </Html>

      <mesh position={[0.08, 0.22, zFront + 0.007]} rotation={[0, 0, 0.25]}>
        <planeGeometry args={[0.12, 0.38]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.05} depthWrite={false} />
      </mesh>
    </group>
  );
}
