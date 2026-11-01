import type { Metadata, Viewport } from 'next';
import { Geist_Mono, Geist_Pixel, Noto_Sans_Symbols_2, Noto_Sans_Tifinagh } from 'next/font/google';
import { SITE_URL } from '@/lib/site';
import { THEME_SCRIPT } from '@/lib/theme';
import './globals.css';

/** Crisp square pixels for titles, labels and controls; Geist Mono for reading. */
const pixel = Geist_Pixel({ subsets: ['latin'], variable: '--font-pixel' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });
/** The alien alphabet (Tifinagh: dots, rings and strokes), and braille dots for it coming into focus. Decoration, so neither is preloaded. */
const tifinagh = Noto_Sans_Tifinagh({ subsets: ['tifinagh'], weight: '400', variable: '--font-tifinagh', preload: false });
const braille = Noto_Sans_Symbols_2({ subsets: ['braille'], weight: '400', variable: '--font-braille-dots', preload: false });

const description =
  '9 quadrillion hand-painted alien avatars for your users, ai agents and bots, over a million for every person on earth. any string gets its own, and always the same one. alive, with moods for agents. react, vue, svelte, solid, preact, a web component, server images and a cli. open source, with zero dependencies.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'glorpies · all hail the glorpies', template: '%s · glorpies' },
  description,
  applicationName: 'glorpies',
  authors: [{ name: 'sunrakerr', url: 'https://github.com/sunrakerr' }],
  creator: 'sunrakerr',
  openGraph: { title: 'glorpies', description, siteName: 'glorpies', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'glorpies', description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4eee4' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0c13' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // the theme is set before paint by the script below, so the attribute is allowed to differ on hydration
    <html lang="en" data-theme="light" suppressHydrationWarning className={[pixel, mono, tifinagh, braille].map((f) => f.variable).join(' ')}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
