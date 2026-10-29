/**
 * Alien writing. The alphabet is Tifinagh (dots, rings and strokes, even in
 * weight beside the pixel letters): every letter has its own glyph, the same
 * one every time, so a name spelled in it is that name in alien. The section
 * marks are letters of it too. Purely for looks.
 */
const TIFINAGH = 0x2d30, LETTERS = 0x2d67 - 0x2d30 + 1;

/** A letter's alien counterpart; spaces stay spaces. */
export const alienLetter = (ch: string) => (ch === ' ' ? ' ' : String.fromCodePoint(TIFINAGH + ((ch.charCodeAt(0) * 7) % LETTERS)));

/** Text spelled in the alien alphabet: a gallery face's true name. */
export const inAlien = (text: string) => [...text].map(alienLetter).join('');

/** A letter of the alphabet to mark each section by. */
export const MARKS = { playground: 'ⵙ', install: 'ⵣ', code: 'ⵅ', api: 'ⵥ', gallery: 'ⵀ', how: 'ⵚ' } as const;
