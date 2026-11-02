import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * SSRF guard for outbound provider endpoints. Hosted default: approved
 * HTTPS providers only — private, loopback, link-local, CGNAT, and
 * metadata addresses are rejected, including all IPv6 equivalents, with
 * real DNS resolution (not hostname pattern checks). Self-hosted local
 * models are an explicit operator setting (ALLOW_LOCAL_MODEL_ENDPOINTS
 * plus an address allowlist) — never available to arbitrary hosted
 * users.
 */

export class UrlGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UrlGuardError'
  }
}

export interface UrlGuardOptions {
  /** Operator opt-in for self-hosted local models (development/self-hosting). */
  allowLocalEndpoints: boolean
  /** Explicitly allowlisted hostnames/IPs (comma separated) for self-hosting. */
  allowlist: string[]
}

interface RangedBlock {
  family: 4 | 6
  start: bigint
  end: bigint
}

/**
 * Parse an IPv4/IPv6 CIDR block into its numeric range. Addresses are
 * normalized to full-width BigInts (32-bit for IPv4, 128-bit for IPv6)
 * BEFORE range math, so an IPv6 prefix can never be compared against a
 * shorter magnitude by accident — the exact class of bug where
 * `fc00::/7` was once written as a 64-bit constant and every ULA,
 * link-local, and multicast IPv6 literal sailed past the guard.
 * Blocks carry their address family and are only compared against
 * addresses of that family: numerically, every IPv4 address also lies
 * inside the IPv6 `::/96` block, so a family-blind comparison would
 * reject the entire public IPv4 internet.
 */
function parseCidr(cidr: string): RangedBlock {
  const [address, prefixText] = cidr.split('/')
  if (address === undefined) throw new Error(`Invalid CIDR: ${cidr}`)
  const family = isIP(address)
  if (family !== 4 && family !== 6) throw new Error(`Invalid CIDR address: ${cidr}`)
  const bits = family === 4 ? 32 : 128
  const prefix = prefixText === undefined ? bits : Number.parseInt(prefixText, 10)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > bits) {
    throw new Error(`Invalid CIDR prefix: ${cidr}`)
  }
  const hostBits = BigInt(bits - prefix)
  const hostMask = (1n << hostBits) - 1n
  const networkMask = ((1n << BigInt(bits)) - 1n) ^ hostMask
  const start = ipToBigInt(address) & networkMask
  return { family, start, end: start | hostMask }
}

/**
 * IPv4 + IPv6 special-purpose ranges that must never be reachable from
 * hosted requests (IANA IPv4/IPv6 Special-Purpose Address Registries,
 * RFC 6890/4291, plus cloud metadata addresses). Cloud metadata note:
 * AWS/GCP/Oracle IMDS live in 169.254.0.0/16, Alibaba's in
 * 100.100.100.200 (inside CGNAT 100.64.0.0/10); Azure's wire server
 * 168.63.129.16 is otherwise-public space used for platform services,
 * so it is blocked as an explicit /32.
 */
const BLOCKED_RANGES: RangedBlock[] = [
  // IPv4
  parseCidr('0.0.0.0/8'), // "this" network
  parseCidr('10.0.0.0/8'), // private
  parseCidr('100.64.0.0/10'), // CGNAT (+ Alibaba metadata 100.100.100.200)
  parseCidr('127.0.0.0/8'), // loopback
  parseCidr('168.63.129.16/32'), // Azure wire server
  parseCidr('169.254.0.0/16'), // link-local + AWS/GCP/Oracle metadata
  parseCidr('172.16.0.0/12'), // private
  parseCidr('192.0.0.0/24'), // IETF protocol assignments
  parseCidr('192.0.2.0/24'), // TEST-NET-1 (documentation)
  parseCidr('192.88.99.0/24'), // 6to4 relay anycast (deprecated)
  parseCidr('192.168.0.0/16'), // private
  parseCidr('198.18.0.0/15'), // benchmarking
  parseCidr('198.51.100.0/24'), // TEST-NET-2 (documentation)
  parseCidr('203.0.113.0/24'), // TEST-NET-3 (documentation)
  parseCidr('224.0.0.0/4'), // multicast
  parseCidr('240.0.0.0/4'), // reserved + limited broadcast
  // IPv6
  parseCidr('::/96'), // unspecified, loopback ::1, deprecated IPv4-compatible
  parseCidr('::ffff:0:0/96'), // IPv4-mapped (any mapped target, public or private)
  parseCidr('64:ff9b::/96'), // IPv4-translated (NAT64 well-known)
  parseCidr('64:ff9b:1::/48'), // NAT64 local-use (RFC 8215)
  parseCidr('100::/64'), // discard-only
  parseCidr('2001::/32'), // Teredo (can tunnel to arbitrary IPv4)
  parseCidr('2001:20::/28'), // ORCHIDv2
  parseCidr('2001:db8::/32'), // documentation
  parseCidr('2002::/16'), // 6to4 (deprecated; embeds arbitrary IPv4)
  parseCidr('fc00::/7'), // unique local
  parseCidr('fe80::/10'), // link-local
  parseCidr('fec0::/10'), // site-local (deprecated)
  parseCidr('ff00::/8'), // multicast
]

