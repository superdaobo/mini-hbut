import * as THREE from 'three';

/** 滚动驱动区域高度（vh） */
export const SCROLL_DRIVER_VH = 900;

export type ScrollPhase =
  | 'intro'
  | 'ignite'
  | 'lift'
  | 'dive'
  | 'schedule'
  | 'grades'
  | 'tunnel'
  | 'return'
  | 'cta';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraKeyframe {
  position: Vec3;
  lookAt: Vec3;
  fov: number;
}

export interface PhoneKeyframe {
  position: Vec3;
  rotation: Vec3;
  scale: number;
  screenBrightness: number;
  float: number;
}

export interface ScrollSample {
  phase: ScrollPhase;
  phaseProgress: number;
  globalProgress: number;
  camera: CameraKeyframe;
  phone: PhoneKeyframe;
  insideScreen: number;
  particleIntensity: number;
  ribbonIntensity: number;
  cardSpread: number;
  heroOpacity: number;
  featureOpacity: number;
  ctaOpacity: number;
}

const PHASE_RANGES: Array<{ phase: ScrollPhase; start: number; end: number }> = [
  { phase: 'intro', start: 0, end: 0.08 },
  { phase: 'ignite', start: 0.08, end: 0.18 },
  { phase: 'lift', start: 0.18, end: 0.3 },
  { phase: 'dive', start: 0.3, end: 0.42 },
  { phase: 'schedule', start: 0.42, end: 0.55 },
  { phase: 'grades', start: 0.55, end: 0.66 },
  { phase: 'tunnel', start: 0.66, end: 0.76 },
  { phase: 'return', start: 0.76, end: 0.86 },
  { phase: 'cta', start: 0.86, end: 1 },
];

const CAMERA_KEYFRAMES: CameraKeyframe[] = [
  { position: { x: 0, y: 5.5, z: 4.2 }, lookAt: { x: 0, y: -0.2, z: 0 }, fov: 42 },
  { position: { x: 0.3, y: 3.8, z: 3.6 }, lookAt: { x: 0, y: 0.1, z: 0 }, fov: 40 },
  { position: { x: 1.2, y: 1.8, z: 2.8 }, lookAt: { x: 0, y: 0.2, z: 0 }, fov: 38 },
  { position: { x: 0, y: 0.35, z: 2.1 }, lookAt: { x: 0, y: 0.15, z: 0 }, fov: 36 },
  { position: { x: 0, y: 0.05, z: 0.55 }, lookAt: { x: 0, y: 0.12, z: 0 }, fov: 34 },
  { position: { x: -0.15, y: 0.2, z: -0.35 }, lookAt: { x: 0, y: 0, z: -1.2 }, fov: 48 },
  { position: { x: 0.2, y: 0.55, z: -1.8 }, lookAt: { x: 0, y: 0.1, z: -2.6 }, fov: 52 },
  { position: { x: 0, y: 0.15, z: -3.4 }, lookAt: { x: 0, y: 0, z: -5 }, fov: 58 },
  { position: { x: 0, y: 0.25, z: -1.2 }, lookAt: { x: 0, y: 0.1, z: -2.2 }, fov: 46 },
  { position: { x: 0, y: 0.45, z: 2.4 }, lookAt: { x: 0, y: 0.1, z: 0 }, fov: 38 },
];

