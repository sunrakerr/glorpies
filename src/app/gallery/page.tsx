import type { Metadata } from 'next';
import { Studio } from '@/components/Studio';

export const metadata: Metadata = {
  title: 'gallery',
  description: 'A wall of hand-painted aliens that come alive, each one named. Restyle any of them, copy it, or download it as PNG or SVG.',
};

export default function Page() {
  return <Studio />;
}