function ipv4ToBigInt(address: string): bigint {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10))
  let value = 0n
  for (const part of parts) {
    value = (value << 8n) + BigInt(part)
  }
  return value
}

function ipToBigInt(address: string): bigint {
  const version = isIP(address)
  if (version === 4) return ipv4ToBigInt(address)
  if (version === 6) return ipv6ToBigInt(address)
  throw new UrlGuardError('Invalid IP address.')
}

function ipv6ToBigInt(address: string): bigint {
  // Handle embedded IPv4 (::ffff:1.2.3.4) and normal forms.
  let normalized = address
  const embeddedV4 = normalized.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/)
  if (embeddedV4) {
    const prefix = embeddedV4[1] ?? ''
    const v4 = embeddedV4[2] ?? '0.0.0.0'
    const v4Big = ipv4ToBigInt(v4)
    const high = (v4Big >> 16n) & 0xffffn
    const low = v4Big & 0xffffn
    normalized = `${prefix}${high.toString(16)}:${low.toString(16)}`
  }

  const [head, tail] = normalized.split('::')
  const headGroups = head ? head.split(':').filter(Boolean) : []
  const tailGroups = tail !== undefined ? (tail ? tail.split(':').filter(Boolean) : []) : null
  const missing = tailGroups === null ? 8 - headGroups.length : 8 - headGroups.length - (tailGroups?.length ?? 0)

  let value = 0n
  for (const group of headGroups) {
    value = (value << 16n) + BigInt(Number.parseInt(group, 16))
  }
  for (let index = 0; index < missing; index += 1) {
    value = value << 16n
  }
  if (tailGroups !== null) {
    for (const group of tailGroups) {
      value = (value << 16n) + BigInt(Number.parseInt(group, 16))
    }
  }
  return value
}

function isBlockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family !== 4 && family !== 6) return true // unparseable → refuse
  const value = ipToBigInt(address)
  return BLOCKED_RANGES.some(
    (range) => range.family === family && value >= range.start && value <= range.end,
  )
}

export interface ResolvedEndpoint {
  url: URL
  /** IPs the hostname resolved to (already validated). */
  addresses: string[]
}

/**
 * Validate an outbound endpoint URL and resolve its hostname to
 * addresses that pass the private-range checks. Throws UrlGuardError
 * with a safe message otherwise.
 */
export async function resolveProviderEndpoint(
  rawUrl: string,
  options: UrlGuardOptions,
): Promise<ResolvedEndpoint> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new UrlGuardError('The endpoint URL is not valid.')
  }

  // No embedded credentials.
  if (url.username !== '' || url.password !== '') {
    throw new UrlGuardError('The endpoint URL must not embed credentials.')
  }

  const allowlisted = options.allowlist.includes(url.hostname)

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UrlGuardError('Only http(s) provider endpoints are allowed.')
  }
  if (url.protocol === 'http:' && !options.allowLocalEndpoints && !allowlisted) {
    throw new UrlGuardError('Provider endpoints must use HTTPS.')
  }

  // Ports: hosted default is 443/80 only; the operator's self-hosted
  // local-model mode (allowLocalEndpoints or an allowlist entry) may use
  // any port (e.g. Ollama on 11434).
  const isDefaultPort =
    (url.protocol === 'https:' && url.port === '443') ||
    (url.protocol === 'http:' && url.port === '80') ||
    url.port === ''
  if (!isDefaultPort && !options.allowLocalEndpoints && !allowlisted) {
    throw new UrlGuardError('Non-standard ports are not allowed for provider endpoints.')
  }

  // Literal IPs are checked directly; hostnames resolve through DNS.
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const asIp = isIP(hostname) !== 0 ? hostname : null

  let addresses: string[]
  if (asIp !== null) {
    addresses = [asIp]
  } else {
    try {
      const results = await lookup(hostname, { all: true, verbatim: true })
      addresses = results.map((result) => result.address)
      if (addresses.length === 0) {
        throw new UrlGuardError('The provider endpoint host did not resolve.')
      }
    } catch (error) {
      if (error instanceof UrlGuardError) throw error
      throw new UrlGuardError('The provider endpoint host did not resolve.')
    }
  }

  const localAllowed = options.allowLocalEndpoints || allowlisted
  if (!localAllowed) {
    for (const address of addresses) {
      if (isBlockedAddress(address)) {
        // Never echo the resolved address back.
        throw new UrlGuardError('The provider endpoint points to a blocked address range.')
      }
    }
  }

  return { url, addresses }
}
