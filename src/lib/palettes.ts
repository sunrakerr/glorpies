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

export const PALETTES: readonly Palette[] = [
  { paper: '#f5eedf', ink: '#241c17', skin: '#f0b48c', shade: '#d98b6c', hair: '#3e5c76', hair2: '#22374a', accent: '#e4572e', accent2: '#76b39d', blush: '#e86a7a', bg: '#9cc5c0', bg2: '#f2cc8f' },
  { paper: '#f3efe6', ink: '#2d2440', skin: '#cdb9e6', shade: '#9d86c9', hair: '#f28f6b', hair2: '#c0563c', accent: '#2f9e8f', accent2: '#f6c85f', blush: '#ff8fa3', bg: '#f6d6a8', bg2: '#a5d8dd' },
  { paper: '#eef0e4', ink: '#1d2a2a', skin: '#b5dcc2', shade: '#76b393', hair: '#e07a5f', hair2: '#9b3d2b', accent: '#3d405b', accent2: '#f2cc8f', blush: '#f4a259', bg: '#f4f1bb', bg2: '#9bc1bc' },
  { paper: '#f7f1e3', ink: '#2a1f1a', skin: '#f6d0a6', shade: '#e0a878', hair: '#5a3a2e', hair2: '#2b1715', accent: '#2a6f97', accent2: '#f4a261', blush: '#ef767a', bg: '#f9d56e', bg2: '#90be6d' },
  { paper: '#f2efe9', ink: '#1b1b2f', skin: '#9fc3e6', shade: '#6b95c4', hair: '#ffb703', hair2: '#e07b00', accent: '#e63946', accent2: '#e9a6c0', blush: '#ff6b9a', bg: '#ffd6a5', bg2: '#cdb4db' },
  { paper: '#f4ebe0', ink: '#2e1e14', skin: '#e09a7a', shade: '#b8664a', hair: '#264653', hair2: '#142a33', accent: '#e9c46a', accent2: '#2a9d8f', blush: '#c44569', bg: '#e9d8a6', bg2: '#94d2bd' },
  { paper: '#f6f0ea', ink: '#2b2023', skin: '#f7c6c7', shade: '#e39a9e', hair: '#6a4c93', hair2: '#3c2a5a', accent: '#1982c4', accent2: '#8ac926', blush: '#ff595e', bg: '#ffd166', bg2: '#b8e0d2' },
  { paper: '#f4eee2', ink: '#1a1411', skin: '#b07a56', shade: '#7d4d34', hair: '#2a211c', hair2: '#4a3529', accent: '#f2a541', accent2: '#5fb49c', blush: '#d1495b', bg: '#f4d58d', bg2: '#bfd7ea' },
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
