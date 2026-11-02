import { pageMetadata } from '@/lib/metadata';
import { HowItsDrawn } from '@/components/HowItsDrawn';

export const metadata = pageMetadata('/how', 'how a glorpie gets painted',
  'Watch a name become a hand-painted alien. See how deterministic seeds, watercolour glazes and dip-pen strokes give every Glorpie its own face.');

export default function Page() {
  return <HowItsDrawn />;
}
