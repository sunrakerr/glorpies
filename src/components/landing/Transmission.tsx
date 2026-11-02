'use client';

import { useEffect, useRef } from 'react';
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
const TYPE = 55,
  WAIT = 450,
  STEP = 30,
  STAGGER = 24,
  HOLD = 2800,
  ERASE = 26,
  GAP = 380;

const PHASES = ['type', 'wait', 'turn', 'hold', 'erase', 'gap'] as const;
type Phase = (typeof PHASES)[number];

function lengths(n: number): Record<Phase, number> {
  return {
    type: n * TYPE,
    wait: WAIT,
    turn: (n - 1) * STAGGER + DITHER.length * STEP,
    hold: HOLD,
    erase: n * ERASE,
    gap: GAP,
  };
}

/** What a cell shows, and the letter it stands for (which holds its place, so every cell is a letter's size). */
type Cell = { ch: string; kind: 'glyph' | 'dots' | 'letter'; en: string };

/** What's on screen `e` ms into a phase of a line: the cells shown, so far. */
function frame(text: string, phase: Phase, e: number): Cell[] {
  const n = text.length;
  const chars = [...text];
  const alien = (en: string): Cell =>
    en === ' ' ? { ch: en, kind: 'letter', en } : { ch: glyph(en), kind: 'glyph', en };
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
  if (phase === 'erase')
    return chars.slice(0, Math.max(0, n - Math.floor(e / ERASE) - 1)).map(plain);
  return [];
}

