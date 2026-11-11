import type { ExportConsent } from './gather-export-data';

export interface PaperScanGroup {
  scanId: string;
  signedDate: string;
  treatmentTypeNames: string[];
  pagePaths: string[];
}

/** One entry per distinct scan, so a scan covering several letters is printed once, not per letter. */
export function groupPaperScans(consents: ExportConsent[]): Map<string, PaperScanGroup> {
  const groups = new Map<string, PaperScanGroup>();
  for (const { treatmentTypeName, consent } of consents) {
    if (consent.method !== 'PAPER' || !consent.scanId) continue;
    const group = groups.get(consent.scanId);
    if (group) {
      group.treatmentTypeNames.push(treatmentTypeName);
    } else {
      groups.set(consent.scanId, {
        scanId: consent.scanId,
        signedDate: consent.signedDate,
        treatmentTypeNames: [treatmentTypeName],
        pagePaths: consent.scanPagePaths,
      });
    }
  }
  return groups;
}
