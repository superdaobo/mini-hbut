'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { applyParallax, vec3ToThree } from '@/lib/scroll-utils';
import { useScrollProgress } from '@/hooks/use-scroll-progress';

/**
 * 镜头始终看向「居中手机」，做推进 / 环绕 / 仰视运镜。
 * 从 sampleRef 读进度，避免 progress 每帧 React 更新导致抖动。
 */
export default function CameraRig() {
  const { camera } = useThree();
  const { sampleRef, pointerRef, reducedMotion, isMobile } = useScrollProgress();
  const lookAtRef = useRef(new THREE.Vector3());
  const idlePhase = useRef(0);

  useFrame((_, delta) => {
    if (isMobile) return;
    const sample = sampleRef.current;
    const pointer = pointerRef.current;
    const t = Math.min(0.12, delta);
    idlePhase.current += delta;

    const parallaxStrength = reducedMotion ? 0 : 0.08;
    let camPos = applyParallax(sample.camera.position, pointer, parallaxStrength);
    let lookAt = applyParallax(sample.camera.lookAt, pointer, parallaxStrength * 0.35);

    // 首屏 idle：极轻环绕（不改 progress）
    if (!reducedMotion && sample.globalProgress < 0.1) {
      const idle = idlePhase.current;
      const amp = 1 - sample.globalProgress / 0.1;
      camPos = {
        x: camPos.x + Math.sin(idle * 0.45) * 0.12 * amp,
        y: camPos.y + Math.sin(idle * 0.32) * 0.03 * amp,
        z: camPos.z + Math.cos(idle * 0.45) * 0.06 * amp,
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
