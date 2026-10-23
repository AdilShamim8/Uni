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
  start: bigint
  end: bigint
}

/** IPv4 + IPv6 ranges that must never be reachable from hosted requests. */
const BLOCKED_RANGES: RangedBlock[] = [
  ipv4Range('0.0.0.0', '0.255.255.255'), // "this" network
  ipv4Range('10.0.0.0', '10.255.255.255'), // private
  ipv4Range('100.64.0.0', '100.127.255.255'), // CGNAT
  ipv4Range('127.0.0.0', '127.255.255.255'), // loopback
  ipv4Range('169.254.0.0', '169.254.255.255'), // link-local + cloud metadata
  ipv4Range('172.16.0.0', '172.31.255.255'), // private
  ipv4Range('192.0.0.0', '192.0.0.255'), // IETF protocol assignments
  ipv4Range('192.168.0.0', '192.168.255.255'), // private
  ipv4Range('198.18.0.0', '198.19.255.255'), // benchmarking
  ipv4Range('224.0.0.0', '255.255.255.255'), // multicast + reserved
  { start: 0xffff00000000n, end: 0xffffffffffffn }, // IPv4-mapped ::ffff:0:0/96
  { start: 0x64ff9b000000n, end: 0x64ff9b000001n }, // IPv4-translated 64:ff9b::/96 (covers ::/96 space)
  { start: 0n, end: 0xffffn }, // IPv6 unspecified + loopback ::/128 and ::1/128
  { start: 0x1000000000000000n, end: 0x1fffffffffffffff8n }, // discard 100::/64
  { start: 0xfc00000000000000n, end: 0xfdffffffffffffffn }, // ULA fc00::/7
  { start: 0xfe80000000000000n, end: 0xfebfffffffffffffn }, // link-local fe80::/10
  { start: 0xfec0000000000000n, end: 0xfefffffffffffff7n }, // site-local fec0::/10
  { start: 0xff00000000000000n, end: 0xffffffffffffffffn }, // multicast ff00::/8
]

function ipv4Range(start: string, end: string): RangedBlock {
  return { start: ipv4ToBigInt(start), end: ipv4ToBigInt(end) }
}

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
  const value = ipToBigInt(address)
  return BLOCKED_RANGES.some((range) => value >= range.start && value <= range.end)
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
