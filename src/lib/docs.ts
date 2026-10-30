export type DocPage = { slug: string; title: string; mark: string; summary: string };

export const DOCS: { group: string; pages: DocPage[] }[] = [
  {
    group: 'start',
    pages: [
      { slug: '', title: 'introduction', mark: 'ⵙ', summary: 'Hand-painted alien avatars from any string, the same face for the same name, everywhere.' },
      { slug: 'quick-start', title: 'quick start', mark: 'ⵣ', summary: 'Install the package and put a face on the page, in any framework.' },
    ],
  },
  {
    group: 'frameworks',
    pages: [
      { slug: 'react', title: 'react', mark: 'ⵔ', summary: 'The <Glorpie> component, and photo avatars that fall back to a face.' },
      { slug: 'vue', title: 'vue', mark: 'ⵠ', summary: 'A <Glorpie> component for Vue 3 and Nuxt.' },
      { slug: 'svelte', title: 'svelte', mark: 'ⵗ', summary: 'A <Glorpie> component and a use:glorpie action, for Svelte 4, 5 and SvelteKit.' },
      { slug: 'solid', title: 'solid', mark: 'ⵛ', summary: 'A <Glorpie> component for Solid and SolidStart.' },
      { slug: 'preact', title: 'preact', mark: 'ⵒ', summary: 'A <Glorpie> component for Preact, with no compat layer.' },
      { slug: 'angular', title: 'angular', mark: 'ⴷ', summary: 'The <glorpie-face> element in Angular templates.' },
      { slug: 'astro', title: 'astro', mark: 'ⵟ', summary: 'Faces in Astro pages, with or without a framework island.' },
      { slug: 'html', title: 'html & js', mark: 'ⵡ', summary: 'The <glorpie-face> element, and mount() on a canvas of your own.' },
    ],
  },
  {
    group: 'images',
    pages: [
      { slug: 'server', title: 'server images', mark: 'ⵅ', summary: 'PNG, WebP, SVG and GIF faces from a route in your own app.' },
      { slug: 'cli', title: 'cli', mark: 'ⵜ', summary: 'Any name to an image file, from a terminal.' },
    ],
  },
  {
    group: 'faces',
    pages: [
      { slug: 'looks', title: 'looks', mark: 'ⵀ', summary: '29 ways to paint the same face.' },
      { slug: 'states', title: 'states', mark: 'ⵚ', summary: 'Moods for agents: thinking, working, waiting, blocked, done.' },
      { slug: 'size-and-shape', title: 'size and shape', mark: 'ⴿ', summary: 'Sizes, crops, and a face without its background.' },
    ],
  },
  {
    group: 'reference',
    pages: [
      { slug: 'options', title: 'options', mark: 'ⵎ', summary: 'Every option a face takes, as a prop, an attribute or a query parameter.' },
      { slug: 'api', title: 'api', mark: 'ⵥ', summary: 'Every export, by entry.' },
      { slug: 'faq', title: 'faq', mark: 'ⵇ', summary: 'Determinism, collisions, performance and licence.' },
    ],
  },
];

export const DOC_PAGES = DOCS.flatMap((g) => g.pages);

export const docHref = (slug: string) => (slug ? `/docs/${slug}` : '/docs');
