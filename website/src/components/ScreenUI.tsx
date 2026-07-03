'use client';

import { Html } from '@react-three/drei';
import type { AppScreen } from '@/lib/scroll-utils';
import PhoneAppScreen from './phone-app/PhoneAppScreen';

interface ScreenUIProps {
  brightness: number;
  insideScreen: number;
  activeScreen: AppScreen;
}

export default function ScreenUI({ brightness, insideScreen, activeScreen }: ScreenUIProps) {
  const opacity = Math.max(0.2, brightness) * (1 - insideScreen * 0.15);
  const scale = 1 + insideScreen * 0.12;

  return (
    <Html
      transform
      occlude
      distanceFactor={1.35}
      position={[0, 0, 0.036]}
      scale={0.22 * scale}
      style={{
        width: '260px',
        height: '520px',
        pointerEvents: 'none',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      <div
        className="h-full w-full overflow-hidden rounded-[22px]"
        style={{
          opacity,
          boxShadow: `0 0 ${16 + brightness * 24}px rgba(56, 189, 248, ${0.12 + brightness * 0.2})`,
        }}
      >
        <PhoneAppScreen screen={activeScreen} />
      </div>
    </Html>
  );
}
