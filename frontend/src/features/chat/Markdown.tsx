import { memo, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Check, Copy } from 'lucide-react'

/**
 * Markdown rendering for message content: GFM tables and lists, fenced code
 * with syntax highlighting and a copy button, safe outbound links, and
 * horizontally scrollable code/tables. Raw HTML is not enabled — it is
 * stripped by react-markdown's default pipeline.
 */

function CodePre({ children, ...props }: ComponentPropsWithoutRef<'pre'>) {
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    const text = ref.current?.textContent ?? ''
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  return (
    <div className="group relative my-3">
      <pre
        ref={ref}
        className="overflow-x-auto rounded-xl bg-[var(--c-code-bg)] p-4 font-mono text-[13px] leading-relaxed text-ink"
        {...props}
      >
        {children}
      </pre>
      <button
        type="button"
        aria-label="Copy code"
        onClick={() => void handleCopy()}
        className="absolute right-2 top-2 rounded-lg border border-line bg-overlay p-1.5 text-ink-soft opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
      >
        {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
      </button>
    </div>
  )
}

function SafeLink({ href, children }: ComponentPropsWithoutRef<'a'>) {
  if (typeof href === 'string' && /^https?:\/\//i.test(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="break-words text-accent underline underline-offset-2 hover:text-accent-strong"
      >
        {children}
      </a>
    )
  }
  // Non-http schemes are rendered inert instead of navigating.
  return <span className="text-ink-soft">{children}</span>
}

const components = {
  pre: CodePre,
  a: SafeLink,
  code: ({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) => {
    if (className?.includes('language-')) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      )
    }
    return (
      <code
        className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[0.88em] text-ink"
        {...props}
      >
        {children}
      </code>
    )
  },
  table: ({ children }: { children?: ReactNode }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border-b border-line bg-subtle px-3 py-2 text-left font-semibold text-ink">
      {children}
    </th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border-b border-line px-3 py-2 align-top text-ink">{children}</td>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="my-3 list-disc space-y-1.5 pl-6 text-ink">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-6 text-ink">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="my-3 leading-[1.7] first:mt-0 last:mb-0">{children}</p>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mb-2 mt-5 text-lg font-semibold tracking-tight text-ink first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mb-1.5 mt-4 text-[15px] font-semibold text-ink first:mt-0">{children}</h3>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="my-3 border-l-2 border-line-strong pl-3 text-ink-soft">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-line" />,
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
}

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="min-w-0 text-[15px] text-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true }]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})
