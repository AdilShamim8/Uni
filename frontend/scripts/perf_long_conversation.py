#!/usr/bin/env python3
"""Long-conversation performance benchmark for the Uni frontend.

Serves no files itself: point it at a running `npm run preview` of the
production build (default http://localhost:4173). It seeds a synthetic
N-message conversation through the app's own persistence schema, then
measures real Chromium metrics:

  mount     navigationStart -> transcript rendered and stable
  stream    long tasks + frame pacing while the demo adapter streams a reply
  scroll    long tasks while stepping through the history upward

Usage:
  python3 scripts/perf_long_conversation.py [--url http://localhost:4173]
      [--messages 600] [--label before] [--out results.json]

Requires: python3 + playwright (chromium installed).
The benchmark never changes app source; it only writes localStorage inside
an isolated browser context.
"""

from __future__ import annotations

import argparse
import datetime
import json
import time

from playwright.sync_api import sync_playwright

INIT_SCRIPT = r"""
window.__lt = { count: 0, total: 0, longest: 0,
  reset() { this.count = 0; this.total = 0; this.longest = 0; } };
try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__lt.count += 1;
      window.__lt.total += entry.duration;
      window.__lt.longest = Math.max(window.__lt.longest, entry.duration);
    }
  }).observe({ type: 'longtask', buffered: true });
} catch (e) { /* longtask unsupported */ }

// Mount probe: samples the transcript and records the moment the rendered
// message count has been stable for 3 consecutive samples.
window.__mount = { last: -1, stable: 0, mountMs: null, samples: 0 };
(function probe() {
  if (window.__mount.mountMs === null) {
    const n = document.querySelectorAll('.message-in').length;
    const m = window.__mount;
    m.samples += 1;
    if (n === m.last && n > 0) {
      m.stable += 1;
      if (m.stable >= 3) m.mountMs = performance.now();
    } else {
      m.stable = 0;
    }
    m.last = n;
    requestAnimationFrame(probe);
  }
})();
"""

