const TRAITS = [
  'soggy', 'wobbly', 'crusty', 'gloopy', 'lumpy', 'squishy', 'grumpy', 'sticky', 'fizzy', 'warty', 'bulgy', 'drooly',
  'slimy', 'cosmic', 'sleepy', 'cranky', 'jiggly', 'mossy', 'rubbery', 'oozy', 'fuzzy', 'spongy', 'toothy', 'blobby',
  'nervous', 'smelly', 'puffy', 'chunky', 'wonky', 'gooey', 'crinkly', 'feral', 'moody', 'clammy', 'bumpy', 'damp',
  'grubby', 'shifty', 'snotty', 'stubby', 'tangy', 'twitchy', 'zappy', 'lanky', 'murky', 'nubby', 'quirky', 'tipsy',
];

const KINDS = [
  'glorp', 'zib', 'blorb', 'flonk', 'snarf', 'zoob', 'gleep', 'florp', 'vrool', 'splotch', 'nubbin', 'morp',
  'plog', 'yib', 'skronk', 'bleep', 'gunk', 'zorp', 'wib', 'goober', 'noodle', 'bloop', 'squib', 'frob',
  'grox', 'thwip', 'blip', 'quark', 'grub', 'snoot', 'wort', 'zonk', 'plub', 'dweeb', 'gloob', 'fnord',
  'meep', 'blob', 'spud', 'crud', 'twerp', 'globule', 'kludge', 'oog', 'scrunt', 'yoink', 'zug', 'blurp',
];

/**
 * A made-up name for a face nobody has named yet, two words joined by a
 * hyphen: `soggy-glorp`. Names are ordinary names, so the same one always
 * paints the same face. `random` is any source of numbers in [0, 1).
 */
export function randomName(random: () => number = Math.random): string {
  const pick = (words: readonly string[]) => words[Math.floor(random() * words.length)];
  return `${pick(TRAITS)}-${pick(KINDS)}`;
}
