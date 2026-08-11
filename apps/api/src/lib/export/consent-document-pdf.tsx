import type { ReactNode } from 'react';
import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { ConsentBlock, ConsentSignatureRole } from '@expedientes/shared-types';

const styles = StyleSheet.create({
  page: { padding: 48, paddingTop: 72, paddingBottom: 64, fontSize: 10, fontFamily: 'Helvetica' },
  header: {
    position: 'absolute',
    top: 24,
    left: 48,
    right: 48,
    textAlign: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: '#cccccc',
    paddingBottom: 6,
  },
  headerClinic: { fontSize: 10, fontWeight: 'bold' },
  headerLogo: { height: 34, objectFit: 'contain', alignSelf: 'center', marginBottom: 2 },
  headerSubtitle: { fontSize: 9, color: '#555555', marginTop: 2 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 8,
    textAlign: 'center',
    color: '#555555',
    borderTopWidth: 0.5,
    borderTopColor: '#cccccc',
    paddingTop: 6,
  },
  title: { fontSize: 16, textAlign: 'center', marginBottom: 16 },
  paragraph: { textAlign: 'justify', marginBottom: 8, lineHeight: 1.4 },
  sectionHeading: {
    fontWeight: 'bold',
    textTransform: 'uppercase',
    fontSize: 11,
    marginTop: 10,
    marginBottom: 4,
  },
  fieldLine: { flexDirection: 'row', marginBottom: 4 },
  fieldLineLabel: { fontWeight: 'bold', width: 140 },
  fieldLineValue: { flex: 1 },
  signatureRow: { flexDirection: 'row', marginTop: 24 },
  signatureColumn: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  signatureImage: { width: 140, height: 50, objectFit: 'contain' },
  signatureLine: { width: 140, height: 50, borderBottomWidth: 1, borderBottomColor: '#000000' },
  signatureCaption: { fontSize: 9, fontWeight: 'bold', marginTop: 4, textTransform: 'uppercase' },
  signatureSubCaption: { fontSize: 8, color: '#555555', marginTop: 2, textAlign: 'center' },
});

export interface ConsentPageHeader {
  clinicName: string;
  /** The clinic's letterhead image. When present it replaces the clinic-name text. */
  logo?: Buffer;
  logoFormat?: 'png' | 'jpg';
  title: string;
  treatmentTypeName: string;
}

export interface ConsentPageFooter {
  patientName: string;
  signedOn: string;
  pageLabel: (n: number, total: number) => string;
}

export interface ConsentPageProps {
  blocks: ConsentBlock[];
  header: ConsentPageHeader;
  footer: ConsentPageFooter;
  signatures: Partial<Record<ConsentSignatureRole, Buffer>>;
}

type SignatureBlock = Extract<ConsentBlock, { kind: 'signatureBlock' }>;

function SignatureColumn({ block, buffer }: { block: SignatureBlock; buffer: Buffer | undefined }) {
  return (
    <View style={styles.signatureColumn}>
      {buffer ? (
        <Image style={styles.signatureImage} src={{ data: buffer, format: 'jpg' }} />
      ) : (
        <View style={styles.signatureLine} />
      )}
      <Text style={styles.signatureCaption}>{block.caption}</Text>
      {block.subCaption ? <Text style={styles.signatureSubCaption}>{block.subCaption}</Text> : null}
    </View>
  );
}

/**
 * Walks the flat block list and groups consecutive `signatureBlock` entries (patient, optional
 * witness, doctor — always emitted back-to-back by `buildConsentDocument`) into a single
 * `signatureRow` so they print side by side, wrapped in `wrap={false}` so a page break can never
 * split a signature from its caption or strand it alone at the top of a sheet.
 */
function renderBlocks(
  blocks: ConsentBlock[],
  signatures: Partial<Record<ConsentSignatureRole, Buffer>>
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];

    if (block.kind === 'signatureBlock') {
      const group: SignatureBlock[] = [];
      while (i < blocks.length) {
        const next = blocks[i];
        if (next.kind !== 'signatureBlock') break;
        group.push(next);
        i++;
      }
      nodes.push(
        <View key={`signatures-${i}`} wrap={false} style={styles.signatureRow}>
          {group.map((g) => (
            <SignatureColumn key={g.role} block={g} buffer={signatures[g.role]} />
          ))}
        </View>
      );
      continue;
    }

    switch (block.kind) {
      case 'title':
        nodes.push(
          <Text key={i} style={styles.title}>
            {block.text}
          </Text>
        );
        break;
      case 'sectionHeading':
        nodes.push(
          <Text key={i} style={styles.sectionHeading}>
            {block.text}
          </Text>
        );
        break;
      case 'paragraph':
        nodes.push(
          <Text key={i} style={styles.paragraph}>
            {block.text}
          </Text>
        );
        break;
      case 'fieldLine':
        nodes.push(
          <View key={i} style={styles.fieldLine}>
            <Text style={styles.fieldLineLabel}>{block.label}</Text>
            <Text style={styles.fieldLineValue}>{block.value}</Text>
          </View>
        );
        break;
    }
    i++;
  }
  return nodes;
}

/**
 * One signed consent, rendered as its own `<Page>` inside the record export's `<Document>`. Every
 * word of `blocks` comes from the frozen, already-Spanish snapshot (`getTreatmentItemDetail`'s
 * `consentDocument`, built in Task 6) and prints unchanged — a signed consent is an archived legal
 * instrument, not a view of live data. `header`/`footer` are the only parts that follow the export's
 * requested language, since they're record chrome, not part of the signed document.
 *
 * Rendering each consent as its own `<Page>` (rather than flowing it inside the record's single
 * page) is what makes the footer's `subPageNumber`/`subPageTotalPages` render props give a true
 * per-consent "Página 1 de N": those values reset per `<Page>` element in `@react-pdf/renderer`
 * 4.5.1, so a consent that spans several sheets counts itself independently of the record's own
 * pagination.
 */
export function ConsentPage({ blocks, header, footer, signatures }: ConsentPageProps) {
  return (
    <Page size="A4" style={styles.page} wrap>
      <View style={styles.header} fixed>
        {header.logo ? (
          <Image
            style={styles.headerLogo}
            src={{ data: header.logo, format: header.logoFormat ?? 'png' }}
          />
        ) : (
          <Text style={styles.headerClinic}>{header.clinicName}</Text>
        )}
        <Text style={styles.headerSubtitle}>
          {header.title} — {header.treatmentTypeName}
        </Text>
      </View>
      <Text
        style={styles.footer}
        fixed
        render={({ subPageNumber, subPageTotalPages }) =>
          `${footer.patientName} — ${footer.signedOn} — ${footer.pageLabel(subPageNumber, subPageTotalPages)}`
        }
      />
      {renderBlocks(blocks, signatures)}
    </Page>
  );
}
