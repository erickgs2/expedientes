import { Document, renderToBuffer } from '@react-pdf/renderer';
import type { ConsentBlock } from '@expedientes/shared-types';
import { ConsentPage } from './consent-document-pdf';
import { CONSENT_LABELS } from '../consent/consent-labels';

export interface BlankConsentInput {
  blocks: ConsentBlock[];
  clinicName: string;
  patientName: string;
  treatmentTypeName: string;
  logo?: Buffer;
  logoFormat?: 'png' | 'jpg';
}

/** One letter, no signature images anywhere — `ConsentPage` draws a ruled line where none is given. */
export async function buildBlankConsentPdf(input: BlankConsentInput): Promise<Buffer> {
  return renderToBuffer(
    <Document>
      <ConsentPage
        blocks={input.blocks}
        header={{
          clinicName: input.clinicName,
          logo: input.logo,
          logoFormat: input.logoFormat,
          title: CONSENT_LABELS.es.title,
          treatmentTypeName: input.treatmentTypeName,
        }}
        footer={{
          patientName: input.patientName,
          signedOn: '',
          pageLabel: (n, total) => `Página ${n} de ${total}`,
        }}
        signatures={{}}
      />
    </Document>
  );
}
