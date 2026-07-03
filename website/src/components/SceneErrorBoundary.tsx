'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface SceneErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface SceneErrorBoundaryState {
  hasError: boolean;
}

function DefaultFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#03060d]">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 20%, rgba(56,189,248,0.2), transparent 60%), radial-gradient(ellipse 50% 40% at 80% 80%, rgba(167,139,250,0.15), transparent 50%)',
        }}
      />
      <p className="relative text-sm text-white/45">3D 场景暂时不可用，页面其余内容可正常浏览</p>
    </div>
  );
}

export default class SceneErrorBoundary extends Component<
  SceneErrorBoundaryProps,
  SceneErrorBoundaryState
> {
  state: SceneErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SceneErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[SceneErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <DefaultFallback />;
    }
    return this.props.children;
  }
}
