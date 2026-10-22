import type { Metadata } from 'next';
import { AvatarLab } from '@/components/AvatarLab';

export const metadata: Metadata = {
  title: 'Avatar lab · Faces',
  robots: { index: false },
};

export default function Page() {
  return <AvatarLab />;
}
