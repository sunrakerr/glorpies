'use client';

import { Braces, ChevronLeft, ChevronRight, Code, Copy, FileCode, ImageDown, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { seedOf } from 'fuglios';
import { lookOf, type LookId } from 'fuglios/internal/looks';
import { EXPORT_SIZES } from '@/lib/share';
import { PRIORITY } from 'fuglios/internal/studio';
import { trueName } from '@/lib/glyphs';
import type { ActionKind } from './actions';
import { FaceCanvas } from './FaceCanvas';
import { FaceSpec } from './FaceSpec';
import { LookStrip } from './LookPicker';
import { Sheet } from './Sheet';
import { TextButton } from './ui';

type Props = {
  names: string[];
  index: number | null;
  /** The gallery's style, and the style a given face is shown in. */
  look: LookId;
  lookFor: (name: string) => LookId;
  onLook: (name: string, look: LookId) => void;
  pngSize: number;
  onPngSize: (px: number) => void;
  onIndex: (i: number) => void;
  onClose: () => void;
  onRepaint: (i: number) => void;
  onAction: (kind: ActionKind, name: string) => void;
  /** Toasts must render inside the modal: it sits in the top layer above the page. */
  children?: ReactNode;
};

export function Viewer({ names, index, look, lookFor, onLook, pngSize, onPngSize, onIndex, onClose, onRepaint, onAction, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = index !== null;
  const name = index === null ? null : names[index] ?? null;
  const seed = name === null ? null : seedOf(name);
  const faceLook = name === null ? look : lookFor(name);
  /** The integration panel stays open from face to face once asked for. */
  const [spec, setSpec] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const go = (step: number) => {
    if (index === null || !names.length) return;
    onIndex((index + step + names.length) % names.length);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || name === null || index === null) return;
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'c') onAction('copy', name);
    else if (e.key === 'r') onRepaint(index);
    else if (e.key === 'u') setSpec((v) => !v);
    else return;
    e.preventDefault();
  };

  return (
    <dialog ref={ref} className="viewer" onClose={onClose} onKeyDown={onKey} aria-label="Face">
      {name !== null && seed !== null && index !== null && (
        <div
          // take initial focus so the close button doesn't open with a focus ring
          tabIndex={-1}
          autoFocus
          className={`relative flex h-full w-full flex-col items-center justify-center gap-5 px-4 py-6 outline-none transition-[padding] duration-500 ease-soft sm:gap-6 sm:py-10 ${spec ? 'lg:pr-[420px]' : ''}`}
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid size-10 place-items-center rounded-full text-ink/70 transition hover:bg-ink/[0.07] hover:text-ink sm:right-6 sm:top-6"
          >
            <X className="size-5" strokeWidth={1.8} />
          </button>

          <div className="flex w-full items-center justify-center gap-3 sm:gap-8" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <NavButton label="Previous face" onClick={() => go(-1)}><ChevronLeft className="size-5" strokeWidth={1.8} /></NavButton>
            <Sheet seed={seed} tilt={-0.5} className="w-[min(90vw,calc(100dvh-21rem),760px)]">
              <div className="relative aspect-square w-full overflow-hidden bg-paper-2/50">
                <FaceCanvas
                  key={seed}
                  seed={seed}
                  look={faceLook}
                  priority={PRIORITY.focus}
                  maxPx={1600}
                  label={`${name}, ${lookOf(faceLook).name}, enlarged`}
                  caption={`Painting in ${lookOf(faceLook).name}…`}
                  pokeable
                />
              </div>
            </Sheet>
            <NavButton label="Next face" onClick={() => go(1)}><ChevronRight className="size-5" strokeWidth={1.8} /></NavButton>
          </div>

          <div className="flex items-center gap-3 text-[12px] text-ink-2">
            <button type="button" onClick={() => go(-1)} aria-label="Previous face" className="grid size-9 place-items-center rounded-full border border-ink/10 bg-paper/70 sm:hidden">
              <ChevronLeft className="size-4" strokeWidth={1.8} />
            </button>
            <p className="text-center">
              <span className="text-ink">{name}</span>
              <span aria-hidden className="ml-2 font-glyph text-[13px] text-accent/80">{trueName(seed)}</span>
              <span className="mx-2 opacity-50">·</span>
              <span className="hidden sm:inline">tap to give it a nudge<span className="mx-2 opacity-50">·</span></span>
              <span className="tabular-nums">{index + 1} / {names.length}</span>
            </p>
            <button type="button" onClick={() => go(1)} aria-label="Next face" className="grid size-9 place-items-center rounded-full border border-ink/10 bg-paper/70 sm:hidden">
              <ChevronRight className="size-4" strokeWidth={1.8} />
            </button>
          </div>

          <LookStrip seed={seed} value={faceLook} gallery={look} onChange={(l) => onLook(name, l)} />

          <div className="flex max-w-full flex-wrap items-center justify-center gap-2">
            <TextButton tone="ink" onClick={() => onAction('copy', name)}>
              <Copy className="size-4" strokeWidth={1.8} /> Copy image
            </TextButton>
            <div className="inline-flex h-10 items-center rounded-full border border-ink/12 bg-paper/70 pl-1 pr-1">
              <button
                type="button"
                onClick={() => onAction('png', name)}
                className="inline-flex h-8 items-center gap-2 rounded-full px-3 text-[13px] font-medium transition hover:bg-ink/[0.06]"
              >
                <ImageDown className="size-4" strokeWidth={1.8} /> PNG
              </button>
              <div role="radiogroup" aria-label="PNG size" className="ml-1 flex rounded-full bg-ink/[0.05] p-0.5">
                {EXPORT_SIZES.map((px) => (
                  <button
                    key={px}
                    type="button"
                    role="radio"
                    aria-checked={pngSize === px}
                    onClick={() => onPngSize(px)}
                    className={`h-7 rounded-full px-2.5 text-[11px] font-medium tabular-nums transition ${pngSize === px ? 'bg-paper text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
                  >
                    {px / 1024}K
                  </button>
                ))}
              </div>
            </div>
            <TextButton onClick={() => onAction('svg', name)}>
              <FileCode className="size-4" strokeWidth={1.8} /> SVG
            </TextButton>
            <TextButton onClick={() => onAction('copy-svg', name)}>
              <Code className="size-4" strokeWidth={1.8} /> Copy SVG
            </TextButton>
            <TextButton onClick={() => onRepaint(index)}>
              <RefreshCw className="size-4" strokeWidth={1.8} /> Repaint
            </TextButton>
            <TextButton aria-pressed={spec} onClick={() => setSpec((v) => !v)} className={spec ? 'border-accent/50 bg-accent/10' : ''}>
              <Braces className="size-4" strokeWidth={1.8} /> Use in code
            </TextButton>
          </div>

          <div className="hidden items-center gap-4 text-[11px] text-ink-2/80 sm:flex">
            <Key k="←" /><Key k="→" /> browse <Key k="C" /> copy <Key k="R" /> repaint <Key k="U" /> code <Key k="Esc" /> close
          </div>
        </div>
      )}
      {spec && name !== null && (
        <FaceSpec
          name={name}
          look={faceLook}
          onClose={() => setSpec(false)}
          className="picker-in absolute inset-x-3 bottom-3 z-10 max-h-[70dvh] overflow-y-auto lg:inset-x-auto lg:bottom-auto lg:right-8 lg:top-1/2 lg:max-h-[calc(100dvh-4rem)] lg:w-[360px] lg:-translate-y-1/2"
        />
      )}
      {children}
    </dialog>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="hidden size-11 shrink-0 place-items-center rounded-full border border-ink/10 bg-paper/70 text-ink/75 shadow-pill transition hover:text-ink active:scale-95 sm:grid"
    >
      {children}
    </button>
  );
}

function Key({ k }: { k: string }) {
  return <kbd className="rounded border border-ink/15 bg-paper px-1.5 py-0.5 font-mono text-[10px] text-ink/70">{k}</kbd>;
}
