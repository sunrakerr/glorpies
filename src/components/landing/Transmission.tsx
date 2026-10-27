'use client';

import { useEffect, useState } from 'react';

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

/** Upright hieroglyphs that fit a letter's width: people, birds, the ankh, the scarab, reeds and staves. */
const ALPHABET = [...'𓀀𓀁𓀔𓁐𓄿𓅃𓅓𓅱𓆣𓇋𓇳𓊃𓊪𓊽𓋹𓋴𓏞𓐍𓆓𓁷𓄤𓃀𓀭𓁶𓅂𓆄𓋞𓀾𓁀𓅐'];

/** Each letter's alien counterpart, the same one for the same letter every time, like a real alphabet. */
const glyph = (ch: string) => ALPHABET[(ch.charCodeAt(0) * 7) % ALPHABET.length]!;

type Cell = { ch: string; kind: 'glyph' | 'dots' | 'letter' };

/** What's on screen `e` ms into a phase of a line: the cells shown, so far. */
function frame(text: string, phase: Phase, e: number): Cell[] {
  const n = text.length;
  const chars = [...text];
  if (phase === 'type') return chars.slice(0, Math.min(n, Math.floor(e / TYPE) + 1)).map((ch) => ({ ch: ch === ' ' ? ' ' : glyph(ch), kind: 'glyph' }));
  if (phase === 'wait') return chars.map((ch) => ({ ch: ch === ' ' ? ' ' : glyph(ch), kind: 'glyph' }));
  if (phase === 'turn') {
    return chars.map((ch, i) => {
      if (ch === ' ') return { ch, kind: 'letter' };
      const step = Math.floor((e - i * STAGGER) / STEP);
      if (step < 0) return { ch: glyph(ch), kind: 'glyph' };
      return step < DITHER.length ? { ch: DITHER[step]!, kind: 'dots' } : { ch, kind: 'letter' };
    });
  }
  if (phase === 'hold') return chars.map((ch) => ({ ch, kind: 'letter' }));
  if (phase === 'erase') return chars.slice(0, Math.max(0, n - Math.floor(e / ERASE) - 1)).map((ch) => ({ ch, kind: 'letter' }));
  return [];
}

const keyOf = (cells: Cell[]) => cells.map((c) => c.ch).join('');

/**
 * The headline as an incoming transmission: each line types out in an alien
 * script, comes into focus through braille dots as English, holds, and is
 * erased by the cursor for the next. Screen readers get the plain words;
 * readers who prefer less motion see the lines change without the effect.
 */
export function Transmission({ className = '' }: { className?: string }) {
  // nothing typed yet on the server; the lines start on the client
  const [cells, setCells] = useState<Cell[]>([]);

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let line = 0;
      const show = () => setCells([...LINES[line]!].map((ch) => ({ ch, kind: 'letter' })));
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
              <span key={ci} className="inline-flex w-[1ch] justify-center">
                {c.kind === 'letter' ? c.ch : <span className={`leading-none text-accent ${c.kind === 'glyph' ? 'glyph-bold font-glyph text-[0.78em]' : 'font-braille text-[1.2em]'}`}>{c.ch}</span>}
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
