import { describe, expect, it } from 'vitest'
import { assertValidRedirectUris } from '../src/domain/clients.js'

describe('Core redirect_uri validation', () => {
  it('accepts production web https and explicit localhost development callback', () => {
    expect(() => assertValidRedirectUris(
      [{ uri: 'https://course.example.com/oauth/callback', kind: 'web_https' }],
      'web_confidential',
    )).not.toThrow()
    expect(() => assertValidRedirectUris(
      [{ uri: 'http://localhost:3000/oauth/callback', kind: 'web_https' }],
      'web_confidential',
      { allowLocalhostDev: true },
    )).not.toThrow()
  })

  it('rejects localhost lookalikes and insecure web callbacks in production', () => {
    for (const uri of [
      'http://localhost:3000/oauth/callback',
      'http://localhost.evil.example/oauth/callback',
      'http://127.0.0.1:3000/oauth/callback',
    ]) {
      expect(() => assertValidRedirectUris(
        [{ uri, kind: 'web_https' }],
        'web_confidential',
      )).toThrow()
    }
  })

  it('enforces redirect kind against client type', () => {
    expect(() => assertValidRedirectUris(
      [{ uri: 'my-app:/oauth/callback', kind: 'native_custom' }],
      'web_confidential',
    )).toThrow()
    expect(() => assertValidRedirectUris(
      [{ uri: 'https://course.example.com/callback', kind: 'web_https' }],
      'native_public',
    )).toThrow()
  })

  it('accepts RFC 8252 native callback shapes and rejects malformed values', () => {
    expect(() => assertValidRedirectUris(
      [{ uri: 'my-app:/oauth/callback', kind: 'native_custom' }],
      'native_public',
    )).not.toThrow()
    expect(() => assertValidRedirectUris(
      [{ uri: 'http://127.0.0.1:49152/callback', kind: 'native_loopback' }],
      'native_public',
    )).not.toThrow()

    for (const item of [
      { uri: 'https:/oauth/callback', kind: 'native_custom' as const },
      { uri: 'http://example.com/callback', kind: 'native_loopback' as const },
      { uri: 'my-app:/callback#token', kind: 'native_custom' as const },
    ]) {
      expect(() => assertValidRedirectUris([item], 'native_public')).toThrow()
    }
  })
})
