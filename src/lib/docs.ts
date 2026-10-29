export type DocPage = { slug: string; title: string; mark: string; summary: string };

export const DOCS: { group: string; pages: DocPage[] }[] = [
  {
    group: 'start',
    pages: [
      { slug: '', title: 'introduction', mark: 'ⵙ', summary: 'what glorpies is, and a face in a minute' },
      { slug: 'installation', title: 'installation', mark: 'ⵣ', summary: 'the package, and what each entry needs' },
    ],
  },
  {
    group: 'use',
    pages: [
      { slug: 'react', title: 'react', mark: 'ⵔ', summary: '<Glorpie>, and a photo with a face behind it' },
      { slug: 'web-component', title: 'web component', mark: 'ⵡ', summary: '<glorpie-face> in html, vue, svelte or angular' },
      { slug: 'canvas', title: 'canvas', mark: 'ⵛ', summary: 'mount() on your own canvas, stills and svg' },
      { slug: 'server', title: 'server images', mark: 'ⵅ', summary: 'png, webp, svg and gif from a route in your app' },
      { slug: 'cli', title: 'cli', mark: 'ⵜ', summary: 'any name to an image file' },
    ],
  },
  {
    group: 'faces',
    pages: [
      { slug: 'looks', title: 'looks', mark: 'ⵀ', summary: '29 ways to paint a face, with or without its background' },
      { slug: 'states', title: 'states', mark: 'ⵚ', summary: 'moods for agents: thinking, working, blocked…' },
    ],
  },
  {
    group: 'reference',
    pages: [
      { slug: 'api', title: 'api', mark: 'ⵥ', summary: 'every export, option and type' },
      { slug: 'faq', title: 'faq', mark: 'ⵇ', summary: 'determinism, collisions, performance, licence' },
    ],
  },
];

export const DOC_PAGES = DOCS.flatMap((g) => g.pages);

export const docHref = (slug: string) => (slug ? `/docs/${slug}` : '/docs');
