'use client';

import { Copy, FileCode, ImageDown, RefreshCw } from 'lucide-react';
import { PRIORITY } from '@/lib/studio';
import { FaceCanvas } from './FaceCanvas';
import { Sheet } from './Sheet';
import type { ActionKind } from './actions';
import { IconButton, Pill } from './ui';

type Props = {
  seed: number;
  index: number;
  onOpen: () => void;
  onRepaint: () => void;
  onAction: (kind: ActionKind) => void;
};

export function FaceCard({ seed, index, onOpen, onRepaint, onAction }: Props) {
  // pinned slightly askew; they settle straighter when you reach for one
  const tilt = (((seed % 997) / 997) - 0.5) * 2.4;
  return (
    <li className="group relative list-none">
      <Sheet seed={seed} tilt={tilt}>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open face ${index + 1}`}
          className="relative block aspect-square w-full overflow-hidden bg-paper-2/50"
        >
          <FaceCanvas seed={seed} priority={PRIORITY.gallery} maxPx={900} label="Watercolour and ink portrait" />
        </button>
      </Sheet>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex translate-y-1 justify-center opacity-0 transition duration-300 ease-soft group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100">
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
