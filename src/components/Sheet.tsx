import type { CSSProperties, ReactNode } from 'react';

/** Muted washi colours; each sheet picks one from its seed so a face keeps its tape. */
const TAPES = ['#e6c79c', '#c9dccd', '#efc3bb', '#d5d0ec', '#f1d98f', '#c6d9e6', '#e9d5c1', '#f3b9a2'];

function rng(seed: number) {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Strip = { style: CSSProperties };

type Pattern = { image: string; size: string };

function tapeFor(seed: number): { color: string; pattern: Pattern; strips: Strip[] } {
  const r = rng(seed);
  const color = TAPES[Math.floor(r() * TAPES.length)]!;
  const roll = r();
  const pattern: Pattern =
    roll < 0.3 ? { image: 'repeating-linear-gradient(90deg, rgb(255 255 255 / 0.38) 0 5px, transparent 5px 11px)', size: 'auto' }
    : roll < 0.45 ? { image: 'radial-gradient(rgb(255 255 255 / 0.5) 1.2px, transparent 1.6px)', size: '9px 9px' }
    : { image: 'none', size: 'auto' };
  if (r() < 0.62) {
    return {
      color, pattern,
      strips: [{ style: { left: `${42 + r() * 16}%`, top: '-0.7rem', width: '38%', transform: `translateX(-50%) rotate(${(r() - 0.5) * 12}deg)` } }],
    };
  }
  const lean = 34 + r() * 10;
  return {
    color, pattern,
    strips: [
      { style: { left: '-0.9rem', top: '0.55rem', width: '30%', transform: `rotate(${-lean}deg)` } },
      { style: { right: '-0.9rem', top: '0.55rem', width: '30%', transform: `rotate(${lean + (r() - 0.5) * 8}deg)` } },
    ],
  };
}

/** A square sketch pinned to the wall with washi tape; the lower corners lift off the page. */
export function Sheet({ seed, tilt = 0, className = '', children }: { seed: number; tilt?: number; className?: string; children: ReactNode }) {
  const tape = tapeFor(seed);
  return (
    <div className={`sheet ${className}`} style={{ '--tilt': `${tilt}deg` } as CSSProperties}>
      {children}
      {tape.strips.map((s, i) => (
        <span
          key={i}
          aria-hidden
          className="tape"
          style={{
            ...s.style,
            backgroundColor: tape.color,
            backgroundImage: `var(--tape-sheen), ${tape.pattern.image}`,
            backgroundSize: `auto, ${tape.pattern.size}`,
          }}
        />
      ))}
    </div>
  );
}
