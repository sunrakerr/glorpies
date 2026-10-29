export type Lang = 'tsx' | 'ts' | 'html' | 'sh' | 'text';
export type TokenKind = 'comment' | 'string' | 'keyword' | 'tag' | 'attr' | 'number' | 'flag' | 'command' | 'punct' | 'text';
export type Token = { kind: TokenKind; text: string };

/**
 * Just enough highlighting for the snippets on this site: strings, comments,
 * keywords, tags and attributes, and for the shell, commands and flags. One
 * regex, alternatives in priority order, everything between them is text.
 */
const RULES: [TokenKind, string][] = [
  ['comment', String.raw`\/\/[^\n]*|<!--[\s\S]*?-->|(?<=^|\s)#[^\n]*`],
  ['string', String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\x60[^\x60]*\x60`],
  ['tag', String.raw`<\/?[A-Za-z][\w.-]*`],
  ['keyword', String.raw`\b(?:import|from|export|const|let|return|async|await|new|type|default|function)\b`],
  ['attr', String.raw`[A-Za-z_][\w-]*(?==)`],
  ['flag', String.raw`(?<=\s)--?[A-Za-z][\w-]*`],
  ['number', String.raw`\b\d+(?:\.\d+)?\b`],
  ['punct', String.raw`\/?>|[{}()[\];,.=:]`],
];

const PATTERN = new RegExp(RULES.map(([, re]) => `(${re})`).join('|'), 'g');

export function highlight(code: string, lang: Lang): Token[][] {
  if (lang === 'text') return code.split('\n').map((line) => (line ? [{ kind: 'text', text: line }] : []));
  return code.split('\n').map((line) => {
    const out: Token[] = [];
    const push = (kind: TokenKind, text: string) => { if (text) out.push({ kind, text }); };
    let rest = line;
    // in the shell the first word is the command, and nothing but flags, strings and comments stands out
    if (lang === 'sh') {
      const [, indent = '', command = ''] = /^(\s*)(\S*)/.exec(line)!;
      push('text', indent);
      push('command', command);
      rest = line.slice(indent.length + command.length);
    }
    let at = 0;
    for (const m of rest.matchAll(PATTERN)) {
      const kind = RULES[m.slice(1).findIndex((g) => g !== undefined)]![0];
      push('text', rest.slice(at, m.index));
      push(lang === 'sh' && kind !== 'flag' && kind !== 'string' && kind !== 'comment' ? 'text' : kind, m[0]);
      at = m.index + m[0].length;
    }
    push('text', rest.slice(at));
    return out;
  });
}
