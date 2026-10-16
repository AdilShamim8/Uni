"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * ReWoo mark — an original glyph: a geometric "R" drawn as workflow strokes,
 * with an orbiting agent node. Rendered inline so it stays crisp at any size
 * and works as the assistant avatar.
 */
export function ReWooMark({ className, size = 22 }: { className?: string; size?: number }) {
  const gradId = useId();
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("shrink-0 rounded-[24%] select-none", className)}
      role="img"
      aria-label="ReWoo"
    >
      <defs>
        <linearGradient id={gradId} x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6D6BF6" />
          <stop offset="0.52" stopColor="#5A54F0" />
          <stop offset="1" stopColor="#06B0D4" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="15.5" fill={`url(#${gradId})`} />
      <path
        d="M25 47.5 V15 H35 a6.4 6.4 0 0 1 0 12.8 H29.9"
        fill="none" stroke="#FFFFFF" strokeWidth="5.6" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M34.1 27.8 L45 47.5"
        fill="none" stroke="#FFFFFF" strokeWidth="5.6" strokeLinecap="round"
      />
      <path
        d="M43.8 15.1 A7.5 7.5 0 0 1 48.4 9.9"
        fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="2.1" strokeLinecap="round"
      />
      <circle cx="51" cy="17" r="4.1" fill="#C9FBFF" />
    </svg>
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
