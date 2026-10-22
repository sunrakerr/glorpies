import type { Metadata } from 'next';
import { HowItsDrawn } from '@/components/HowItsDrawn';

export const metadata: Metadata = {
  title: 'How a face gets painted · Faces',
};

export default function Page() {
  return <HowItsDrawn />;
}
