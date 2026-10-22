'use client';

import { PenLine, Plus, Shuffle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { getStage } from '@/lib/stage';
import { forget, newSeed } from '@/lib/studio';
import { runAction, type ActionKind } from './actions';
import { FaceCard } from './FaceCard';
import { IconButton, Pill, ToastView, useToast } from './ui';
import { Viewer } from './Viewer';

const BATCH = 12;
const ALIVE_KEY = 'faces:alive';

const freshBatch = () => Array.from({ length: BATCH }, newSeed);

export function Studio() {
  const [seeds, setSeeds] = useState<number[]>([]);
  const [alive, setAlive] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [pngSize, setPngSize] = useState(1024);
  const { toast, show } = useToast();
  const router = useRouter();

  // seeds are random, so they're chosen on the client to keep server and client markup identical
  useEffect(() => {
    setSeeds(freshBatch());
    const saved = localStorage.getItem(ALIVE_KEY);
    setAlive(saved ? saved === '1' : !matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    getStage().setAlive(alive);
  }, [alive]);

  const toggleAlive = () => {
    setAlive((v) => {
      localStorage.setItem(ALIVE_KEY, v ? '0' : '1');
      return !v;
    });
  };

  const repaint = useCallback((i: number) => {
    setSeeds((s) => {
      const old = s[i];
      if (old !== undefined) forget(old);
      return s.map((v, j) => (j === i ? newSeed() : v));
    });
  }, []);

  const shuffleAll = () => {
    setSeeds((s) => {
      s.forEach(forget);
      return freshBatch();
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const act = (kind: ActionKind, seed: number) => runAction(kind, seed, pngSize, show);

  return (
    <div className="relative z-10 min-h-dvh">
      <main className="mx-auto max-w-[1400px] px-5 pb-32 pt-8 sm:px-8 sm:pt-12">
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-7 sm:gap-y-10 lg:grid-cols-4 lg:gap-x-9 lg:gap-y-12">
          {seeds.length
            ? seeds.map((seed, i) => (
                <FaceCard
                  key={`${i}-${seed}`}
                  seed={seed}
                  index={i}
                  onOpen={() => setOpen(i)}
                  onRepaint={() => repaint(i)}
                  onAction={(kind) => act(kind, seed)}
                />
              ))
            : Array.from({ length: BATCH }, (_, i) => (
                <li key={i} className="aspect-square list-none rounded-[3px] bg-paper-2/50 shadow-sheet" />
              ))}
        </ul>
      </main>

      <nav aria-label="Gallery controls" className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center">
        <Pill className="pointer-events-auto">
          <IconButton label={alive ? 'Hold still' : 'Bring them to life'} role="switch" aria-checked={alive} onClick={toggleAlive}>
            <span className="relative flex size-2.5">
              {alive && <span className="absolute inline-flex size-full animate-ping rounded-full bg-clay/60" />}
              <span className={`relative inline-flex size-2.5 rounded-full transition ${alive ? 'bg-clay' : 'bg-ink/30'}`} />
            </span>
          </IconButton>
          <span className="mx-0.5 h-5 w-px bg-ink/10" aria-hidden />
          <IconButton label="New faces" onClick={shuffleAll}>
            <Shuffle className="size-[17px]" strokeWidth={1.8} />
          </IconButton>
          <IconButton label="Twelve more" onClick={() => setSeeds((s) => [...s, ...freshBatch()])}>
            <Plus className="size-[18px]" strokeWidth={1.8} />
          </IconButton>
          <span className="mx-0.5 h-5 w-px bg-ink/10" aria-hidden />
          <IconButton label="How they're painted" onClick={() => router.push('/how')}>
            <PenLine className="size-[17px]" strokeWidth={1.8} />
          </IconButton>
        </Pill>
      </nav>

      <Viewer
        seeds={seeds}
        index={open}
        pngSize={pngSize}
        onPngSize={setPngSize}
        onIndex={setOpen}
        onClose={() => setOpen(null)}
        onRepaint={repaint}
        onAction={act}
      >
        {open !== null && <ToastView toast={toast} />}
      </Viewer>
      {open === null && <ToastView toast={toast} />}
    </div>
  );
}

