import type { Metadata } from 'next';
import { Lab } from '@/components/Lab';

export const metadata: Metadata = {
  title: 'Style lab · Faces',
  robots: { index: false },
};

export default function Page() {
  return <Lab />;
}
