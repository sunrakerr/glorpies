'use client';

import { useEffect, useState } from 'react';
import { randomName } from 'glorpies';
import { Glorpie } from 'glorpies/react';

/** The crowd's rows and how many stand in each: a band across a phone or tablet, a cluster beside the headline on a wide screen. */
const ROWS = 7;
const COLS = 14;
const SIZE = 48;

/** Different names; made-up names can repeat, and a crowd of twins would give the game away. */
const crowd = () => {
  const names = new Set<string>();
  while (names.size < ROWS * COLS) names.add(randomName());
  return [...names];
};

/** A crowd standing in staggered rows, every face turned to the pointer; picking one takes it to the playground. */
export function Crowd({ onPick, className = '' }: { onPick: (name: string) => void; className?: string }) {
  // a new crowd every visit, drawn on the client so the server's markup has nothing to disagree with
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => setNames(crowd()), []);

  return (
    <div className={className}>
      <div className="relative -mx-6 h-[13.5rem] overflow-hidden [mask-composite:intersect] [mask-image:linear-gradient(to_right,transparent,black_14%,black_86%,transparent),linear-gradient(to_bottom,transparent,black_22%,black_78%,transparent)] lg:mx-0 lg:h-[24rem] lg:[mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_55%,transparent)]">
        <ul className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-y-1.5">
          {Array.from({ length: ROWS }, (_, r) => (
            // the row under the pointer comes forward, so a name shown below a face isn't hidden by the row beneath
            <li key={r} className={`relative flex list-none gap-x-2.5 focus-within:z-10 hover:z-10 ${r % 2 ? 'translate-x-[1.8rem]' : ''}`}>
              {names.slice(r * COLS, (r + 1) * COLS).map((name) => (
                <button key={name} type="button" onClick={() => onPick(name)} aria-label={`Try ${name}`} className="group relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <span className="block transition-transform duration-200 ease-soft group-hover:-translate-y-1 group-hover:scale-110">
                    <Glorpie name={name} size={SIZE} label={name} />
                  </span>
                  <span className="pointer-events-none absolute left-1/2 top-full z-10 -translate-x-1/2 whitespace-nowrap rounded-[3px] bg-ink px-1.5 py-0.5 text-[10px] leading-none text-paper opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                    {name}
                  </span>
                </button>
              ))}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
