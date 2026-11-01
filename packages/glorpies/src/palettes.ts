export type Palette = {
  paper: string;
  ink: string;
  skin: string;
  shade: string;
  hair: string;
  hair2: string;
  accent: string;
  accent2: string;
  blush: string;
  bg: string;
  bg2: string;
};

/** Alien palettes, loud on purpose, on cream paper so they still read as paintings. */
export const PALETTES: readonly Palette[] = [
  { paper: '#f4f1e6', ink: '#161a12', skin: '#7ee05a', shade: '#3f9e3a', hair: '#ff4fa3', hair2: '#b8146a', accent: '#ffe14d', accent2: '#ffc93c', blush: '#ff7ab6', bg: '#c6a8ff', bg2: '#5ee0ff' },
  { paper: '#f6f0ea', ink: '#24102a', skin: '#ff7ac8', shade: '#d63f97', hair: '#5ee86a', hair2: '#1f9e4a', accent: '#5ef2ff', accent2: '#ffd23f', blush: '#ff4d6d', bg: '#fff07a', bg2: '#8f9bff' },
  { paper: '#f2f0ea', ink: '#1b1030', skin: '#b77dff', shade: '#7a3fe0', hair: '#ffd23f', hair2: '#e08a00', accent: '#7dff5e', accent2: '#ffd23f', blush: '#ff6fd8', bg: '#7dffc4', bg2: '#ffb36b' },
  { paper: '#f2f3ec', ink: '#0f1e24', skin: '#4fd8e0', shade: '#1b97a8', hair: '#ff5c7a', hair2: '#c21e45', accent: '#fff15c', accent2: '#ffb52e', blush: '#ff8fd0', bg: '#ffd6f5', bg2: '#b4ff6e' },
  { paper: '#f6f2e4', ink: '#21140a', skin: '#ffd23f', shade: '#e08a1a', hair: '#8f3fff', hair2: '#5214b8', accent: '#3effc8', accent2: '#ff4f8b', blush: '#ff7a3d', bg: '#8fd6ff', bg2: '#ff8fe0' },
  { paper: '#f5efe8', ink: '#200e0a', skin: '#ff8a3d', shade: '#d4501a', hair: '#2fd6b4', hair2: '#0f8a74', accent: '#c6ff3d', accent2: '#ffe066', blush: '#ff4f6e', bg: '#a6c8ff', bg2: '#e2a8ff' },
  { paper: '#f0f1f4', ink: '#0d1230', skin: '#6f8cff', shade: '#3a4fd6', hair: '#ff9f2e', hair2: '#d1600a', accent: '#ff5ef0', accent2: '#7cffcb', blush: '#d17dff', bg: '#ffe3a3', bg2: '#7dffd0' },
  { paper: '#f3f4e8', ink: '#141c08', skin: '#c2f04a', shade: '#7fb31a', hair: '#ff5ec4', hair2: '#b81e8a', accent: '#5ec8ff', accent2: '#ffd23f', blush: '#ff9a5c', bg: '#ffb3e6', bg2: '#8fe8ff' },
  { paper: '#f6efea', ink: '#240a12', skin: '#ff5c7a', shade: '#c4224a', hair: '#ffd23f', hair2: '#d18a0a', accent: '#5effa8', accent2: '#ffe14d', blush: '#ff9ad5', bg: '#9de6ff', bg2: '#caa3ff' },
  { paper: '#f1f3ee', ink: '#0c1a14', skin: '#9df5c4', shade: '#3fbf86', hair: '#ff6b3d', hair2: '#c23a12', accent: '#ff3dbb', accent2: '#ffd93d', blush: '#ff8fb8', bg: '#e4b3ff', bg2: '#fff07a' },
];

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function hex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

export function mix(a: string, b: string, t: number): string {
  const x = channels(a), y = channels(b);
  return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export function multiply(a: string, b: string): string {
  const x = channels(a), y = channels(b);
  return hex([(x[0] * y[0]) / 255, (x[1] * y[1]) / 255, (x[2] * y[2]) / 255]);
}
