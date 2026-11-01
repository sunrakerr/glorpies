import type { MDXComponents } from 'mdx/types';
import { AgentList, AvatarDemo, Faces, LooksGrid, PropsTable, StatesTable } from './components/docs/Demos';
import { Code, CodeGroup, Frameworks, Note, Preview, prose, Step, Steps } from './components/docs/Prose';
import { Install } from './components/Install';

const components = { ...prose, AgentList, AvatarDemo, Code, CodeGroup, Faces, Frameworks, Install, LooksGrid, Note, Preview, PropsTable, StatesTable, Step, Steps } as MDXComponents;

export function useMDXComponents(): MDXComponents {
  return components;
}
