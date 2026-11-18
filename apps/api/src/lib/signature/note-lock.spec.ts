jest.mock('../prisma/client', () => ({ prisma: {} }));
jest.mock('../auth/password', () => ({ verifyPassword: async (pin: string, hash: string) => hash === `hash:${pin}` }));

import { prisma } from '../prisma/client';
import { afterNoteEdit, beginNoteEdit, diffContent } from './note-signature';
import { createAddendum, listAddenda, parseAddendumDiagrams } from './addenda';
import * as addendaModule from './addenda';
import { listRevisions } from '../historia-clinica/revisions';

type Row = Record<string, unknown>;

/** A tiny in-memory stand-in for the Prisma models these functions touch. */
function fakeDb() {
  const db = {
    valoracion: new Map<string, Row>(),
    historia: new Map<string, Row>(),
    revisions: [] as Row[],
    addenda: [] as Row[],
    audit: [] as Row[],
    users: new Map<string, Row>(),
  };
  let seq = 0;
  const p = prisma as unknown as Record<string, unknown>;
  p.valoracion = {
    findUnique: async ({ where }: { where: { id: string } }) => db.valoracion.get(where.id) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = { ...db.valoracion.get(where.id), ...data };
      db.valoracion.set(where.id, row);
      return row;
    },
  };
  p.treatment = { findUnique: async () => null };
  p.historiaClinica = {
    findUnique: async ({ where }: { where: { id: string } }) => db.historia.get(where.id) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = { ...db.historia.get(where.id), ...data };
      db.historia.set(where.id, row);
      return row;
    },
  };
  p.historiaClinicaRevision = {
    findFirst: async ({ where }: { where: { historiaClinicaId: string } }) =>
      db.revisions
        .filter((r) => r.historiaClinicaId === where.historiaClinicaId)
        .sort((a, b) => (b.revision as number) - (a.revision as number))[0] ?? null,
    findMany: async ({ where }: { where: { historiaClinicaId: string } }) =>
      db.revisions
        .filter((r) => r.historiaClinicaId === where.historiaClinicaId)
        .sort((a, b) => (a.revision as number) - (b.revision as number)),
    create: async ({ data }: { data: Row }) => {
      const row = { id: `rev${++seq}`, changedAt: new Date(), legacyRecord: false, signedAt: null, ...data };
      db.revisions.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = db.revisions.find((r) => r.id === where.id) as Row;
      Object.assign(row, data);
      return row;
    },
  };
  p.clinicalAddendum = {
    create: async ({ data }: { data: Row }) => {
      const row = { id: `add${++seq}`, ...data };
      db.addenda.push(row);
      return row;
    },
    findMany: async ({ where }: { where: { entity: string; entityId: string } }) =>
      db.addenda.filter((a) => a.entity === where.entity && a.entityId === where.entityId),
  };
  p.auditLog = { create: async ({ data }: { data: Row }) => db.audit.push(data) };
  p.user = {
    findUnique: async ({ where }: { where: { id: string } }) => db.users.get(where.id) ?? null,
    findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id) => db.users.get(id)).filter(Boolean),
  };
  return db;
}

const valoracion = (over: Row = {}): Row => ({
  id: 'v1',
  patientId: 'p1',
  fecha: new Date('2026-11-18T00:00:00Z'),
  queQuiereElPaciente: 'Labios',
  queNecesitaElPaciente: null,
  notas: 'Ácido hialurónico 1 ml',
  diagrams: [{ view: 'LIPS', data: { strokes: [1, 2, 3] } }],
  createdById: 'u1',
  createdAt: new Date('2026-11-18T16:00:00Z'),
  signedById: null,
  signedAt: null,
  signedHash: null,
  signerName: null,
  signerTitle: null,
  signerLicense: null,
  legacyRecord: false,
  ...over,
});

const doctor = { id: 'u1', fullName: 'Miroslava Ruiz', professionalTitle: 'Dra.', professionalLicense: '12345678', signingPinHash: 'hash:246810' };

describe('signed notes are locked (phase C1)', () => {
  it('refuses to edit a signed valoración with 409 NOTE_SIGNED', async () => {
    const db = fakeDb();
    db.valoracion.set('v1', valoracion({ signedAt: new Date(), signerName: 'Miroslava Ruiz' }));
    let error: { code?: string; status?: number } | null = null;
    try {
      await beginNoteEdit('valoracion', 'v1');
    } catch (e) {
      error = e as { code?: string; status?: number };
    }
    expect(error?.code).toBe('NOTE_SIGNED');
    expect(error?.status).toBe(409);
  });

  it('keeps a draft editable and logs each changed field before and after', async () => {
    const db = fakeDb();
    db.valoracion.set('v1', valoracion());
    const start = await beginNoteEdit('valoracion', 'v1');
    expect(start).not.toBeNull();

    db.valoracion.set('v1', valoracion({ notas: 'Ácido hialurónico 0.5 ml', diagrams: [{ view: 'LIPS', data: { strokes: [9] } }] }));
    await afterNoteEdit('valoracion', 'v1', 'u1', 'p1', start);

    expect(db.audit).toHaveLength(1);
    const changes = (db.audit[0].metadata as { changes: Record<string, { before: unknown; after: unknown }> }).changes;
    expect(Object.keys(changes).sort()).toEqual(['diagrams', 'notas']);
    expect(changes.notas).toEqual({ before: 'Ácido hialurónico 1 ml', after: 'Ácido hialurónico 0.5 ml' });
    // Diagram strokes are logged as a short hash per view, not copied whole.
    const before = changes.diagrams.before as { view: string; data: string }[];
    expect(before[0].view).toBe('LIPS');
    expect(typeof before[0].data).toBe('string');
    expect(before[0].data).toHaveLength(12);
  });

  it('logs nothing when a save changed nothing', async () => {
    const db = fakeDb();
    db.valoracion.set('v1', valoracion());
    const start = await beginNoteEdit('valoracion', 'v1');
    await afterNoteEdit('valoracion', 'v1', 'u1', 'p1', start);
    expect(db.audit).toHaveLength(0);
    expect(diffContent({ a: 1 }, { a: 1 })).toEqual({});
  });
});

