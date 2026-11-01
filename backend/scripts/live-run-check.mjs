/**
 * Live check for the runs pipeline against the running backend:
 * a fake OpenAI-compatible provider on loopback, a real provider row +
 * credential envelope, a real conversation + user node, then create a
 * run over HTTP and read the SSE event stream until it completes.
 */
import http from 'node:http'

const API = 'http://127.0.0.1:4000'
const ORIGIN = 'http://localhost:5173'
const COOKIE = process.env.UNI_COOKIE

function fakeProvider() {
  return http.createServer((req, res) => {
    if (req.url?.includes('/chat/completions')) {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const chunks = [
        { id: 'chatcmpl-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: 'Hello ' }, finish_reason: null }] },
        { id: 'chatcmpl-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: 'from the fake provider.' }, finish_reason: null }] },
        { id: 'chatcmpl-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      ]
      let i = 0
      const tick = () => {
        if (i < chunks.length) {
          res.write(`data: ${JSON.stringify(chunks[i++])}\n\n`)
          setTimeout(tick, 30)
        } else {
          res.write('data: [DONE]\n\n')
          res.end()
        }
      }
      setTimeout(tick, 30)
    } else if (req.url?.includes('/models')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ data: [{ id: 'model-alpha' }, { id: 'model-beta' }] }))
    } else {
      res.writeHead(404)
      res.end('{}')
    }
  })
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      cookie: COOKIE,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, json }
}

const provider = fakeProvider()
await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve))
const providerUrl = `http://127.0.0.1:${provider.address().port}`
console.log('fake provider at', providerUrl)

try {
  // 1. provider row + credential envelope
  const created = await api('POST', '/api/v1/providers', {
    label: 'Live fake',
    kind: 'openai-compatible',
    endpointUrl: providerUrl,
    modelId: 'model-alpha',
  })
  if (created.status !== 201) throw new Error(`provider create ${created.status}: ${JSON.stringify(created.json)}`)
  console.log('provider created:', created.json.id)

  const cred = await api('PUT', `/api/v1/providers/${created.json.id}/credential`, { apiKey: 'sk-live-check' })
  if (cred.status !== 200) throw new Error(`credential ${cred.status}: ${JSON.stringify(cred.json)}`)
  console.log('credential stored:', JSON.stringify(cred.json.credential ?? cred.json))

  // 2. conversation + user node
  const convo = await api('POST', '/api/v1/conversations', { title: 'Live run check' })
  if (convo.status !== 201) throw new Error(`conversation ${convo.status}`)
  const node = await api('POST', `/api/v1/conversations/${convo.json.id}/nodes`, {
    role: 'user', content: 'Say something live.',
  })
  if (node.status !== 201) throw new Error(`node ${node.status}`)
  console.log('user node:', node.json.node.id)

  // 3. create the run (JSON response), then tail its SSE event stream.
  const runRes = await fetch(`${API}/api/v1/conversations/${convo.json.id}/runs`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: COOKIE },
    body: JSON.stringify({ parentNodeId: node.json.node.id, providerId: created.json.id, modelId: 'model-alpha' }),
  })
  console.log('run create status:', runRes.status, 'content-type:', runRes.headers.get('content-type'))
  const createBody = await runRes.json()
  const runId = createBody?.run?.id
  if (!runId) throw new Error(`no run id: ${JSON.stringify(createBody).slice(0, 300)}`)
  console.log('run id:', runId, 'initial status:', createBody.run.status)

  const streamRes = await fetch(`${API}/api/v1/runs/${runId}/events`, {
    headers: { origin: ORIGIN, cookie: COOKIE, accept: 'text/event-stream' },
  })
  console.log('events status:', streamRes.status, 'content-type:', streamRes.headers.get('content-type'))
  const stream = await streamRes.text()
  const events = stream.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim())
  const kinds = events.map((e) => { try { return JSON.parse(e).payload?.kind ?? JSON.parse(e).kind ?? '?' } catch { return 'raw' } })
  console.log('SSE events:', kinds.join(', '))
  const output = events.map((e) => { try { return JSON.parse(e).payload?.delta ?? '' } catch { return '' } }).join('')
  console.log('streamed output:', JSON.stringify(output))

  // 4. durable read of the run (poll briefly: execution continues async)
  let run = null
  for (let i = 0; i < 10; i++) {
    run = await api('GET', `/api/v1/runs/${runId}`)
    if (run.json.status === 'complete' || run.json.status === 'error') break
    await new Promise((r) => setTimeout(r, 300))
  }
  console.log('run read:', run.status, JSON.stringify({ status: run.json.status, output: run.json.outputText, usage: run.json.usage }))
  const events2 = await api('GET', `/api/v1/runs/${runId}/events`)
  console.log('event replay:', events2.status, Array.isArray(events2.json) ? events2.json.length : 'n/a')
  if (run.json.status !== 'complete') throw new Error(`run ended ${run.json.status}: ${run.json.errorMessage}`)
  console.log('RUN PIPELINE OK')
} finally {
  provider.close()
}
