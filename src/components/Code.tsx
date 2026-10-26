'use client';

import { Check, Copy } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { highlight, type Lang } from '@/lib/highlight';

/** Copies `text`, and says so for a moment. With `label`, it reads "copy" / "copied" next to the icon. */
export function CopyButton({ text, label = false, className = '' }: { text: string; label?: boolean; className?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    } catch {
      // without clipboard access the text is still there to select by hand
    }
  };
  const Icon = done ? Check : Copy;
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={done ? 'Copied' : 'Copy'}
      className={`inline-flex h-7 shrink-0 items-center justify-center gap-1.5 text-[11px] opacity-55 transition hover:opacity-100 ${label ? 'px-2' : 'w-7'} ${done ? 'text-accent opacity-100' : ''} ${className}`}
    >
      <Icon className="size-3.5" strokeWidth={done ? 2 : 1.7} />
      {label && (done ? 'copied' : 'copy')}
    </button>
  );
}

/**
 * Code in a terminal window: a title bar (a file name, or tabs passed in as
 * `title`), line numbers and syntax colours, with a copy button. `compact`
 * drops the window dots and the copy label, for narrow panels.
 */
export function CodePanel({ code, lang, title, compact = false, className = '' }: { code: string; lang: Lang; title?: ReactNode; compact?: boolean; className?: string }) {
  const lines = useMemo(() => highlight(code, lang), [code, lang]);
  return (
    <div className={`overflow-hidden rounded-lg border border-white/[0.07] bg-term text-term-fg shadow-sheet ${className}`}>
      <div className={`flex h-10 items-center gap-3 border-b border-white/[0.07] pr-2 ${compact ? 'pl-2.5' : 'pl-4'}`}>
        <span aria-hidden className={`gap-1.5 ${compact ? 'hidden' : 'flex'}`}>
          <i className="size-2.5 rounded-full bg-[#ff5f7a]/80" />
          <i className="size-2.5 rounded-full bg-[#ffd23f]/80" />
          <i className="size-2.5 rounded-full bg-[#b4ff5a]/80" />
        </span>
        <div className="min-w-0 flex-1 text-[11.5px] text-term-fg/55">{title}</div>
        <CopyButton text={code} label={!compact} />
      </div>
      <pre className="overflow-x-auto py-3.5 text-[12.5px] leading-[1.8] [scrollbar-width:thin]">
        <code className="grid min-w-max">
          {lines.map((tokens, i) => (
            <span key={i} className="grid grid-cols-[3rem_minmax(0,1fr)] pr-5">
              <span aria-hidden className="select-none pr-4 text-right text-term-fg/25">{lang === 'sh' ? '$' : i + 1}</span>
              <span>
                {tokens.map((t, j) => (t.kind === 'text' ? t.text : <span key={j} className={`tk-${t.kind}`}>{t.text}</span>))}
                {tokens.length === 0 && ' '}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
