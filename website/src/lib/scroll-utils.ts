import * as THREE from 'three';

/** 滚动驱动区域高度（vh） */
export const SCROLL_DRIVER_VH = 720;

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

/** 手机内展示的 Tauri 应用页面 */
export type AppScreen =
  | 'home'
  | 'schedule'
  | 'grades'
  | 'exams'
  | 'notifications'
  | 'electricity'
  | 'classroom'
  | 'ranking'
  | 'all-features'
  | 'me';

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
  activeScreen: AppScreen;
  screenFrom: AppScreen;
  screenTo: AppScreen;
  screenBlend: number;
}

/** 手机内演示：各页面稳定展示区间 */
const PHONE_SCREEN_SEQUENCE: AppScreen[] = [
  'home',
  'schedule',
  'grades',
  'exams',
  'notifications',
  'electricity',
  'classroom',
  'ranking',
  'all-features',
];

const PHONE_DEMO_START = 0.22;
const PHONE_DEMO_END = 0.88;
const SCREEN_FADE_PORTION = 0.28;

const PHASE_RANGES: Array<{ phase: ScrollPhase; start: number; end: number }> = [
  { phase: 'intro', start: 0, end: 0.06 },
  { phase: 'ignite', start: 0.06, end: 0.14 },
  { phase: 'lift', start: 0.14, end: 0.24 },
  { phase: 'dive', start: 0.24, end: 0.34 },
  { phase: 'schedule', start: 0.34, end: 0.46 },
  { phase: 'grades', start: 0.46, end: 0.56 },
  { phase: 'tunnel', start: 0.56, end: 0.84 },
  { phase: 'return', start: 0.84, end: 0.92 },
  { phase: 'cta', start: 0.92, end: 1 },
];

const CAMERA_KEYFRAMES: CameraKeyframe[] = [
  { position: { x: 0, y: 10.8, z: 13.6 }, lookAt: { x: 0, y: -0.72, z: 0 }, fov: 58 },
  { position: { x: 0.03, y: 10.2, z: 12.8 }, lookAt: { x: 0, y: -0.62, z: 0 }, fov: 57 },
  { position: { x: 0.06, y: 9.6, z: 12.0 }, lookAt: { x: 0, y: -0.48, z: 0 }, fov: 56 },
  { position: { x: 0.08, y: 9.1, z: 11.4 }, lookAt: { x: 0, y: -0.32, z: 0 }, fov: 55 },
  { position: { x: 0.1, y: 8.8, z: 11.0 }, lookAt: { x: 0, y: -0.14, z: 0 }, fov: 54 },
  { position: { x: 0.1, y: 8.7, z: 10.9 }, lookAt: { x: 0, y: 0, z: 0 }, fov: 53 },
  { position: { x: 0.08, y: 8.7, z: 10.9 }, lookAt: { x: 0, y: 0, z: 0 }, fov: 53 },
  { position: { x: 0.06, y: 8.8, z: 11.0 }, lookAt: { x: 0, y: 0, z: 0 }, fov: 53 },
  { position: { x: 0.04, y: 8.9, z: 11.1 }, lookAt: { x: 0, y: -0.02, z: 0 }, fov: 54 },
  { position: { x: 0, y: 9.6, z: 12.2 }, lookAt: { x: 0, y: -0.2, z: 0 }, fov: 56 },
];

