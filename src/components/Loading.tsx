/** Loading states in the faces' own hand: a graphite face sketching itself, and a brush over a face being repainted. */

/** Strokes of the underdrawing, in the order a hand would put them down. */
const SKETCH = [
  'M47 16.6c18-1.6 31 12 31.6 30 .5 20-12 37.6-29 37.6-17.6 0-29.2-15-29.2-35C20.4 31 31 17.6 50 16.3c4 0 7 .8 9.6 2',
  'M29.5 32c6.5-6.6 14.5-9.6 22.5-8.6 9 1 15.4 5.2 19.4 10.6',
  'M34.8 47.2a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0-6.8 0',
  'M58.4 47.2a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0-6.8 0',
  'M50.6 50.4c-1.6 4-2.6 7-.6 8.6 1 .6 2.4.4 3.4-.3',
  'M40.6 66.2c4.4 4 13.4 4.4 18.4-.6',
] as const;

export function FaceSkeleton({ caption }: { caption?: string }) {
  return (
    <div className="skeleton absolute inset-0 overflow-hidden" aria-hidden>
      <div className="skeleton-wash absolute -inset-1/4" />
      <svg className="skeleton-sketch absolute inset-0 m-auto h-[62%] w-[62%] text-ink-2" viewBox="0 0 100 100" fill="none">
        <circle className="skeleton-blush" cx="33" cy="58" r="5.5" />
        <circle className="skeleton-blush" cx="67" cy="58" r="5.5" />
        {SKETCH.map((d, i) => (
          <path key={i} d={d} pathLength={1} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: `${i * 0.22}s` }} />
        ))}
      </svg>
      {caption && <Caption text={caption} className="bottom-[7%]" />}
    </div>
  );
}

/** Laid over a face that is still showing its old style while the new one paints. */
export function Restyling({ caption }: { caption?: string }) {
  return (
    <div className="restyling absolute inset-0 overflow-hidden" aria-hidden>
      <div className="restyling-brush absolute inset-0" />
      {caption && <Caption text={caption} className="bottom-4" />}
    </div>
  );
}

/** A quiet placeholder for the small style previews. */
export function ThumbSkeleton() {
  return (
    <span className="skeleton absolute inset-0 overflow-hidden" aria-hidden>
      <span className="skeleton-wash absolute -inset-1/4" />
      <span className="skeleton-shimmer absolute inset-0" />
    </span>
  );
}

function Caption({ text, className }: { text: string; className: string }) {
  return (
    <span className={`absolute inset-x-0 flex justify-center ${className}`}>
      <span className="flex items-center gap-2 rounded-full bg-paper/85 px-3 py-1.5 font-display text-[13px] text-ink-2 shadow-pill backdrop-blur-sm">
        <span className="skeleton-nib size-1.5 rounded-full bg-accent" />
        {text}
      </span>
    </span>
  );
}
