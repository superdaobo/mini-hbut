'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useScrollProgress } from '@/hooks/use-scroll-progress';

/**
 * 氛围镜头：缓慢漂移，服务粒子/光带背景。
 * 产品手机已改为 DOM 层，不再绑定 PhoneModel 关键帧。
 */
export default function CameraRig() {
  const { camera } = useThree();
  const { pointer, reducedMotion, progress } = useScrollProgress();
  const tRef = useRef(0);
  const look = useRef(new THREE.Vector3(0, 0, 0));

  useFrame((_, delta) => {
    tRef.current += delta;
    const t = tRef.current;
    const idle = reducedMotion ? 0 : 1;

    const baseX = 0.15 + progress * 0.25 + pointer.x * 0.15 * idle;
    const baseY = 1.15 + Math.sin(t * 0.35) * 0.08 * idle + pointer.y * 0.08 * idle;
    const baseZ = 4.1 - progress * 0.35;

    const target = new THREE.Vector3(baseX, baseY, baseZ);
    const ease = 1 - Math.pow(0.001, Math.min(0.12, delta));
    camera.position.lerp(target, ease);

    look.current.lerp(new THREE.Vector3(pointer.x * 0.2 * idle, 0.1, 0), ease);
    camera.lookAt(look.current);

    if ('fov' in camera) {
      const p = camera as THREE.PerspectiveCamera;
      p.fov = THREE.MathUtils.lerp(p.fov, 42 - progress * 2, ease);
      p.updateProjectionMatrix();
    }
  });

  return null;
}
