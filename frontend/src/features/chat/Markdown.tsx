import {
  memo,
  useRef,
  useState,
  isValidElement,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'
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

/** Extracts the fenced-code language from the child <code> element's class. */
function getCodeLanguage(children: ReactNode): string | undefined {
  const child = Array.isArray(children) ? children.find(isValidElement) : children
  if (!isValidElement(child)) return undefined
  const className = (child.props as { className?: string }).className ?? ''
  const match = /language-([\w+#-]+)/.exec(className)
  return match?.[1]
}

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

  // Derive the language label from the highlighted code element.
  const language = getCodeLanguage(children)

  return (
    <figure className="group relative my-3">
      <figcaption
        className="flex items-center justify-between rounded-t-group border border-b-0 border-line bg-subtle px-3.5 py-1.5"
      >
        <span className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">
          {language ?? 'code'}
        </span>
        <button
          type="button"
          aria-label="Copy code"
          onClick={() => void handleCopy()}
          className="rounded-md p-1 text-ink-faint transition-colors hover:bg-raised hover:text-ink focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        >
          {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
        </button>
      </figcaption>
      <pre
        ref={ref}
        className="overflow-x-auto rounded-b-group bg-[var(--c-code-bg)] p-4 font-mono text-[13px] leading-relaxed text-ink"
        {...props}
      >
        {children}
      </pre>
    </figure>
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
    <div className="my-3 overflow-x-auto rounded-group border border-line">
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
    <blockquote className="my-3 border-l-2 border-accent/50 pl-3.5 text-ink-soft">
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
    <div className="min-w-0 text-[16px] text-ink">
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
