import { prisma } from '../prisma/client';
import { currentClinicId } from '../tenancy/context';
import { HISTORIA_CLINICAL_FIELDS, type ParsedFields } from '../clinical/clinical-fields';

/** Plus the 6.1 clinical fields of phase D, all optional. */
export type HistoriaClinicaData = HistoriaClinicaBaseData & ParsedFields<typeof HISTORIA_CLINICAL_FIELDS>;

interface HistoriaClinicaBaseData {
  ocupacion?: string | null;
  fechaNacimiento?: Date | null;
  sexo?: string | null;
  queQuiereElPaciente?: string | null;
  queNecesitaElPaciente?: string | null;
  atributosEmocionales?: string | null;
  enfermedadesActuales?: string | null;
  medicamentosAcne3Meses?: string | null;
  cirugiasEsteticasAnteriores?: string | null;
  rutinaCuidadoFacial?: string | null;
  consumoAlcohol?: string | null;
  consumoTabaco?: string | null;
  consumoDrogas?: string | null;
  tipoFrecuenciaEjercicio?: string | null;
  vacunas?: string | null;
  posibilidadEmbarazo?: string | null;
  antecedentesHeredofamiliares?: string | null;
  allergyNames?: string[];
}

export class HistoriaClinicaExistsError extends Error {}
export class HistoriaClinicaNotFoundError extends Error {}

const HISTORIA_INCLUDE = { allergies: { include: { allergy: true } } } as const;

function scalarFields(data: HistoriaClinicaData) {
  const { allergyNames: _allergyNames, ...scalars } = data;
  return scalars;
}

/**
 * Birth date and sex also live on the patient, so every note and the PDF header can show age and
 * sex (NOM-004-SSA3-2012 5.9). The historia is where they are captured; each save copies them.
 */
async function syncPatientIdentity(patientId: string, data: HistoriaClinicaData): Promise<void> {
  const identity: { birthDate?: Date | null; sex?: string | null } = {};
  if (data.fechaNacimiento !== undefined) identity.birthDate = data.fechaNacimiento;
  if (data.sexo !== undefined) identity.sex = data.sexo;
  if (Object.keys(identity).length > 0) await prisma.patient.update({ where: { id: patientId }, data: identity });
}

async function resolveAllergyIds(names: string[]): Promise<string[]> {
  const trimmed = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  const allergies = await Promise.all(
    trimmed.map((name) =>
      prisma.allergy.upsert({
        // Each clinic keeps its own allergy catalog: names typed in one are never offered to another.
        where: { clinicId_name: { clinicId: currentClinicId(), name } },
        update: {},
        create: { name },
      })
    )
  );
  return allergies.map((allergy) => allergy.id);
}

export async function getHistoriaClinica(patientId: string) {
  return prisma.historiaClinica.findUnique({
    where: { patientId },
    include: HISTORIA_INCLUDE,
  });
}

export async function createHistoriaClinica(patientId: string, data: HistoriaClinicaData, createdById?: string) {
  const existing = await prisma.historiaClinica.findUnique({ where: { patientId } });
  if (existing) {
    throw new HistoriaClinicaExistsError('Historia clínica already exists for this patient');
  }

  const allergyIds = await resolveAllergyIds(data.allergyNames ?? []);
  await syncPatientIdentity(patientId, data);
  return prisma.historiaClinica.create({
    data: {
      patientId,
      createdById,
      ...scalarFields(data),
      allergies: { create: allergyIds.map((allergyId) => ({ allergyId })) },
    },
    include: HISTORIA_INCLUDE,
  });
}

export async function updateHistoriaClinica(patientId: string, data: HistoriaClinicaData) {
  const existing = await prisma.historiaClinica.findUnique({ where: { patientId } });
  if (!existing) {
    throw new HistoriaClinicaNotFoundError('Historia clínica not found for this patient');
  }

  const allergyIds = await resolveAllergyIds(data.allergyNames ?? []);
  await syncPatientIdentity(patientId, data);
  return prisma.historiaClinica.update({
    where: { patientId },
    data: {
      ...scalarFields(data),
      allergies: {
        deleteMany: {},
        create: allergyIds.map((allergyId) => ({ allergyId })),
      },
    },
    include: HISTORIA_INCLUDE,
  });
}

function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export async function searchAllergies(query: string): Promise<{ id: string; name: string }[]> {
  const trimmed = normalizeForSearch(query.trim());
  const allergies = await prisma.allergy.findMany({ orderBy: { name: 'asc' } });
  if (!trimmed) return allergies.slice(0, 10);
  return allergies.filter((allergy) => normalizeForSearch(allergy.name).includes(trimmed)).slice(0, 10);
}
