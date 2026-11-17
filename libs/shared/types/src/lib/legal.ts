export type LegalDocumentKind = 'PRIVACY' | 'TERMS';

export interface LegalDocumentSummary {
  id: string;
  kind: LegalDocumentKind;
  version: string;
  /** ISO */
  effectiveFrom: string;
  changeSummary: string;
}

export interface LegalDocumentView extends LegalDocumentSummary {
  /** Markdown, in the subset parseLegalMarkdown understands. */
  body: string;
}

export interface CurrentLegalDocuments {
  privacy: LegalDocumentView;
  terms: LegalDocumentView;
}

/** A public legal page: the version shown and the list of every version. */
export interface LegalDocumentPage {
  document: LegalDocumentView;
  versions: LegalDocumentSummary[];
}

export interface AcceptLegalRequest {
  documentIds: string[];
}
