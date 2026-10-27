import type { Metadata, Viewport } from 'next';
import { Geist_Mono, Geist_Pixel, Noto_Sans_Egyptian_Hieroglyphs, Noto_Sans_Linear_A, Noto_Sans_Runic, Noto_Sans_Symbols_2, Noto_Sans_Tifinagh } from 'next/font/google';
import { SITE_URL } from '@/lib/site';
import { THEME_SCRIPT } from '@/lib/theme';
import './globals.css';

/** Crisp square pixels for titles, labels and controls; Geist Mono for reading. */
const pixel = Geist_Pixel({ subsets: ['latin'], variable: '--font-pixel' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });
/** Alien writing, in scripts nobody reads any more. Decoration, so it isn't preloaded. */
const hiero = Noto_Sans_Egyptian_Hieroglyphs({ subsets: ['egyptian-hieroglyphs'], weight: '400', variable: '--font-hiero', preload: false });
const linearA = Noto_Sans_Linear_A({ subsets: ['linear-a'], weight: '400', variable: '--font-linear-a', preload: false });
const runic = Noto_Sans_Runic({ subsets: ['runic'], weight: '400', variable: '--font-runic', preload: false });
/** The headline's alien alphabet (Tifinagh: dots, rings and strokes), and braille dots for it coming into focus. */
const tifinagh = Noto_Sans_Tifinagh({ subsets: ['tifinagh'], weight: '400', variable: '--font-tifinagh', preload: false });
const braille = Noto_Sans_Symbols_2({ subsets: ['braille'], weight: '400', variable: '--font-braille-dots', preload: false });

const description =
  'glorpies turns any name into a hand-painted alien avatar, the same face every time, in 29 looks. alive, with moods for agents. react, a web component, image urls and a cli, with zero dependencies.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'glorpies · all hail the glorpies', template: '%s · glorpies' },
  description,
  applicationName: 'glorpies',
  openGraph: { title: 'glorpies', description, siteName: 'glorpies', type: 'website' },
  twitter: { card: 'summary', title: 'glorpies', description },
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
    <html lang="en" data-theme="light" suppressHydrationWarning className={[pixel, mono, hiero, linearA, runic, tifinagh, braille].map((f) => f.variable).join(' ')}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
