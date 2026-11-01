export type DocPage = { slug: string; title: string; mark: string; summary: string };

export const DOCS: { group: string; pages: DocPage[] }[] = [
  {
    group: 'start',
    pages: [
      { slug: '', title: 'introduction', mark: 'ⵙ', summary: 'Generated avatars for every user, bot and agent.' },
      { slug: 'quick-start', title: 'quick start', mark: 'ⵣ', summary: 'Install, render a face, customise it.' },
    ],
  },
  {
    group: 'frameworks',
    pages: [
      { slug: 'react', title: 'react', mark: 'ⵔ', summary: 'The <Glorpie> component, photo avatars and server components.' },
      { slug: 'vue', title: 'vue', mark: 'ⵠ', summary: 'A <Glorpie> component for Vue 3 and Nuxt.' },
      { slug: 'svelte', title: 'svelte', mark: 'ⵗ', summary: 'A <Glorpie> component and a use:glorpie action, for Svelte 4, 5 and SvelteKit.' },
      { slug: 'solid', title: 'solid', mark: 'ⵛ', summary: 'A <Glorpie> component for Solid and SolidStart.' },
      { slug: 'preact', title: 'preact', mark: 'ⵒ', summary: 'A <Glorpie> component for Preact, with no compat layer.' },
      { slug: 'angular', title: 'angular', mark: 'ⴷ', summary: 'The <glorpie-face> element in Angular templates.' },
      { slug: 'astro', title: 'astro', mark: 'ⵟ', summary: 'The element in .astro files, or a component in an island.' },
      { slug: 'html', title: 'html & js', mark: 'ⵡ', summary: 'The <glorpie-face> element, mount() and still images.' },
    ],
  },
  {
    group: 'images',
    pages: [
      { slug: 'server', title: 'server images', mark: 'ⵅ', summary: 'PNG, WebP, SVG and GIF faces from a route in your own app.' },
      { slug: 'cli', title: 'cli', mark: 'ⵜ', summary: 'Render any name to an image file from the terminal.' },
    ],
  },
  {
    group: 'faces',
    pages: [
      { slug: 'looks', title: 'looks', mark: 'ⵀ', summary: '29 ways to paint the same face.' },
      { slug: 'states', title: 'states', mark: 'ⵚ', summary: 'Moods for agents: thinking, working, waiting, blocked, done.' },
      { slug: 'size-and-shape', title: 'size and shape', mark: 'ⴿ', summary: 'Sizing, crops and transparent faces.' },
    ],
  },
  {
    group: 'reference',
    pages: [
      { slug: 'options', title: 'options', mark: 'ⵎ', summary: 'Every option, as a prop, attribute, query parameter or flag.' },
      { slug: 'api', title: 'api', mark: 'ⵥ', summary: 'Every export, by entry point.' },
      { slug: 'faq', title: 'faq', mark: 'ⵇ', summary: 'Determinism, collisions, size, SSR and licence.' },
    ],
  },
];

export const DOC_PAGES = DOCS.flatMap((g) => g.pages);

export const docHref = (slug: string) => (slug ? `/docs/${slug}` : '/docs');
