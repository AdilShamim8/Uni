"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

/** Markdown renderer tuned for chat content (`.rewoo-prose` styles in globals.css). */
export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="rewoo-prose text-[0.94rem]">
      <ReactMarkdown
        components={{
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
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
