'use client';

import { Copy, FileCode, ImageDown, RefreshCw } from 'lucide-react';
import { seedOf } from 'glorpies';
import { lookOf, type LookId } from 'glorpies/internal/looks';
import { PRIORITY } from 'glorpies/internal/studio';
import { inAlien } from '@/lib/glyphs';
import { FaceCanvas } from './FaceCanvas';
import { Sheet } from './Sheet';
import type { ActionKind } from './actions';
import { IconButton, Pill } from './ui';

type Props = {
  name: string;
  look: LookId;
  onOpen: () => void;
  onRepaint: () => void;
  onAction: (kind: ActionKind) => void;
};

export function FaceCard({ name, look, onOpen, onRepaint, onAction }: Props) {
  const seed = seedOf(name);
  // pinned slightly askew; they settle straighter when you reach for one
  const tilt = (((seed % 997) / 997) - 0.5) * 2.4;
  return (
    <li className="group relative list-none">
      <Sheet seed={seed} tilt={tilt}>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${name}`}
          className="relative block aspect-square w-full overflow-hidden bg-paper-2/50"
        >
          <FaceCanvas seed={seed} look={look} priority={PRIORITY.gallery} maxPx={900} label={`${name}, ${lookOf(look).name}`} />
        </button>
      </Sheet>
      <p className="mt-3 flex items-baseline justify-center gap-2 truncate text-[11.5px] text-ink-2">
        {name}
        <span aria-hidden className="truncate font-alien text-[12px] text-accent/80">{inAlien(name)}</span>
      </p>
      <div className="pointer-events-none absolute inset-x-0 bottom-10 flex translate-y-1 justify-center opacity-0 transition duration-300 ease-soft group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100">
        <Pill className="pointer-events-auto">
          <IconButton label="Copy image" onClick={() => onAction('copy')}>
            <Copy className="size-[17px]" strokeWidth={1.8} />
          </IconButton>
          <IconButton label="Download PNG" onClick={() => onAction('png')}>
            <ImageDown className="size-[17px]" strokeWidth={1.8} />
          </IconButton>
          <IconButton label="Download SVG" onClick={() => onAction('svg')}>
            <FileCode className="size-[17px]" strokeWidth={1.8} />
          </IconButton>
          <span className="mx-0.5 h-5 w-px bg-ink/10" aria-hidden />
          <IconButton label="Paint someone new" onClick={onRepaint}>
            <RefreshCw className="size-[16px]" strokeWidth={1.8} />
          </IconButton>
        </Pill>
      </div>
    </li>
  );
}
