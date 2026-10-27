'use client';

import { useEffect, useState } from 'react';
import { alienLetter as glyph } from '@/lib/glyphs';

/** What the headline says, one line at a time, forever. */
const LINES = [
  'all hail the glorpies.',
  'every name has a glorpie.',
  'take me to your avatar.',
  'we come in pieces.',
  'resistance is fugly.',
  'greetings, carbon unit.',
  'no two glorpies alike.',
  'abducted for science.',
  'one face per earthling.',
  'the truth is ugly.',
  'beam up a profile pic.',
];

/** A cell coming into focus: braille dots thickening into a block, then thinning into the letter. */
const DITHER = ['⡀', '⣀', '⣄', '⣤', '⣦', '⣶', '⣷', '⣿', '⢿', '⠿', '⠛', '⠉'];

/** Milliseconds: per glyph typed, before the alien text turns, per dither step, between cells turning, holding, per letter erased, between lines. */
const TYPE = 55, WAIT = 450, STEP = 30, STAGGER = 24, HOLD = 2800, ERASE = 26, GAP = 380;

const PHASES = ['type', 'wait', 'turn', 'hold', 'erase', 'gap'] as const;
type Phase = (typeof PHASES)[number];

function lengths(n: number): Record<Phase, number> {
  return { type: n * TYPE, wait: WAIT, turn: (n - 1) * STAGGER + DITHER.length * STEP, hold: HOLD, erase: n * ERASE, gap: GAP };
}


/** What a cell shows, and the letter it stands for (which holds its place, so every cell is a letter's size). */
type Cell = { ch: string; kind: 'glyph' | 'dots' | 'letter'; en: string };

/** What's on screen `e` ms into a phase of a line: the cells shown, so far. */
function frame(text: string, phase: Phase, e: number): Cell[] {
  const n = text.length;
  const chars = [...text];
  const alien = (en: string): Cell => (en === ' ' ? { ch: en, kind: 'letter', en } : { ch: glyph(en), kind: 'glyph', en });
  const plain = (en: string): Cell => ({ ch: en, kind: 'letter', en });
  if (phase === 'type') return chars.slice(0, Math.min(n, Math.floor(e / TYPE) + 1)).map(alien);
  if (phase === 'wait') return chars.map(alien);
  if (phase === 'turn') {
    return chars.map((en, i) => {
      if (en === ' ') return plain(en);
      const step = Math.floor((e - i * STAGGER) / STEP);
      if (step < 0) return alien(en);
      return step < DITHER.length ? { ch: DITHER[step]!, kind: 'dots', en } : plain(en);
    });
  }
  if (phase === 'hold') return chars.map(plain);
  if (phase === 'erase') return chars.slice(0, Math.max(0, n - Math.floor(e / ERASE) - 1)).map(plain);
  return [];
}

const keyOf = (cells: Cell[]) => cells.map((c) => c.ch).join('');

/**
 * The headline as an incoming transmission: each line types out in an alien
 * script (Tifinagh), comes into focus through braille dots as English, holds, and is
 * erased by the cursor for the next. Screen readers get the plain words;
 * readers who prefer less motion see the lines change without the effect.
 */
export function Transmission({ className = '' }: { className?: string }) {
  // nothing typed yet on the server; the lines start on the client
  const [cells, setCells] = useState<Cell[]>([]);

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let line = 0;
      const show = () => setCells([...LINES[line]!].map((en) => ({ ch: en, kind: 'letter', en })));
      show();
      const id = setInterval(() => {
        line = (line + 1) % LINES.length;
        show();
      }, HOLD + 1600);
      return () => clearInterval(id);
    }
    let line = 0, phase = 0, raf = 0, shown = '';
    let start = performance.now();
    const tick = (now: number) => {
      let len = lengths(LINES[line]!.length);
      // a hidden tab wakes up far along; whole phases are skipped until the clock catches up
      while (now - start >= len[PHASES[phase]!]) {
        start += len[PHASES[phase]!];
        if (++phase === PHASES.length) {
          phase = 0;
          line = (line + 1) % LINES.length;
          len = lengths(LINES[line]!.length);
        }
      }
      const next = frame(LINES[line]!, PHASES[phase]!, now - start);
      // only a change on screen is a render; holding still costs nothing
      const key = `${line}:${keyOf(next)}:${next.map((c) => c.kind[0]).join('')}`;
      if (key !== shown) {
        shown = key;
        setCells(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // cells are grouped into words so lines only ever break between them
  const words: { cells: Cell[]; at: number }[] = [];
  cells.forEach((c, i) => {
    if (c.ch === ' ') words.push({ cells: [], at: i + 1 });
    else (words.at(-1) ?? words[words.push({ cells: [], at: i }) - 1]!).cells.push(c);
  });
  const last = words.length - 1;

  return (
    <h1 className={className}>
      <span className="sr-only">glorpies: {LINES.join(' ')}</span>
      {/* room for the longest line, so nothing below moves as they change: two lines on a phone, one from tablets up */}
      <span aria-hidden className="block min-h-[2lh] md:min-h-[1lh]">
        {words.map((w, wi) => (
          <span key={wi} className="inline-block whitespace-nowrap">
            {w.cells.map((c, ci) => (
              // the letter always sets the cell's size and the line's height; glyphs and dots are laid over it, so other fonts' taller lines never push the page down
              <span key={ci} className="relative inline-block w-[1ch] text-center">
                <span className={c.kind === 'letter' ? '' : 'invisible'}>{c.en}</span>
                {c.kind !== 'letter' && (
                  <span className={`absolute inset-0 flex items-center justify-center leading-none text-accent ${c.kind === 'glyph' ? 'font-alien text-[0.92em]' : 'font-braille text-[1.2em]'}`}>{c.ch}</span>
                )}
              </span>
            ))}
            {wi === last && <span className="cursor" />}
            {wi < last && <span className="inline-block w-[0.45ch]"> </span>}
          </span>
        ))}
        {!words.length && <span className="cursor" />}
      </span>
    </h1>
  );
}
