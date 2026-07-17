'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { applyParallax, vec3ToThree } from '@/lib/scroll-utils';
import { useScrollProgress } from '@/hooks/use-scroll-progress';

/**
 * 驱动唯一 3D 产品手机的镜头：滚动关键帧 + 首屏 idle 环绕。
 */
export default function CameraRig() {
  const { camera } = useThree();
  const { sample, pointer, reducedMotion, isMobile } = useScrollProgress();
  const lookAtRef = useRef(new THREE.Vector3());
  const idlePhase = useRef(0);

  useFrame((_, delta) => {
    if (isMobile) return;
    const t = Math.min(0.12, delta);
    idlePhase.current += delta;

    const parallaxStrength = reducedMotion ? 0 : 0.1;
    let camPos = applyParallax(sample.camera.position, pointer, parallaxStrength);
    let lookAt = applyParallax(sample.camera.lookAt, pointer, parallaxStrength * 0.4);

    // 镜头略偏向右侧产品位（与 PhoneModel 0.42 偏移对齐）
    camPos = { ...camPos, x: camPos.x + 0.35 };
    lookAt = { ...lookAt, x: lookAt.x + 0.35 };

    if (!reducedMotion && sample.globalProgress < 0.1) {
      const idle = idlePhase.current;
      const amp = 1 - sample.globalProgress / 0.1;
      camPos = {
        x: camPos.x + Math.sin(idle * 0.5) * 0.18 * amp,
        y: camPos.y + Math.sin(idle * 0.38) * 0.05 * amp,
        z: camPos.z + Math.cos(idle * 0.5) * 0.08 * amp,
      };
    }

    const targetPos = vec3ToThree(camPos);
    const targetLook = vec3ToThree(lookAt);
    const ease = 1 - Math.pow(0.0008, t);

    camera.position.lerp(targetPos, ease);
    lookAtRef.current.lerp(targetLook, ease);
    camera.lookAt(lookAtRef.current);

    if ('fov' in camera) {
      const perspective = camera as THREE.PerspectiveCamera;
      perspective.fov = THREE.MathUtils.lerp(perspective.fov, sample.camera.fov, ease);
      perspective.updateProjectionMatrix();
    }
  });

  return null;
}
