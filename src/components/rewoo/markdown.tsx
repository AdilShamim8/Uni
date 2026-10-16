"use client";

import { memo, useCallback, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** GitHub-style tables, strikethrough, task lists, autolinks. */

function CopyButton({ getText, className }: { getText: () => string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }, [getText]);
  return (
    <button
      type="button"
      onClick={onCopy}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground",
        className
      )}
      aria-label="Copy to clipboard"
      title="Copy"
    >
      {copied ? <Check className="size-3.5 text-emerald-500" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
    </button>
  );
}

/** Extracts the raw text from markdown children for copy actions. */
function nodeToText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (typeof node === "object" && "props" in (node as unknown as Record<string, unknown>)) {
    const props = (node as unknown as { props?: { children?: ReactNode } }).props;
    return nodeToText(props?.children);
  }
  return "";
}

/** Code block with a header bar: language label + copy button. */
function CodeBlock({ className, children, ...rest }: React.HTMLAttributes<HTMLElement> & { children?: ReactNode }) {
  const lang = /language-(\w+)/.exec(className ?? "")?.[1] ?? "text";
  const codeEl = Array.isArray(children) ? children[0] : children;
  const raw = nodeToText(children);
  return (
    <div className="code-block group/code my-3 overflow-hidden rounded-xl border border-border bg-[--code-bg]">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{lang}</span>
        <CopyButton getText={() => raw} className="size-6 opacity-0 transition-opacity group-hover/code:opacity-100 focus-visible:opacity-100" />
      </div>
      <pre
        {...rest}
        className={cn("rewoo-scroll overflow-x-auto p-3.5 text-[0.84rem] leading-relaxed", className)}
      >
        {codeEl}
      </pre>
    </div>
  );
}

/** Markdown renderer tuned for chat content (`.rewoo-prose` styles in globals.css). */
export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="rewoo-prose text-[0.94rem]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          pre: ({ children, ...props }) => (
            <CodeBlock {...(props as React.HTMLAttributes<HTMLElement>)}>{children}</CodeBlock>
          ),
          code: ({ className, children, ...props }) => {
            // Inline code (no language class) renders as a chip.
            if (!/language-/.test(className ?? "")) {
              return (
                <code
                  className="rounded-[5px] border border-border/60 bg-muted px-[0.35em] py-[0.12em] font-mono text-[0.85em]"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={cn("hljs", className)} {...props}>
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="rewoo-scroll my-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-[0.88rem]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border bg-muted/60 px-3 py-2 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => <td className="border-b border-border/60 px-3 py-2 align-top">{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});

export function StreamingDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 py-2", className)} aria-label="Generating">
      <span className="rewoo-stream-dot size-1.5 rounded-full bg-foreground" />
      <span className="rewoo-stream-dot size-1.5 rounded-full bg-foreground" />
      <span className="rewoo-stream-dot size-1.5 rounded-full bg-foreground" />
    </span>
  );
}
