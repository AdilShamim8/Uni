import { isIP } from 'node:net'

/**
 * Client-IP resolution for Better Auth rate limiting.
 *
 * The Fastify bridge hands Better Auth a Web `Request`, which cannot carry
 * the socket's remote address — so in production Better Auth cannot see
 * where a connection came from, warns, and falls back to ONE shared
 * rate-limit bucket per path for every client (three sign-ups lock the
 * whole auth surface for ten seconds). It would also trust a client-set
 * single-value `X-Forwarded-For` verbatim, letting callers rotate fake
 * IPs and bypass per-IP limits.
 *
 * This resolver closes both holes: the bridge computes the client IP from
 * the socket peer (honoring forwarded chains only when the peer is an
 * operator-listed trusted proxy), strips every spoofable forwarded header
 * from the inbound request, and injects the resolved address under a
 * private header Better Auth reads (`advanced.ipAddress.ipAddressHeaders`).
 * Clients cannot influence the value: it is either the direct peer or an
 * address unwrapped from a chain that terminates at a trusted proxy.
 */

/** Header the bridge injects; Better Auth reads it exclusively. */
export const CLIENT_IP_HEADER = 'x-un-client-ip'

/** Inbound headers that could spoof the resolved address. */
export const SPOOFABLE_HEADERS = ['x-forwarded-for', 'x-real-ip', 'forwarded', CLIENT_IP_HEADER]

interface CidrRule {
  bytes: Uint8Array
  prefix: number
}

function ipToBytes(ip: string): Uint8Array | null {
  if (isIP(ip) === 4) {
    return Uint8Array.from(ip.split('.').map((part) => Number.parseInt(part, 10)))
  }
  if (isIP(ip) === 6) {
    const match = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    const mapped = match?.[1]
    if (mapped) {
      return Uint8Array.from(mapped.split('.').map((part) => Number.parseInt(part, 10)))
    }
    const groups = expandIpv6(ip)
    const bytes = new Uint8Array(16)
    for (let index = 0; index < 8; index += 1) {
      const value = Number.parseInt(groups[index] ?? '0', 16)
      bytes[index * 2] = (value >> 8) & 0xff
      bytes[index * 2 + 1] = value & 0xff
    }
    return bytes
  }
  return null
}

function expandIpv6(ip: string): string[] {
  if (!ip.includes('::')) {
    return ip.split(':').map((group) => group.padStart(4, '0'))
  }
  const [head = '', tail = ''] = ip.split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const missing = 8 - left.length - right.length
  return [
    ...left.map((group) => group.padStart(4, '0')),
    ...Array.from({ length: missing }, () => '0000'),
    ...right.map((group) => group.padStart(4, '0')),
  ]
}

function parseCidr(entry: string): CidrRule | 'any' | null {
  if (entry === '*') return 'any'
  const slash = entry.lastIndexOf('/')
  const address = slash === -1 ? entry : entry.slice(0, slash)
  const bytes = ipToBytes(address)
  if (bytes === null) return null
  const maxBits = bytes.length * 8
  if (slash === -1) return { bytes, prefix: maxBits }
  const prefix = Number.parseInt(entry.slice(slash + 1), 10)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxBits) return null
  return { bytes, prefix }
}

function bytesInCidr(bytes: Uint8Array, rule: CidrRule): boolean {
  if (bytes.length !== rule.bytes.length) return false
  let remaining = rule.prefix
  for (let index = 0; index < bytes.length && remaining > 0; index += 1) {
    const take = remaining >= 8 ? 8 : remaining
    const mask = take === 8 ? 0xff : (0xff << (8 - take)) & 0xff
    if (((bytes[index] ?? 0) & mask) !== ((rule.bytes[index] ?? 0) & mask)) return false
    remaining -= 8
  }
  return true
}

export interface TrustedProxyConfig {
  /** True when the list contains `*` (trust every direct peer). */
  any: boolean
  rules: CidrRule[]
}

export function parseTrustedProxies(raw: string): TrustedProxyConfig {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  const rules: CidrRule[] = []
  let any = false
  for (const entry of entries) {
    const parsed = parseCidr(entry)
    if (parsed === 'any') {
      any = true
    } else if (parsed !== null) {
      rules.push(parsed)
    }
  }
  return { any, rules }
}

function ipMatchesList(ip: string, trusted: TrustedProxyConfig): boolean {
  if (trusted.any) return true
  const bytes = ipToBytes(ip)
  if (bytes === null) return false
  return trusted.rules.some((rule) => bytesInCidr(bytes, rule))
}

/** IPv4-mapped IPv6 (``::ffff:127.0.0.1``) normalizes to the IPv4 form. */
export function normalizePeerAddress(address: string | undefined): string | null {
  if (!address) return null
  const trimmed = address.trim()
  if (trimmed.length === 0) return null
  const match = trimmed.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  const candidate = match?.[1] ?? trimmed
  return isIP(candidate) === 0 ? null : candidate
}

/**
 * Resolve the client IP for a request.
 *
 * - No trusted proxies configured: the direct socket peer IS the client.
 * - Peer is a trusted proxy: unwrap `X-Forwarded-For` from the right,
 *   skipping trusted hops; the first untrusted address is the client.
 *   With the `*` wildcard the rightmost entry wins (the hop our trusted
 *   proxy actually observed), since the leftmost is trivially spoofable.
 * - Anything unparseable falls back to the peer: rate limiting must
 *   degrade to "one bucket for this connection", never to a global one.
 */
export function resolveClientIp(
  peerAddress: string | undefined,
  forwardedFor: string | undefined,
  trusted: TrustedProxyConfig,
): string | null {
  const peer = normalizePeerAddress(peerAddress)
  if (!peer) return null
  if (!trusted.any && trusted.rules.length === 0) return peer
  if (!ipMatchesList(peer, trusted)) return peer

  const chain = (forwardedFor ?? '')
    .split(',')
    .map((entry) => normalizePeerAddress(entry))
    .filter((entry): entry is string => entry !== null)
  if (chain.length === 0) return peer

  if (trusted.any) return chain[chain.length - 1] ?? peer
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const candidate = chain[index]
    if (!candidate) continue
    if (ipMatchesList(candidate, trusted)) continue
    return candidate
  }
  // Every hop was trusted (the client dialed out from the proxy network).
  return peer
}
