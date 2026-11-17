import { readFileSync } from 'fs';
import { join } from 'path';
import { findLegalPlaceholders, parseLegalMarkdown } from '@expedientes/shared-types';

describe('parseLegalMarkdown', () => {
  it('parses headings, paragraphs, lists, notes and tables', () => {
    const blocks = parseLegalMarkdown(
      [
        '# Aviso',
        '',
        '> **Borrador** pendiente.',
        '',
        'Primera línea',
        'sigue el párrafo.',
        '',
        '## 1. Datos',
        '',
        '- uno',
        '- **dos**',
        '',
        '1. primero',
        '2. segundo',
        '',
        '| A | B |',
        '| --- | --- |',
        '| x | [web](https://medcloud.intech-erp.com) |',
      ].join('\n')
    );
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'note', 'paragraph', 'heading', 'list', 'list', 'table']);
    expect(blocks[0]).toEqual({ kind: 'heading', level: 1, spans: [{ text: 'Aviso' }] });
    expect(blocks[1]).toEqual({ kind: 'note', spans: [{ text: 'Borrador', bold: true }, { text: ' pendiente.' }] });
    expect(blocks[2]).toEqual({ kind: 'paragraph', spans: [{ text: 'Primera línea sigue el párrafo.' }] });
    expect(blocks[4]).toMatchObject({ kind: 'list', ordered: false, items: [[{ text: 'uno' }], [{ text: 'dos', bold: true }]] });
    expect(blocks[5]).toMatchObject({ kind: 'list', ordered: true });
    expect(blocks[6]).toEqual({
      kind: 'table',
      header: [[{ text: 'A' }], [{ text: 'B' }]],
      rows: [[[{ text: 'x' }], [{ text: 'web', href: 'https://medcloud.intech-erp.com' }]]],
    });
  });

  it('never turns a non-http link into a link', () => {
    const [block] = parseLegalMarkdown('[clic](javascript:alert(1))');
    expect(block).toEqual({ kind: 'paragraph', spans: [{ text: '[clic](javascript:alert(1))' }] });
  });
});

describe('findLegalPlaceholders', () => {
  it('finds bracketed placeholders but not links', () => {
    expect(findLegalPlaceholders('Soy [RAZÓN SOCIAL] en [x](https://a.b) y [RAZÓN SOCIAL].')).toEqual(['[RAZÓN SOCIAL]']);
  });
});

describe('the bundled legal drafts', () => {
  const dir = join(__dirname, '../../../../../prisma/legal');

  for (const file of ['privacy-notice-v1.md', 'terms-v1.md']) {
    it(`${file} parses into a titled document`, () => {
      const markdown = readFileSync(join(dir, file), 'utf8');
      const blocks = parseLegalMarkdown(markdown);
      expect(blocks[0]).toMatchObject({ kind: 'heading', level: 1 });
      expect(blocks.filter((b) => b.kind === 'heading' && b.level === 2).length).toBeGreaterThan(5);
      // The migration seeds exactly these texts.
      const migration = readFileSync(
        join(__dirname, '../../../../../prisma/migrations/20261118000000_signup_legal/migration.sql'),
        'utf8'
      );
      expect(migration.includes(`$legal$${markdown}$legal$`)).toBe(true);
    });
  }
});
