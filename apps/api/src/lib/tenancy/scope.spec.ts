import { scopeQueryArgs, TenancyViolationError } from './scope';

const CLINIC = 'clinic-a';

describe('scopeQueryArgs', () => {
  it('adds the clinic to every read, keeping the caller filter', () => {
    for (const op of ['findMany', 'findFirst', 'findUnique', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy']) {
      expect(scopeQueryArgs(op, { where: { fullName: 'Ana' } }, CLINIC)).toEqual({
        where: { fullName: 'Ana', clinicId: CLINIC },
      });
    }
  });

  it('adds the clinic when the read has no filter at all', () => {
    expect(scopeQueryArgs('findMany', undefined, CLINIC)).toEqual({ where: { clinicId: CLINIC } });
    expect(scopeQueryArgs('count', {}, CLINIC)).toEqual({ where: { clinicId: CLINIC } });
  });

  it('overrides a clinicId the caller tried to pass in a filter', () => {
    expect(scopeQueryArgs('findMany', { where: { clinicId: 'clinic-b' } }, CLINIC)).toEqual({
      where: { clinicId: CLINIC },
    });
  });

  it('keeps compound unique keys usable alongside the clinic', () => {
    const args = { where: { valoracionId_view: { valoracionId: 'v1', view: 'FRONT' } } };
    expect(scopeQueryArgs('findUnique', args, CLINIC)).toEqual({
      where: { valoracionId_view: { valoracionId: 'v1', view: 'FRONT' }, clinicId: CLINIC },
    });
  });

  it('limits updates and deletes to the clinic', () => {
    for (const op of ['update', 'updateMany', 'delete', 'deleteMany']) {
      const scoped = scopeQueryArgs(op, { where: { id: 'x' }, data: { notes: 'n' } }, CLINIC);
      expect(scoped?.['where']).toEqual({ id: 'x', clinicId: CLINIC });
    }
  });

  it('writes the clinic into created rows', () => {
    expect(scopeQueryArgs('create', { data: { fullName: 'Ana' } }, CLINIC)).toEqual({
      data: { fullName: 'Ana', clinicId: CLINIC },
    });
    expect(scopeQueryArgs('createMany', { data: [{ a: 1 }, { a: 2 }] }, CLINIC)).toEqual({
      data: [
        { a: 1, clinicId: CLINIC },
        { a: 2, clinicId: CLINIC },
      ],
    });
  });

  it('scopes both sides of an upsert', () => {
    expect(
      scopeQueryArgs('upsert', { where: { id: 'x' }, create: { name: 'n' }, update: { name: 'm' } }, CLINIC)
    ).toEqual({
      where: { id: 'x', clinicId: CLINIC },
      create: { name: 'n', clinicId: CLINIC },
      update: { name: 'm' },
    });
  });

  it('refuses to create a row for another clinic', () => {
    expect(() => scopeQueryArgs('create', { data: { clinicId: 'clinic-b' } }, CLINIC)).toThrow(
      TenancyViolationError
    );
  });

  it('accepts a create that already names the current clinic', () => {
    expect(scopeQueryArgs('create', { data: { clinicId: CLINIC, a: 1 } }, CLINIC)).toEqual({
      data: { clinicId: CLINIC, a: 1 },
    });
  });

  it('refuses to move a row to another clinic', () => {
    expect(() => scopeQueryArgs('update', { where: { id: 'x' }, data: { clinicId: 'clinic-b' } }, CLINIC)).toThrow(
      TenancyViolationError
    );
    expect(() =>
      scopeQueryArgs('upsert', { where: { id: 'x' }, create: {}, update: { clinicId: 'clinic-b' } }, CLINIC)
    ).toThrow(TenancyViolationError);
  });

  it('refuses a relation-style clinic in a create', () => {
    expect(() =>
      scopeQueryArgs('create', { data: { clinic: { connect: { id: 'clinic-b' } } } }, CLINIC)
    ).toThrow(TenancyViolationError);
  });
});
