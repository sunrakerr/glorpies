'use client';

import { useState } from 'react';
import { CopyButton } from './Code';
import { Tabs } from './Tabs';

const MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const;
type Manager = (typeof MANAGERS)[number];

const command = (manager: Manager, packages: string) => `${manager} ${manager === 'npm' ? 'i' : 'add'} ${packages}`;

/** A little terminal with the install command, one tab per package manager. */
export function Install({ packages = 'glorpies', className = '' }: { packages?: string; className?: string }) {
  const [manager, setManager] = useState<Manager>('npm');
  return (
    <div className={`w-fit max-w-full rounded-lg border border-term-fg/10 bg-term text-term-fg shadow-pill ${className}`}>
      <div className="border-b border-term-fg/10 px-2 py-1.5">
        <Tabs options={MANAGERS} value={manager} onChange={setManager} dark />
      </div>
      <div className="flex h-11 items-center gap-3 overflow-x-auto pl-4 pr-1.5">
        <span className="text-[13.5px] text-term-accent">❯</span>
        {/* every command is laid out, the others hidden, so the box is as wide as the longest and never jumps */}
        <code className="grid whitespace-nowrap text-[13.5px]">
          {MANAGERS.map((m) => (
            <span key={m} aria-hidden={m !== manager} className={`[grid-area:1/1] ${m === manager ? '' : 'invisible'}`}>{command(m, packages)}</span>
          ))}
        </code>
        <CopyButton text={command(manager, packages)} />
      </div>
    </div>
  );
}
