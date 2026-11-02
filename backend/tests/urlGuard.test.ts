import { describe, expect, it } from 'vitest'
import { resolveProviderEndpoint, UrlGuardError } from '../src/lib/urlGuard.js'

/**
 * SSRF guard address classification (audit F01 / U002). Validation only:
 * every case uses a literal IP so no DNS query or network request is
 * ever made — private infrastructure is never probed, only classified.
 *
 * The audited bug: IPv6 range constants were 64-bit magnitudes compared
 * against 128-bit parsed addresses, so fc00::/fd00::/fe80::/ff02:: all
 * passed the hosted policy. Range math is now derived from CIDR blocks
 * at full address width.
 */

const HOSTED = { allowLocalEndpoints: false, allowlist: [] as string[] }
const LOCAL_ALLOWED = { allowLocalEndpoints: true, allowlist: [] as string[] }

async function expectBlocked(url: string): Promise<void> {
  await expect(resolveProviderEndpoint(url, HOSTED)).rejects.toBeInstanceOf(UrlGuardError)
}

async function expectAllowed(url: string, expectedAddress: string): Promise<void> {
  const resolved = await resolveProviderEndpoint(url, HOSTED)
  expect(resolved.addresses).toEqual([expectedAddress])
}

describe('urlGuard — IPv6 special-purpose ranges are blocked (F01)', () => {
  it.each([
    'https://[fc00::1]/v1', // unique local fc00::/7
    'https://[fd12:3456:789a::1]/v1', // unique local fd00::/8
    'https://[fe80::1]/v1', // link-local fe80::/10
    'https://[fe90::1]/v1', // link-local (upper half of fe80::/10)
    'https://[fec0::1]/v1', // site-local (deprecated)
    'https://[ff02::1]/v1', // multicast ff00::/8
    'https://[fff8::1]/v1', // reserved multicast
    'https://[::1]/v1', // loopback
    'https://[::]/v1', // unspecified
    'https://[::42]/v1', // deprecated IPv4-compatible space under ::/96
    'https://[100::]/v1', // discard-only
    'https://[2001:0:1234::1]/v1', // Teredo
    'https://[2001:20::1]/v1', // ORCHIDv2
    'https://[2001:db8::1]/v1', // documentation
    'https://[2002:c0a8:101::]/v1', // 6to4 embedding 192.168.1.1
    'https://[2002:7f00:1::]/v1', // 6to4 embedding 127.0.0.1
    'https://[64:ff9b::c000:280]/v1', // NAT64 well-known translating 192.0.2.128
    'https://[64:ff9b:1::abcd]/v1', // NAT64 local-use (RFC 8215)
  ])('%s is rejected under hosted policy', async (url) => {
    await expectBlocked(url)
  })

  it('blocks IPv4-mapped and IPv4-translated loopback bypass forms', async () => {
    // Node normalizes [::ffff:127.0.0.1] to [::ffff:7f00:1]; both forms
    // must land inside the ::ffff:0:0/96 block regardless of the mapped
    // target being private…
    await expectBlocked('https://[::ffff:127.0.0.1]/v1')
    await expectBlocked('https://[::ffff:7f00:1]/v1')
    await expectBlocked('https://[::ffff:169.254.169.254]/latest/meta-data')
    await expectBlocked('https://[::ffff:10.0.0.5]/v1')
    // …and even when the mapped target is public (mapped forms are not
    // valid internet destinations and stay blocked wholesale).
    await expectBlocked('https://[::ffff:8.8.8.8]/v1')
    await expectBlocked('https://[64:ff9b::7f00:1]/v1')
  })

  it('accepts real public IPv6 destinations', async () => {
    await expectAllowed('https://[2606:4700::6810:85e5]/v1', '2606:4700::6810:85e5')
    await expectAllowed('https://[2a00:1450:4001:81b::200e]/v1', '2a00:1450:4001:81b::200e')
    await expectAllowed('https://[2620:0:2d0:200::3]/v1', '2620:0:2d0:200::3')
    await expectAllowed('https://[2600::1]/v1', '2600::1')
  })
})

describe('urlGuard — IPv4 special-purpose ranges are blocked', () => {
  it.each([
    'https://0.0.0.0/v1',
    'https://10.0.0.7/v1',
    'https://100.64.0.1/v1', // CGNAT
    'https://100.100.100.200/v1', // Alibaba metadata (inside CGNAT)
    'https://127.0.0.1/v1',
    'https://127.8.8.8/v1', // loopback is the whole /8
    'https://168.63.129.16/v1', // Azure wire server
    'https://169.254.169.254/latest/meta-data', // AWS/GCP/Oracle metadata
    'https://172.16.0.9/v1',
    'https://172.31.255.254/v1',
    'https://192.0.0.8/v1', // IETF protocol assignments
    'https://192.0.2.33/v1', // TEST-NET-1
    'https://192.88.99.1/v1', // 6to4 relay anycast
    'https://192.168.1.1/v1',
    'https://198.18.0.5/v1', // benchmarking
    'https://198.51.100.7/v1', // TEST-NET-2
    'https://203.0.113.9/v1', // TEST-NET-3
    'https://224.0.0.1/v1', // multicast
    'https://239.5.5.5/v1',
    'https://240.0.0.1/v1', // reserved
    'https://255.255.255.255/v1', // limited broadcast
  ])('%s is rejected under hosted policy', async (url) => {
    await expectBlocked(url)
  })

  it('normalizes encoded IPv4 notations before classification', async () => {
    // WHATWG URL parsing converts integer/hex shorthand to dotted quad.
    await expectBlocked('https://2130706433/v1') // 127.0.0.1 as integer
    await expectBlocked('https://0x7f.0.0.1/v1') // 127.0.0.1 in hex
    await expectBlocked('https://0177.0.0.1/v1') // 127.0.0.1 in octal
  })

  it('accepts real public IPv4 destinations', async () => {
    await expectAllowed('https://8.8.8.8/v1', '8.8.8.8')
    await expectAllowed('https://1.1.1.1/v1', '1.1.1.1')
    await expectAllowed('https://93.184.216.34/v1', '93.184.216.34')
    await expectAllowed('https://104.18.7.45/v1', '104.18.7.45')
  })
})

describe('urlGuard — operator opt-ins still work', () => {
  it('allows loopback when the operator enables local endpoints', async () => {
    const resolved = await resolveProviderEndpoint('http://127.0.0.1:11434/v1', LOCAL_ALLOWED)
    expect(resolved.addresses).toEqual(['127.0.0.1'])
  })

  it('allows an allowlisted host without the broad local opt-in', async () => {
    const resolved = await resolveProviderEndpoint('http://127.0.0.1:8080/v1', {
      allowLocalEndpoints: false,
      allowlist: ['127.0.0.1'],
    })
    expect(resolved.addresses).toEqual(['127.0.0.1'])
  })

  it('still blocks private ranges outside the allowlist even with local endpoints disabled', async () => {
    await expect(
      resolveProviderEndpoint('http://10.0.0.5:8080/v1', {
        allowLocalEndpoints: false,
        allowlist: ['192.168.1.5'],
      }),
    ).rejects.toBeInstanceOf(UrlGuardError)
  })
})
