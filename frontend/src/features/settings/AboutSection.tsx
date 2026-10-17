import { Ghost, HardDrive, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/Tooltip'

const ATTRIBUTIONS = [
  'React, React Router, Vite, zustand, react-markdown, remark-gfm, Vitest, Testing Library — MIT',
  'rehype-highlight — MIT · highlight.js — BSD-3-Clause',
  'lucide-react — ISC',
  'Tailwind CSS — MIT',
]

export function AboutSection() {
  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Local persistence">
        <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
          <HardDrive size={14} />
          Where your data lives
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Conversations, preferences, and provider profiles are stored in this
          browser's <code className="rounded bg-subtle px-1 font-mono text-xs">localStorage</code>{' '}
          under a versioned key. Nothing leaves your device: this build makes no
          network requests to any provider and includes no analytics, accounts,
          or backend. Unreadable saved data is quarantined locally and a fresh
          demo workspace is created rather than crashing.
        </p>
      </section>

      <section aria-label="Temporary chats">
        <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
          <Ghost size={14} />
          Temporary chats
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Conversations marked temporary live in memory only and disappear on
          reload. They are filtered out of every save, export, and backup write.
        </p>
      </section>

      <section aria-label="Demo behavior">
        <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
          <ShieldCheck size={14} />
          What is simulated
        </h3>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-ink-soft">
          <p>
            Responses come from a deterministic local demo adapter. Streaming,
            sources, progress steps, and connection tests are all simulated and
            labeled as such. Attachments are validated and previewed locally but
            never analyzed. Tool availability reflects a capability registry on
            the selected demo model — never an API key.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="warning">Working local UI</Badge>
            <Badge tone="warning">Labeled simulations</Badge>
            <Badge tone="warning">Deferred integrations</Badge>
          </div>
        </div>
      </section>

      <section aria-label="Independence and attribution">
        <h3 className="text-sm font-medium text-ink">Independence and attribution</h3>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-ink-soft">
          <p>
            Universe is an independent, open-source project. It is not
            affiliated with, endorsed by, or connected to OpenAI or Anthropic;
            provider names appear in settings only as configuration concepts.
          </p>
          <p>
            New original code in this milestone is offered under the MIT license
            (see <code className="rounded bg-subtle px-1 font-mono text-xs">frontend/LICENSE</code>).
            Third-party dependencies keep their own licenses:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {ATTRIBUTIONS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
