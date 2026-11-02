import { pageMetadata } from '@/lib/metadata';
import { Studio } from '@/components/Studio';

export const metadata = pageMetadata('/gallery', 'gallery',
  'Find your Glorpie. Explore hand-painted alien avatars, try 29 looks, and download your favourite as PNG or SVG. Any name gets its own face.');

export default function Page() {
  return <Studio />;
}
