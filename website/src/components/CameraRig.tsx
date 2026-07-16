'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { applyParallax, vec3ToThree } from '@/lib/scroll-utils';
import { useScrollProgress } from '@/hooks/use-scroll-progress';

/**
 * 滚动驱动镜头 + 首屏 idle 环绕运镜。
 * reduced-motion 时只做关键帧插值，不做 idle 摆动。
 */
export default function CameraRig() {
  const { camera } = useThree();
  const { sample, pointer, reducedMotion } = useScrollProgress();
  const lookAtRef = useRef(new THREE.Vector3());
  const idlePhase = useRef(0);

  useFrame((_, delta) => {
    const t = Math.min(0.12, delta);
    idlePhase.current += delta;

    const parallaxStrength = reducedMotion ? 0 : 0.12;
    let camPos = applyParallax(sample.camera.position, pointer, parallaxStrength);
    let lookAt = applyParallax(sample.camera.lookAt, pointer, parallaxStrength * 0.45);

    // 滚动很浅时：自动轻微环绕，避免「死定妆」
    if (!reducedMotion && sample.globalProgress < 0.08) {
      const idle = idlePhase.current;
      const amp = 1 - sample.globalProgress / 0.08;
      camPos = {
        x: camPos.x + Math.sin(idle * 0.55) * 0.22 * amp,
        y: camPos.y + Math.sin(idle * 0.4) * 0.06 * amp,
        z: camPos.z + Math.cos(idle * 0.55) * 0.1 * amp,
      };
      lookAt = {
        x: lookAt.x + Math.sin(idle * 0.35) * 0.03 * amp,
        y: lookAt.y,
        z: lookAt.z,
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
