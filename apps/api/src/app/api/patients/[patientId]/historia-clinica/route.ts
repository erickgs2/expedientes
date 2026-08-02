import { NextRequest, NextResponse } from 'next/server';
import {
  getHistoriaClinica,
  createHistoriaClinica,
  updateHistoriaClinica,
  HistoriaClinicaExistsError,
  HistoriaClinicaNotFoundError,
  type HistoriaClinicaData,
} from '../../../../../lib/historia-clinica/historia-clinica';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

interface HistoriaClinicaBody {
  ocupacion?: string | null;
  fechaNacimiento?: string | null;
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

function toServiceData(body: HistoriaClinicaBody): HistoriaClinicaData {
  return {
    ocupacion: body.ocupacion,
    fechaNacimiento:
      body.fechaNacimiento === null
        ? null
        : body.fechaNacimiento
          ? new Date(body.fechaNacimiento)
          : undefined,
    sexo: body.sexo,
    queQuiereElPaciente: body.queQuiereElPaciente,
    queNecesitaElPaciente: body.queNecesitaElPaciente,
    atributosEmocionales: body.atributosEmocionales,
    enfermedadesActuales: body.enfermedadesActuales,
    medicamentosAcne3Meses: body.medicamentosAcne3Meses,
    cirugiasEsteticasAnteriores: body.cirugiasEsteticasAnteriores,
    rutinaCuidadoFacial: body.rutinaCuidadoFacial,
    consumoAlcohol: body.consumoAlcohol,
    consumoTabaco: body.consumoTabaco,
    consumoDrogas: body.consumoDrogas,
    tipoFrecuenciaEjercicio: body.tipoFrecuenciaEjercicio,
    vacunas: body.vacunas,
    posibilidadEmbarazo: body.posibilidadEmbarazo,
    antecedentesHeredofamiliares: body.antecedentesHeredofamiliares,
    allergyNames: body.allergyNames,
  };
}

export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'historia-clinica', 'view');
    const { patientId } = await params;

    const historia = await getHistoriaClinica(patientId);
    if (!historia) return apiError('NOT_FOUND', 'Historia clínica not found', 404);

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'HistoriaClinica',
      entityId: historia.id,
      patientId,
    });

    return NextResponse.json({ historiaClinica: historia });
  }
);

export const POST = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'historia-clinica', 'create');
    const { patientId } = await params;
    const body = (await request.json()) as HistoriaClinicaBody;

    let historia;
    try {
      historia = await createHistoriaClinica(patientId, toServiceData(body));
    } catch (error) {
      if (error instanceof HistoriaClinicaExistsError) {
        return apiError('CONFLICT', error.message, 409);
      }
      throw error;
    }

    await writeAuditLogSafe({
      userId,
      action: 'create',
      entity: 'HistoriaClinica',
      entityId: historia.id,
      patientId,
    });

    return NextResponse.json({ historiaClinica: historia }, { status: 201 });
  }
);

export const PATCH = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'historia-clinica', 'edit');
    const { patientId } = await params;
    const body = (await request.json()) as HistoriaClinicaBody;

    let historia;
    try {
      historia = await updateHistoriaClinica(patientId, toServiceData(body));
    } catch (error) {
      if (error instanceof HistoriaClinicaNotFoundError) {
        return apiError('NOT_FOUND', error.message, 404);
      }
      throw error;
    }

    await writeAuditLogSafe({
      userId,
      action: 'update',
      entity: 'HistoriaClinica',
      entityId: historia.id,
      patientId,
    });

    return NextResponse.json({ historiaClinica: historia });
  }
);
