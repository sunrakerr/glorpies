'use client';

import { useEffect, useState } from 'react';
import { WorkerGlorpie } from '../WorkerGlorpie';
import names from './crowd-names.json';

/** The crowd's rows and how many stand in each: a band across a phone or tablet, a cluster beside the headline on a wide screen. */
const ROWS = 7;
const COLS = 14;
const SIZE = 48;

/** A cached crowd in staggered rows, with a few living faces; picking one takes it to the playground. */
export function Crowd({
  onPick,
  className = '',
}: {
  onPick: (name: string) => void;
  className?: string;
}) {
  // Cached first frames are present in server markup; a few visible faces wake after hydration.
  const [animated, setAnimated] = useState<number[]>([]);
  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const phone = matchMedia('(pointer: coarse)');
    const sync = () => setAnimated(motion.matches ? [] : phone.matches ? [48, 50] : [35, 48, 63]);
    sync();
    motion.addEventListener('change', sync);
    phone.addEventListener('change', sync);
    return () => {
      motion.removeEventListener('change', sync);
      phone.removeEventListener('change', sync);
    };
  }, []);

  return (
    <div className={className}>
      <div className="relative -mx-6 h-[13.5rem] overflow-hidden [mask-composite:intersect] [mask-image:linear-gradient(to_right,transparent,black_14%,black_86%,transparent),linear-gradient(to_bottom,transparent,black_22%,black_78%,transparent)] lg:mx-0 lg:h-[24rem] lg:[mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_55%,transparent)]">
        <ul className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-y-1.5">
          {Array.from({ length: ROWS }, (_, r) => (
            // the row under the pointer comes forward, so a name shown below a face isn't hidden by the row beneath
            <li
              key={r}
              className={`relative flex list-none gap-x-2.5 focus-within:z-10 hover:z-10 ${r % 2 ? 'translate-x-[1.8rem]' : ''}`}
            >
              {names.slice(r * COLS, (r + 1) * COLS).map((name, col) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onPick(name)}
                  aria-label={`Try ${name}`}
                  className="group relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="block transition-transform duration-200 ease-soft group-hover:-translate-y-1 group-hover:scale-110">
                    {animated.includes(r * COLS + col) ? (
                      <WorkerGlorpie
                        name={name}
                        size={SIZE}
                        label={name}
                        style={{
                          backgroundImage: 'url(/landing/crowd.webp)',
                          backgroundSize: '672px 336px',
                          backgroundPosition: `${-col * SIZE}px ${-r * SIZE}px`,
                        }}
                      />
                    ) : (
                      <span
                        role="img"
                        aria-label={name}
                        className="block size-12 rounded-full"
                        style={{
                          backgroundImage: 'url(/landing/crowd.webp)',
                          backgroundSize: '672px 336px',
                          backgroundPosition: `${-col * SIZE}px ${-r * SIZE}px`,
                        }}
                      />
                    )}
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
