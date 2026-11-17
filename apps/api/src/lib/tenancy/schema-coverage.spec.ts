import { readFileSync } from 'fs';
import { join } from 'path';
import { CHILD_MODELS, GLOBAL_MODELS, TENANT_MODELS } from './scope';

/**
 * Keeps the tenancy lists honest as the schema grows. A new model must be put in exactly one list,
 * which forces a decision about whether its rows belong to a clinic, and a tenant model must really
 * have a required clinicId.
 */
const schema = readFileSync(join(__dirname, '../../../../../prisma/schema.prisma'), 'utf8');

function models(): Map<string, string> {
  const result = new Map<string, string>();
  const pattern = /^model (\w+) \{([\s\S]*?)^\}/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(schema)) !== null) result.set(match[1], match[2]);
  return result;
}

function hasRequiredClinicId(body: string): boolean {
  return /^\s*clinicId\s+String(\s|$)/m.test(body);
}

describe('tenancy classification of the Prisma schema', () => {
  const all = models();

  it('finds the models', () => {
    expect(all.size).toBeGreaterThan(20);
  });

  it('classifies every model exactly once', () => {
    const unclassified: string[] = [];
    const twice: string[] = [];
    for (const name of all.keys()) {
      const hits = [TENANT_MODELS, CHILD_MODELS, GLOBAL_MODELS].filter((set) => set.has(name)).length;
      if (hits === 0) unclassified.push(name);
      if (hits > 1) twice.push(name);
    }
    expect({ unclassified, twice }).toEqual({ unclassified: [], twice: [] });
  });

  it('lists no model that does not exist', () => {
    const listed = [...TENANT_MODELS, ...CHILD_MODELS, ...GLOBAL_MODELS];
    expect(listed.filter((name) => !all.has(name))).toEqual([]);
  });

  it('gives every tenant model a required clinicId, and no other model one', () => {
    const tenantWithout = [...TENANT_MODELS].filter((name) => !hasRequiredClinicId(all.get(name) ?? ''));
    const othersWith = [...CHILD_MODELS, ...GLOBAL_MODELS].filter((name) =>
      hasRequiredClinicId(all.get(name) ?? '')
    );
    expect({ tenantWithout, othersWith }).toEqual({ tenantWithout: [], othersWith: [] });
  });
});
