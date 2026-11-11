import { groupPaperScans } from './group-paper-scans';
import type { ExportConsent } from './gather-export-data';

const consent = (
  over: Partial<ExportConsent['consent']>,
  id: string,
  name: string
): ExportConsent => ({
  treatmentItemId: id,
  treatmentTypeName: name,
  consent: {
    blocks: [],
    signedDate: '2026-11-11',
    method: 'PAPER',
    patientSignatureImagePath: null,
    witnessSignatureImagePath: null,
    scanId: 's1',
    scanPagePaths: ['p1.jpg', 'p2.jpg'],
    ...over,
  },
});

describe('groupPaperScans', () => {
  it('lists one group per scan with every letter it covers', () => {
    const groups = groupPaperScans([consent({}, 'a', 'Toxina'), consent({}, 'b', 'Relleno')]);
    expect(groups.size).toBe(1);
    expect(groups.get('s1')).toEqual({
      scanId: 's1',
      signedDate: '2026-11-11',
      treatmentTypeNames: ['Toxina', 'Relleno'],
      pagePaths: ['p1.jpg', 'p2.jpg'],
    });
  });

  it('keeps different scans apart', () => {
    const groups = groupPaperScans([
      consent({}, 'a', 'Toxina'),
      consent({ scanId: 's2', scanPagePaths: ['q1.png'] }, 'b', 'Relleno'),
    ]);
    expect([...groups.keys()]).toEqual(['s1', 's2']);
  });

  it('ignores digital consents', () => {
    const digital = consent({ method: 'DIGITAL', scanId: null, scanPagePaths: [] }, 'c', 'Peeling');
    expect(groupPaperScans([digital]).size).toBe(0);
  });
});
