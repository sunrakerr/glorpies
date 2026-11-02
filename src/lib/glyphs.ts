/** Alien writing, purely for looks: each letter maps to its own Tifinagh glyph, the same every time. */
const TIFINAGH = 0x2d30,
  LETTERS = 0x2d67 - 0x2d30 + 1;

/** A letter's alien counterpart; spaces stay spaces. */
export const alienLetter = (ch: string) =>
  ch === ' ' ? ' ' : String.fromCodePoint(TIFINAGH + ((ch.charCodeAt(0) * 7) % LETTERS));

/** Text spelled in the alien alphabet: a gallery face's true name. */
export const inAlien = (text: string) => [...text].map(alienLetter).join('');

/** A letter of the alphabet to mark each section by. */
export const MARKS = { playground: 'ⵙ', install: 'ⵣ', code: 'ⵅ', gallery: 'ⵀ', how: 'ⵚ' } as const;