/** The headline: each line types out in alien, comes into focus through braille dots as English, and is erased for the next. */
export function Transmission({
  lines = LINES,
  label = 'glorpies',
  className = '',
}: {
  lines?: readonly string[];
  label?: string;
  className?: string;
}) {
  const target = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!lines.length) return;
    const host = target.current!;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let nodes: {
      cell: HTMLSpanElement;
      letter: HTMLSpanElement;
      overlay: HTMLSpanElement;
      word: HTMLSpanElement;
      shown?: string;
    }[] = [];
    let words: HTMLSpanElement[] = [];
    let built = -1,
      line = 0,
      phase = 0,
      elapsed = 0,
      last = 0,
      timer = 0,
      visible = false;
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    cursor.style.setProperty('--cursor-play', 'paused');
    const draw = (cells: Cell[]) => {
      if (built !== line) {
        host.replaceChildren();
        nodes = [];
        words = [];
        built = line;
        let word = document.createElement('span');
        word.className = 'inline-block whitespace-nowrap';
        words.push(word);
        host.append(word);
        for (const en of lines[line]!) {
          if (en === ' ') {
            const space = document.createElement('span');
            space.className = 'inline-block w-[0.45ch]';
            space.textContent = ' ';
            word.append(space);
            nodes.push({ cell: space, letter: space, overlay: space, word });
            word = document.createElement('span');
            word.className = 'inline-block whitespace-nowrap';
            words.push(word);
            host.append(word);
          } else {
            const cell = document.createElement('span');
            cell.className = 'relative inline-block w-[1ch] text-center';
            const letter = document.createElement('span');
            letter.textContent = en;
            const overlay = document.createElement('span');
            cell.append(letter, overlay);
            word.append(cell);
            nodes.push({ cell, letter, overlay, word });
          }
        }
      }
      const visibleWords = new Set<HTMLSpanElement>();
      let parent: HTMLElement = host;
      nodes.forEach((node, index) => {
        const current = cells[index];
        if (current) {
          visibleWords.add(node.word);
          parent = node.word;
        }
        const key = current ? `${current.kind}:${current.ch}` : 'hidden';
        if (node.shown === key) return;
        node.shown = key;
        node.cell.style.display = current ? 'inline-block' : 'none';
        if (!current) return;
        if (current.en === ' ') return;
        node.letter.style.visibility = current.kind === 'letter' ? 'visible' : 'hidden';
        node.overlay.className = `absolute inset-0 flex items-center justify-center leading-none text-accent ${current.kind === 'glyph' ? 'font-alien text-[0.92em]' : 'font-braille text-[1.2em]'}`;
        node.overlay.style.display = current.kind === 'letter' ? 'none' : 'flex';
        node.overlay.textContent = current.ch;
      });
      for (const word of words)
        word.style.display = visibleWords.has(word) ? 'inline-block' : 'none';
      if (cursor.parentElement !== parent) parent.append(cursor);
    };
    const pause = () => {
      cursor.style.setProperty('--cursor-play', 'paused');
      clearTimeout(timer);
      timer = 0;
      last = 0;
    };
    const tick = () => {
      timer = 0;
      if (!visible || document.hidden) return;
      const now = performance.now();
      if (last) elapsed += now - last;
      last = now;
      if (motion.matches) {
        line = 0;
        draw(frame(lines[0]!, 'hold', 0));
        return;
      }
      let duration = lengths(lines[line]!.length);
      while (elapsed >= duration[PHASES[phase]!]) {
        elapsed -= duration[PHASES[phase]!];
        if (++phase === PHASES.length) {
          phase = 0;
          line = (line + 1) % lines.length;
          duration = lengths(lines[line]!.length);
        }
      }
      cursor.style.setProperty('--cursor-play', 'running');
      const current = PHASES[phase]!;
      draw(frame(lines[line]!, current, elapsed));
      if (lines.length === 1 && current === 'hold') return;
      const cadence =
        current === 'type'
          ? TYPE
          : current === 'turn'
            ? STEP
            : current === 'erase'
              ? ERASE
              : duration[current] - elapsed;
      timer = window.setTimeout(tick, Math.max(16, Math.min(cadence, duration[current] - elapsed)));
    };
    const resume = () => {
      pause();
      if (visible && !document.hidden) tick();
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]!.isIntersecting;
      resume();
    });
    observer.observe(host);
    document.addEventListener('visibilitychange', resume);
    motion.addEventListener('change', resume);
    return () => {
      pause();
      observer.disconnect();
      document.removeEventListener('visibilitychange', resume);
      motion.removeEventListener('change', resume);
    };
  }, [lines]);

  return (
    <h1 className={className}>
      <span className="sr-only">
        {label}: {lines.join(' ')}
      </span>
      {/* every line is laid out unseen in the same place, so the headline is always as tall as the longest one wraps to and nothing below it moves */}
      <span aria-hidden className="grid">
        {lines.map((line, i) => (
          <span key={i} className="invisible col-start-1 row-start-1">
            <Words cells={frame(line, 'hold', 0)} />
          </span>
        ))}
        <span ref={target} className="col-start-1 row-start-1" />
      </span>
    </h1>
  );
}

/** Cells grouped into words, so lines only ever break between them, with the cursor after the last. */
function Words({ cells }: { cells: Cell[] }) {
  const words: { cells: Cell[] }[] = [];
  cells.forEach((c) => {
    if (c.ch === ' ') words.push({ cells: [] });
    else (words.at(-1) ?? words[words.push({ cells: [] }) - 1]!).cells.push(c);
  });
  const last = words.length - 1;
  if (!words.length) return <span className="cursor" />;
  return words.map((w, wi) => (
    <span key={wi} className="inline-block whitespace-nowrap">
      {w.cells.map((c, ci) => (
        // the letter always sets the cell's size and the line's height; glyphs and dots are laid over it, so other fonts' taller lines never push the page down
        <span key={ci} className="relative inline-block w-[1ch] text-center">
          <span className={c.kind === 'letter' ? '' : 'invisible'}>{c.en}</span>
          {c.kind !== 'letter' && (
            <span
              className={`absolute inset-0 flex items-center justify-center leading-none text-accent ${c.kind === 'glyph' ? 'font-alien text-[0.92em]' : 'font-braille text-[1.2em]'}`}
            >
              {c.ch}
            </span>
          )}
        </span>
      ))}
      {wi === last && <span className="cursor" />}
      {wi < last && <span className="inline-block w-[0.45ch]"> </span>}
    </span>
  ));
}
