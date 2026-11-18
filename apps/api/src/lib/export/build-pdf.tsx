import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { ConsentSignatureRole } from '@expedientes/shared-types';
import { readStoredFile } from '../storage/file-storage';
import { isPng } from '../storage/image-signature';
import { groupPaperScans } from './group-paper-scans';
import { ConsentScanPages } from './consent-scan-pdf';
import { interpolate } from '../consent/build-consent-document';
import { CONSENT_LABELS } from '../consent/consent-labels';
import { ConsentPage } from './consent-document-pdf';
import type { NoteSignatureView } from '../signature/note-signature';
import type {
  ExportAddendum,
  ExportData,
  ExportDiagramRef,
  ExportTreatment,
  ExportTreatmentItem,
  ExportValoracion,
} from './gather-export-data';
import { PDF_LABELS, type PdfLabels } from './pdf-labels';
import { bodyMassIndex } from '../clinical/clinical-fields';

const styles = StyleSheet.create({
  // `paddingTop` leaves room for the fixed letterhead below, which sits outside the flow.
  page: { padding: 40, paddingTop: 84, fontSize: 10, fontFamily: 'Helvetica' },
  brandFooter: { position: 'absolute', bottom: 18, left: 40, right: 40, fontSize: 7, color: '#999999', textAlign: 'center' },
  letterhead: {
    position: 'absolute',
    top: 24,
    left: 40,
    right: 40,
    alignItems: 'center',
  },
  letterheadLogo: { height: 40, objectFit: 'contain' },
  title: { fontSize: 20, marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#555555', marginBottom: 16 },
  patientInfo: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 14,
    marginTop: 16,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#cccccc',
  },
  subsectionTitle: { fontSize: 11, fontWeight: 'bold', marginTop: 10, marginBottom: 4 },
  field: { flexDirection: 'row', marginBottom: 3 },
  fieldLabel: { fontWeight: 'bold', width: 180 },
  fieldValue: { flex: 1 },
  visitBlock: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
  },
  itemBlock: { marginBottom: 8 },
  itemTitle: { fontWeight: 'bold' },
  diagramRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, marginBottom: 6 },
  diagramImage: { marginRight: 8, marginBottom: 8 },
  productRow: { flexDirection: 'row', marginBottom: 2 },
  productCell: { flex: 1 },
  productDose: { flex: 2 },
  noteSignature: { fontSize: 8, color: '#444444', marginTop: 6 },
  addendum: { marginTop: 8, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: '#bbbbbb' },
  addendumText: { marginBottom: 2 },
  addendumTitle: { fontSize: 9, fontWeight: 'bold', marginBottom: 2 },
  retiredGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  retiredCell: { width: '48%', marginRight: '2%', marginBottom: 14 },
  retiredImage: { width: '100%', height: 180, objectFit: 'contain', backgroundColor: '#f4f4f1' },
  retiredCaption: { fontSize: 8, color: '#444444', marginTop: 3 },
});