const PHONE_KEYFRAMES: PhoneKeyframe[] = [
  { position: { x: 0, y: -0.35, z: 0 }, rotation: { x: -1.15, y: 0.15, z: 0 }, scale: 1, screenBrightness: 0.05, float: 0 },
  { position: { x: 0, y: -0.28, z: 0.02 }, rotation: { x: -0.85, y: 0.1, z: 0 }, scale: 1, screenBrightness: 0.55, float: 0.02 },
  { position: { x: 0, y: 0.05, z: 0.05 }, rotation: { x: -0.35, y: 0.25, z: 0 }, scale: 1.02, screenBrightness: 0.85, float: 0.05 },
  { position: { x: 0, y: 0.18, z: 0.08 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1.04, screenBrightness: 1, float: 0.08 },
  { position: { x: 0, y: 0.22, z: 0.12 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1.12, screenBrightness: 1, float: 0.1 },
  { position: { x: 0, y: 0.15, z: -0.8 }, rotation: { x: 0, y: 0.08, z: 0 }, scale: 1.35, screenBrightness: 1, float: 0.12 },
  { position: { x: 0, y: 0.1, z: -1.6 }, rotation: { x: 0.05, y: -0.05, z: 0 }, scale: 1.2, screenBrightness: 0.95, float: 0.1 },
  { position: { x: 0, y: 0.12, z: -2.4 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1.05, screenBrightness: 0.9, float: 0.08 },
  { position: { x: 0, y: 0.2, z: -0.5 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1.08, screenBrightness: 1, float: 0.12 },
  { position: { x: 0, y: 0.28, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1.06, screenBrightness: 1, float: 0.15 },
];

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function getPhase(progress: number): { phase: ScrollPhase; phaseProgress: number } {
  const p = clamp01(progress);
  const match = PHASE_RANGES.find((range) => p >= range.start && p < range.end)
    ?? PHASE_RANGES[PHASE_RANGES.length - 1];
  const phaseProgress = (p - match.start) / Math.max(0.0001, match.end - match.start);
  return { phase: match.phase, phaseProgress: clamp01(phaseProgress) };
}

function sampleTrack<T extends CameraKeyframe | PhoneKeyframe>(
  keyframes: T[],
  progress: number,
  interpolate: (a: T, b: T, t: number) => T,
): T {
  const scaled = clamp01(progress) * (keyframes.length - 1);
  const index = Math.min(keyframes.length - 2, Math.floor(scaled));
  const localT = scaled - index;
  return interpolate(keyframes[index], keyframes[index + 1], localT);
}

function interpolateCamera(a: CameraKeyframe, b: CameraKeyframe, t: number): CameraKeyframe {
  return {
    position: lerpVec3(a.position, b.position, t),
    lookAt: lerpVec3(a.lookAt, b.lookAt, t),
    fov: lerp(a.fov, b.fov, t),
  };
}

function interpolatePhone(a: PhoneKeyframe, b: PhoneKeyframe, t: number): PhoneKeyframe {
  return {
    position: lerpVec3(a.position, b.position, t),
    rotation: lerpVec3(a.rotation, b.rotation, t),
    scale: lerp(a.scale, b.scale, t),
    screenBrightness: lerp(a.screenBrightness, b.screenBrightness, t),
    float: lerp(a.float, b.float, t),
  };
}

export function sampleScroll(progress: number): ScrollSample {
  const globalProgress = clamp01(progress);
  const { phase, phaseProgress } = getPhase(globalProgress);
  const camera = sampleTrack(CAMERA_KEYFRAMES, globalProgress, interpolateCamera);
  const phone = sampleTrack(PHONE_KEYFRAMES, globalProgress, interpolatePhone);

  const insideScreen = smoothstep(0.36, 0.48, globalProgress) * (1 - smoothstep(0.74, 0.86, globalProgress));
  const particleIntensity = lerp(0.35, 1, smoothstep(0, 0.2, globalProgress))
    * (1 - smoothstep(0.82, 0.95, globalProgress) * 0.35);
  const ribbonIntensity = smoothstep(0.5, 0.72, globalProgress) * (1 - smoothstep(0.78, 0.9, globalProgress));
  const cardSpread = smoothstep(0.4, 0.55, globalProgress) * (1 - smoothstep(0.72, 0.86, globalProgress));

  const heroOpacity = 1 - smoothstep(0.12, 0.28, globalProgress);
  const featureOpacity = smoothstep(0.38, 0.5, globalProgress) * (1 - smoothstep(0.7, 0.82, globalProgress));
  const ctaOpacity = smoothstep(0.84, 0.94, globalProgress);

  return {
    phase,
    phaseProgress,
    globalProgress,
    camera,
    phone,
    insideScreen,
    particleIntensity,
    ribbonIntensity,
    cardSpread,
    heroOpacity,
    featureOpacity,
    ctaOpacity,
  };
}

export function vec3ToThree(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z);
}

export function applyParallax(base: Vec3, pointer: { x: number; y: number }, strength = 0.12): Vec3 {
  return {
    x: base.x + pointer.x * strength,
    y: base.y + pointer.y * strength * 0.6,
    z: base.z,
  };
}
