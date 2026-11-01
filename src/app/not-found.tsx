import type { Metadata } from 'next';
import { Lost } from '@/components/lost/Lost';

export const metadata: Metadata = { title: 'page not found' };

export default function NotFound() {
  return <Lost />;
}
