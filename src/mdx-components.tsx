import type { MDXComponents } from 'mdx/types';
import { Contents } from './components/docs/Contents';
import { AgentList, AvatarDemo, Faces, LooksGrid, PropsTable, StatesTable } from './components/docs/Demos';
import { Code, Lead, Note, prose } from './components/docs/Prose';
import { Install } from './components/Install';

const components = { ...prose, AgentList, AvatarDemo, Code, Contents, Faces, Install, Lead, LooksGrid, Note, PropsTable, StatesTable } as MDXComponents;

export function useMDXComponents(): MDXComponents {
  return components;
}
