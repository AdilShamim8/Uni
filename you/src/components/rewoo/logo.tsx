"use client";

import { cn } from "@/lib/utils";

/** ReWoo wordmark — a quiet, precise mark. No gradients, no glow. */
export function ReWooMark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-[7px] bg-primary text-primary-foreground font-semibold select-none", className)}
      style={{ width: size, height: size, fontSize: size * 0.56, lineHeight: 1 }}
      aria-hidden="true"
    >
      R
    </span>
  );
}

export function ReWooWordmark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <ReWooMark size={size} />
      <span className="font-semibold tracking-tight" style={{ fontSize: size * 0.82 }}>
        ReWoo
      </span>
    </span>
  );
}
