'use client';

import { Plus, Shuffle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { randomName, seedOf } from 'glorpies';
import { DEFAULT_LOOK, isLook, type LookId } from 'glorpies/internal/looks';
import { getStage } from 'glorpies/internal/stage';
import { forget } from 'glorpies/internal/studio';
import type { Still } from '@/lib/share';
import { runAction, type ActionKind } from './actions';
import { FaceCard } from './FaceCard';
import { StylePicker } from './LookPicker';
import { MARKS } from '@/lib/glyphs';
import { Heading, Page } from './Page';
import { IconButton, Pill, ToastView, useToast } from './ui';
import { Viewer } from './Viewer';

const BATCH = 12;
const ALIVE_KEY = 'faces:alive';
const LOOK_KEY = 'faces:look';

/** The face a history entry has open, if the entry belongs to this wall: a reload or a shuffle paints a new one, and old entries open nothing. */
function viewerIn(state: unknown, wall: string, count: number): number | null {
  const s = state as { viewer?: unknown; wall?: unknown } | null;
  const i = s?.viewer;
  return s?.wall === wall && typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < count ? i : null;
}

const newWall = () => Math.random().toString(36).slice(2);

/** A name not already on the wall, so every face on it is its own (until a wall holds most of the names there are). */
function freshName(taken: ReadonlySet<string>) {
  let name = randomName();
  for (let i = 0; i < 64 && taken.has(name); i++) name = randomName();
  return name;
}

/** Twelve new names, none of them in `taken`. */
function freshBatch(taken: readonly string[] = []) {
  const seen = new Set(taken);
  return Array.from({ length: BATCH }, () => {
    const name = freshName(seen);
    seen.add(name);
    return name;
  });
}

export function Studio() {
  const [names, setNames] = useState<string[]>([]);
  const [alive, setAlive] = useState(true);
  const [look, setLook] = useState<LookId>(DEFAULT_LOOK);
  /** Faces restyled on their own in the viewer; the rest follow the gallery. */
  const [overrides, setOverrides] = useState<ReadonlyMap<string, LookId>>(() => new Map());
  const [open, setOpen] = useState<number | null>(null);
  const [pngSize, setPngSize] = useState(1024);
  const { toast, show } = useToast();

  // names are random, so they're chosen on the client to keep server and client markup identical
  useEffect(() => {
    wall.current = newWall();
    setNames(freshBatch());
    const saved = localStorage.getItem(ALIVE_KEY);
    setAlive(saved ? saved === '1' : !matchMedia('(prefers-reduced-motion: reduce)').matches);
    const savedLook = localStorage.getItem(LOOK_KEY);
    if (isLook(savedLook)) setLook(savedLook);
  }, []);

  useEffect(() => {
    getStage().setAlive(alive);
  }, [alive]);

  // an open face is a step in history, holding which face: back closes the viewer, forward opens it again
  const wall = useRef('');
  const count = useRef(0);
  useEffect(() => {
    count.current = names.length;
  }, [names.length]);
  useEffect(() => {
    const pop = () => setOpen(viewerIn(history.state, wall.current, count.current));
    addEventListener('popstate', pop);
    return () => removeEventListener('popstate', pop);
  }, []);

  const openFace = (i: number) => {
    const state = { ...history.state, viewer: i, wall: wall.current };
    if (viewerIn(history.state, wall.current, names.length) === null) history.pushState(state, '');
    else history.replaceState(state, '');
    setOpen(i);
  };
  const closeFace = () => (viewerIn(history.state, wall.current, names.length) !== null ? history.back() : setOpen(null));

  const toggleAlive = () => {
    setAlive((v) => {
      localStorage.setItem(ALIVE_KEY, v ? '0' : '1');
      return !v;
    });
  };

  const chooseLook = (next: LookId) => {
    setLook(next);
    localStorage.setItem(LOOK_KEY, next);
    // faces already in the new style rejoin the gallery
    setOverrides((m) => ([...m.values()].includes(next) ? new Map([...m].filter(([, l]) => l !== next)) : m));
  };

  const lookFor = (name: string) => overrides.get(name) ?? look;

  /** Choosing the gallery's own style hands the face back to the gallery. */
  const setFaceLook = (name: string, next: LookId) => {
    setOverrides((m) => {
      const out = new Map(m);
      if (next === look) out.delete(name);
      else out.set(name, next);
      return out;
    });
  };

  const dropOverride = (name: string) =>
    setOverrides((m) => {
      if (!m.has(name)) return m;
      const out = new Map(m);
      out.delete(name);
      return out;
    });

  const repaint = useCallback((i: number) => {
    setNames((s) => {
      const old = s[i];
      if (old !== undefined) {
        forget(seedOf(old));
        dropOverride(old);
      }
      const next = freshName(new Set(s));
      return s.map((v, j) => (j === i ? next : v));
    });
  }, []);

  const shuffleAll = () => {
    wall.current = newWall();
    setNames((s) => {
      for (const name of s) forget(seedOf(name));
      return freshBatch(s);
    });
    setOverrides(new Map());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const act = (kind: ActionKind, still: Still) => runAction(kind, still, pngSize, show);

  return (
    <Page className="pb-16 pt-12">
      <Heading as="h1" title="gallery" mark={MARKS.gallery} aside={names.length ? `${names.length} glorpies, each one named` : undefined} />
      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-7 sm:gap-y-10 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-11">
        {names.length
          ? names.map((name, i) => (
              <FaceCard
                key={`${i}-${name}`}
                name={name}
                look={lookFor(name)}
                onOpen={() => openFace(i)}
                onRepaint={() => repaint(i)}
                onAction={(kind) => act(kind, { name, look: lookFor(name) })}
              />
            ))
          : Array.from({ length: BATCH }, (_, i) => (
              <li key={i} className="aspect-square list-none rounded-[3px] bg-paper-2/50 shadow-sheet" />
            ))}
      </ul>

      <nav aria-label="Gallery controls" className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center">
        <Pill className="pointer-events-auto">
          <IconButton label={alive ? 'Hold still' : 'Bring them to life'} role="switch" aria-checked={alive} onClick={toggleAlive}>
            <span className="relative flex size-2.5">
              {alive && <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent/60" />}
              <span className={`relative inline-flex size-2.5 rounded-full transition ${alive ? 'bg-accent' : 'bg-ink/30'}`} />
            </span>
          </IconButton>
          <span className="mx-0.5 h-5 w-px bg-ink/10" aria-hidden />
          <StylePicker seed={names[0] === undefined ? undefined : seedOf(names[0])} value={look} onChange={chooseLook} />
          <span className="mx-0.5 h-5 w-px bg-ink/10" aria-hidden />
          <IconButton label="New faces" onClick={shuffleAll}>
            <Shuffle className="size-[17px]" strokeWidth={1.8} />
          </IconButton>
          <IconButton label="Twelve more" onClick={() => setNames((s) => [...s, ...freshBatch(s)])}>
            <Plus className="size-[18px]" strokeWidth={1.8} />
          </IconButton>
        </Pill>
      </nav>

      <Viewer
        names={names}
        index={open}
        look={look}
        lookFor={lookFor}
        onLook={setFaceLook}
        pngSize={pngSize}
        onPngSize={setPngSize}
        onIndex={openFace}
        onClose={closeFace}
        onRepaint={repaint}
        onAction={act}
      >
        {open !== null && <ToastView toast={toast} />}
      </Viewer>
      {open === null && <ToastView toast={toast} />}
    </Page>
  );
}

