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

/** 首屏 idle 轮播用（与滚动关键帧解耦，仅切换 UI 预览） */
export const PHONE_SCREEN_SEQUENCE_FOR_DEMO: AppScreen[] = [
  'home',
  'schedule',
  'grades',
  'exams',
  'notifications',
  'electricity',
  'classroom',
];

/** 移动端缩短滚动驱动高度，减少长距离刷屏与误触闪烁 */
export const SCROLL_DRIVER_VH_MOBILE = 420;

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

/**
 * 三栏构图：左文案 / 中手机 / 右功能卡。
 * 镜头始终看向原点附近的居中手机，做推进与左右环绕。
 */
const CAMERA_KEYFRAMES: CameraKeyframe[] = [
  // intro：正前略侧，完整见整机
  { position: { x: 0.55, y: 0.32, z: 3.35 }, lookAt: { x: 0, y: 0.05, z: 0 }, fov: 34 },
  // ignite：推进
  { position: { x: 0.35, y: 0.26, z: 3.0 }, lookAt: { x: 0, y: 0.06, z: 0 }, fov: 33 },
  // lift：更正视
  { position: { x: 0.15, y: 0.2, z: 2.75 }, lookAt: { x: 0, y: 0.07, z: 0 }, fov: 32 },
  // dive：看清 App UI（仍保持整机可见）
  { position: { x: 0.05, y: 0.12, z: 2.55 }, lookAt: { x: 0, y: 0.08, z: 0 }, fov: 31 },
  // schedule：左侧环绕，露机身厚度
  { position: { x: -0.75, y: 0.18, z: 2.85 }, lookAt: { x: 0.02, y: 0.07, z: 0 }, fov: 33 },
  // grades：右侧环绕
  { position: { x: 0.85, y: 0.2, z: 2.8 }, lookAt: { x: -0.02, y: 0.06, z: 0 }, fov: 33 },
  // tunnel：轻微仰视
  { position: { x: 0.2, y: -0.08, z: 2.9 }, lookAt: { x: 0, y: 0.12, z: 0 }, fov: 34 },
  // return
  { position: { x: 0.25, y: 0.22, z: 3.0 }, lookAt: { x: 0, y: 0.05, z: 0 }, fov: 33 },
  // pre-cta
  { position: { x: 0.45, y: 0.3, z: 3.2 }, lookAt: { x: 0, y: 0.04, z: 0 }, fov: 34 },
  // cta：产品定妆
  { position: { x: 0.55, y: 0.34, z: 3.4 }, lookAt: { x: 0, y: 0.03, z: 0 }, fov: 34 },
];

/** 手机居中立起；旋转做 3D 展示，位移保持小幅度 */
const PHONE_KEYFRAMES: PhoneKeyframe[] = [
  { position: { x: 0, y: 0.02, z: 0 }, rotation: { x: -0.1, y: 0.42, z: 0.03 }, scale: 0.94, screenBrightness: 0.95, float: 0.02 },
  { position: { x: 0, y: 0.03, z: 0.01 }, rotation: { x: -0.07, y: 0.28, z: 0.02 }, scale: 0.96, screenBrightness: 1, float: 0.024 },
  { position: { x: 0, y: 0.04, z: 0.02 }, rotation: { x: -0.04, y: 0.1, z: 0 }, scale: 0.98, screenBrightness: 1, float: 0.028 },
  { position: { x: 0, y: 0.04, z: 0.03 }, rotation: { x: -0.02, y: 0.02, z: 0 }, scale: 1.0, screenBrightness: 1, float: 0.03 },
  { position: { x: 0.02, y: 0.03, z: 0.02 }, rotation: { x: -0.03, y: -0.32, z: -0.02 }, scale: 0.98, screenBrightness: 1, float: 0.028 },
  { position: { x: -0.02, y: 0.04, z: 0.02 }, rotation: { x: -0.02, y: 0.34, z: 0.02 }, scale: 0.97, screenBrightness: 1, float: 0.026 },
  { position: { x: 0, y: 0.05, z: 0.01 }, rotation: { x: 0.05, y: 0.08, z: 0 }, scale: 0.96, screenBrightness: 1, float: 0.024 },
  { position: { x: 0, y: 0.03, z: 0.01 }, rotation: { x: -0.04, y: 0.16, z: 0.01 }, scale: 0.95, screenBrightness: 1, float: 0.022 },
  { position: { x: 0, y: 0.02, z: 0 }, rotation: { x: -0.08, y: 0.28, z: 0.02 }, scale: 0.94, screenBrightness: 1, float: 0.02 },
  { position: { x: 0, y: 0.02, z: 0 }, rotation: { x: -0.1, y: 0.36, z: 0.03 }, scale: 0.92, screenBrightness: 0.98, float: 0.018 },
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

  // 左栏文案：运镜前半段保持可见，后半段再淡出
  const heroOpacity = 1 - smoothstep(0.22, 0.42, globalProgress);
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
