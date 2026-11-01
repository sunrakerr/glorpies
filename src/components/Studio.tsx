'use client';

import { ArrowDown, Shuffle } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { randomName, seedOf } from 'glorpies';
import { DEFAULT_LOOK, isLook, type LookId } from 'glorpies/internal/looks';
import { getStage } from 'glorpies/internal/stage';
import { forget } from 'glorpies/internal/studio';
import type { Still } from '@/lib/share';
import { runAction, type ActionKind } from './actions';
import { FaceCard } from './FaceCard';
import { StylePicker } from './LookPicker';
import { MARKS } from '@/lib/glyphs';
import { readPref, writePref } from '@/lib/prefs';
import { Heading, Page } from './Page';
import { IconButton, Pill, ToastView, useToast } from './ui';
import { Viewer } from './Viewer';

/** Faces added at a time: twelve fills whole rows at two, three or four across. */
const BATCH = 12;
/** Batches that load on their own as you scroll before the wall asks whether to keep going. */
const RUN = 8;
const GRID = 'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-7 sm:gap-y-10 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-11';
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
  /** How many batches the wall may hold before it stops to ask. */
  const [until, setUntil] = useState(RUN);
  const { toast, show } = useToast();

  // names are random, so they're chosen on the client to keep server and client markup identical
  useEffect(() => {
    wall.current = newWall();
    setNames(freshBatch());
    const saved = readPref(ALIVE_KEY);
    setAlive(saved ? saved === '1' : !matchMedia('(prefers-reduced-motion: reduce)').matches);
    const savedLook = readPref(LOOK_KEY);
    if (isLook(savedLook)) setLook(savedLook);
  }, []);

  // holding the gallery still holds every face on the page, so leaving it lets them all move again
  useEffect(() => {
    const stage = getStage();
    stage.setAlive(alive);
    return () => stage.setAlive(true);
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
    setAlive(!alive);
    writePref(ALIVE_KEY, alive ? '0' : '1');
  };

  const chooseLook = (next: LookId) => {
    setLook(next);
    writePref(LOOK_KEY, next);
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

  const repaint = (i: number) => {
    const old = names[i];
    if (old === undefined) return;
    forget(seedOf(old));
    dropOverride(old);
    const next = freshName(new Set(names));
    setNames((s) => s.map((v, j) => (j === i ? next : v)));
  };

  const shuffleAll = () => {
    wall.current = newWall();
    for (const name of names) forget(seedOf(name));
    setNames(freshBatch(names));
    setOverrides(new Map());
    setUntil(RUN);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const more = () => setNames((s) => [...s, ...freshBatch(s)]);
  const batches = Math.ceil(names.length / BATCH);
  const paused = batches >= until;

  const act = (kind: ActionKind, still: Still) => runAction(kind, still, pngSize, show);

  return (
    <Page className="pb-16 pt-12">
      <Heading as="h1" title="gallery" mark={MARKS.gallery} aside={names.length ? `${names.length} glorpies, each one named` : undefined} />
      {names.length ? (
        <Wall>
          {Array.from({ length: batches }, (_, b) => (
            <Batch key={b}>
              {names.slice(b * BATCH, (b + 1) * BATCH).map((name, j) => {
                const i = b * BATCH + j;
                return (
                  <FaceCard
                    key={`${i}-${name}`}
                    name={name}
                    look={lookFor(name)}
                    onOpen={() => openFace(i)}
                    onRepaint={() => repaint(i)}
                    onAction={(kind) => act(kind, { name, look: lookFor(name) })}
                  />
                );
              })}
            </Batch>
          ))}
        </Wall>
      ) : (
        <ul className={GRID}>
          {Array.from({ length: BATCH }, (_, i) => (
            <li key={i} className="aspect-square list-none rounded-[3px] bg-paper-2/50 shadow-sheet" />
          ))}
        </ul>
      )}
      {names.length > 0 &&
        (paused ? (
          <div className="mt-14 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setUntil(batches + RUN);
                more();
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3.5 py-2 text-[12.5px] text-paper transition hover:bg-accent"
            >
              keep scrolling <ArrowDown className="size-3.5" strokeWidth={1.8} />
            </button>
          </div>
        ) : (
          <Nearing key={names.length} onNear={more} />
        ))}

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


/** Every full batch is the same height, so one measured on screen stands in for all the ones that aren't. */
let batchHeight = 0;

function Wall({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-y-6 sm:gap-y-10 lg:gap-y-11">{children}</div>;
}

/**
 * Twelve faces, mounted only while they're within a screen or so of view.
 * Further off they're let go (their paintings, canvases and queued work with
 * them) and an empty block of the same height holds their place.
 */
function Batch({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const [near, setNear] = useState(true);
  useEffect(() => {
    const el = ref.current!;
    const seen = new IntersectionObserver(([e]) => {
      if (!e) return;
      if (!e.isIntersecting && el.offsetHeight) batchHeight = el.offsetHeight;
      setNear(e.isIntersecting);
    }, { rootMargin: '120% 0px' });
    const sized = new ResizeObserver(() => {
      if (el.childElementCount === BATCH) batchHeight = el.offsetHeight;
    });
    seen.observe(el);
    sized.observe(el);
    return () => {
      seen.disconnect();
      sized.disconnect();
    };
  }, []);
  return (
    <ul ref={ref} className={GRID} style={near ? undefined : { height: batchHeight }}>
      {near && children}
    </ul>
  );
}

/** Calls for more when the end of the wall comes within a couple of screens. */
function Nearing({ onNear }: { onNear: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const call = useRef(onNear);
  call.current = onNear;
  useEffect(() => {
    const seen = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) call.current();
    }, { rootMargin: '0px 0px 150% 0px' });
    seen.observe(ref.current!);
    return () => seen.disconnect();
  }, []);
  return <div ref={ref} aria-hidden className="h-px" />;
}