/** "dd/mm/yyyy hh:mm" in the clinic's zone. */
function stamp(iso: string, timeZone: string, language: 'es' | 'en'): string {
  return new Date(iso).toLocaleString(language === 'en' ? 'en-US' : 'es-MX', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Who recorded the note and when, and who signed it (NOM-004-SSA3-2012 5.10). */
function NoteSignatureLine({
  signature,
  labels,
  timeZone,
  language,
}: {
  signature: NoteSignatureView | null;
  labels: PdfLabels;
  timeZone: string;
  language: 'es' | 'en';
}) {
  if (!signature) return null;
  const l = labels.signature;
  const recorded = `${l.recordedBy} ${signature.createdByName ?? l.authorUnknown} ${l.recordedAt} ${stamp(signature.createdAt, timeZone, language)}`;
  const signed = signature.signed
    ? `${l.signedBy} ${[signature.signed.title, signature.signed.name].filter(Boolean).join(' ')}${
        signature.signed.license ? ` (${l.license} ${signature.signed.license})` : ''
      } ${l.recordedAt} ${stamp(signature.signed.at, timeZone, language)}`
    : signature.legacy
      ? l.legacy
      : l.unsigned;
  return (
    <Text style={styles.noteSignature}>
      {recorded} · {signed}
    </Text>
  );
}

/** The signed addenda of a note, in order, each with its own signature line. */
function Addenda({
  addenda,
  labels,
  diagramImages,
  timeZone,
  language,
}: {
  addenda: ExportAddendum[];
  labels: PdfLabels;
  diagramImages: Map<string, Buffer>;
  timeZone: string;
  language: 'es' | 'en';
}) {
  const l = labels.signature;
  return (
    <>
      {addenda.map((a, i) => (
        <View key={i} style={styles.addendum} wrap={false}>
          <Text style={styles.addendumTitle}>
            {l.addendum} {i + 1} · {stamp(a.signed.at, timeZone, language)}
          </Text>
          {a.text ? <Text style={styles.addendumText}>{a.text}</Text> : null}
          <DiagramImages diagrams={a.diagrams} diagramImages={diagramImages} />
          <Text style={styles.noteSignature}>
            {l.signedBy} {[a.signed.title, a.signed.name].filter(Boolean).join(' ')}
            {a.signed.license ? ` (${l.license} ${a.signed.license})` : ''} {l.recordedAt}{' '}
            {stamp(a.signed.at, timeZone, language)}
          </Text>
        </View>
      ))}
    </>
  );
}

/** Completed years between a birth date and `at`; null without a birth date. */
export function ageOn(birthIso: string | null, at: Date): number | null {
  if (!birthIso) return null;
  const birth = new Date(birthIso);
  let age = at.getUTCFullYear() - birth.getUTCFullYear();
  const hadBirthday =
    at.getUTCMonth() > birth.getUTCMonth() ||
    (at.getUTCMonth() === birth.getUTCMonth() && at.getUTCDate() >= birth.getUTCDate());
  if (!hadBirthday) age -= 1;
  return age;
}

const num = (v: unknown) => (typeof v === 'number' ? v : null);

/** "TA 120/80 mmHg · FC 72 lpm · …" from whichever vital signs were recorded; null when none. */
export function vitalsLine(values: Record<string, unknown>, labels: PdfLabels): string | null {
  const f = labels.clinical.fields;
  const parts: string[] = [];
  const sys = num(values['presionSistolica']);
  const dia = num(values['presionDiastolica']);
  if (sys !== null || dia !== null) parts.push(`${f['presionSistolica']} ${sys ?? '—'}/${dia ?? '—'} mmHg`);
  const fc = num(values['frecuenciaCardiaca']);
  if (fc !== null) parts.push(`${f['frecuenciaCardiaca']} ${fc} lpm`);
  const fr = num(values['frecuenciaRespiratoria']);
  if (fr !== null) parts.push(`${f['frecuenciaRespiratoria']} ${fr} rpm`);
  const t = num(values['temperatura']);
  if (t !== null) parts.push(`${f['temperatura']} ${t} °C`);
  const peso = num(values['peso']);
  if (peso !== null) parts.push(`${f['peso']} ${peso} kg`);
  const talla = num(values['talla']);
  if (talla !== null) parts.push(`${f['talla']} ${talla} cm`);
  const bmi = bodyMassIndex(peso, talla);
  if (bmi !== null) parts.push(`${labels.clinical.bmi} ${bmi.toFixed(1)}`);
  return parts.length ? parts.join(' · ') : null;
}

/** "0.5 ml · intradérmica · labio superior · cada 4 meses" from what was recorded. */
export function doseLine(dose: Record<string, unknown>, labels: PdfLabels): string | null {
  const c = labels.clinical;
  const parts: string[] = [];
  const q = num(dose['quantity']);
  const unit = typeof dose['unit'] === 'string' ? c.units[dose['unit']] ?? dose['unit'] : '';
  if (q !== null) parts.push(`${q}${unit ? ` ${unit}` : ''}`);
  if (typeof dose['route'] === 'string') parts.push(c.routes[dose['route']] ?? dose['route']);
  if (typeof dose['zone'] === 'string') parts.push(dose['zone']);
  if (typeof dose['frequency'] === 'string') parts.push(dose['frequency']);
  return parts.length ? parts.join(' · ') : null;
}

/** One subsection of NOM-004 fields, printed only when at least one of them was filled. */
function ClinicalGroup({
  title,
  names,
  values,
  labels,
  vitals = false,
}: {
  title: string;
  names: string[];
  values: Record<string, unknown>;
  labels: PdfLabels;
  vitals?: boolean;
}) {
  const c = labels.clinical;
  const line = vitals ? vitalsLine(values, labels) : null;
  const shown = names.filter((n) => values[n] !== undefined && values[n] !== null);
  if (!line && shown.length === 0) return null;
  const display = (name: string): string => {
    const v = values[name];
    if (name === 'tipoPiel' && typeof v === 'string') return c.skinTypes[v] ?? v;
    return String(v);
  };
  return (
    <View>
      <Text style={styles.subsectionTitle}>{title}</Text>
      {line ? <Field label={c.vitals} value={line} /> : null}
      {shown.map((n) => (
        <Field key={n} label={c.fields[n] ?? n} value={display(n)} />
      ))}
    </View>
  );
}

const EVOLUTION_TEXT = ['evolucion', 'resultadosEstudios', 'diagnostico', 'pronostico', 'indicaciones'];

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

/**
 * Printed size per view, matching each view's canvas aspect ratio in the web editor (full views are
 * 480×600; the close-ups are cropped to their own shape) so no diagram is stretched.
 */
const DIAGRAM_IMAGE_SIZES: Record<ExportDiagramRef['view'], { width: number; height: number }> = {
  FRONT: { width: 130, height: 162 },
  LEFT_PROFILE: { width: 130, height: 162 },
  RIGHT_PROFILE: { width: 130, height: 162 },
  EYES: { width: 220, height: 110 },
  NOSE: { width: 104, height: 130 },
  LIPS: { width: 176, height: 110 },
};

function DiagramImages({
  diagrams,
  diagramImages,
}: {
  diagrams: ExportDiagramRef[];
  diagramImages: Map<string, Buffer>;
}) {
  const present = diagrams.filter((d) => diagramImages.has(d.imageKey));
  if (present.length === 0) return null;
  return (
    <View style={styles.diagramRow}>
      {present.map((d) => (
        <Image
          key={d.imageKey}
          style={[styles.diagramImage, DIAGRAM_IMAGE_SIZES[d.view]]}
          src={{ data: diagramImages.get(d.imageKey) as Buffer, format: 'png' }}
        />
      ))}
    </View>
  );
}

function HistoriaClinicaSection({
  historia,
  labels,
}: {
  historia: NonNullable<ExportData['historiaClinica']>;
  labels: PdfLabels;
}) {
  const l = labels.historiaClinica;
  return (
    <View>
      <Text style={styles.sectionTitle}>{l.sectionTitle}</Text>
      <Text style={styles.subsectionTitle}>{l.personalInfo}</Text>
      <Field label={l.fields.ocupacion} value={historia.ocupacion} />
      <Field
        label={l.fields.fechaNacimiento}
        value={historia.fechaNacimiento ? historia.fechaNacimiento.substring(0, 10) : null}
      />
      <Field
        label={l.fields.sexo}
        value={
          historia.sexo
            ? (l.sexoOptions[historia.sexo as keyof typeof l.sexoOptions] ?? historia.sexo)
            : null
        }
      />
      <Field label={l.fields.alergias} value={historia.allergyNames.join(', ') || null} />
      <Field label={l.fields.queQuiereElPaciente} value={historia.queQuiereElPaciente} />
      <Field label={l.fields.queNecesitaElPaciente} value={historia.queNecesitaElPaciente} />
      <Field label={l.fields.atributosEmocionales} value={historia.atributosEmocionales} />
      <Text style={styles.subsectionTitle}>{l.medicalInfo}</Text>
      <Field label={l.fields.enfermedadesActuales} value={historia.enfermedadesActuales} />
      <Field label={l.fields.medicamentosAcne3Meses} value={historia.medicamentosAcne3Meses} />
      <Field
        label={l.fields.cirugiasEsteticasAnteriores}
        value={historia.cirugiasEsteticasAnteriores}
      />
      <Field label={l.fields.rutinaCuidadoFacial} value={historia.rutinaCuidadoFacial} />
      <Text style={styles.subsectionTitle}>{l.personalHistory}</Text>
      <Field label={l.fields.consumoAlcohol} value={historia.consumoAlcohol} />
      <Field label={l.fields.consumoTabaco} value={historia.consumoTabaco} />
      <Field label={l.fields.consumoDrogas} value={historia.consumoDrogas} />
      <Field label={l.fields.tipoFrecuenciaEjercicio} value={historia.tipoFrecuenciaEjercicio} />
      <Field label={l.fields.vacunas} value={historia.vacunas} />
      <Field
        label={l.fields.posibilidadEmbarazo}
        value={
          historia.posibilidadEmbarazo
            ? (l.posibilidadEmbarazoOptions[
                historia.posibilidadEmbarazo as keyof typeof l.posibilidadEmbarazoOptions
              ] ?? historia.posibilidadEmbarazo)
            : null
        }
      />
      <Text style={styles.subsectionTitle}>{l.familyHistory}</Text>
      <Field
        label={l.fields.antecedentesHeredofamiliares}
        value={historia.antecedentesHeredofamiliares}
      />
      {/* NOM-004-SSA3-2012 6.1, in the norm's order; empty groups are left out. */}
      <ClinicalGroup
        title={labels.clinical.pathological}
        names={['antecedentesPersonalesPatologicos', 'padecimientoActual']}
        values={historia.clinical}
        labels={labels}
      />
      <ClinicalGroup
        title={labels.clinical.systems}
        names={['interrogatorioPiel', 'interrogatorioCardiovascular', 'interrogatorioEndocrino', 'interrogatorioNeurologico', 'interrogatorioOtros']}
        values={historia.clinical}
        labels={labels}
      />
      <ClinicalGroup
        title={labels.clinical.physicalExam}
        names={['fototipoFitzpatrick', 'tipoPiel', 'exploracionFacial', 'lesionesCutaneas']}
        values={historia.clinical}
        labels={labels}
        vitals
      />
      <ClinicalGroup
        title={labels.clinical.assessment}
        names={['resultadosEstudios', 'diagnostico', 'pronostico', 'indicacionTerapeutica']}
        values={historia.clinical}
        labels={labels}
      />
    </View>
  );
}

function ValoracionSection({
  valoraciones,
  diagramImages,
  labels,
  meta,
}: {
  valoraciones: ExportValoracion[];
  meta: { timeZone: string; language: 'es' | 'en' };
  diagramImages: Map<string, Buffer>;
  labels: PdfLabels;
}) {
  const l = labels.valoracion;
  return (
    <View>
      <Text style={styles.sectionTitle}>{l.sectionTitle}</Text>
      {valoraciones.map((v, index) => (
        <View key={index} style={styles.visitBlock}>
          <Text style={styles.subsectionTitle}>
            {l.visitOn} {v.fecha.substring(0, 10)}
          </Text>
          <Field
            label={l.notes}
            value={
              [v.queQuiereElPaciente, v.queNecesitaElPaciente, v.notas].filter(Boolean).join(' — ') ||
              null
            }
          />
          <ClinicalGroup title={labels.clinical.evolution} names={EVOLUTION_TEXT} values={v.evolution} labels={labels} vitals />
          <DiagramImages diagrams={v.diagrams} diagramImages={diagramImages} />
          <NoteSignatureLine signature={v.signature} labels={labels} {...meta} />
          <Addenda addenda={v.addenda} labels={labels} diagramImages={diagramImages} {...meta} />
        </View>
      ))}
    </View>
  );
}

function TreatmentItemBlock({
  item,
  diagramImages,
  labels,
  annexIncluded,
}: {
  item: ExportTreatmentItem;
  diagramImages: Map<string, Buffer>;
  labels: PdfLabels;
  annexIncluded: boolean;
}) {
  const l = labels.treatments;
  return (
    <View style={styles.itemBlock}>
      <Text style={styles.itemTitle}>{item.treatmentTypeName}</Text>
      <Field label={l.notes} value={item.notes} />
      <DiagramImages diagrams={item.diagrams} diagramImages={diagramImages} />
      {item.products.length > 0 && (
        <View>
          <Text style={styles.subsectionTitle}>{l.products}</Text>
          <View style={styles.productRow}>
            <Text style={[styles.productCell, styles.itemTitle]}>{l.productBrand}</Text>
            <Text style={[styles.productCell, styles.itemTitle]}>{l.productLot}</Text>
            <Text style={[styles.productCell, styles.itemTitle]}>{l.productExpiry}</Text>
            <Text style={[styles.productDose, styles.itemTitle]}>{labels.clinical.dose}</Text>
          </View>
          {item.products.map((p, i) => (
            <View key={i} style={styles.productRow}>
              <Text style={styles.productCell}>{p.brand}</Text>
              <Text style={styles.productCell}>{p.lotNumber}</Text>
              <Text style={styles.productCell}>
                {p.expiryDate ? p.expiryDate.substring(0, 7) : '—'}
              </Text>
              <Text style={styles.productDose}>{doseLine(p.dose, labels) ?? '—'}</Text>
            </View>
          ))}
        </View>
      )}
      {item.consent && (
        <Field
          label={l.consentSignedOn}
          // Only point at the annex when the annex is actually in this export — with the consents
          // module unchecked, the signing date still belongs in the history, but there is nothing
          // to turn to.
          value={
            annexIncluded
              ? `${item.consent.signedDate} — ${l.consentAnnexRef}`
              : item.consent.signedDate
          }
        />
      )}
    </View>
  );
}

function TreatmentsSection({
  treatments,
  diagramImages,
  labels,
  annexIncluded,
  meta,
}: {
  treatments: ExportTreatment[];
  meta: { timeZone: string; language: 'es' | 'en' };
  diagramImages: Map<string, Buffer>;
  labels: PdfLabels;
  annexIncluded: boolean;
}) {
  const l = labels.treatments;
  return (
    <View>
      <Text style={styles.sectionTitle}>{l.sectionTitle}</Text>
      {treatments.map((t, tIndex) => (
        <View key={tIndex} style={styles.visitBlock}>
          <Text style={styles.subsectionTitle}>
            {l.visitOn} {t.fecha.substring(0, 10)}
          </Text>
          {t.items.map((item) => (
            <TreatmentItemBlock
              key={item.id}
              item={item}
              diagramImages={diagramImages}
              labels={labels}
              annexIncluded={annexIncluded}
            />
          ))}
          <ClinicalGroup title={labels.clinical.evolution} names={EVOLUTION_TEXT} values={t.evolution} labels={labels} vitals />
          <NoteSignatureLine signature={t.signature} labels={labels} {...meta} />
          <Addenda addenda={t.addenda} labels={labels} diagramImages={diagramImages} {...meta} />
        </View>
      ))}
    </View>
  );
}

/**
 * Builds the export PDF and returns it as a `Buffer` ready to stream in an HTTP response.
 *
 * `diagramImages` are already-resolved Buffers (the client-rendered PNGs uploaded with the
 * request — read from the parsed `multipart/form-data` by the route handler). Consent signature
 * images (patient, witness, and the clinic's physician signature) are NOT part of that map —
 * they're existing stored files, read here via `readStoredFile` (local disk or S3). All image
 * reads happen before the JSX tree is constructed: `@react-pdf/renderer`'s `Image` component needs
 * its `src` data available synchronously at render time, not as a promise. Every read is wrapped in
 * its own `try/catch` so one unreadable file — a missing physician signature, a corrupted upload —
 * never fails the whole export; a missing signature just prints a blank ruled line.
 */
export async function buildExportPdf(
  data: ExportData,
  diagramImages: Map<string, Buffer>,
  language: 'es' | 'en',
  /** Free plan exports carry a small "Generated with MedCloud" line on the record pages. */
  options: { brandFooter?: boolean } = {}
): Promise<Buffer> {
  const labels = PDF_LABELS[language];

  // Keyed `${treatmentItemId}:patient` / `${treatmentItemId}:witness` so `ConsentPage` can look up
  // each signature independently — a witness-less consent simply has no `:witness` entry.
  const signatureImages = new Map<string, Buffer>();
  for (const entry of data.consents ?? []) {
    const id = entry.treatmentItemId;
    // A paper-signed consent has no signature image — its evidence is the scan, read below.
    if (entry.consent.method !== 'DIGITAL' || !entry.consent.patientSignatureImagePath) continue;
    try {
      const buffer = await readStoredFile(entry.consent.patientSignatureImagePath);
      signatureImages.set(`${id}:patient`, buffer);
    } catch (error) {
      console.error(`Failed to read patient signature image for treatment item ${id}`, error);
    }
    if (entry.consent.witnessSignatureImagePath) {
      try {
        const buffer = await readStoredFile(entry.consent.witnessSignatureImagePath);
        signatureImages.set(`${id}:witness`, buffer);
      } catch (error) {
        console.error(`Failed to read witness signature image for treatment item ${id}`, error);
      }
    }
    if (entry.consent.secondWitnessSignatureImagePath) {
      try {
        const buffer = await readStoredFile(entry.consent.secondWitnessSignatureImagePath);
        signatureImages.set(`${id}:secondWitness`, buffer);
      } catch (error) {
        console.error(`Failed to read second witness signature image for treatment item ${id}`, error);
      }
    }
  }

  // Each scan is read once however many letters it covers; an unreadable page is skipped (logged)
  // rather than failing the export, like every other stored image here.
  const paperGroups = groupPaperScans(data.consents ?? []);
  const scanImages = new Map<string, Array<{ data: Buffer; format: 'jpg' | 'png' }>>();
  for (const group of paperGroups.values()) {
    const images: Array<{ data: Buffer; format: 'jpg' | 'png' }> = [];
    for (const path of group.pagePaths) {
      try {
        const data = await readStoredFile(path);
        images.push({ data, format: isPng(data) ? 'png' : 'jpg' });
      } catch (error) {
        console.error(`Failed to read scan page ${path}`, error);
      }
    }
    scanImages.set(group.scanId, images);
  }

  // Read once — the same physician signature is stamped onto every signed consent in the export.
  let doctorSignature: Buffer | null = null;
  if (data.doctorSignaturePath) {
    try {
      doctorSignature = await readStoredFile(data.doctorSignaturePath);
    } catch (error) {
      console.error('Failed to read physician signature image', error);
    }
  }

  // The letterhead prints on every page of the export, so it is read once here — like every other
  // image, before the JSX tree exists, because react-pdf needs `src` data synchronously at render.
  let clinicLogo: Buffer | undefined;
  let clinicLogoFormat: 'png' | 'jpg' = 'png';
  if (data.clinicLogoPath) {
    try {
      clinicLogo = await readStoredFile(data.clinicLogoPath);
      clinicLogoFormat = isPng(clinicLogo) ? 'png' : 'jpg';
    } catch (error) {
      console.error('Failed to read the clinic logo', error);
    }
  }

  const letterhead = clinicLogo ? (
    <View style={styles.letterhead} fixed>
      <Image style={styles.letterheadLogo} src={{ data: clinicLogo, format: clinicLogoFormat }} />
    </View>
  ) : null;

  const emittedScans = new Set<string>();
  const consentPages = (data.consents ?? []).map((entry) => {
    if (entry.consent.method === 'PAPER' && entry.consent.scanId) {
      // A scan covering several letters is printed once, after the first letter it covers.
      const scanId = entry.consent.scanId;
      const group = paperGroups.get(scanId);
      if (emittedScans.has(scanId) || !group) return null;
      emittedScans.add(scanId);
      return (
        <ConsentScanPages
          key={`scan-${scanId}`}
          title={labels.treatments.consentScan.title}
          coversLabel={labels.treatments.consentScan.covers}
          signedOnLabel={labels.treatments.consentScan.signedOn}
          signedDate={group.signedDate}
          treatmentTypeNames={group.treatmentTypeNames}
          images={scanImages.get(scanId) ?? []}
        />
      );
    }

    const signatures: Partial<Record<ConsentSignatureRole, Buffer>> = {};
    const patientSignature = signatureImages.get(`${entry.treatmentItemId}:patient`);
    if (patientSignature) signatures.patient = patientSignature;
    const witnessSignature = signatureImages.get(`${entry.treatmentItemId}:witness`);
    if (witnessSignature) signatures.witness = witnessSignature;
    const secondWitnessSignature = signatureImages.get(`${entry.treatmentItemId}:secondWitness`);
    if (secondWitnessSignature) signatures.secondWitness = secondWitnessSignature;
    if (doctorSignature) signatures.doctor = doctorSignature;

    return (
      <ConsentPage
        key={entry.treatmentItemId}
        blocks={entry.consent.blocks}
        header={{
          clinicName: data.clinicName,
          logo: clinicLogo,
          logoFormat: clinicLogoFormat,
          title: CONSENT_LABELS.es.title,
          treatmentTypeName: entry.treatmentTypeName,
        }}
        footer={{
          patientName: data.patient.fullName,
          signedOn: entry.consent.signedDate,
          pageLabel: (n, total) =>
            interpolate(labels.treatments.consentPageOf, { n: String(n), total: String(total) }),
        }}
        signatures={signatures}
      />
    );
  });

  // Retired photos (only when the export asked for them), read up front like every other image.
  const retiredPhotoImages: Array<{ photo: NonNullable<ExportData['retiredPhotos']>[number]; data: Buffer; format: 'png' | 'jpg' }> = [];
  for (const photo of data.retiredPhotos ?? []) {
    try {
      const buffer = await readStoredFile(photo.filePath);
      retiredPhotoImages.push({ photo, data: buffer, format: isPng(buffer) ? 'png' : 'jpg' });
    } catch (error) {
      console.error(`Failed to read retired photo ${photo.filePath}`, error);
    }
  }
  const retired = labels.retiredPhotos;
  const retiredPage =
    data.retiredPhotos && data.retiredPhotos.length > 0 ? (
      <Page size="A4" style={styles.page} wrap>
        {letterhead}
        <Text style={styles.sectionTitle}>{retired.title}</Text>
        <Text style={styles.subtitle}>
          {data.patient.fullName} · {retired.intro}
        </Text>
        <View style={styles.retiredGrid}>
          {retiredPhotoImages.map(({ photo, data: img, format }, i) => (
            <View key={i} style={styles.retiredCell} wrap={false}>
              <Image style={styles.retiredImage} src={{ data: img, format }} />
              <Text style={styles.retiredCaption}>
                {photo.source.kind === 'valoracion' ? retired.valoracion : photo.source.treatmentTypeName} ·{' '}
                {photo.source.fecha} · {retired.tags[photo.tag]}
              </Text>
              <Text style={styles.retiredCaption}>
                {retired.takenOn} {photo.takenAt.substring(0, 10)} · {retired.retiredOn}{' '}
                {photo.archivedAt.substring(0, 10)}
                {photo.archivedByName ? ` ${retired.by} ${photo.archivedByName}` : ''}
              </Text>
            </View>
          ))}
        </View>
      </Page>
    ) : null;

  const noteMeta = { timeZone: data.timeZone, language };
  const document = (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        {letterhead}
        <Text style={styles.title}>{data.patient.fullName}</Text>
        <Text style={styles.subtitle}>
          {labels.generatedOn} {data.generatedAt.toISOString().substring(0, 10)}
        </Text>
        <View style={styles.patientInfo}>
          <Field
            label={labels.patientInfo.recordNumber}
            value={data.patient.recordNumber ? String(data.patient.recordNumber).padStart(4, '0') : null}
          />
          <Field label={labels.patientInfo.phone} value={data.patient.phone} />
          <Field label={labels.patientInfo.documentId} value={data.patient.documentId} />
          <Field
            label={labels.patientInfo.age}
            value={(() => {
              const age = ageOn(data.patient.birthDate, data.generatedAt);
              return age === null ? null : `${age} ${labels.patientInfo.years}`;
            })()}
          />
          <Field
            label={labels.patientInfo.sex}
            value={
              data.patient.sex
                ? (labels.historiaClinica.sexoOptions[data.patient.sex as keyof PdfLabels['historiaClinica']['sexoOptions']] ??
                  data.patient.sex)
                : null
            }
          />
        </View>
        {data.historiaClinica && (
          <View>
            <HistoriaClinicaSection historia={data.historiaClinica} labels={labels} />
            <NoteSignatureLine signature={data.historiaClinica.signature} labels={labels} {...noteMeta} />
          </View>
        )}
        {data.valoraciones && data.valoraciones.length > 0 && (
          <ValoracionSection
            valoraciones={data.valoraciones}
            diagramImages={diagramImages}
            labels={labels}
            meta={noteMeta}
          />
        )}
        {data.treatments && data.treatments.length > 0 && (
          <TreatmentsSection
            treatments={data.treatments}
            diagramImages={diagramImages}
            labels={labels}
            annexIncluded={(data.consents ?? []).length > 0}
            meta={noteMeta}
          />
        )}
        {options.brandFooter && (
          // Only on the record pages: the consent annex reproduces signed legal documents and gets
          // nothing added to it.
          <Text style={styles.brandFooter} fixed>
            {labels.generatedWith}
          </Text>
        )}
      </Page>
      {retiredPage}
      {consentPages}
    </Document>
  );

  return renderToBuffer(document);
}
