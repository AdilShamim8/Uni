// Animated Bot avatar: a luminous orb creature whose face and motion reflect what it's doing.
// States: idle · thinking · reading · working · writing · waiting · done · oops
import { useId } from "react";

function shade(hex: string, amt: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c: number) => (amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `#${[f(r), f(g), f(b)].map(clamp).map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const MOUTHS: Record<string, string> = {
  idle: "M40 66 Q50 72 60 66",
  thinking: "M44 68 Q50 66 56 68",
  reading: "M43 67 Q50 70 57 67",
  working: "M42 66 Q50 71 58 66",
  writing: "M44 67 Q50 70 56 67",
  waiting: "M46 67 Q50 71 54 67 Q50 63 46 67",
  done: "M38 63 Q50 78 62 63",
  oops: "M42 70 Q50 64 58 70",
};

export function BotOrb({ color = "#7c5cff", state = "idle", size = 44, emoji, title }:
  { color?: string; state?: string; size?: number; emoji?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  const s = MOUTHS[state] ? state : "working";
  return (
    <span className={`orb ${s}`} style={{ width: size, height: size, ["--c" as any]: color }} title={title} role="img" aria-label={title || "Bot"}>
      <span className="halo" />
      <span className="ring" />
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <defs>
          <radialGradient id={`g${id}`} cx="36%" cy="30%" r="78%">
            <stop offset="0" stopColor={shade(color, 0.55)} />
            <stop offset="0.55" stopColor={color} />
            <stop offset="1" stopColor={shade(color, -0.45)} />
          </radialGradient>
        </defs>
        <g className="body">
          <circle cx="50" cy="54" r="40" fill={`url(#g${id})`} />
          <ellipse cx="36" cy="34" rx="12" ry="7" fill="#fff" opacity="0.28" transform="rotate(-24 36 34)" />
          <ellipse cx="32" cy="64" rx="6" ry="3.5" fill="#ff9ec0" opacity="0.45" />
          <ellipse cx="68" cy="64" rx="6" ry="3.5" fill="#ff9ec0" opacity="0.45" />
          <g className="eyes">
            <ellipse cx="38" cy="50" rx="7.5" ry="9.5" fill="#fff" />
            <ellipse cx="62" cy="50" rx="7.5" ry="9.5" fill="#fff" />
            <g className="pupils">
              <circle cx="39" cy="52" r={s === "done" ? 3.2 : 4} fill="#120d24" />
              <circle cx="63" cy="52" r={s === "done" ? 3.2 : 4} fill="#120d24" />
              <circle cx="40.5" cy="50" r="1.3" fill="#fff" />
              <circle cx="64.5" cy="50" r="1.3" fill="#fff" />
            </g>
          </g>
          <path className="mouth" d={MOUTHS[s]} fill={s === "done" ? "#120d24" : "none"} stroke="#120d24" strokeWidth="3.4" strokeLinecap="round" />
          {s === "thinking" && (
            <g fill="#fff" opacity="0.9">
              <circle cx="84" cy="22" r="3"><animate attributeName="opacity" values=".2;1;.2" dur="1.2s" repeatCount="indefinite" /></circle>
              <circle cx="92" cy="12" r="4"><animate attributeName="opacity" values=".2;1;.2" dur="1.2s" begin=".2s" repeatCount="indefinite" /></circle>
            </g>
          )}
          {s === "done" && <text x="80" y="24" fontSize="16">✨</text>}
          {s === "oops" && <text x="78" y="30" fontSize="14">💧</text>}
        </g>
      </svg>
      {emoji && size >= 40 && (
        <span style={{ position: "absolute", right: -4, bottom: -4, fontSize: Math.max(12, size * 0.3), lineHeight: 1, filter: "drop-shadow(0 2px 3px rgba(0,0,0,.4))" }}>{emoji}</span>
      )}
    </span>
  );
}

export function stateOf(b?: { activity?: { state?: string; live?: boolean } }): string {
  const st = b?.activity?.live ? b.activity.state || "working" : "idle";
  return st === "running" ? "working" : st;
}
