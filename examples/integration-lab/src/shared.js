import metadata from 'glorpies/package.json';
export const VERSION = metadata.version;
export const DEFAULTS = {
  name: 'sunrakerrisfriednoodlz', look: 'watercolour', size: 144,
  state: 'idle', shape: 'circle', background: true, alive: false,
  pokeable: true, label: 'Integration specimen', priority: 2,
};
export const INTEGRATIONS = [
  ['react', 'React'], ['vue', 'Vue'], ['svelte', 'Svelte'], ['solid', 'Solid'],
  ['preact', 'Preact'], ['element', 'Web component'], ['angular', 'Angular'],
  ['mount', 'Canvas mount()'], ['svelte-action', 'Svelte action'],
  ['canvas', 'faceCanvas()'], ['svg', 'faceSVG()'], ['avatar', 'Photo fallback'],
  ['lit', 'Lit'], ['image', 'Server image'], ['cdn', 'CDN script'],
];

export function optionsForElement(options) {
  return Object.fromEntries(Object.entries(options).filter(([key, value]) =>
    !['className', 'class', 'style', 'photo', 'format', 'maxPx', 'morph'].includes(key)));
}
