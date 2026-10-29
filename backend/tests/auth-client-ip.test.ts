import { describe, expect, it } from 'vitest'
import {
  normalizePeerAddress,
  parseTrustedProxies,
  resolveClientIp,
} from '../src/modules/auth/clientIp.js'

/**
 * Client-IP resolution for auth rate limiting: the Fastify bridge feeds
 * Better Auth a server-resolved address, so per-IP limits work in
 * production (no shared fallback bucket) and cannot be spoofed through
 * client-supplied forwarded headers.
 */

describe('normalizePeerAddress', () => {
  it('unwraps IPv4-mapped IPv6', () => {
    expect(normalizePeerAddress('::ffff:192.0.2.10')).toBe('192.0.2.10')
  })

  it('keeps plain addresses and rejects garbage', () => {
    expect(normalizePeerAddress('203.0.113.7')).toBe('203.0.113.7')
    expect(normalizePeerAddress('2001:db8::1')).toBe('2001:db8::1')
    expect(normalizePeerAddress(undefined)).toBeNull()
    expect(normalizePeerAddress('not-an-ip')).toBeNull()
  })
})

describe('parseTrustedProxies', () => {
  it('parses IPs, CIDRs, and the wildcard; skips junk', () => {
    const config = parseTrustedProxies('127.0.0.1, 10.0.0.0/8, *, oops')
    expect(config.any).toBe(true)
    expect(config.rules).toHaveLength(2)
  })

  it('empty string means direct-peer mode', () => {
    const config = parseTrustedProxies('')
    expect(config.any).toBe(false)
    expect(config.rules).toHaveLength(0)
  })
})

describe('resolveClientIp', () => {
  const noProxies = parseTrustedProxies('')

  it('uses the direct peer when no proxies are configured', () => {
    expect(resolveClientIp('203.0.113.9', '6.6.6.6', noProxies)).toBe('203.0.113.9')
    // Spoofed forwarded headers are ignored entirely.
    expect(resolveClientIp('::ffff:203.0.113.9', '6.6.6.6', noProxies)).toBe('203.0.113.9')
  })

  it('uses the peer when it is not a trusted proxy', () => {
    const proxies = parseTrustedProxies('10.0.0.0/8')
    expect(resolveClientIp('203.0.113.9', '6.6.6.6', proxies)).toBe('203.0.113.9')
  })

  it('unwraps forwarded chains behind a trusted proxy (right-to-left)', () => {
    const proxies = parseTrustedProxies('10.0.0.0/8')
    expect(resolveClientIp('10.0.0.1', '198.51.100.4, 10.0.0.9', proxies)).toBe('198.51.100.4')
    expect(resolveClientIp('10.0.0.1', '198.51.100.4', proxies)).toBe('198.51.100.4')
  })

  it('falls back to the peer when every hop is trusted', () => {
    const proxies = parseTrustedProxies('10.0.0.0/8')
    expect(resolveClientIp('10.0.0.1', '10.0.0.5, 10.0.0.9', proxies)).toBe('10.0.0.1')
  })

  it('falls back to the peer when the chain is garbage', () => {
    const proxies = parseTrustedProxies('127.0.0.1')
    expect(resolveClientIp('127.0.0.1', 'not-an-ip,,,', proxies)).toBe('127.0.0.1')
    expect(resolveClientIp('127.0.0.1', undefined, proxies)).toBe('127.0.0.1')
  })

  it('wildcard trusts every peer and uses the rightmost entry (observed hop)', () => {
    const wildcard = parseTrustedProxies('*')
    // Leftmost is client-spoofable; rightmost is what our proxy actually saw.
    expect(resolveClientIp('10.1.2.3', '6.6.6.6, 198.51.100.4', wildcard)).toBe('198.51.100.4')
    expect(resolveClientIp('10.1.2.3', '198.51.100.4', wildcard)).toBe('198.51.100.4')
  })

  it('IPv6 peers resolve and match exact trusted entries', () => {
    const proxies = parseTrustedProxies('::1')
    expect(resolveClientIp('::1', '198.51.100.4', proxies)).toBe('198.51.100.4')
    expect(resolveClientIp('2001:db8::5', '198.51.100.4', proxies)).toBe('2001:db8::5')
  })

  it('returns null for a missing peer (no IP is better than a wrong one)', () => {
    expect(resolveClientIp(undefined, '6.6.6.6', noProxies)).toBeNull()
  })
})
