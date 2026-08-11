import type { ConsentBlock, ConsentSection, ConsentSectionKey } from '@expedientes/shared-types';

export interface ConsentDocumentLabels {
  title: string;
  place: string;
  date: string;
  patient: string;
  identifiesWith: string;
  sections: Record<ConsentSectionKey, string>;
  signatures: { patient: string; witness: string; doctor: string };
}

export interface ConsentDocumentInput {
  clinicName: string;
  doctorTitle: string;
  doctorName: string;
  doctorLicense: string;
  patientName: string;
  patientIdentification: string;
  place: string;
  /** Calendar date in `YYYY-MM-DD`, already resolved in the clinic's local timezone at signing. */
  signedDate: string;
  declarationBefore: string;
  declarationAfter: string;
  sections: ConsentSection[];
  witnessName: string | null;
  labels: ConsentDocumentLabels;
}

/**
 * Order matters: it is the order sections print in, independent of the order they arrive in.
 */
const SECTION_ORDER: ConsentSectionKey[] = [
  'description',
  'risks',
  'alternatives',
  'aftercare',
  'contraindications',
];

/**
 * Replaces `{{key}}` with `values[key]`. An unrecognized placeholder is deliberately left in the
 * output rather than blanked: a typo in an edited boilerplate paragraph should be visible on the
 * page, not silently delete a clause.
 */
export function interpolate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? values[key] : match
  );
}

/**
 * The calendar date, in the server's own timezone, that a consent signed *now* should print as its
 * FECHA. The API server runs at the clinic, so its local date is the clinic's date; taking the UTC
 * date instead would print tomorrow for anything signed after early evening. The result is stored
 * on the Consent row and never recomputed, so a signed consent's printed date can never drift.
 */
export function localSigningDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildConsentDocument(input: ConsentDocumentInput): ConsentBlock[] {
  const l = input.labels;
  const values: Record<string, string> = {
    clinicName: input.clinicName,
    doctorTitle: input.doctorTitle,
    doctorName: input.doctorName,
    doctorLicense: input.doctorLicense,
    patientName: input.patientName,
  };

  const blocks: ConsentBlock[] = [
    { kind: 'title', text: l.title },
    { kind: 'fieldLine', label: l.place, value: input.place },
    { kind: 'fieldLine', label: l.date, value: input.signedDate },
    { kind: 'fieldLine', label: l.patient, value: input.patientName },
    { kind: 'fieldLine', label: l.identifiesWith, value: input.patientIdentification },
    { kind: 'paragraph', text: interpolate(input.declarationBefore, values) },
  ];

  const byKey = new Map(input.sections.map((s) => [s.key, s.body]));
  for (const key of SECTION_ORDER) {
    const body = byKey.get(key);
    if (!body || !body.trim()) continue;
    blocks.push({ kind: 'sectionHeading', text: l.sections[key] });
    blocks.push({ kind: 'paragraph', text: body.trim() });
  }

  blocks.push({ kind: 'paragraph', text: interpolate(input.declarationAfter, values) });

  blocks.push({ kind: 'signatureBlock', role: 'patient', caption: l.signatures.patient });
  if (input.witnessName && input.witnessName.trim()) {
    blocks.push({
      kind: 'signatureBlock',
      role: 'witness',
      caption: l.signatures.witness,
      subCaption: input.witnessName.trim(),
    });
  }
  blocks.push({
    kind: 'signatureBlock',
    role: 'doctor',
    caption: l.signatures.doctor,
    subCaption: `${input.doctorTitle} ${input.doctorName} CED ${input.doctorLicense}`,
  });

  return blocks;
}
