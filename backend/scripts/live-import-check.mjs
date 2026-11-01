/**
 * Live check of the backup import round-trip (the designed sync path):
 * preview → commit → conversation list on the server, plus idempotent
 * replay. Mirrors the Settings → Account two-step import the UI runs.
 */
const API = 'http://127.0.0.1:4000'
const ORIGIN = 'http://localhost:5173'
const COOKIE = process.env.UNI_COOKIE

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: COOKIE },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, json }
}

const backup = {
  kind: 'uni-workspace-backup',
  version: 1,
  savedAt: 1_700_000_000_000,
  payload: {
    app: {
      version: 1,
      savedAt: 1_700_000_000_000,
      conversations: [
        {
          id: 'live-import-conv-1',
          title: 'Imported from browser check',
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_010_000,
          pinned: true,
          archived: false,
          nodes: {
            'live-node-a': {
              id: 'live-node-a',
              parentId: null,
              role: 'user',
              content: 'Persisted from the browser check',
              createdAt: 1_700_000_001_000,
              status: 'complete',
            },
            'live-node-b': {
              id: 'live-node-b',
              parentId: 'live-node-a',
              role: 'assistant',
              content: 'Welcome back!',
              createdAt: 1_700_000_002_000,
              status: 'complete',
            },
          },
          activeLeafId: 'live-node-b',
        },
      ],
      preferences: {},
      providers: [],
    },
  },
}

// 1. preview (dry run — nothing stored)
const preview = await api('POST', '/api/v1/import/preview', backup)
console.log('preview:', preview.status, JSON.stringify(preview.json).slice(0, 200))

// 2. commit
const commit = await api('POST', '/api/v1/import/commit', backup)
console.log('commit:', commit.status, JSON.stringify(commit.json).slice(0, 200))

// 3. list conversations on the server
const list = await api('GET', '/api/v1/conversations')
const imported = list.json.items.find((c) => c.title === 'Imported from browser check')
console.log('listed:', list.status, 'imported conversation present:', !!imported, '| messages:', imported?.messageCount)

// 4. idempotent replay
const replay = await api('POST', '/api/v1/import/commit', backup)
console.log('replay:', replay.status, JSON.stringify(replay.json).slice(0, 160))
const list2 = await api('GET', '/api/v1/conversations')
const dupes = list2.json.items.filter((c) => c.title === 'Imported from browser check').length
console.log('after replay, duplicates:', dupes)

const ok = preview.status === 200 && commit.status === 200 && imported && dupes === 1
console.log(ok ? 'IMPORT ROUND-TRIP OK' : 'IMPORT ROUND-TRIP FAILED')
process.exit(ok ? 0 : 1)