const PHONE_KEYFRAMES: PhoneKeyframe[] = [
  { position: { x: 0, y: -0.52, z: 0 }, rotation: { x: -1.08, y: 0.1, z: 0 }, scale: 0.48, screenBrightness: 0.02, float: 0 },
  { position: { x: 0, y: -0.42, z: 0.01 }, rotation: { x: -0.88, y: 0.08, z: 0 }, scale: 0.52, screenBrightness: 0.3, float: 0.006 },
  { position: { x: 0, y: -0.3, z: 0.015 }, rotation: { x: -0.62, y: 0.06, z: 0 }, scale: 0.56, screenBrightness: 0.65, float: 0.01 },
  { position: { x: 0, y: -0.16, z: 0.02 }, rotation: { x: -0.34, y: 0.04, z: 0 }, scale: 0.58, screenBrightness: 0.9, float: 0.014 },
  { position: { x: 0, y: -0.06, z: 0.022 }, rotation: { x: -0.1, y: 0.02, z: 0 }, scale: 0.6, screenBrightness: 1, float: 0.018 },
  { position: { x: 0, y: 0, z: 0.024 }, rotation: { x: 0, y: 0.01, z: 0 }, scale: 0.6, screenBrightness: 1, float: 0.02 },
  { position: { x: 0, y: 0.01, z: 0.024 }, rotation: { x: 0, y: 0, z: 0 }, scale: 0.6, screenBrightness: 1, float: 0.02 },
  { position: { x: 0, y: 0.01, z: 0.022 }, rotation: { x: 0, y: 0, z: 0 }, scale: 0.6, screenBrightness: 1, float: 0.02 },
  { position: { x: 0, y: 0, z: 0.02 }, rotation: { x: 0, y: -0.01, z: 0 }, scale: 0.59, screenBrightness: 1, float: 0.018 },
  { position: { x: 0, y: 0.02, z: 0.018 }, rotation: { x: 0, y: 0, z: 0 }, scale: 0.58, screenBrightness: 1, float: 0.016 },
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

export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = smoothstep(edge0, edge1, x);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

interface ScreenTransition {
  from: AppScreen;
  to: AppScreen;
  blend: number;
}

function holdScreen(screen: AppScreen): ScreenTransition {
  return { from: screen, to: screen, blend: 0 };
}

export function resolveScreenTransition(globalProgress: number): ScreenTransition {
  const p = clamp01(globalProgress);

  if (p < PHONE_DEMO_START) {
    return holdScreen('home');
  }

  if (p >= PHONE_DEMO_END) {
    return holdScreen('all-features');
  }

  const seq = PHONE_SCREEN_SEQUENCE;
  const local = (p - PHONE_DEMO_START) / (PHONE_DEMO_END - PHONE_DEMO_START);
  const segmentSize = 1 / (seq.length - 1);
  const rawIdx = local / segmentSize;
  const idx = Math.min(seq.length - 2, Math.floor(rawIdx));
  const segT = rawIdx - idx;
  const fadeStart = 1 - SCREEN_FADE_PORTION;

  if (segT < fadeStart) {
    return holdScreen(seq[idx]);
  }

  const blend = smootherstep(fadeStart, 1, segT);
  return {
    from: seq[idx],
    to: seq[idx + 1],
    blend,
  };
}

export function resolveActiveScreen(globalProgress: number): AppScreen {
  return resolveScreenTransition(globalProgress).to;
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

  const insideScreen = 0;
  const particleIntensity = lerp(0.35, 1, smoothstep(0, 0.16, globalProgress))
    * (1 - smoothstep(0.82, 0.95, globalProgress) * 0.35);
  const ribbonIntensity = smoothstep(0.38, 0.58, globalProgress) * (1 - smoothstep(0.72, 0.86, globalProgress));
  const cardSpread = smoothstep(0.30, 0.44, globalProgress) * (1 - smoothstep(0.68, 0.82, globalProgress));

  const heroOpacity = 1 - smoothstep(0.1, 0.24, globalProgress);
  const featureOpacity = smoothstep(0.22, 0.32, globalProgress) * (1 - smoothstep(0.74, 0.86, globalProgress));
  const ctaOpacity = smoothstep(0.84, 0.94, globalProgress);
  const screenTransition = resolveScreenTransition(globalProgress);
  const activeScreen = screenTransition.to;

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
    activeScreen,
    screenFrom: screenTransition.from,
    screenTo: screenTransition.to,
    screenBlend: screenTransition.blend,
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
