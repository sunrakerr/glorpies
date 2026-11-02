import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MobileIndex, Outline, PrevNext, Sidebar } from '@/components/docs/Nav';
import { Page } from '@/components/Page';

export const metadata: Metadata = {
  title: { default: 'docs', template: '%s · glorpies docs' },
  description:
    'How to use glorpies, the open-source library of hand-painted alien avatars for users, AI agents and bots: in React, Vue, Svelte, Solid, Preact, as a web component, on a canvas, from a server route or the command line.',
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <Page className="pt-12">
      <div className="grid gap-10 md:grid-cols-[160px_minmax(0,1fr)] xl:grid-cols-[160px_minmax(0,1fr)_170px]">
        <Sidebar />
        <div className="min-w-0">
          <MobileIndex />
          <article data-doc>{children}</article>
          <PrevNext />
        </div>
        <Outline />
      </div>
    </Page>
  );
}
