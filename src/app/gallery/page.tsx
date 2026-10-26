import type { Metadata } from 'next';
import { Studio } from '@/components/Studio';

export const metadata: Metadata = {
  title: 'gallery',
  description: 'A wall of hand-painted faces that come alive, in 29 styles. Copy any face or download it as PNG or SVG.',
};

export default function Page() {
  return <Studio />;
}
