import type { ConsentBlock } from '@expedientes/shared-types';
import { prisma } from '../prisma/client';
import { getHistoriaClinica } from '../historia-clinica/historia-clinica';
import { listValoraciones, getValoracion } from '../valoracion/valoracion';
import { listTreatments, getTreatment } from '../treatment/treatment';
import { getTreatmentItemDetail } from '../treatment/consent';

// TODO(Task 8): the PDF export still renders the consent as a single text blob. This flattens the
// structured `consentDocument` blocks back into plain text just to keep that working; the real fix
// is to render the blocks themselves (title/fieldLine/sectionHeading/paragraph/signatureBlock) in
// `build-pdf.tsx`.
function flattenConsentDocument(blocks: ConsentBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.kind) {
        case 'title':
        case 'sectionHeading':
        case 'paragraph':
          return block.text;
        case 'fieldLine':
          return `${block.label}: ${block.value}`;
        case 'signatureBlock':
          return null;
      }
    })
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

export interface ExportModulesSelection {
  historiaClinica: boolean;
  valoracion: boolean;
  treatments: boolean;
}

export interface ExportDiagramRef {
  view: 'FRONT' | 'LEFT_PROFILE' | 'RIGHT_PROFILE';
  /**
   * The `multipart/form-data` field name the client-rendered PNG for this diagram was uploaded
   * under — e.g. `diagram_valoracion_<id>_FRONT` or `diagram_treatmentItem_<id>_FRONT`. The route
   * handler looks this key up directly against the parsed form data; the PDF builder never needs
   * to know how the key was constructed, only that it matches.
   */
  imageKey: string;
}

export interface ExportHistoriaClinica {
  ocupacion: string | null;
  fechaNacimiento: string | null;
  sexo: string | null;
  queQuiereElPaciente: string | null;
  queNecesitaElPaciente: string | null;
  atributosEmocionales: string | null;
  enfermedadesActuales: string | null;
  medicamentosAcne3Meses: string | null;
  cirugiasEsteticasAnteriores: string | null;
  rutinaCuidadoFacial: string | null;
  consumoAlcohol: string | null;
  consumoTabaco: string | null;
  consumoDrogas: string | null;
  tipoFrecuenciaEjercicio: string | null;
  vacunas: string | null;
  posibilidadEmbarazo: string | null;
  antecedentesHeredofamiliares: string | null;
  allergyNames: string[];
}

export interface ExportValoracion {
  fecha: string;
  queQuiereElPaciente: string | null;
  queNecesitaElPaciente: string | null;
  notas: string | null;
  diagrams: ExportDiagramRef[];
}

export interface ExportTreatmentItem {
  id: string;
  treatmentTypeName: string;
  notes: string | null;
  diagrams: ExportDiagramRef[];
  consent: { consentText: string; signatureImagePath: string } | null;
}

export interface ExportTreatment {
  fecha: string;
  items: ExportTreatmentItem[];
}

export interface ExportData {
  patient: { fullName: string; phone: string; documentId: string };
  generatedAt: Date;
  historiaClinica: ExportHistoriaClinica | null;
  valoraciones: ExportValoracion[] | null;
  treatments: ExportTreatment[] | null;
}

async function gatherHistoriaClinica(patientId: string): Promise<ExportHistoriaClinica | null> {
  const historia = await getHistoriaClinica(patientId);
  if (!historia) return null;
  return {
    ocupacion: historia.ocupacion,
    fechaNacimiento: historia.fechaNacimiento ? historia.fechaNacimiento.toISOString() : null,
    sexo: historia.sexo,
    queQuiereElPaciente: historia.queQuiereElPaciente,
    queNecesitaElPaciente: historia.queNecesitaElPaciente,
    atributosEmocionales: historia.atributosEmocionales,
    enfermedadesActuales: historia.enfermedadesActuales,
    medicamentosAcne3Meses: historia.medicamentosAcne3Meses,
    cirugiasEsteticasAnteriores: historia.cirugiasEsteticasAnteriores,
    rutinaCuidadoFacial: historia.rutinaCuidadoFacial,
    consumoAlcohol: historia.consumoAlcohol,
    consumoTabaco: historia.consumoTabaco,
    consumoDrogas: historia.consumoDrogas,
    tipoFrecuenciaEjercicio: historia.tipoFrecuenciaEjercicio,
    vacunas: historia.vacunas,
    posibilidadEmbarazo: historia.posibilidadEmbarazo,
    antecedentesHeredofamiliares: historia.antecedentesHeredofamiliares,
    allergyNames: historia.allergies.map((a) => a.allergy.name),
  };
}

async function gatherValoraciones(patientId: string): Promise<ExportValoracion[]> {
  const summaries = await listValoraciones(patientId);
  const fullOnes = await Promise.all(summaries.map((v) => getValoracion(v.id)));
  return fullOnes
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .map((v) => ({
      fecha: v.fecha.toISOString(),
      queQuiereElPaciente: v.queQuiereElPaciente,
      queNecesitaElPaciente: v.queNecesitaElPaciente,
      notas: v.notas,
      diagrams: v.diagrams.map((d) => ({
        view: d.view,
        imageKey: `diagram_valoracion_${v.id}_${d.view}`,
      })),
    }));
}

async function gatherTreatments(patientId: string): Promise<ExportTreatment[]> {
  const summaries = await listTreatments(patientId);
  const fullOnes = await Promise.all(summaries.map((t) => getTreatment(t.id)));
  const treatments = fullOnes.filter((t): t is NonNullable<typeof t> => t !== null);

  return Promise.all(
    treatments.map(async (t) => {
      const items = await Promise.all(
        t.items.map(async (item): Promise<ExportTreatmentItem> => {
          const detail = await getTreatmentItemDetail(item.id);
          return {
            id: item.id,
            treatmentTypeName: item.treatmentTypeName,
            notes: item.notes,
            diagrams: (detail?.diagrams ?? []).map((d) => ({
              view: d.view,
              imageKey: `diagram_treatmentItem_${item.id}_${d.view}`,
            })),
            consent:
              detail?.consent && detail.consentDocument
                ? {
                    consentText: flattenConsentDocument(detail.consentDocument),
                    signatureImagePath: detail.consent.patientSignatureImagePath,
                  }
                : null,
          };
        })
      );
      return { fecha: t.fecha.toISOString(), items };
    })
  );
}

/**
 * Gathers every selected module's data for one patient, re-reading everything from the database
 * directly (never trusting a client-supplied copy of this data — only the module selection,
 * language, and the client-rendered diagram images themselves cross the request boundary as
 * client input). Returns `null` if the patient doesn't exist; the route handler maps that to 404.
 */
export async function gatherExportData(
  patientId: string,
  modules: ExportModulesSelection
): Promise<ExportData | null> {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return null;

  const [historiaClinica, valoraciones, treatments] = await Promise.all([
    modules.historiaClinica ? gatherHistoriaClinica(patientId) : Promise.resolve(null),
    modules.valoracion ? gatherValoraciones(patientId) : Promise.resolve(null),
    modules.treatments ? gatherTreatments(patientId) : Promise.resolve(null),
  ]);

  return {
    patient: {
      fullName: patient.fullName,
      phone: patient.phone,
      documentId: patient.documentId,
    },
    generatedAt: new Date(),
    historiaClinica,
    valoraciones,
    treatments,
  };
}