def build_long_state(page, messages: int) -> str:
    """Capture the app's own demo state and swap in a long conversation.

    Returns the JSON text of the modified persisted state. Done inside the
    page so the base stays schema-valid; the result is installed BEFORE the
    app boots in a fresh context (the running app would otherwise persist
    its in-memory state over any late localStorage write).
    """
    raw = page.evaluate("() => localStorage.getItem('universe:data')")
    state = json.loads(raw)
    base = state['conversations'][0]
    topics = [
        'branch switching', 'schema versioning', 'streaming cancellation',
        'provider presets', 'canvas versions', 'context limits', 'memory scoping',
        'plugin receipts', 'thread drafts', 'honest export scope',
    ]
    start = datetime.datetime.now().timestamp() * 1000 - messages * 45000
    nodes = {}
    parent_id = None
    at = start
    for i in range(messages):
        is_user = i % 2 == 0
        topic = topics[(i // 2) % len(topics)]
        if is_user:
            content = (
                f'Question {i // 2 + 1}: how does {topic} behave when the '
                'conversation gets long?'
            )
        else:
            n = (i // 2) % 5
            code = (
                '```ts\nconst path = activePath(conversation);\n'
                'const timed = withSeparators(path);\n'
                'return timed.slice(start, end);\n```\n\n'
                if n == 4
                else ''
            )
            content = (
                f'**{topic}** — answer {i // 2 + 1}.\n\n'
                'The transcript grows one message at a time, and every reply '
                'keeps the same shape so the measurement stays comparable.\n\n'
                f'- first point about {topic}\n'
                '- second point with a **bold** word\n'
                '- third point that wraps onto another line in narrow viewports\n\n'
                + code
                + f'Closing line {i}: the reply is long enough to exercise '
                'markdown, lists'
                + (', code blocks' if n == 4 else '')
                + ' and word wrap.'
            )
        node_id = f"{'u' if is_user else 'a'}-bench-{i}"
        nodes[node_id] = {
            'id': node_id,
            'parentId': parent_id,
            'role': 'user' if is_user else 'assistant',
            'content': content,
            'createdAt': round(at),
            'status': 'complete',
            'feedback': None,
        }
        parent_id = node_id
        at += 45000
    state['conversations'][0] = {
        **base,
        'title': 'Benchmark long conversation',
        'nodes': nodes,
        'activeLeafId': parent_id,
        'updatedAt': round(start + messages * 45000),
    }
    state['savedAt'] = round(start)
    return json.dumps(state, separators=(',', ':'))

FRAME_SAMPLER = r"""
(ms) => new Promise((resolve) => {
  const deltas = [];
  let last = performance.now();
  const stopAt = last + ms;
  function tick(now) {
    deltas.push(now - last);
    last = now;
    if (now < stopAt) requestAnimationFrame(tick);
    else resolve(deltas);
  }
  requestAnimationFrame(tick);
});
"""


def phase_longtasks(page) -> dict:
    return page.evaluate(
        "() => ({ count: window.__lt.count, total: window.__lt.total,"
        ' longest: window.__lt.longest })'
    )


def transcript_nodes(page) -> int:
    return page.evaluate(
        "() => document.querySelector('[role=\"log\"]')?.querySelectorAll('*').length ?? 0"
    )


def message_count(page) -> int:
    return page.evaluate("() => document.querySelectorAll('.message-in').length")


def heap_mb(page):
    return page.evaluate(
        "() => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null)"
    )


def run(url: str, messages: int, label: str, min_mount_messages: int) -> dict:
    results = {
        'label': label,
        'url': url,
        'messages': messages,
        'phases': {},
    }
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--enable-precise-memory-info'],
        )

        # Stage 1: boot once in a scratch context just to capture a
        # schema-valid demo state, then close that context so its app can
        # never write over our fixture.
        scratch = browser.new_context(viewport={'width': 1440, 'height': 900})
        scratch_page = scratch.new_page()
        scratch_page.goto(url, wait_until='load', timeout=60000)
        scratch_page.wait_for_function(
            "() => localStorage.getItem('universe:data') !== null", timeout=30000
        )
        long_state_json = build_long_state(scratch_page, messages)
        conversation_id = json.loads(long_state_json)['conversations'][0]['id']
        scratch.close()

        # Stage 2: fresh context; the fixture lands in localStorage before
        # any app script runs, so hydration sees exactly this state.
        context = browser.new_context(
            viewport={'width': 1440, 'height': 900},
            device_scale_factor=1,
        )
        # json.dumps of the state text produces a safely quoted JS string
        # literal (double-encoded), immune to content in the fixture.
        state_literal = json.dumps(long_state_json)
        context.add_init_script(
            f"try {{ localStorage.setItem('universe:data', {state_literal}); }}"
            ' catch (e) {}'
        )
        context.add_init_script(INIT_SCRIPT)
        page = context.new_page()
        page.goto(f"{url}/c/{conversation_id}", wait_until='load', timeout=60000)
        page.wait_for_function(
            "() => window.__mount.mountMs !== null", timeout=60000
        )
        rendered = message_count(page)
        if rendered < min_mount_messages:
            raise SystemExit(
                f'seed failed: expected at least {min_mount_messages} messages '
                f'at mount, rendered {rendered}'
            )

        mount = page.evaluate("() => window.__mount.mountMs")
        results['phases']['mount'] = {
            'mountMs': round(mount, 1),
            'longTasks': phase_longtasks(page),
            'domNodesInTranscript': transcript_nodes(page),
            'messagesRendered': message_count(page),
            'heapMB': heap_mb(page),
        }

        # Phase: streaming one new reply through the demo adapter.
        composer = page.get_by_role('textbox').last
        composer.click()
        composer.fill('Summarize how branch switching works in two paragraphs')
        page.evaluate("() => window.__lt.reset()")
        page.keyboard.press('Enter')
        frames = page.evaluate(FRAME_SAMPLER, 6000)
        streamed = phase_longtasks(page)
        sorted_frames = sorted(frames)
        results['phases']['stream'] = {
            'longTasks': streamed,
            'frameCount': len(frames),
            'medianFrameMs': round(sorted_frames[len(sorted_frames) // 2], 1),
            'p95FrameMs': round(sorted_frames[int(len(sorted_frames) * 0.95)], 1),
            'maxFrameMs': round(sorted_frames[-1], 1),
            'messagesRendered': message_count(page),
            'domNodesInTranscript': transcript_nodes(page),
            'heapMB': heap_mb(page),
        }

        # Phase: walk upward through the history in 700px steps.
        page.evaluate("() => window.__lt.reset()")
        for _ in range(40):
            page.evaluate(
                "() => { const el = document.querySelector('[role=\"log\"]');"
                ' if (!el) return; el.scrollTop = Math.max(0, el.scrollTop - 700); }'
            )
            time.sleep(0.12)
        time.sleep(1.0)
        results['phases']['scroll'] = {
            'longTasks': phase_longtasks(page),
            'messagesRendered': message_count(page),
            'domNodesInTranscript': transcript_nodes(page),
            'heapMB': heap_mb(page),
        }

        context.close()
        browser.close()
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://localhost:4173')
    parser.add_argument('--messages', type=int, default=600)
    parser.add_argument(
        '--min-mount-messages',
        type=int,
        default=None,
        help='minimum messages expected in the DOM after mount '
        '(default: --messages; pass a lower value when transcript '
        'windowing intentionally mounts only a tail window)',
    )
    parser.add_argument('--label', default='run')
    parser.add_argument('--out', default=None)
    args = parser.parse_args()

    minimum = (
        args.min_mount_messages if args.min_mount_messages is not None
        else args.messages
    )
    result = run(args.url, args.messages, args.label, minimum)
    text = json.dumps(result, indent=2)
    print(text)
    if args.out:
        with open(args.out, 'w', encoding='utf-8') as handle:
            handle.write(text)


if __name__ == '__main__':
    main()
