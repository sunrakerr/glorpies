import { Landing } from '@/components/landing/Landing';
import { pageMetadata, SITE_DESCRIPTION } from '@/lib/metadata';

export const metadata = pageMetadata('/', 'glorpies', SITE_DESCRIPTION);

export default function Page() {
  return <Landing />;
}
