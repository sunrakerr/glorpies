'use client';

import { Dices } from 'lucide-react';
import { useState } from 'react';
import {
  FULL_LOOKS,
  randomName,
  SMALL_LOOKS,
  type FaceState,
  type LookChoice,
  type Shape,
} from 'glorpies';
import { Avatar, AvatarFallback, AvatarImage, Glorpie } from 'glorpies/react';
import { Tabs } from '../Tabs';

/** A few faces in a row, each over its name. */
export function Faces({
  names,
  size = 64,
  look = 'auto',
  shape = 'squircle',
  state,
  background = true,
}: {
  names: string[];
  size?: number;
  look?: LookChoice;
  shape?: Shape;
  state?: FaceState;
  background?: boolean | string;
}) {
  return (
    <div className="my-6 flex flex-wrap items-end gap-x-7 gap-y-5">
      {names.map((name) => (
        <figure key={name} className="flex flex-col items-center gap-2">
          <Glorpie
            name={name}
            size={size}
            look={look}
            shape={shape}
            state={state}
            background={background}
            label={name}
          />
          <figcaption className="text-[11px] text-ink-2">{name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Every look, painting one name, with or without its background. */
export function LooksGrid() {
  const [name, setName] = useState('zorb-from-accounts');
  const [background, setBackground] = useState(true);
  return (
    <div className="my-8">
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex w-64 items-center gap-2.5 border-b border-ink/25 pb-1.5 transition focus-within:border-accent">
          <span aria-hidden className="text-accent">
            ❯
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            spellCheck={false}
            maxLength={64}
            aria-label="Name"
            className="w-full bg-transparent text-[14px] text-ink outline-none"
          />
          <button
            type="button"
            onClick={() => setName(randomName())}
            aria-label="Make up a name"
            className="text-ink-2 transition hover:text-ink"
          >
            <Dices className="size-4" strokeWidth={1.8} />
          </button>
        </label>
        <span className="flex items-center gap-3 text-[12px] text-ink-2">
          background
          <Tabs
            options={['true', 'false'] as const}
            value={background ? 'true' : 'false'}
            onChange={(v) => setBackground(v === 'true')}
          />
        </span>
      </div>
      {[
        { title: 'paintings', looks: FULL_LOOKS },
        { title: 'avatars', looks: SMALL_LOOKS },
      ].map((group) => (
        <div key={group.title} className="mb-8">
          <p className="mb-3 text-[11px] text-ink-2/70">{group.title}</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-x-3 gap-y-5">
            {group.looks.map((l) => (
              <figure key={l.id} className="flex flex-col items-center gap-2" title={l.name}>
                <div className={`rounded-[22%] ${background ? '' : 'checker'}`}>
                  <Glorpie
                    name={name || ' '}
                    look={l.id}
                    size={84}
                    shape="squircle"
                    background={background}
                    label={`${name} in ${l.name}`}
                  />
                </div>
                <figcaption className="text-[11px] text-ink">{l.id}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const STATE_NOTES: { state: FaceState; mark: string; face: string }[] = [
  { state: 'idle', mark: 'none', face: 'at ease: breathing, blinking, glancing at the pointer' },
  {
    state: 'thinking',
    mark: 'thought bubbles',
    face: 'eyes up and away, one brow raised, head tilted',
  },
  { state: 'working', mark: 'typing bubble', face: 'eyes down reading, brows set, a steady nod' },
  { state: 'waiting', mark: 'a ?', face: 'brows up, a hopeful smile, looking at you' },
  {
    state: 'blocked',
    mark: 'a red !',
    face: 'knitted brows, a frown, slumped, shaking now and then',
  },
  { state: 'done', mark: 'sparkles', face: 'a big smile, a pleased squint, a little hop' },
];

/** The six states on one face, with what each one shows. */
export function StatesTable({ name = 'agent-47' }: { name?: string }) {
  return (
    <div className="my-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {STATE_NOTES.map((s) => (
        <div key={s.state} className="flex items-center gap-4 rounded-lg border border-ink/10 p-3">
          <Glorpie
            name={name}
            state={s.state}
            size={64}
            look="watercolour"
            shape="squircle"
            label={`${name}, ${s.state}`}
          />
          <div className="min-w-0 text-[12px] leading-relaxed">
            <code className="text-accent">{s.state}</code>
            <p className="text-ink-2">{s.face}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

const AGENTS: { name: string; task: string; state: FaceState }[] = [
  { name: 'research-bot', task: 'reading 14 papers', state: 'working' },
  { name: 'planner', task: 'weighing two plans', state: 'thinking' },
  { name: 'deploy-agent', task: 'needs a token', state: 'blocked' },
  { name: 'reviewer', task: 'your turn: 3 comments', state: 'waiting' },
  { name: 'test-runner', task: '212 passed', state: 'done' },
];

/** A sidebar of agents, each telling you its status with its face. */
export function AgentList() {
  return (
    <ul className="my-6 w-full max-w-sm divide-y divide-ink/8 rounded-lg border border-ink/10 bg-paper-2/40">
      {AGENTS.map((a) => (
        <li key={a.name} className="flex list-none items-center gap-3 px-3 py-2.5">
          <Glorpie name={a.name} state={a.state} size={36} label={`${a.name}: ${a.state}`} />
          <div className="min-w-0 text-[12px]">
            <p className="text-ink">{a.name}</p>
            <p className="truncate text-ink-2">{a.task}</p>
          </div>
          <code className="ml-auto text-[11px] text-ink-2/70">{a.state}</code>
        </li>
      ))}
    </ul>
  );
}

/** Three avatars: a photo that loads, one that fails, and none at all. */
export function AvatarDemo() {
  const cases = [
    { label: 'photo loads', src: '/docs/a-photo.png' },
    { label: 'photo fails', src: '/no-such-photo.jpg' },
    { label: 'no photo', src: undefined },
  ];
  return (
    <div className="my-6 flex flex-wrap gap-8">
      {cases.map((c) => (
        <figure key={c.label} className="flex flex-col items-center gap-2">
          <Avatar size={56}>
            <AvatarImage src={c.src} alt="" />
            <AvatarFallback name="grace@hopper.dev" />
          </Avatar>
          <figcaption className="text-[11px] text-ink-2">{c.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

const PROPS: { prop: string; type: string; fallback: string; note: string }[] = [
  {
    prop: 'name',
    type: 'string | number',
    fallback: 'required',
    note: 'Any string, or a seed in [0, 2^53). The same name always gives the same face.',
  },
  {
    prop: 'look',
    type: '"auto" | look id',
    fallback: '"auto"',
    note: 'auto resolves to watercolour at 72px and up, ink below. See looks.',
  },
  {
    prop: 'size',
    type: 'number | CSS length',
    fallback: '48',
    note: 'Pixels, or any CSS length such as "100%". Repaints at the new resolution when it grows.',
  },
  {
    prop: 'shape',
    type: '"circle" | "squircle" | "rounded" | "square"',
    fallback: '"circle"',
    note: 'The crop. Ignored when background is false.',
  },
  {
    prop: 'background',
    type: 'boolean | string',
    fallback: 'true',
    note: 'false draws only the face, on transparency: no backdrop, pencil guides or crop. A CSS colour puts the face on that colour instead of its paper, inside its crop.',
  },
  {
    prop: 'state',
    type: 'idle | thinking | working | waiting | blocked | done',
    fallback: '"idle"',
    note: 'Changes the expression and motion, and adds a mark beside the head. See states.',
  },
  {
    prop: 'alive',
    type: 'boolean',
    fallback: 'true',
    note: 'Breathing, blinking and glancing at the pointer. Defaults to false under prefers-reduced-motion.',
  },
  {
    prop: 'pokeable',
    type: 'boolean',
    fallback: 'false',
    note: 'Clicking or tapping the face makes it wobble.',
  },
  {
    prop: 'label',
    type: 'string',
    fallback: '"Avatar"',
    note: 'The accessible name; the face has role="img".',
  },
  {
    prop: 'priority',
    type: 'number',
    fallback: '1',
    note: 'Paint order when many faces are queued; higher paints first. Raise it for faces above the fold.',
  },
];

export function PropsTable() {
  return (
    <div className="my-6 overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-ink/15 text-[11px] text-ink-2">
            {['prop', 'type', 'default', ''].map((h) => (
              <th key={h} className="py-2 pr-4 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PROPS.map((p) => (
            <tr key={p.prop} className="border-b border-ink/8 align-top">
              <td className="py-2.5 pr-4 text-ink">{p.prop}</td>
              <td className="max-w-[14rem] py-2.5 pr-4 text-accent">{p.type}</td>
              <td className="whitespace-nowrap py-2.5 pr-4 text-ink-2">{p.fallback}</td>
              <td className="py-2.5 leading-relaxed text-ink-2">{p.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
