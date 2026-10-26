import type { Metadata } from 'next';
import { HowItsDrawn } from '@/components/HowItsDrawn';

export const metadata: Metadata = {
  title: 'how a fuglio gets painted',
};

export default function Page() {
  return <HowItsDrawn />;
}
