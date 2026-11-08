import type { MetadataRoute } from 'next';
import { DOC_PAGES, docHref } from '@/lib/docs';
import { SITE_URL } from '@/lib/site';

/** Every page, so search engines find the docs without waiting to follow links. */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ['', '/gallery', '/how', ...DOC_PAGES.map((p) => docHref(p.slug))];
  return paths.map((path) => ({ url: `${SITE_URL}${path}` }));
}
