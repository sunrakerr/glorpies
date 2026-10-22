'use client';

import { Check, Copy, Download, Eye, EyeOff, Shuffle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Engine } from '@/lib/engine';
import { loadEngine } from '@/lib/engine';
import type { Face } from '@/lib/face/types';
import { PAINTS } from '@/lib/paints';
import { faceFor, newSeed } from '@/lib/studio';
import { renderStyle, STYLES, type StyleId } from '@/lib/styles';
import { IconButton, Pill, ToastView, useToast } from './ui';

type Entry = { id: string; name: string; note: string; render: (face: Face, E: Engine, px: number) => HTMLCanvasElement };

const GROUPS: { group: string; items: Entry[] }[] = [
  {
    group: 'Original & first experiments',
    items: STYLES.map((s) => ({ ...s, render: (face: Face, E: Engine, px: number) => renderStyle(s.id as StyleId, face, E, px) })),
  },
  ...PAINTS,
];

const ALL = GROUPS.flatMap((g) => g.items);
const APPROVED_KEY = 'faces:lab-approved';

declare global {
  interface Window {
    /** Renders one face in one style, for exporting comparison sheets. */
    __lab?: { render: (seed: number, style: string, px: number) => Promise<string> };
  }
}

/** The export, in catalogue order so the list reads the same however styles were ticked. */
function exportText(approved: Set<string>) {
  const picked = ALL.filter((s) => approved.has(s.id));
  return JSON.stringify({ approved: picked.map((s) => s.id), names: picked.map((s) => s.name) }, null, 2);
}

/** Unlinked scratch page comparing the same wobbly faces across art styles, with approvals to export. */
export function Lab() {
  const [seeds, setSeeds] = useState<number[]>([]);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [onlyApproved, setOnlyApproved] = useState(false);
  const { toast, show } = useToast();

  useEffect(() => {
    const q = new URLSearchParams(location.search).get('seeds');
    const parsed = q?.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0) ?? [];
    setSeeds(parsed.length ? parsed : [newSeed(), newSeed(), newSeed()]);
    try {
      const saved = JSON.parse(localStorage.getItem(APPROVED_KEY) ?? '[]') as unknown;
      if (Array.isArray(saved)) setApproved(new Set(saved.filter((x): x is string => typeof x === 'string')));
    } catch {
      // a corrupt entry just means starting over
    }
    window.__lab = {
      render: async (seed, style, px) => {
        const E = await loadEngine();
        const entry = ALL.find((s) => s.id === style);
        if (!entry) throw new Error(`unknown style ${style}`);
        const face = faceFor(seed, E);
        E.noiseSeed(face.seed);
        return entry.render(face, E, px).toDataURL('image/png');
      },
    };
  }, []);

  const update = (next: Set<string>) => {
    setApproved(next);
    localStorage.setItem(APPROVED_KEY, JSON.stringify([...next]));
  };

  const toggle = (id: string) => {
    const next = new Set(approved);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportText(approved));
      show(`Copied ${approved.size} approved style${approved.size === 1 ? '' : 's'}`, 'ok');
    } catch {
      show('Couldn’t reach the clipboard — try Download', 'error');
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([exportText(approved)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'approved-styles.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    show('approved-styles.json saved', 'ok');
  };

  return (
    <div className="relative z-10 min-h-dvh">
      <main className="mx-auto max-w-[1400px] px-5 pb-32 pt-10 sm:px-8">
        {GROUPS.map((g) => {
          const items = onlyApproved ? g.items.filter((s) => approved.has(s.id)) : g.items;
          if (!items.length) return null;
          return (
            <div key={g.group} className="mb-16">
              <h2 className="mb-6 border-b border-ink/10 pb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-2">{g.group}</h2>
              <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((s) => {
                  const on = approved.has(s.id);
                  return (
                    <section key={s.id} className={`-m-3 rounded-[10px] p-3 transition duration-300 ${on ? 'bg-clay/[0.07] ring-1 ring-clay/40' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-display text-2xl italic">{s.name}</h3>
                          <p className="mb-3 text-[13px] text-ink-2">{s.note}</p>
                        </div>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          aria-label={`Approve ${s.name}`}
                          onClick={() => toggle(s.id)}
                          className={`mt-1 grid size-8 shrink-0 place-items-center rounded-full border transition duration-200 active:scale-95 ${on ? 'border-clay bg-clay text-paper shadow-pill' : 'border-ink/20 text-transparent hover:border-ink/40 hover:text-ink/30'}`}
                        >
                          <Check className="size-4" strokeWidth={2.6} />
                        </button>
                      </div>
                      <div className="grid cursor-pointer grid-cols-3 gap-2" onClick={() => toggle(s.id)}>
                        {seeds.map((seed) => <Tile key={seed} seed={seed} entry={s} />)}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          );
        })}
        {onlyApproved && approved.size === 0 && (
          <p className="py-24 text-center font-display text-xl italic text-ink-2">Nothing approved yet — tick the styles you like.</p>
        )}
      </main>

      <nav aria-label="Approvals" className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center">
        <Pill className="pointer-events-auto">
          <span className="px-3 text-[13px] font-medium tabular-nums text-ink">
            {approved.size} <span className="text-ink-2">of {ALL.length} approved</span>
          </span>
          <span className="mx-0.5 h-5 w-px bg-ink/10" aria-hidden />
          <IconButton label={onlyApproved ? 'Show all styles' : 'Show approved only'} onClick={() => setOnlyApproved((v) => !v)} aria-pressed={onlyApproved}>
            {onlyApproved ? <EyeOff className="size-[17px]" strokeWidth={1.8} /> : <Eye className="size-[17px]" strokeWidth={1.8} />}
          </IconButton>
          <IconButton label="New faces" onClick={() => setSeeds([newSeed(), newSeed(), newSeed()])}>
            <Shuffle className="size-[17px]" strokeWidth={1.8} />
          </IconButton>
          <span className="mx-0.5 h-5 w-px bg-ink/10" aria-hidden />
          <IconButton label="Copy approved list" onClick={copy} disabled={!approved.size}>
            <Copy className="size-[17px]" strokeWidth={1.8} />
          </IconButton>
          <IconButton label="Download approved list" onClick={download} disabled={!approved.size}>
            <Download className="size-[17px]" strokeWidth={1.8} />
          </IconButton>
          <IconButton label="Clear approvals" onClick={() => update(new Set())} disabled={!approved.size}>
            <X className="size-[17px]" strokeWidth={1.8} />
          </IconButton>
        </Pill>
      </nav>
      <ToastView toast={toast} />
    </div>
  );
}

function Tile({ seed, entry }: { seed: number; entry: Entry }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    // tiles render one per task so the page stays responsive while three dozen styles paint
    const t = setTimeout(() => {
      loadEngine().then((E) => {
        if (!live || !ref.current) return;
        const face = faceFor(seed, E);
        E.noiseSeed(face.seed);
        const c = entry.render(face, E, 360);
        c.className = 'block aspect-square w-full rounded-[3px] shadow-sheet';
        ref.current.replaceChildren(c);
      });
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [seed, entry]);
  return <div ref={ref} className="aspect-square rounded-[3px] bg-paper-2/50" />;
}
