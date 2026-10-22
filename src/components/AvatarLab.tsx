'use client';

import { useEffect, useRef, useState } from 'react';
import { character } from '@/lib/avatar/spec';
import { AVATAR_STYLES, renderAvatar, type AvatarStyle } from '@/lib/avatar/styles';
import { newSeed } from '@/lib/studio';

declare global {
  interface Window {
    /** Renders one character in one style, for exporting comparison sheets. */
    __avatars?: { render: (seed: number, style: AvatarStyle, px: number) => string };
  }
}

/** Unlinked scratch page: the same characters across avatar styles. */
export function AvatarLab() {
  const [seeds, setSeeds] = useState<number[]>([]);

  useEffect(() => {
    const q = new URLSearchParams(location.search).get('seeds');
    const parsed = q?.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0) ?? [];
    setSeeds(parsed.length ? parsed : Array.from({ length: 4 }, newSeed));
    window.__avatars = { render: (seed, style, px) => renderAvatar(style, character(seed), px).toDataURL('image/png') };
  }, []);

  return (
    <main className="relative z-10 mx-auto max-w-[1400px] px-5 py-10 sm:px-8">
      <div className="flex flex-col gap-12">
        {AVATAR_STYLES.map((s) => (
          <section key={s.id}>
            <h2 className="font-display text-2xl italic">{s.name}</h2>
            <p className="mb-3 text-[13px] text-ink-2">{s.note}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {seeds.map((seed) => <Tile key={seed} seed={seed} style={s.id} />)}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function Tile({ seed, style }: { seed: number; style: AvatarStyle }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (!ref.current) return;
      const c = renderAvatar(style, character(seed), 400);
      c.className = 'block aspect-square w-full rounded-[4px] shadow-sheet';
      ref.current.replaceChildren(c);
    }, 0);
    return () => clearTimeout(t);
  }, [seed, style]);
  return <div ref={ref} className="aspect-square rounded-[4px] bg-paper-2/50" />;
}
