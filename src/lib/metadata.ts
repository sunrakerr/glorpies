import type { Metadata } from 'next';
import docsImage from '@/app/docs/opengraph-image.png';

export const SITE_DESCRIPTION =
  'Hand-painted alien avatars from any string. Same name, same face, every time. 29 looks, animated moods, every framework. Open source with zero dependencies.';

/** Keep search results and social previews specific to the page being shared. */
export function pageMetadata(path: string, title: string, description: string): Metadata {
  const fullTitle = path === '/'
    ? 'glorpies · all hail the glorpies'
    : `${title} · glorpies${path.startsWith('/docs/') ? ' docs' : ''}`;
  // Child metadata replaces the parent's entire social object. Explicitly keep
  // the docs card on nested guides; the static import gives it a versioned URL.
  const images = path.startsWith('/docs/') ? [{
    url: docsImage.src, width: docsImage.width, height: docsImage.height,
    alt: 'Glorpies documentation: a little alien in your app. Framework components, server images and a CLI.',
  }] : undefined;

  return {
    title: { absolute: fullTitle },
    description,
    alternates: { canonical: path },
    openGraph: { title: fullTitle, description, url: path, siteName: 'glorpies', type: 'website', locale: 'en_US', ...(images ? { images } : {}) },
    twitter: { card: 'summary_large_image', title: fullTitle, description, ...(images ? { images } : {}) },
  };
}
