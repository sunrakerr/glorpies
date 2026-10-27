'use client';

import { Check, Palette } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { FULL_LOOKS, LOOKS, lookOf, SMALL_LOOKS, type Look, type LookId } from 'glorpies/internal/looks';
import { cachedThumb, paintThumb } from 'glorpies/internal/studio';
import { ThumbSkeleton } from './Loading';

/** One size for every preview, so the gallery picker and the viewer strip share a cache. */
const THUMB_PX = 168;

/** A face rendered small in one style; painted once, then drawn from the cache. */
export function LookThumb({ seed, look }: { seed: number; look: LookId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const show = (src: HTMLCanvasElement) => {
      const c = ref.current;
      if (!c) return;
      c.width = c.height = THUMB_PX;
      c.getContext('2d')?.drawImage(src, 0, 0, THUMB_PX, THUMB_PX);
      setReady(true);
    };
    const hit = cachedThumb(seed, look, THUMB_PX);
    if (hit) {
      show(hit);
      return;
    }
    setReady(false);
    const job = paintThumb(seed, look, THUMB_PX);
    job.promise.then(show, () => {});
    return job.cancel;
  }, [seed, look]);

  return (
    <>
      <canvas ref={ref} className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`} />
      {!ready && <ThumbSkeleton />}
    </>
  );
}

type TileProps = { seed: number; look: Look; selected: boolean; marked?: boolean; compact?: boolean; onSelect: () => void };

function LookTile({ seed, look, selected, marked = false, compact = false, onSelect }: TileProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={look.name}
      title={compact ? look.name : look.note}
      onClick={onSelect}
      data-look={look.id}
      className={`group/tile flex shrink-0 flex-col items-center gap-1.5 text-center outline-none ${compact ? 'w-14 snap-center sm:w-16' : 'w-full'}`}
    >
      <span
        className={`relative block aspect-square w-full overflow-hidden rounded-[4px] bg-paper-2/60 shadow-sheet transition duration-300 ease-soft group-focus-visible/tile:ring-2 group-focus-visible/tile:ring-accent ${
          selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-paper' : 'group-hover/tile:-translate-y-0.5 group-hover/tile:shadow-sheet-lift'
        }`}
      >
        <LookThumb seed={seed} look={look.id} />
        {selected && (
          <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-accent text-paper shadow-pill">
            <Check className="size-2.5" strokeWidth={3} />
          </span>
        )}
      </span>
      {compact ? (
        <span aria-hidden className={`size-1 rounded-full transition ${marked ? 'bg-ink/35' : 'bg-transparent'}`} />
      ) : (
        <span className={`line-clamp-2 text-[11px] leading-tight transition ${selected ? 'font-medium text-ink' : 'text-ink-2 group-hover/tile:text-ink'}`}>{look.name}</span>
      )}
    </button>
  );
}

/** Full styles for faces shown large; small ones for avatars, which still read at 16px. */
const GROUPS = [
  { title: 'Paintings', looks: FULL_LOOKS },
  { title: 'Avatars', looks: SMALL_LOOKS },
];

type PickerProps = { seed: number | undefined; value: LookId; onChange: (look: LookId) => void };

/** The gallery's style: a button in the control pill that opens a sheet of previews above it. */
export function StylePicker({ seed, value, onChange }: PickerProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const current = lookOf(value);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    root.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  // the panel is placed against the control pill (its backdrop filter makes it the containing block), so it centres on the
  // pill; it is opaque because a backdrop blur cannot see past the pill's own
  return (
    <div ref={root}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Style: ${current.name}`}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-9 max-w-[11rem] items-center gap-2 rounded-full px-3 text-[13px] font-medium text-ink/80 transition duration-200 hover:bg-ink/[0.07] hover:text-ink active:scale-[0.98] ${open ? 'bg-ink/[0.07] text-ink' : ''}`}
      >
        <Palette className="size-[16px] shrink-0" strokeWidth={1.8} />
        <span className="hidden truncate sm:inline">{current.name}</span>
      </button>

      {open && seed !== undefined && (
        <div
          role="dialog"
          aria-label="Choose a style"
          className="picker-in absolute bottom-full left-1/2 mb-3 w-[min(calc(100vw-2rem),35rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-pill"
        >
          <div className="flex items-baseline justify-between gap-3 px-5 pb-2 pt-4">
            <h2 className="font-display text-lg font-medium">Style</h2>
            <p className="truncate text-[12px] text-ink-2">{current.note}</p>
          </div>
          <div className="max-h-[min(58dvh,26rem)] overflow-y-auto overscroll-contain px-5 pb-5 pt-2">
            {GROUPS.map((g) => (
              <section key={g.title} className="mb-5 last:mb-0">
                <h3 className="mb-2.5 text-[11px] uppercase tracking-[0.12em] text-ink-2">{g.title}</h3>
                <div className="grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-6">
                  {g.looks.map((l) => (
                    <LookTile key={l.id} seed={seed} look={l} selected={l.id === value} onSelect={() => onChange(l.id)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type StripProps = { seed: number; value: LookId; gallery: LookId; onChange: (look: LookId) => void };

/** One face's style in the viewer: a strip of that face in every style. The dot marks the gallery's style. */
export function LookStrip({ seed, value, gallery, onChange }: StripProps) {
  const strip = useRef<HTMLDivElement>(null);
  const current = lookOf(value);

  useEffect(() => {
    strip.current?.querySelector(`[data-look="${value}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [value, seed]);

  return (
    <div className="flex w-full max-w-[min(94vw,760px)] flex-col items-center gap-2">
      <p className="text-[12px] text-ink-2">
        <span className="font-display text-[14px] font-medium text-ink">{current.name}</span>
        <span className="mx-2 opacity-50">·</span>
        {value === gallery ? 'gallery style' : 'just this face'}
      </p>
      <div
        ref={strip}
        role="group"
        aria-label="Style for this face"
        className="strip-fade flex w-full snap-x gap-2.5 overflow-x-auto overscroll-x-contain px-6 pb-1 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {LOOKS.map((l, i) => (
          <Fragment key={l.id}>
            {i > 0 && l.size !== LOOKS[i - 1]!.size && <span aria-hidden className="mx-1 my-3 w-px shrink-0 self-stretch bg-ink/12" />}
            <LookTile seed={seed} look={l} compact selected={l.id === value} marked={l.id === gallery} onSelect={() => onChange(l.id)} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
