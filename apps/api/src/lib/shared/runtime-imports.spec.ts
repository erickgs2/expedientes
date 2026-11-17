import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * `next build` (Turbopack) cannot resolve the `.js` re-exports of @expedientes/shared-types, so the
 * API may only import types from the package; runtime values come through lib/shared/runtime.ts.
 * Jest resolves the package fine, which is why this has to be checked explicitly.
 */
const SRC = join(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.spec\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('imports from @expedientes/shared-types in the API', () => {
  it('are type-only', () => {
    const offenders: string[] = [];
    const pattern = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+'@expedientes\/shared-types'/g;
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1]) continue;
        const values = match[2]
          .split(',')
          .map((name) => name.trim())
          .filter((name) => name && !name.startsWith('type '));
        if (values.length) offenders.push(`${relative(SRC, file)}: ${values.join(', ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
