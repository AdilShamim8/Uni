"use client";

import { cn } from "@/lib/utils";

/** YOU wordmark — a quiet, precise mark. No gradients, no glow. */
export function YouMark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-[7px] bg-primary text-primary-foreground font-semibold select-none", className)}
      style={{ width: size, height: size, fontSize: size * 0.56, lineHeight: 1 }}
      aria-hidden="true"
    >
      Y
    </span>
  );
}

export function YouWordmark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <YouMark size={size} />
      <span className="font-semibold tracking-tight" style={{ fontSize: size * 0.82 }}>
        YOU
      </span>
    </span>
  );
}
