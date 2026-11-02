#!/usr/bin/env node
/**
 * Opt-in smoke harness against REAL configured providers (U020).
 *
 * Deterministic fake adapters in the test suites cover the supported
 * protocols offline; this script runs the same surfaces (discovery +
 * one-token generation) against providers YOU configure, and records
 * the results separately. It is opt-in on purpose:
 *
 *   - It performs REAL network requests.
 *   - Each run sends one real generation request per provider, which
 *     may consume quota or cost tokens on paid accounts.
 *   - Credentials are supplied via the SMOKE_PROVIDERS environment
 *     variable and are NEVER written to the results file or committed.
 *
 * Usage:
 *   SMOKE_PROVIDERS='[{"label":"groq","endpointUrl":"https://api.groq.com/openai/v1","kind":"openai-compatible","apiKey":"gsk-…","modelId":"llama-3.1-8b-instant"}]' \
 *     node scripts/provider-smoke.mjs
 *
 * Results are appended to backend/smoke-results.json (git-ignored).
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RESULTS_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'smoke-results.json')
const DISCOVERY_TIMEOUT_MS = 15_000
const GENERATION_TIMEOUT_MS = 30_000

function fail(message) {
  console.error(`provider-smoke: ${message}`)
  process.exit(1)
}

const raw = process.env.SMOKE_PROVIDERS
if (!raw) {
  fail(
    'opt-in only — set SMOKE_PROVIDERS to a JSON array of ' +
      '{label, endpointUrl, kind, apiKey, modelId?} entries. Each run performs REAL requests ' +
      'and may consume quota or cost tokens.',
  )
}

let providers
try {
  providers = JSON.parse(raw)
} catch (error) {
  fail(`SMOKE_PROVIDERS is not valid JSON: ${error.message}`)
}
if (!Array.isArray(providers) || providers.length === 0) fail('SMOKE_PROVIDERS must be a non-empty array.')

for (const entry of providers) {
  if (typeof entry.label !== 'string' || typeof entry.endpointUrl !== 'string') {
    fail('every provider needs label and endpointUrl')
  }
  if (entry.kind !== 'openai-compatible' && entry.kind !== 'anthropic') {
    fail(`unsupported kind for ${entry.label}: ${entry.kind}`)
  }
  if (entry.kind === 'anthropic' && !entry.apiKey) {
    fail(`anthropic providers need a credential (${entry.label})`)
  }
}

console.log(
  [
    'provider-smoke (opt-in, REAL providers)',
    `  providers: ${providers.map((p) => `${p.label} (${p.kind})`).join(', ')}`,
    '  cost: one one-token generation per provider — may consume quota or cost tokens',
    '  results: backend/smoke-results.json (credentials never recorded)',
    '',
  ].join('\n'),
)

function authHeaders(kind, apiKey) {
  return kind === 'anthropic'
    ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    : apiKey
      ? { authorization: `Bearer ${apiKey}` }
      : {}
}

function urls(entry) {
  const base = entry.endpointUrl.replace(/\/+$/, '')
  if (entry.kind === 'anthropic') {
    const versioned = /\/v1$/.test(base) ? base : `${base}/v1`
    return { discovery: `${versioned}/models`, generation: `${versioned}/messages` }
  }
  return {
    discovery: `${base}/models`,
    generation: /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`,
  }
}

async function boundedText(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('response too large')
  const text = await response.text()
  if (text.length > maxBytes) throw new Error('response too large')
  return text
}

async function checkDiscovery(entry) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS)
  const started = Date.now()
  try {
    const response = await fetch(urls(entry).discovery, {
      headers: authHeaders(entry.kind, entry.apiKey),
      signal: controller.signal,
    })
    const latencyMs = Date.now() - started
    if (!response.ok) return { ok: false, status: response.status, latencyMs }
    const body = JSON.parse(await boundedText(response, 2_000_000))
    const count = Array.isArray(body?.data)
      ? body.data.filter((m) => typeof m?.id === 'string').length
      : null
    return { ok: true, status: response.status, modelCount: count, latencyMs }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'network failure' }
  } finally {
    clearTimeout(timer)
  }
}

async function checkGeneration(entry) {
  const modelId = entry.modelId
  if (!modelId) return { skipped: 'no modelId configured' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS)
  const started = Date.now()
  try {
    const response = await fetch(urls(entry).generation, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders(entry.kind, entry.apiKey) },
      body: JSON.stringify({ model: modelId, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
      signal: controller.signal,
    })
    const latencyMs = Date.now() - started
    if (!response.ok) {
      const snippet = (await boundedText(response, 16_000).catch(() => '')).slice(0, 180)
      return { ok: false, status: response.status, latencyMs, ...(snippet ? { snippet } : {}) }
    }
    return { ok: true, status: response.status, latencyMs }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'network failure' }
  } finally {
    clearTimeout(timer)
  }
}

const results = []
for (const entry of providers) {
  // Record the HOST only — never the full endpoint with credentials or
  // query strings, and never the key.
  let host = 'unparseable'
  try {
    host = new URL(entry.endpointUrl).host
  } catch {
    /* keep the honest placeholder */
  }
  const result = {
    label: entry.label,
    host,
    protocol: entry.kind,
    checkedAt: new Date().toISOString(),
    discovery: await checkDiscovery(entry),
    generation: await checkGeneration(entry),
  }
  results.push(result)
  console.log(JSON.stringify(result, null, 2))
}

const previous = existsSync(RESULTS_PATH) ? JSON.parse(readFileSync(RESULTS_PATH, 'utf8')) : []
writeFileSync(RESULTS_PATH, JSON.stringify([...previous, ...results], null, 2))
console.log(`\nrecorded ${results.length} result(s) in ${RESULTS_PATH} (deterministic suite results live separately)`)
