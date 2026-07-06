'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { applyParallax, vec3ToThree } from '@/lib/scroll-utils';
import { useScrollProgress } from '@/hooks/use-scroll-progress';

export default function CameraRig() {
  const { camera } = useThree();
  const { sample, pointer, reducedMotion } = useScrollProgress();
  const lookAtRef = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const parallaxStrength = reducedMotion ? 0 : 0.18;
    const camPos = applyParallax(sample.camera.position, pointer, parallaxStrength);
    const lookAt = applyParallax(sample.camera.lookAt, pointer, parallaxStrength * 0.5);

    const targetPos = vec3ToThree(camPos);
    const targetLook = vec3ToThree(lookAt);

    camera.position.lerp(targetPos, 1 - Math.pow(0.001, delta));
    lookAtRef.current.lerp(targetLook, 1 - Math.pow(0.001, delta));
    camera.lookAt(lookAtRef.current);

    if ('fov' in camera) {
      const perspective = camera as THREE.PerspectiveCamera;
      perspective.fov = THREE.MathUtils.lerp(perspective.fov, sample.camera.fov, 1 - Math.pow(0.001, delta));
      perspective.updateProjectionMatrix();
    }
  });

  return null;
}
