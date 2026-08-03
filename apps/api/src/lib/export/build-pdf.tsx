import { readFile } from 'fs/promises';
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { resolveFilePath } from '../storage/file-storage';
import type { ExportData, ExportDiagramRef, ExportTreatment, ExportTreatmentItem, ExportValoracion } from './gather-export-data';
import { PDF_LABELS, type PdfLabels } from './pdf-labels';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
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
  diagramRow: { flexDirection: 'row', marginTop: 6, marginBottom: 6 },
  diagramImage: { width: 130, height: 162, marginRight: 8 },
  signatureImage: { width: 200, height: 80, marginTop: 4 },
});

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

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
          style={styles.diagramImage}
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
    </View>
  );
}

function ValoracionSection({
  valoraciones,
  diagramImages,
  labels,
}: {
  valoraciones: ExportValoracion[];
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
          <DiagramImages diagrams={v.diagrams} diagramImages={diagramImages} />
        </View>
      ))}
    </View>
  );
}

function TreatmentItemBlock({
  item,
  diagramImages,
  signatureImages,
  labels,
}: {
  item: ExportTreatmentItem;
  diagramImages: Map<string, Buffer>;
  signatureImages: Map<string, Buffer>;
  labels: PdfLabels;
}) {
  const l = labels.treatments;
  const signature = signatureImages.get(item.id);
  return (
    <View style={styles.itemBlock}>
      <Text style={styles.itemTitle}>{item.treatmentTypeName}</Text>
      <Field label={l.notes} value={item.notes} />
      <DiagramImages diagrams={item.diagrams} diagramImages={diagramImages} />
      {item.consent && (
        <View>
          <Text style={styles.subsectionTitle}>{l.consent}</Text>
          <Text>{item.consent.consentText}</Text>
          {signature && (
            <Image style={styles.signatureImage} src={{ data: signature, format: 'jpg' }} />
          )}
        </View>
      )}
    </View>
  );
}

function TreatmentsSection({
  treatments,
  diagramImages,
  signatureImages,
  labels,
}: {
  treatments: ExportTreatment[];
  diagramImages: Map<string, Buffer>;
  signatureImages: Map<string, Buffer>;
  labels: PdfLabels;
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
              signatureImages={signatureImages}
              labels={labels}
            />
          ))}
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
 * images are NOT part of that map — they're existing files already on disk, read here via
 * `resolveFilePath`/`readFile`, keyed by the owning treatment item's id so `TreatmentItemBlock`
 * can look each one up directly. All image reads happen before the JSX tree is constructed:
 * `@react-pdf/renderer`'s `Image` component needs its `src` data available synchronously at
 * render time, not as a promise.
 */
export async function buildExportPdf(
  data: ExportData,
  diagramImages: Map<string, Buffer>,
  language: 'es' | 'en'
): Promise<Buffer> {
  const labels = PDF_LABELS[language];

  const signatureImages = new Map<string, Buffer>();
  if (data.treatments) {
    for (const treatment of data.treatments) {
      for (const item of treatment.items) {
        if (!item.consent) continue;
        try {
          const buffer = await readFile(resolveFilePath(item.consent.signatureImagePath));
          signatureImages.set(item.id, buffer);
        } catch (error) {
          console.error(`Failed to read signature image for treatment item ${item.id}`, error);
        }
      }
    }
  }

  const document = (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.title}>{data.patient.fullName}</Text>
        <Text style={styles.subtitle}>
          {labels.generatedOn} {data.generatedAt.toISOString().substring(0, 10)}
        </Text>
        <View style={styles.patientInfo}>
          <Field label={labels.patientInfo.phone} value={data.patient.phone} />
          <Field label={labels.patientInfo.documentId} value={data.patient.documentId} />
        </View>
        {data.historiaClinica && (
          <HistoriaClinicaSection historia={data.historiaClinica} labels={labels} />
        )}
        {data.valoraciones && data.valoraciones.length > 0 && (
          <ValoracionSection
            valoraciones={data.valoraciones}
            diagramImages={diagramImages}
            labels={labels}
          />
        )}
        {data.treatments && data.treatments.length > 0 && (
          <TreatmentsSection
            treatments={data.treatments}
            diagramImages={diagramImages}
            signatureImages={signatureImages}
            labels={labels}
          />
        )}
      </Page>
    </Document>
  );

  return renderToBuffer(document);
}
