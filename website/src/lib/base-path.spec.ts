import { afterEach, describe, expect, it, vi } from 'vitest';

describe('base-path helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('with empty basePath keeps root-relative paths', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '');
    const { withBasePath, homeWithHash, BASE_PATH } = await import('./base-path');
    expect(BASE_PATH).toBe('');
    expect(withBasePath('/')).toBe('/');
    expect(withBasePath('/docs')).toBe('/docs');
    expect(homeWithHash('#features')).toBe('/#features');
  });

  it('with GitHub Pages basePath prefixes paths and home hashes', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/mini-hbut');
    const { withBasePath, homeWithHash, BASE_PATH } = await import('./base-path');
    expect(BASE_PATH).toBe('/mini-hbut');
    expect(withBasePath('/')).toBe('/mini-hbut');
    expect(withBasePath('/docs')).toBe('/mini-hbut/docs');
    expect(withBasePath('/mini-hbut/docs')).toBe('/mini-hbut/docs');
    expect(homeWithHash('#download')).toBe('/mini-hbut/#download');
    expect(homeWithHash('about')).toBe('/mini-hbut/#about');
    // never emit bare /# which drops the repo path on github.io
    expect(homeWithHash('#features')).not.toBe('/#features');
  });
});
