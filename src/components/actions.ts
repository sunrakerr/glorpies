import { copyPNG, copySVG, downloadPNG, downloadSVG } from '@/lib/share';

export type ActionKind = 'copy' | 'png' | 'svg' | 'copy-svg';

const COPY: Record<ActionKind, { busy: string; done: string }> = {
  copy: { busy: 'Painting a copy…', done: 'Copied to clipboard' },
  png: { busy: 'Painting your PNG…', done: 'PNG saved' },
  svg: { busy: 'Inking your SVG…', done: 'SVG saved' },
  'copy-svg': { busy: 'Inking SVG markup…', done: 'SVG markup copied' },
};

/**
 * Starts the work before anything is awaited: clipboard writes must begin
 * inside the click that asked for them.
 */
export function runAction(kind: ActionKind, seed: number, pngSize: number, notify: (text: string, tone: 'busy' | 'ok' | 'error') => void) {
  const work =
    kind === 'copy' ? copyPNG(seed)
    : kind === 'png' ? downloadPNG(seed, pngSize)
    : kind === 'svg' ? downloadSVG(seed)
    : copySVG(seed);
  notify(COPY[kind].busy, 'busy');
  work.then(
    () => notify(COPY[kind].done, 'ok'),
    (err: unknown) => notify(err instanceof Error && err.message ? err.message : 'That didn’t work — try again', 'error'),
  );
}
