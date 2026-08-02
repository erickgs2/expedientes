import { prisma } from '../prisma/client';

export interface HistoriaClinicaData {
  ocupacion?: string;
  fechaNacimiento?: Date;
  sexo?: string;
  queQuiereElPaciente?: string;
  queNecesitaElPaciente?: string;
  atributosEmocionales?: string;
  enfermedadesActuales?: string;
  medicamentosAcne3Meses?: string;
  cirugiasEsteticasAnteriores?: string;
  rutinaCuidadoFacial?: string;
  consumoAlcohol?: string;
  consumoTabaco?: string;
  consumoDrogas?: string;
  tipoFrecuenciaEjercicio?: string;
  vacunas?: string;
  posibilidadEmbarazo?: string;
  antecedentesHeredofamiliares?: string;
  allergyNames?: string[];
}

export class HistoriaClinicaExistsError extends Error {}
export class HistoriaClinicaNotFoundError extends Error {}

const HISTORIA_INCLUDE = { allergies: { include: { allergy: true } } } as const;

function scalarFields(data: HistoriaClinicaData) {
  const { allergyNames: _allergyNames, ...scalars } = data;
  return scalars;
}

async function resolveAllergyIds(names: string[]): Promise<string[]> {
  const trimmed = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  const allergies = await Promise.all(
    trimmed.map((name) => prisma.allergy.upsert({ where: { name }, update: {}, create: { name } }))
  );
  return allergies.map((allergy) => allergy.id);
}

export async function getHistoriaClinica(patientId: string) {
  return prisma.historiaClinica.findUnique({
    where: { patientId },
    include: HISTORIA_INCLUDE,
  });
}

export async function createHistoriaClinica(patientId: string, data: HistoriaClinicaData) {
  const existing = await prisma.historiaClinica.findUnique({ where: { patientId } });
  if (existing) {
    throw new HistoriaClinicaExistsError('Historia clínica already exists for this patient');
  }

  const allergyIds = await resolveAllergyIds(data.allergyNames ?? []);
  return prisma.historiaClinica.create({
    data: {
      patientId,
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
