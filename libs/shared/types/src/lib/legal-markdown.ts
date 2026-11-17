/**
 * The small Markdown subset legal documents are written in, parsed into plain data so the web can
 * render it with templates instead of injecting HTML. Supported: `#`–`###` headings, paragraphs,
 * `-` and `1.` lists, pipe tables, `>` notes, `**bold**` and `[text](https://…)` links.
 */

export interface LegalSpan {
  text: string;
  bold?: boolean;
  href?: string;
}

export type LegalBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; spans: LegalSpan[] }
  | { kind: 'paragraph'; spans: LegalSpan[] }
  | { kind: 'note'; spans: LegalSpan[] }
  | { kind: 'list'; ordered: boolean; items: LegalSpan[][] }
  | { kind: 'table'; header: LegalSpan[][]; rows: LegalSpan[][][] };

export function parseLegalInline(text: string): LegalSpan[] {
  const spans: LegalSpan[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) spans.push({ text: text.slice(last, match.index) });
    if (match[1] !== undefined) spans.push({ text: match[1], bold: true });
    else spans.push({ text: match[2], href: match[3] });
    last = match.index + match[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans;
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

export function parseLegalMarkdown(markdown: string): LegalBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: LegalBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        spans: parseLegalInline(heading[2]),
      });
      i++;
      continue;
    }
    if (trimmed.startsWith('|')) {
      const rowsText: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rowsText.push(lines[i++]);
      const [headerLine, ...rest] = rowsText;
      const body = rest.filter((row) => !/^\|?\s*:?-{3,}/.test(row.trim()));
      blocks.push({
        kind: 'table',
        header: tableCells(headerLine).map(parseLegalInline),
        rows: body.map((row) => tableCells(row).map(parseLegalInline)),
      });
      continue;
    }
    if (/^(-|\d+\.)\s+/.test(trimmed)) {
      const ordered = /^\d+\./.test(trimmed);
      const items: LegalSpan[][] = [];
      while (i < lines.length && /^(-|\d+\.)\s+/.test(lines[i].trim())) {
        items.push(parseLegalInline(lines[i].trim().replace(/^(-|\d+\.)\s+/, '')));
        i++;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    if (trimmed.startsWith('>')) {
      const parts: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) parts.push(lines[i++].trim().replace(/^>\s?/, ''));
      blocks.push({ kind: 'note', spans: parseLegalInline(parts.join(' ')) });
      continue;
    }
    const parts: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3}\s|\||-\s|\d+\.\s|>)/.test(lines[i].trim())
    ) {
      parts.push(lines[i++].trim());
    }
    blocks.push({ kind: 'paragraph', spans: parseLegalInline(parts.join(' ')) });
  }
  return blocks;
}

/** Placeholders still waiting to be filled in, like `[RAZÓN SOCIAL]`; links are not placeholders. */
export function findLegalPlaceholders(markdown: string): string[] {
  const found = markdown.match(/\[[^\]]+\](?!\()/g) ?? [];
  return [...new Set(found)];
}
