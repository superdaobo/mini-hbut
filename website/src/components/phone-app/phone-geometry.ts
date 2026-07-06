import * as THREE from 'three';

export const PHONE_WIDTH = 0.62;
export const PHONE_HEIGHT = 1.28;
export const PHONE_DEPTH = 0.058;
export const SCREEN_WIDTH = PHONE_WIDTH * 0.88;
export const SCREEN_HEIGHT = PHONE_HEIGHT * 0.9;
export const BEVEL_RADIUS = 0.048;

/** 圆角矩形截面，用于挤出手机机身 */
export function createPhoneProfile(width: number, height: number, radius: number) {
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);

  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);

  return shape;
}

export const phoneExtrudeSettings: THREE.ExtrudeGeometryOptions = {
  depth: PHONE_DEPTH,
  bevelEnabled: true,
  bevelThickness: 0.006,
  bevelSize: 0.006,
  bevelSegments: 4,
  curveSegments: 16,
};