describe('addenda (phase C2)', () => {
  it('is only for signed notes', async () => {
    const db = fakeDb();
    db.users.set('u1', doctor);
    db.valoracion.set('v1', valoracion());
    const result = await createAddendum('valoracion', 'v1', 'u1', { text: 'Corrección', diagrams: [], pin: '246810' });
    expect(result).toEqual({ ok: false, code: 'NOTE_NOT_SIGNED' });
  });

  it('is written and signed in one step with the PIN, and listed in order', async () => {
    const db = fakeDb();
    db.users.set('u1', doctor);
    db.valoracion.set('v1', valoracion({ signedAt: new Date('2026-11-18T17:00:00Z'), signerName: 'Miroslava Ruiz' }));

    expect((await createAddendum('valoracion', 'v1', 'u1', { text: 'x', diagrams: [], pin: '000000' })).ok).toBe(false);

    const first = await createAddendum('valoracion', 'v1', 'u1', {
      text: 'La dosis real fue 0.5 ml.',
      diagrams: [{ view: 'LIPS', data: { strokes: [4] } }],
      pin: '246810',
    }, new Date('2026-11-18T18:00:00Z'));
    const second = await createAddendum('valoracion', 'v1', 'u1', { text: 'Control a 15 días.', diagrams: [], pin: '246810' }, new Date('2026-11-18T19:00:00Z'));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok) return;
    expect(first.addendum.signed).toEqual({ at: '2026-11-18T18:00:00.000Z', name: 'Miroslava Ruiz', title: 'Dra.', license: '12345678' });
    expect(first.addendum.diagrams).toEqual([{ view: 'LIPS', data: { strokes: [4] } }]);
    expect(typeof db.addenda[0].contentHash).toBe('string');

    const list = await listAddenda('valoracion', 'v1');
    expect(list.map((a) => a.text)).toEqual(['La dosis real fue 0.5 ml.', 'Control a 15 días.']);
  });

  it('can never be edited or deleted: the module offers no way to', () => {
    const exported = Object.keys(addendaModule);
    expect(exported.some((name) => /update|edit|delete|remove/i.test(name))).toBe(false);
  });

  it('accepts only known diagram views, once each', () => {
    expect(parseAddendumDiagrams(undefined)).toEqual([]);
    expect(parseAddendumDiagrams([{ view: 'LIPS', data: {} }])).toEqual([{ view: 'LIPS', data: {} }]);
    expect(parseAddendumDiagrams([{ view: 'ELBOW', data: {} }])).toBeNull();
    expect(parseAddendumDiagrams([{ view: 'LIPS', data: {} }, { view: 'LIPS', data: {} }])).toBeNull();
  });
});

describe('historia clínica revisions (phase C3)', () => {
  const historia = (over: Row = {}): Row => ({
    id: 'h1',
    clinicId: 'c1',
    patientId: 'p1',
    createdAt: new Date('2026-01-10T00:00:00Z'),
    updatedAt: new Date('2026-01-10T00:00:00Z'),
    createdById: null,
    signedById: null,
    signedAt: null,
    signedHash: null,
    signerName: null,
    signerTitle: null,
    signerLicense: null,
    legacyRecord: true,
    fecha: new Date('2026-01-10T00:00:00Z'),
    ocupacion: 'Contadora',
    consumoTabaco: false,
    allergies: [],
    ...over,
  });

  it('keeps the old historia as revision 1, a new revision per save, and shows what changed', async () => {
    const db = fakeDb();
    db.users.set('u1', doctor);
    db.historia.set('h1', historia());

    const start = await beginNoteEdit('historiaClinica', 'h1');
    expect(db.revisions).toHaveLength(1);
    expect(db.revisions[0].legacyRecord).toBe(true);

    db.historia.set('h1', { ...db.historia.get('h1'), ocupacion: 'Arquitecta', consumoTabaco: true });
    await afterNoteEdit('historiaClinica', 'h1', 'u1', 'p1', start);
    expect(db.revisions).toHaveLength(2);
    expect(db.historia.get('h1')?.legacyRecord).toBe(false);

    // A save that changes nothing adds no revision.
    const again = await beginNoteEdit('historiaClinica', 'h1');
    await afterNoteEdit('historiaClinica', 'h1', 'u1', 'p1', again);
    expect(db.revisions).toHaveLength(2);

    const list = await listRevisions('h1');
    expect(list.map((r) => r.revision)).toEqual([2, 1]);
    expect(list[0].changedByName).toBe('Miroslava Ruiz');
    expect(list[0].changes.map((c) => c.field)).toEqual(['consumoTabaco', 'ocupacion']);
    expect(list[0].changes.find((c) => c.field === 'ocupacion')).toEqual({ field: 'ocupacion', before: 'Contadora', after: 'Arquitecta' });
    expect(list[1].legacy).toBe(true);
    expect(list[1].changes).toEqual([]);
  });

  it('is never locked by its signature', async () => {
    const db = fakeDb();
    db.historia.set('h1', historia({ legacyRecord: false, signedAt: new Date(), signerName: 'Miroslava Ruiz' }));
    await expect(beginNoteEdit('historiaClinica', 'h1')).resolves.not.toBeNull();
  });
});
